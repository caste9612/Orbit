// Sessione multi-finestra (modello "C+": più processi indipendenti + registro condiviso).
// Ogni istanza di Orbit è un processo separato con una finestra "main". Per poter
// "riaprire tutte le finestre" dopo un riavvio teniamo, in app_config_dir:
//   - windows/<id>.json    : il set VIVO, UN FILE PER FINESTRA. Ogni processo scrive/cancella SOLO il
//                            proprio file → niente race né file temp condiviso tra processi.
//   - windows-restore.json : il set da RIAPRIRE al prossimo avvio "nudo" (snapshot, scritto da una sola
//                            istanza alla volta: chi chiude per ultimo, o chi avvia il "chiudi tutte").
//   - windows-control.json : token per il "chiudi tutte" (vedi in fondo).
//
// Regola che evita ogni IPC tra processi (e quindi zero dipendenze, niente liveness dei pid):
//   - avvio "NUDO" (Orbit lanciato da menu/taskbar, senza cartella) → RIPRISTINA il set salvato:
//     questa istanza apre la prima finestra e ri-spawna le altre alle loro posizioni;
//   - avvio CON cartella (Nuova finestra, `orbit <path>`, Apri-con, o un figlio del ripristino con
//     geometria via env) → apre SOLO quella, nessun ripristino.
//
// Questo modulo è anche l'unico responsabile della geometria della finestra "main" (prima lo era
// winstate.rs): la salva PER-FINESTRA nel registro invece che in un window.json globale (che con più
// istanze si sovrascriveva a vicenda). Si applica solo a "main"; le flottanti del terminale restano effimere.
use notify::Watcher;
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::Mutex;
use tauri::{AppHandle, Manager, PhysicalPosition, PhysicalSize, WebviewWindow, WindowEvent};

#[derive(Serialize, Deserialize, Clone, Copy)]
pub struct WinGeom {
    pub x: i32,
    pub y: i32,
    pub width: u32,
    pub height: u32,
    pub maximized: bool,
}

// Una finestra nel registro: cartella aperta + geometria + id univoco di questa finestra-processo.
#[derive(Serialize, Deserialize, Clone)]
pub struct WinEntry {
    pub folder: String,
    pub x: i32,
    pub y: i32,
    pub width: u32,
    pub height: u32,
    pub maximized: bool,
    pub id: String,
}

// Ultima geometria "normale" (non massimizzata/minimizzata), aggiornata sui Moved/Resized: è ciò che
// salviamo, così ripristinando e poi de-massimizzando la finestra torna a una dimensione sensata.
#[derive(Default)]
pub struct LastNormal(pub Mutex<Option<(i32, i32, u32, u32)>>);

// Id (pid + nanos) assegnato alla finestra di QUESTO processo al primo register_window.
#[derive(Default)]
pub struct WinId(pub Mutex<String>);

// Cartella che la finestra di questo processo deve aprire quando è la "restoratrice" di una sessione
// (avvio nudo con set salvato): letta da `startup()` per dire al frontend cosa aprire.
#[derive(Default)]
pub struct OpenFolder(pub Mutex<Option<String>>);

// Coordinamento "chiudi tutte": `quitting` = questo processo sta uscendo per un chiudi-tutte (così
// la sua on_close non riscrive il ripristino, già salvato da chi ha avviato); `baseline` = il token
// del file di controllo letto all'avvio (un token più alto = un altro processo ha chiesto la chiusura).
#[derive(Default)]
pub struct QuitState {
    quitting: AtomicBool,
    baseline: AtomicU64,
}

// --- geometria (helper) -----------------------------------------------------

/// Geometria corrente (fisica), o None se le API falliscono.
pub fn current_geom(win: &WebviewWindow) -> Option<(i32, i32, u32, u32)> {
    let pos = win.outer_position().ok()?;
    let size = win.inner_size().ok()?;
    Some((pos.x, pos.y, size.width, size.height))
}

/// True se almeno un punto della barra del titolo cade dentro un monitor collegato: evita di
/// ripristinare la finestra su un secondo schermo ora scollegato (sarebbe irraggiungibile, visto
/// che le decorazioni native sono disattivate e si trascina dalla titlebar custom).
fn on_some_monitor(win: &WebviewWindow, g: &WinGeom) -> bool {
    let monitors = match win.available_monitors() {
        Ok(m) if !m.is_empty() => m,
        _ => return true, // in dubbio (nessun monitor noto): prova comunque
    };
    let (px, py) = (g.x + 60.min(g.width as i32 / 2), g.y + 16); // un punto della titlebar
    monitors.iter().any(|m| {
        let p = m.position();
        let s = m.size();
        px >= p.x && px <= p.x + s.width as i32 && py >= p.y && py <= p.y + s.height as i32
    })
}

