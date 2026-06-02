// Comando di servizio per lo smoke test dell'IPC (milestone 1).
#[tauri::command]
fn app_info() -> String {
    format!(
        "Lume v{} · Tauri {}",
        env!("CARGO_PKG_VERSION"),
        tauri::VERSION
    )
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![app_info])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
