// Sessione multi-finestra (modello "C+": più processi indipendenti + registro condiviso).
// Ogni istanza di Orbit è un processo separato con una finestra "main". Per poter
// "riaprire tutte le finestre" dopo un riavvio teniamo due file in app_config_dir:
//   - windows-open.json    : il set VIVO (le finestre aperte ORA); ogni istanza mantiene la sua voce.
//   - windows-restore.json : il set da RIAPRIRE al prossimo avvio "nudo" (snapshot).
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
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
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

fn open_path(app: &AppHandle) -> Option<PathBuf> {
    app.path().app_config_dir().ok().map(|d| d.join("windows-open.json"))
}
fn restore_path(app: &AppHandle) -> Option<PathBuf> {
    app.path().app_config_dir().ok().map(|d| d.join("windows-restore.json"))
}

fn load(path: &Path) -> Vec<WinEntry> {
    std::fs::read_to_string(path)
        .ok()
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or_default()
}

/// Scrittura atomica (temp + rename): più processi possono scrivere → evita letture "strappate".
/// Le perdite di update logiche (last-writer-wins) sono innocue per posizioni di finestre.
fn save_atomic(path: &Path, v: &[WinEntry]) {
    let Ok(json) = serde_json::to_string(v) else { return };
    if let Some(parent) = path.parent() {
        let _ = std::fs::create_dir_all(parent);
    }
    let tmp = path.with_extension("json.tmp");
    if std::fs::write(&tmp, json).is_ok() {
        let _ = std::fs::rename(&tmp, path);
    }
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
    if let Some(p) = open_path(&app) {
        let mut v = load(&p);
        v.retain(|e| e.id != id);
        v.push(entry);
        save_atomic(&p, &v);
    }
}

/// Alla chiusura della finestra: aggiorna la geometria finale, fa lo SNAPSHOT del set vivo nel file
/// di ripristino, poi rimuove la propria voce dal set vivo. Idempotente (se già rimossa, non fa nulla).
fn on_close(app: &AppHandle, win: &WebviewWindow) {
    let id = this_id(app);
    let Some(p) = open_path(app) else { return };
    let mut v = load(&p);
    if !v.iter().any(|e| e.id == id) {
        return; // già gestita (es. CloseRequested poi ExitRequested)
    }
    // geometria finale = ultima "normale" tracciata, o quella corrente
    let normal = *app.state::<LastNormal>().0.lock().unwrap_or_else(|e| e.into_inner());
    let geom = normal.or_else(|| current_geom(win));
    let maximized = win.is_maximized().unwrap_or(false);
    if let Some(e) = v.iter_mut().find(|e| e.id == id) {
        if let Some((x, y, w, h)) = geom {
            e.x = x;
            e.y = y;
            e.width = w;
            e.height = h;
        }
        e.maximized = maximized;
    }
    // snapshot del set VIVO (questa finestra inclusa) → set di ripristino
    if let Some(rp) = restore_path(app) {
        if !v.is_empty() {
            save_atomic(&rp, &v);
        }
    }
    // rimuovi la propria voce dal set vivo
    v.retain(|e| e.id != id);
    save_atomic(&p, &v);
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

/// Inizializza la finestra "main": installa il tracking della geometria, decide se applicare una
/// geometria (env), aprire una sola cartella (arg) o RIPRISTINARE l'intera sessione (avvio nudo),
/// poi mostra la finestra. `arg_dir` = cartella passata da CLI/env (None = avvio nudo).
pub fn init(app: &AppHandle, win: &WebviewWindow, arg_dir: Option<String>) {
    // tracking geometria + salvataggio alla chiusura
    let w = win.clone();
    let app2 = app.clone();
    win.on_window_event(move |event| match event {
        WindowEvent::Moved(_) | WindowEvent::Resized(_) => track_normal(&w, app2.state::<LastNormal>().inner()),
        WindowEvent::CloseRequested { .. } => on_close(&app2, &w),
        _ => {}
    });

    // 1) geometria via env → figlio di un ripristino (o Nuova finestra con geometria): applica e mostra
    if let Some(g) = geom_from_env() {
        apply_geom(win, g);
        let _ = win.show();
        return;
    }
    // 2) avvio CON cartella → apre solo quella; niente ripristino
    if arg_dir.is_some() {
        let _ = win.show();
        return;
    }
    // 3) avvio NUDO → ripristina il set salvato, ma SOLO se non c'è già una sessione viva
    //    (set vivo vuoto): evita di duplicare finestre se l'utente lancia una seconda istanza nuda.
    let live = open_path(app).map(|p| load(&p)).unwrap_or_default();
    if live.is_empty() {
        let set = restore_path(app).map(|p| load(&p)).unwrap_or_default();
        if let Some(first) = set.first().cloned() {
            apply_geom(
                win,
                WinGeom { x: first.x, y: first.y, width: first.width, height: first.height, maximized: first.maximized },
            );
            *app.state::<OpenFolder>().0.lock().unwrap_or_else(|e| e.into_inner()) = Some(first.folder.clone());
            if let Ok(exe) = std::env::current_exe() {
                for e in set.iter().skip(1) {
                    spawn_instance(&exe, e);
                }
            }
        }
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