/// Applica una geometria salvata alla finestra (NON la mostra: lo fa il chiamante).
fn apply_geom(win: &WebviewWindow, g: WinGeom) {
    if g.width >= 200 && g.height >= 200 {
        let _ = win.set_size(PhysicalSize::new(g.width, g.height));
        if on_some_monitor(win, &g) {
            let _ = win.set_position(PhysicalPosition::new(g.x, g.y));
        }
    }
    if g.maximized {
        let _ = win.maximize();
    }
}

/// Aggiorna la geometria "normale" tracciata (chiamata sui Moved/Resized in stato normale).
fn track_normal(win: &WebviewWindow, last: &LastNormal) {
    let maxed = win.is_maximized().unwrap_or(false);
    let mind = win.is_minimized().unwrap_or(false);
    if maxed || mind {
        return;
    }
    // da minimizzata Windows riporta coordinate sentinella tipo -32000 → da scartare.
    if let Some(g @ (x, y, _, _)) = current_geom(win) {
        if x > -30000 && y > -30000 {
            *last.0.lock().unwrap_or_else(|e| e.into_inner()) = Some(g);
        }
    }
}

// --- registro (file) --------------------------------------------------------

fn windows_dir(app: &AppHandle) -> Option<PathBuf> {
    app.path().app_config_dir().ok().map(|d| d.join("windows"))
}
fn entry_path(app: &AppHandle, id: &str) -> Option<PathBuf> {
    windows_dir(app).map(|d| d.join(format!("{}.json", id)))
}
fn restore_path(app: &AppHandle) -> Option<PathBuf> {
    app.path().app_config_dir().ok().map(|d| d.join("windows-restore.json"))
}

/// Scrittura atomica con file temp UNICO PER PROCESSO (pid+nanos): istanze concorrenti non
/// corrompono lo stesso temp; il rename finale è atomico → niente letture "strappate".
fn atomic_write(path: &Path, data: &[u8]) {
    if let Some(parent) = path.parent() {
        let _ = std::fs::create_dir_all(parent);
    }
    let uniq = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_nanos())
        .unwrap_or(0);
    let tmp = path.with_file_name(format!(".tmp-{}-{}", std::process::id(), uniq));
    if std::fs::write(&tmp, data).is_ok() {
        let _ = std::fs::rename(&tmp, path);
    }
}

fn write_json_atomic<T: Serialize>(path: &Path, val: &T) {
    if let Ok(json) = serde_json::to_string(val) {
        atomic_write(path, json.as_bytes());
    }
}

/// Set VIVO = tutti i file windows/*.json (uno per finestra). Ordinato per id (≈ ordine di creazione).
fn load_live(app: &AppHandle) -> Vec<WinEntry> {
    let Some(dir) = windows_dir(app) else { return Vec::new() };
    let Ok(rd) = std::fs::read_dir(&dir) else { return Vec::new() };
    let mut out: Vec<WinEntry> = rd
        .flatten()
        .filter(|e| e.path().extension().and_then(|s| s.to_str()) == Some("json"))
        .filter_map(|e| std::fs::read_to_string(e.path()).ok())
        .filter_map(|s| serde_json::from_str(&s).ok())
        .collect();
    out.sort_by(|a, b| a.id.cmp(&b.id));
    out
}

/// Set da RIPRISTINARE (snapshot single-file).
fn load_restore(app: &AppHandle) -> Vec<WinEntry> {
    restore_path(app)
        .and_then(|p| std::fs::read_to_string(p).ok())
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or_default()
}

fn new_id() -> String {
    let pid = std::process::id();
    let nanos = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_nanos())
        .unwrap_or(0);
    format!("{}-{}", pid, nanos)
}

/// Id della finestra di questo processo (lo crea al primo uso).
fn this_id(app: &AppHandle) -> String {
    let st = app.state::<WinId>();
    let mut s = st.0.lock().unwrap_or_else(|e| e.into_inner());
    if s.is_empty() {
        *s = new_id();
    }
    s.clone()
}

