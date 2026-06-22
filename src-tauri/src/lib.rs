// Orbit — backend Tauri: filesystem, sessione, git, pty, watcher.
mod git;
mod pty;
mod symbols;
mod watcher;
mod winsession;

use serde::Serialize;
use std::hash::{Hash, Hasher};
use std::path::{Path, PathBuf};
use tauri::{AppHandle, Manager};

/// Cartella/file da aprire all'avvio: da variabili LUME_DIR/LUME_FILE oppure dal
/// primo argomento CLI (così si può lanciare `lume /percorso/progetto`).
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct Startup {
    dir: Option<String>,
    file: Option<String>,
    search: Option<String>,
    win_key: String, // chiave di sessione STABILE di questa finestra (vedi winsession::WinKey)
}

/// Cartella passata da CLI/env: LUME_DIR, oppure il primo arg se è una cartella (`lume /progetto`),
/// oppure la cartella del file passato come arg (apertura via "Apri con" di Windows).
fn cli_dir() -> Option<String> {
    let arg = std::env::args().nth(1);
    let arg_file = arg.as_deref().filter(|a| Path::new(a).is_file()).map(str::to_string);
    std::env::var("LUME_DIR")
        .ok()
        .filter(|d| Path::new(d).is_dir())
        .or_else(|| arg.as_deref().filter(|a| Path::new(a).is_dir()).map(str::to_string))
        .or_else(|| arg_file.as_deref().and_then(|f| Path::new(f).parent()).map(|p| p.to_string_lossy().into_owned()))
}

