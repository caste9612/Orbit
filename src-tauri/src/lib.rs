mod git;

use serde::Serialize;
use std::path::Path;

// Smoke test IPC (milestone 1).
#[tauri::command]
fn app_info() -> String {
    format!(
        "Lume v{} · Tauri {}",
        env!("CARGO_PKG_VERSION"),
        tauri::VERSION
    )
}

/// Cartella/file da aprire all'avvio: da variabili LUME_DIR/LUME_FILE oppure dal
/// primo argomento CLI (così si può lanciare `lume /percorso/progetto`).
#[derive(Serialize)]
struct Startup {
    dir: Option<String>,
    file: Option<String>,
}

#[tauri::command]
fn startup() -> Startup {
    let dir = std::env::var("LUME_DIR")
        .ok()
        .filter(|d| Path::new(d).is_dir())
        .or_else(|| std::env::args().nth(1).filter(|a| Path::new(a).is_dir()));
    let file = std::env::var("LUME_FILE")
        .ok()
        .filter(|f| Path::new(f).is_file());
    Startup { dir, file }
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

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            app_info,
            startup,
            read_dir,
            read_file,
            write_file,
            git::git_status,
            git::git_diff,
            git::git_stage,
            git::git_unstage,
            git::git_commit,
            git::git_branches,
            git::git_checkout_branch
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