/// Il frontend, risolta la cartella di lavoro, registra questa finestra nel set vivo.
/// Richiamabile anche al cambio cartella (idempotente: aggiorna la voce per id).
#[tauri::command]
pub fn register_window(app: AppHandle, window: WebviewWindow, folder: String) {
    let id = this_id(&app);
    let (x, y, width, height) = current_geom(&window).unwrap_or((100, 100, 1280, 800));
    let maximized = window.is_maximized().unwrap_or(false);
    let entry = WinEntry { folder, x, y, width, height, maximized, id: id.clone() };
    if let Some(p) = entry_path(&app, &id) {
        write_json_atomic(&p, &entry);
    }
}

/// Aggiorna la geometria nel PROPRIO file (read-modify-write del solo file di questa finestra: niente
/// race tra processi). Chiamata sul blur, prima dello snapshot del "chiudi tutte" e alla chiusura.
fn update_own_geom(app: &AppHandle, win: &WebviewWindow) {
    let id = this_id(app);
    let Some(p) = entry_path(app, &id) else { return };
    let Ok(s) = std::fs::read_to_string(&p) else { return }; // non ancora registrata
    let Ok(mut entry) = serde_json::from_str::<WinEntry>(&s) else { return };
    // geometria = ultima "normale" tracciata, o quella corrente
    let normal = *app.state::<LastNormal>().0.lock().unwrap_or_else(|e| e.into_inner());
    if let Some((x, y, w, h)) = normal.or_else(|| current_geom(win)) {
        entry.x = x;
        entry.y = y;
        entry.width = w;
        entry.height = h;
    }
    entry.maximized = win.is_maximized().unwrap_or(false);
    write_json_atomic(&p, &entry);
}

/// Alla chiusura: salva la geometria finale nel proprio file, fa lo SNAPSHOT del set vivo nel file di
/// ripristino (salvo durante un "chiudi tutte"), poi cancella il proprio file. Idempotente.
fn on_close(app: &AppHandle, win: &WebviewWindow) {
    let id = this_id(app);
    let Some(p) = entry_path(app, &id) else { return };
    if !p.exists() {
        return; // già gestita (es. CloseRequested poi ExitRequested)
    }
    update_own_geom(app, win); // geometria finale nel proprio file (incluso nello snapshot sotto)
    // snapshot del set VIVO → ripristino. SALTATO durante un "chiudi tutte": lo snapshot completo
    // l'ha già scritto chi ha avviato la chiusura (altrimenti ogni finestra che esce lo rimpicciolirebbe).
    let quitting = app.state::<QuitState>().quitting.load(Ordering::SeqCst);
    if !quitting {
        let live = load_live(app);
        if !live.is_empty() {
            if let Some(rp) = restore_path(app) {
                write_json_atomic(&rp, &live);
            }
        }
    }
    let _ = std::fs::remove_file(&p); // rimuovi il proprio file dal set vivo
}

// --- avvio / ripristino -----------------------------------------------------

/// Legge una variabile d'ambiente numerica (generica su i32/u32: una closure non basterebbe perché
/// inferirebbe un solo tipo di ritorno).
fn env_num<T: std::str::FromStr>(k: &str) -> Option<T> {
    std::env::var(k).ok().and_then(|v| v.parse().ok())
}

/// Geometria passata dal processo padre a un figlio del ripristino (via env).
fn geom_from_env() -> Option<WinGeom> {
    Some(WinGeom {
        x: env_num("ORBIT_WIN_X")?,
        y: env_num("ORBIT_WIN_Y")?,
        width: env_num("ORBIT_WIN_W")?,
        height: env_num("ORBIT_WIN_H")?,
        maximized: std::env::var("ORBIT_WIN_MAX").map(|v| v == "1").unwrap_or(false),
    })
}

/// Lancia un'altra istanza di Orbit su `folder`, passandole la geometria da applicare via env.
fn spawn_instance(exe: &Path, e: &WinEntry) {
    let mut cmd = std::process::Command::new(exe);
    cmd.arg(&e.folder);
    cmd.env("ORBIT_WIN_X", e.x.to_string())
        .env("ORBIT_WIN_Y", e.y.to_string())
        .env("ORBIT_WIN_W", e.width.to_string())
        .env("ORBIT_WIN_H", e.height.to_string())
        .env("ORBIT_WIN_MAX", if e.maximized { "1" } else { "0" });
    let _ = cmd.spawn();
}