#[tauri::command]
fn startup(app: AppHandle) -> Startup {
    let win_key = winsession::this_key(&app); // chiave stabile (impostata da winsession::init)
    // se questa istanza è la "restoratrice" di una sessione (avvio nudo con set salvato), apre la
    // cartella della sua voce invece dell'ultima sessione singola.
    if let Some(dir) = winsession::restore_folder(&app) {
        return Startup { dir: Some(dir), file: None, search: None, win_key };
    }
    let arg = std::env::args().nth(1);
    let arg_file = arg.as_deref().filter(|a| Path::new(a).is_file()).map(str::to_string);
    let file = std::env::var("LUME_FILE")
        .ok()
        .filter(|f| Path::new(f).is_file())
        .or(arg_file);
    let search = std::env::var("LUME_SEARCH")
        .ok()
        .filter(|s| !s.trim().is_empty());
    Startup { dir: cli_dir(), file, search, win_key }
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct FsEntry {
    name: String,
    path: String,
    is_dir: bool,
}

/// Legge UNA directory (lazy, non ricorsivo): dirs prima, poi file, ordine
/// alfabetico case-insensitive. Lazy + virtualizzazione lato UI = regge cartelle grandi.
#[tauri::command]
fn read_dir(path: String) -> Result<Vec<FsEntry>, String> {
    let rd = std::fs::read_dir(&path).map_err(|e| e.to_string())?;
    let mut entries: Vec<FsEntry> = Vec::new();
    for item in rd.flatten() {
        let is_dir = item.file_type().map(|t| t.is_dir()).unwrap_or(false);
        entries.push(FsEntry {
            name: item.file_name().to_string_lossy().into_owned(),
            path: item.path().to_string_lossy().into_owned(),
            is_dir,
        });
    }
    entries.sort_by(|a, b| {
        b.is_dir
            .cmp(&a.is_dir)
            .then_with(|| a.name.to_lowercase().cmp(&b.name.to_lowercase()))
    });
    Ok(entries)
}

/// Legge un file di testo (UTF-8). Sui file binari/non-UTF8 ritorna errore.
#[tauri::command]
fn read_file(path: String) -> Result<String, String> {
    std::fs::read_to_string(&path).map_err(|e| e.to_string())
}

/// Scrive (sovrascrive) un file di testo su disco.
#[tauri::command]
fn write_file(path: String, content: String) -> Result<(), String> {
    std::fs::write(&path, content).map_err(|e| e.to_string())
}

/// Primo percorso esistente (file) tra i candidati. Risolve i link cliccati nel terminale
/// quando il percorso è relativo: il frontend prova cwd del terminale e radice del progetto.
#[tauri::command]
fn resolve_existing(paths: Vec<String>) -> Option<String> {
    paths.into_iter().find(|p| Path::new(p).is_file())
}

// ---- Gestione file (create / rename / delete) -------------------------------
// Operazioni su filesystem usate dal menu contestuale dell'albero. Nessuna
// dipendenza extra: solo std::fs. L'albero si aggiorna da solo via file watcher.

/// Crea un file vuoto (errore se esiste già). Crea i genitori mancanti.
#[tauri::command]
fn create_file(path: String) -> Result<(), String> {
    if let Some(parent) = Path::new(&path).parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    std::fs::OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(&path)
        .map_err(|e| e.to_string())?;
    Ok(())
}

/// Crea una cartella (e i genitori mancanti).
#[tauri::command]
fn create_dir(path: String) -> Result<(), String> {
    std::fs::create_dir_all(&path).map_err(|e| e.to_string())
}

/// Rinomina/sposta un file o una cartella. Rifiuta se la destinazione esiste.
#[tauri::command]
fn rename_path(from: String, to: String) -> Result<(), String> {
    if Path::new(&to).exists() {
        return Err("Esiste già un elemento con questo nome".into());
    }
    std::fs::rename(&from, &to).map_err(|e| e.to_string())
}

/// Elimina (definitivamente) un file o una cartella con il suo contenuto.
#[tauri::command]
fn delete_path(path: String) -> Result<(), String> {
    let p = Path::new(&path);
    if p.is_dir() {
        std::fs::remove_dir_all(p).map_err(|e| e.to_string())
    } else {
        std::fs::remove_file(p).map_err(|e| e.to_string())
    }
}

#[derive(Serialize)]
struct SearchMatch {
    line: u32,
    text: String,
}

#[derive(Serialize)]
struct FileMatches {
    path: String,
    rel: String,
    matches: Vec<SearchMatch>,
}

/// Ricerca testuale (substring, case-insensitive) in tutti i file del progetto.
/// Walk manuale con esclusioni (no dep extra); salta cartelle rumorose, file grandi
/// e binari; limita i risultati per restare leggero e reattivo.
#[tauri::command]
fn search_in_project(root: String, query: String) -> Result<Vec<FileMatches>, String> {
    if query.trim().is_empty() {
        return Ok(vec![]);
    }
    let needle = query.to_lowercase();
    let root_path = std::path::Path::new(&root);
    let mut results: Vec<FileMatches> = Vec::new();
    let mut total = 0usize;
    let mut stack = vec![root_path.to_path_buf()];

    while let Some(dir) = stack.pop() {
        let rd = match std::fs::read_dir(&dir) {
            Ok(r) => r,
            Err(_) => continue,
        };
        for entry in rd.flatten() {
            if total >= 2000 || results.len() >= 400 {
                results.sort_by(|a, b| a.rel.cmp(&b.rel));
                return Ok(results);
            }
            let p = entry.path();
            let name = entry.file_name().to_string_lossy().to_string();
            let is_dir = entry.file_type().map(|t| t.is_dir()).unwrap_or(false);
            if is_dir {
                if matches!(name.as_str(), "node_modules" | ".git" | "target" | "dist") {
                    continue;
                }
                stack.push(p);
                continue;
            }
            if entry.metadata().map(|m| m.len()).unwrap_or(0) > 2_000_000 {
                continue;
            }
            let content = match std::fs::read_to_string(&p) {
                Ok(c) => c,
                Err(_) => continue, // binario o non-UTF8
            };
            let mut fm: Vec<SearchMatch> = Vec::new();
            for (i, line) in content.lines().enumerate() {
                if line.to_lowercase().contains(&needle) {
                    let trimmed = line.trim_start();
                    let text: String = trimmed.chars().take(240).collect();
                    fm.push(SearchMatch {
                        line: (i as u32) + 1,
                        text,
                    });
                    total += 1;
                    if fm.len() >= 50 || total >= 2000 {
                        break;
                    }
                }
            }
            if !fm.is_empty() {
                let rel = p
                    .strip_prefix(root_path)
                    .unwrap_or(&p)
                    .to_string_lossy()
                    .replace('\\', "/");
                results.push(FileMatches {
                    path: p.to_string_lossy().to_string(),
                    rel,
                    matches: fm,
                });
            }
        }
    }
    results.sort_by(|a, b| a.rel.cmp(&b.rel));
    Ok(results)
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct FileRef {
    path: String,
    rel: String,
}

/// Elenca tutti i file del progetto (path assoluto + relativo) per il quick-open.
/// Stesso walk/esclusioni della ricerca; cap alto per restare leggero su repo enormi.
#[tauri::command]
fn list_files(root: String) -> Result<Vec<FileRef>, String> {
    let root_path = Path::new(&root);
    let mut out: Vec<FileRef> = Vec::new();
    let mut stack = vec![root_path.to_path_buf()];
    while let Some(dir) = stack.pop() {
        let rd = match std::fs::read_dir(&dir) {
            Ok(r) => r,
            Err(_) => continue,
        };
        for entry in rd.flatten() {
            if out.len() >= 20000 {
                out.sort_by(|a, b| a.rel.cmp(&b.rel));
                return Ok(out);
            }
            let p = entry.path();
            let name = entry.file_name().to_string_lossy().to_string();
            let is_dir = entry.file_type().map(|t| t.is_dir()).unwrap_or(false);
            if is_dir {
                if matches!(name.as_str(), "node_modules" | ".git" | "target" | "dist") {
                    continue;
                }
                stack.push(p);
            } else {
                let rel = p
                    .strip_prefix(root_path)
                    .unwrap_or(&p)
                    .to_string_lossy()
                    .replace('\\', "/");
                out.push(FileRef {
                    path: p.to_string_lossy().to_string(),
                    rel,
                });
            }
        }
    }
    out.sort_by(|a, b| a.rel.cmp(&b.rel));
    Ok(out)
}

// ---- Persistenza di sessione (per-cartella, per le istanze multiple) ---------
// Ogni sessione è un blob JSON salvato sotto una chiave = cartella aperta, così due
// istanze su progetti diversi non si sovrascrivono. Un puntatore "last_session.txt"
// ricorda l'ultima cartella, per ripristinarla all'avvio senza argomenti.

fn session_file(app: &AppHandle, key: &str) -> Result<PathBuf, String> {
    let dir = app.path().app_config_dir().map_err(|e| e.to_string())?.join("sessions");
    let mut h = std::collections::hash_map::DefaultHasher::new();
    key.hash(&mut h);
    Ok(dir.join(format!("{:016x}.json", h.finish())))
}

fn last_pointer(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(app.path().app_config_dir().map_err(|e| e.to_string())?.join("last_session.txt"))
}

/// Carica la sessione per `key` (cartella); senza key usa l'ultima cartella aperta.
#[tauri::command]
fn load_state(app: AppHandle, key: Option<String>) -> Option<String> {
    let resolved = match key {
        Some(k) => k,
        None => std::fs::read_to_string(last_pointer(&app).ok()?).ok()?,
    };
    std::fs::read_to_string(session_file(&app, &resolved).ok()?).ok()
}

#[tauri::command]
fn save_state(app: AppHandle, key: String, data: String) -> Result<(), String> {
    let file = session_file(&app, &key)?;
    if let Some(parent) = file.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    std::fs::write(file, data).map_err(|e| e.to_string())?;
    let _ = std::fs::write(last_pointer(&app)?, &key); // aggiorna "ultima cartella"
    Ok(())
}

/// Apre una nuova istanza dell'app (nuovo processo), opzionalmente su una cartella.
/// Le istanze sono indipendenti: niente blocco single-instance.
#[tauri::command]
fn open_new_window(dir: Option<String>) -> Result<(), String> {
    let exe = std::env::current_exe().map_err(|e| e.to_string())?;
    let mut cmd = std::process::Command::new(exe);
    if let Some(d) = dir.filter(|d| Path::new(d).is_dir()) {
        cmd.arg(d);
    }
    cmd.spawn().map_err(|e| e.to_string())?;
    Ok(())
}

/// Mostra un file/cartella nel file manager dell'OS (lo seleziona dove possibile).
#[tauri::command]
fn reveal_path(path: String) -> Result<(), String> {
    // un path inesistente farebbe aprire a explorer la cartella sbagliata (silenziosamente)
    if !Path::new(&path).exists() {
        return Err(format!("path does not exist: {path}"));
    }
    #[cfg(target_os = "windows")]
    {
        std::process::Command::new("explorer")
            .arg(format!("/select,{}", path))
            .spawn()
            .map_err(|e| e.to_string())?;
    }
    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open")
            .args(["-R", &path])
            .spawn()
            .map_err(|e| e.to_string())?;
    }
    #[cfg(all(unix, not(target_os = "macos")))]
    {
        let p = Path::new(&path);
        let dir = if p.is_dir() {
            p.to_path_buf()
        } else {
            p.parent().map(|x| x.to_path_buf()).unwrap_or_else(|| p.to_path_buf())
        };
        std::process::Command::new("xdg-open")
            .arg(dir)
            .spawn()
            .map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ClaudeSession {
    id: String,
    preview: String, // ULTIMO messaggio utente "vero" (più distintivo del primo)
    messages: u32,   // numero di turni utente
    modified: u64,
}

/// Anteprima di una sessione: ULTIMO messaggio utente "vero" + numero di turni utente. Il primo
/// messaggio è poco distintivo (spesso una scorciatoia identica o boilerplate di ripresa); l'ultimo
/// dice "a che punto eri". Pre-filtro `"type":"user"` per non parsare le righe pesanti assistant/tool.
fn session_preview(path: &Path) -> (String, u32) {
    use std::io::BufRead;
    let file = match std::fs::File::open(path) {
        Ok(f) => f,
        Err(_) => return (String::new(), 0),
    };
    let mut last = String::new();
    let mut count: u32 = 0;
    for line in std::io::BufReader::new(file).lines().flatten() {
        if !line.contains("\"type\":\"user\"") {
            continue;
        }
        let v: serde_json::Value = match serde_json::from_str(&line) {
            Ok(v) => v,
            Err(_) => continue,
        };
        if v.get("type").and_then(|t| t.as_str()) != Some("user") {
            continue;
        }
        let content = &v["message"]["content"];
        let text = if let Some(s) = content.as_str() {
            s.to_string()
        } else if let Some(arr) = content.as_array() {
            arr.iter()
                .find_map(|b| {
                    if b.get("type").and_then(|t| t.as_str()) == Some("text") {
                        b.get("text").and_then(|t| t.as_str()).map(String::from)
                    } else {
                        None
                    }
                })
                .unwrap_or_default()
        } else {
            String::new()
        };
        let t = text.trim();
        if t.is_empty() || t.starts_with('<') {
            continue; // system-reminder / tag / tool_result
        }
        let low = t.to_lowercase();
        if low.starts_with("this session is being continued")
            || low.starts_with("continue from where you left off")
            || low.starts_with("caveat:")
        {
            continue; // boilerplate di ripresa/compaction
        }
        count += 1;
        last = t.lines().next().unwrap_or("").chars().take(90).collect();
    }
    (last, count)
}

/// Sessioni Claude Code del progetto: transcript in ~/.claude/projects/<slug>/*.jsonl,
/// dalla più recente. `slug` = path con ogni carattere non alfanumerico sostituito da '-'.
#[tauri::command]
fn claude_sessions(root: String) -> Result<Vec<ClaudeSession>, String> {
    let home = std::env::var("USERPROFILE")
        .ok()
        .or_else(|| std::env::var("HOME").ok())
        .ok_or_else(|| "home dir not found".to_string())?;
    let slug: String = root
        .chars()
        .map(|c| if c.is_ascii_alphanumeric() { c } else { '-' })
        .collect();
    let dir = Path::new(&home).join(".claude").join("projects").join(&slug);
    let mut out: Vec<ClaudeSession> = Vec::new();
    let rd = match std::fs::read_dir(&dir) {
        Ok(r) => r,
        Err(_) => return Ok(out), // nessuna cartella → nessuna sessione
    };
    for entry in rd.flatten() {
        let p = entry.path();
        if p.extension().and_then(|e| e.to_str()) != Some("jsonl") {
            continue;
        }
        let id = match p.file_stem().and_then(|s| s.to_str()) {
            Some(s) if !s.is_empty() => s.to_string(),
            _ => continue,
        };
        let modified = entry
            .metadata()
            .ok()
            .and_then(|m| m.modified().ok())
            .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
            .map(|d| d.as_secs())
            .unwrap_or(0);
        let (preview, messages) = session_preview(&p);
        out.push(ClaudeSession { id, preview, messages, modified });
    }
    out.sort_by(|a, b| b.modified.cmp(&a.modified));
    Ok(out)
}

// Le finestre flottanti del terminale usano label "term-float-<id>" (una per terminale estratto);
// i permessi relativi sono in capabilities/default.json (windows: ["main", "term-float-*"]).
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .manage(pty::PtyManager::default())
        .manage(watcher::WatchState::default())
        .manage(winsession::LastNormal::default())
        .manage(winsession::WinId::default())
        .manage(winsession::WinKey::default())
        .manage(winsession::OpenFolder::default())
        .manage(winsession::QuitState::default())
        .setup(|app| {
            // ripristina la geometria della finestra principale (e l'intera sessione, se avvio nudo) e la mostra
            let handle = app.handle().clone();
            match app.get_webview_window("main") {
                Some(win) => winsession::init(&handle, &win, cli_dir()),
                None => {
                    // non dovrebbe accadere (la finestra in config ha label "main"); ma con visible:false
                    // una finestra mai mostrata sarebbe irrecuperabile (decorations off) → mostra ciò che c'è.
                    eprintln!("winsession: finestra 'main' non trovata; mostro le finestre disponibili");
                    for (_, w) in app.webview_windows() {
                        let _ = w.show();
                    }
                }
            }
            // watcher per il "chiudi tutte" (un'altra istanza può chiedere a questa di uscire)
            winsession::start_quit_watcher(&handle);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            startup,
            read_dir,
            read_file,
            write_file,
            create_file,
            create_dir,
            rename_path,
            delete_path,
            search_in_project,
            list_files,
            load_state,
            save_state,
            open_new_window,
            winsession::register_window,
            winsession::close_all_windows,
            reveal_path,
            resolve_existing,
            claude_sessions,
            git::git_status,
            git::git_diff,
            git::git_stage,
            git::git_unstage,
            git::git_commit,
            git::git_branches,
            git::git_checkout_branch,
            git::git_discard,
            git::git_log,
            git::git_show,
            git::git_create_branch,
            git::git_upstream,
            pty::pty_spawn,
            pty::pty_write,
            pty::pty_resize,
            pty::pty_kill,
            pty::pty_alive,
            pty::list_shells,
            watcher::watch_start,
            symbols::scan_symbols
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|app, event| {
            // all'uscita: termina i PTY (niente shell/claude orfani in background)
            if let tauri::RunEvent::ExitRequested { .. } = event {
                app.state::<pty::PtyManager>().kill_all();
                // rete di sicurezza se CloseRequested non ha salvato (es. app.exit())
                if let Some(win) = app.get_webview_window("main") {
                    winsession::save_on_exit(app, &win);
                }
            }
        });
}

#[cfg(test)]
mod tests {
    //! Unit test dei comandi su filesystem (puri, senza runtime Tauri/GUI).
    //! Ogni test lavora in una cartella temporanea isolata e la ripulisce.
    use super::*;
    use std::fs;
    use std::path::{Path, PathBuf};
    use std::sync::atomic::{AtomicU32, Ordering};

    static COUNTER: AtomicU32 = AtomicU32::new(0);

    fn temp_root(tag: &str) -> PathBuf {
        let n = COUNTER.fetch_add(1, Ordering::SeqCst);
        let dir = std::env::temp_dir().join(format!("lume_test_{}_{}_{}", std::process::id(), tag, n));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        dir
    }

    fn s(p: &Path) -> String {
        p.to_string_lossy().to_string()
    }

    #[test]
    fn create_file_then_duplicate_errors() {
        let root = temp_root("create");
        let f = root.join("a.txt");
        create_file(s(&f)).unwrap();
        assert!(f.is_file());
        assert!(create_file(s(&f)).is_err(), "creare un file esistente deve fallire");
        fs::remove_dir_all(&root).ok();
    }

    #[test]
    fn create_file_makes_missing_parents() {
        let root = temp_root("parents");
        let f = root.join("nested/deep/b.txt");
        create_file(s(&f)).unwrap();
        assert!(f.is_file());
        fs::remove_dir_all(&root).ok();
    }

    #[test]
    fn create_directory_recursive() {
        let root = temp_root("dir");
        let d = root.join("sub/inner");
        create_dir(s(&d)).unwrap();
        assert!(d.is_dir());
        fs::remove_dir_all(&root).ok();
    }

    #[test]
    fn rename_moves_and_rejects_existing_target() {
        let root = temp_root("rename");
        let a = root.join("a.txt");
        let b = root.join("b.txt");
        create_file(s(&a)).unwrap();
        rename_path(s(&a), s(&b)).unwrap();
        assert!(!a.exists() && b.is_file());
        let c = root.join("c.txt");
        create_file(s(&c)).unwrap();
        assert!(rename_path(s(&c), s(&b)).is_err(), "rename su destinazione esistente deve fallire");
        fs::remove_dir_all(&root).ok();
    }

    #[test]
    fn delete_file_and_directory() {
        let root = temp_root("delete");
        let f = root.join("x.txt");
        create_file(s(&f)).unwrap();
        delete_path(s(&f)).unwrap();
        assert!(!f.exists());
        let d = root.join("d");
        create_file(s(&d.join("inner.txt"))).unwrap();
        delete_path(s(&d)).unwrap();
        assert!(!d.exists(), "delete su cartella deve essere ricorsivo");
        fs::remove_dir_all(&root).ok();
    }

    #[test]
    fn list_files_excludes_noise_and_is_relative() {
        let root = temp_root("list");
        create_file(s(&root.join("README.md"))).unwrap();
        create_file(s(&root.join("src/main.rs"))).unwrap();
        create_file(s(&root.join("node_modules/pkg/index.js"))).unwrap();
        create_file(s(&root.join(".git/config"))).unwrap();
        let files = list_files(s(&root)).unwrap();
        let rels: Vec<&str> = files.iter().map(|f| f.rel.as_str()).collect();
        assert!(rels.contains(&"README.md"));
        assert!(rels.contains(&"src/main.rs"));
        assert!(!rels.iter().any(|r| r.contains("node_modules")), "node_modules deve essere escluso");
        assert!(!rels.iter().any(|r| r.starts_with(".git")), ".git deve essere escluso");
        fs::remove_dir_all(&root).ok();
    }

    #[test]
    fn search_is_case_insensitive_with_line_numbers() {
        let root = temp_root("search");
        fs::write(root.join("a.txt"), "Hello World\nsecond TODO line\n").unwrap();
        let res = search_in_project(s(&root), "todo".into()).unwrap();
        assert_eq!(res.len(), 1);
        assert_eq!(res[0].matches.len(), 1);
        assert_eq!(res[0].matches[0].line, 2, "il match è sulla seconda riga");
        fs::remove_dir_all(&root).ok();
    }

    #[test]
    fn read_dir_lists_directories_first() {
        let root = temp_root("readdir");
        create_file(s(&root.join("zzz.txt"))).unwrap();
        create_dir(s(&root.join("aaa_dir"))).unwrap();
        let entries = read_dir(s(&root)).unwrap();
        assert!(entries[0].is_dir, "le cartelle vengono prima dei file");
        fs::remove_dir_all(&root).ok();
    }
}