/// Cosa fare con la finestra "main" all'avvio (logica pura, testata in isolamento).
enum RestorePlan {
    ApplyEnv(WinGeom),                            // figlio del ripristino: applica la geometria via env
    OpenArgOnly,                                  // avvio con cartella: apre solo quella
    Restore { first: WinEntry, spawn: Vec<WinEntry> }, // avvio nudo: ripristina la sessione
    Nothing,                                      // avvio nudo senza set, o sessione già viva
}

/// Decide il piano d'avvio. Priorità: env (figlio) → cartella da CLI (apri-una) → avvio nudo
/// (ripristina, ma solo se NON c'è già una sessione viva: evita di duplicare finestre).
fn plan(arg_dir: Option<&str>, env_geom: Option<WinGeom>, live: &[WinEntry], restore: &[WinEntry]) -> RestorePlan {
    if let Some(g) = env_geom {
        return RestorePlan::ApplyEnv(g);
    }
    if arg_dir.is_some() {
        return RestorePlan::OpenArgOnly;
    }
    if !live.is_empty() {
        return RestorePlan::Nothing; // un'altra sessione è già aperta → non ripristinare
    }
    match restore.split_first() {
        Some((first, rest)) => RestorePlan::Restore { first: first.clone(), spawn: rest.to_vec() },
        None => RestorePlan::Nothing,
    }
}

/// Inizializza la finestra "main": installa il tracking della geometria, decide il piano d'avvio
/// (geometria env / apri-cartella / ripristina sessione) e mostra la finestra.
/// `arg_dir` = cartella passata da CLI/env (None = avvio nudo).
pub fn init(app: &AppHandle, win: &WebviewWindow, arg_dir: Option<String>) {
    // tracking geometria + salvataggio alla chiusura
    let w = win.clone();
    let app2 = app.clone();
    win.on_window_event(move |event| match event {
        WindowEvent::Moved(_) | WindowEvent::Resized(_) => track_normal(&w, app2.state::<LastNormal>().inner()),
        // perdita di fuoco → salva la geometria corrente nel proprio file (così "chiudi tutte" e il
        // ripristino vedono dove la finestra è ORA, non dove era stata aperta).
        WindowEvent::Focused(false) => update_own_geom(&app2, &w),
        WindowEvent::CloseRequested { .. } => on_close(&app2, &w),
        _ => {}
    });

    let live = load_live(app);
    let restore = load_restore(app);
    match plan(arg_dir.as_deref(), geom_from_env(), &live, &restore) {
        RestorePlan::ApplyEnv(g) => apply_geom(win, g),
        RestorePlan::Restore { first, spawn } => {
            apply_geom(
                win,
                WinGeom { x: first.x, y: first.y, width: first.width, height: first.height, maximized: first.maximized },
            );
            *app.state::<OpenFolder>().0.lock().unwrap_or_else(|e| e.into_inner()) = Some(first.folder.clone());
            if let Ok(exe) = std::env::current_exe() {
                for e in &spawn {
                    spawn_instance(&exe, e);
                }
            }
        }
        RestorePlan::OpenArgOnly | RestorePlan::Nothing => {}
    }
    let _ = win.show();
}

/// Cartella da aprire per l'istanza "restoratrice" (None se non è un ripristino).
pub fn restore_folder(app: &AppHandle) -> Option<String> {
    let st = app.state::<OpenFolder>();
    let g = st.0.lock().ok()?;
    g.clone()
}

/// Rete di sicurezza all'uscita: salva come una chiusura normale (idempotente).
pub fn save_on_exit(app: &AppHandle, win: &WebviewWindow) {
    on_close(app, win);
}

// --- "chiudi tutte" (coordinamento tra processi) ----------------------------
// Un file di controllo (windows-control.json) contiene un token monotòno. "Chiudi tutte" lo
// incrementa: ogni istanza ha un watcher `notify` sulla cartella di config e, vedendo un token più
// alto del proprio baseline d'avvio, esce. Event-driven (niente polling), zero dipendenze nuove.

fn control_path(app: &AppHandle) -> Option<PathBuf> {
    app.path().app_config_dir().ok().map(|d| d.join("windows-control.json"))
}

fn read_token(app: &AppHandle) -> u64 {
    control_path(app)
        .and_then(|p| std::fs::read_to_string(p).ok())
        .and_then(|s| s.trim().parse().ok())
        .unwrap_or(0)
}

fn write_token(app: &AppHandle, token: u64) {
    if let Some(p) = control_path(app) {
        atomic_write(&p, token.to_string().as_bytes());
    }
}

fn now_token() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(1)
}

/// Avvia l'uscita di QUESTO processo per un "chiudi tutte" (idempotente).
fn begin_quit(app: &AppHandle) {
    let qs = app.state::<QuitState>();
    if qs.quitting.swap(true, Ordering::SeqCst) {
        return; // già in chiusura
    }
    let a = app.clone();
    let _ = app.run_on_main_thread(move || a.exit(0));
}

/// Comando "Chiudi tutte le finestre": salva lo snapshot completo per il ripristino, poi fa uscire
/// questa istanza e segnala a tutte le altre di uscire (bump del token di controllo).
#[tauri::command]
pub fn close_all_windows(app: AppHandle) {
    // 1) la finestra che avvia ha il fuoco: salva la SUA geometria corrente nel proprio file
    //    (le altre l'hanno già salvata perdendo il fuoco quando l'utente ha cliccato qui).
    if let Some(win) = app.get_webview_window("main") {
        update_own_geom(&app, &win);
    }
    // 2) snapshot del set vivo completo → ripristino (così tornano tutte alle posizioni correnti)
    let live = load_live(&app);
    if !live.is_empty() {
        if let Some(rp) = restore_path(&app) {
            write_json_atomic(&rp, &live);
        }
    }
    // 3) segnala alle altre istanze di uscire, poi esci anche tu
    write_token(&app, now_token());
    begin_quit(&app);
}

/// Watcher del file di controllo: se un'altra istanza ha chiesto il "chiudi tutte" (token oltre il
/// baseline d'avvio), questa istanza esce. Un watcher `notify` per processo sulla cartella di config.
pub fn start_quit_watcher(app: &AppHandle) {
    app.state::<QuitState>().baseline.store(read_token(app), Ordering::SeqCst);
    let Some(cdir) = control_path(app).and_then(|p| p.parent().map(|d| d.to_path_buf())) else { return };
    let app2 = app.clone();
    std::thread::spawn(move || {
        let (tx, rx) = std::sync::mpsc::channel();
        let Ok(mut watcher) = notify::recommended_watcher(move |res| { let _ = tx.send(res); }) else { return };
        if watcher.watch(&cdir, notify::RecursiveMode::NonRecursive).is_err() {
            return;
        }
        // il watcher resta vivo finché il loop consuma `rx` (tx vive dentro il watcher)
        for res in rx {
            if res.is_err() {
                continue;
            }
            let qs = app2.state::<QuitState>();
            if read_token(&app2) > qs.baseline.load(Ordering::SeqCst) {
                begin_quit(&app2);
                break;
            }
        }
        drop(watcher);
    });
}

#[cfg(test)]
mod tests {
    use super::*;

    fn entry(folder: &str) -> WinEntry {
        WinEntry { folder: folder.into(), x: 0, y: 0, width: 1280, height: 800, maximized: false, id: folder.into() }
    }

    #[test]
    fn env_geom_ha_precedenza() {
        // un figlio del ripristino (geometria via env) applica quella, ignorando arg/registro
        let g = WinGeom { x: 1, y: 2, width: 300, height: 400, maximized: true };
        assert!(matches!(plan(Some("/x"), Some(g), &[entry("/a")], &[entry("/b")]), RestorePlan::ApplyEnv(_)));
    }

    #[test]
    fn avvio_con_cartella_apre_solo_quella() {
        assert!(matches!(plan(Some("/x"), None, &[], &[entry("/a"), entry("/b")]), RestorePlan::OpenArgOnly));
    }

    #[test]
    fn avvio_nudo_con_sessione_viva_non_ripristina() {
        // se c'è già una sessione aperta (set vivo non vuoto), un avvio nudo non duplica nulla
        assert!(matches!(plan(None, None, &[entry("/a")], &[entry("/a"), entry("/b")]), RestorePlan::Nothing));
    }

    #[test]
    fn avvio_nudo_senza_set_non_fa_nulla() {
        assert!(matches!(plan(None, None, &[], &[]), RestorePlan::Nothing));
    }

    #[test]
    fn avvio_nudo_ripristina_la_prima_e_spawna_il_resto() {
        match plan(None, None, &[], &[entry("/a"), entry("/b"), entry("/c")]) {
            RestorePlan::Restore { first, spawn } => {
                assert_eq!(first.folder, "/a");
                assert_eq!(spawn.len(), 2);
                assert_eq!(spawn[0].folder, "/b");
                assert_eq!(spawn[1].folder, "/c");
            }
            _ => panic!("atteso RestorePlan::Restore"),
        }
    }
}
