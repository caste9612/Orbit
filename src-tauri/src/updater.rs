// Aggiornamenti dalle release GitHub (M59). Il plugin ufficiale di Tauri legge `latest.json`, pubblicato
// con ogni release (scripts/New-Release.ps1), confronta la versione e scarica l'installer verificandone
// la firma (chiave pubblica in tauri.conf.json). Comandi propri invece del pacchetto npm del plugin:
// niente dipendenze JS né permessi sul plugin, e il backend coordina le finestre prima di installare.
//
// Sequenza: update_check → update_download (avanzamento con l'evento `update-progress`) → il frontend
// salva e fa uscire le altre finestre (winsession::quit_others) → update_install: segno di riavvio e
// installer avviato. Su Windows l'installer NSIS (modalità passiva: solo la barra di avanzamento)
// sostituisce i file e riapre Orbit, che ritrova tutte le finestre.
use crate::{pty, winsession};
use serde::Serialize;
use std::sync::Mutex;
use std::time::Instant;
use tauri::{AppHandle, Emitter, Manager, State};
use tauri_plugin_updater::{Update, UpdaterExt};

#[derive(Default)]
pub struct PendingUpdate {
    update: Mutex<Option<Update>>,
    bytes: Mutex<Option<Vec<u8>>>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateInfo {
    version: String,
    current: String,
    notes: Option<String>,
    date: Option<String>,
}

/// Uscita per l'installazione (Windows: `install` termina il processo con `std::process::exit`, senza
/// passare da `RunEvent::ExitRequested`): terminali chiusi e finestra tolta dal registro, come un'uscita
/// normale. Chiamata dal plugin subito prima di avviare l'installer, quando il pacchetto è valido.
fn before_install_exit(app: &AppHandle) {
    app.state::<pty::PtyManager>().kill_all();
    if let Some(win) = app.get_webview_window("main") {
        winsession::save_on_exit(app, &win);
    }
}

/// C'è una versione più nuova? Ricorda l'aggiornamento trovato per il download e l'installazione.
#[tauri::command]
pub async fn update_check(app: AppHandle, state: State<'_, PendingUpdate>) -> Result<Option<UpdateInfo>, String> {
    let app2 = app.clone();
    let updater = app
        .updater_builder()
        .on_before_exit(move || before_install_exit(&app2))
        .build()
        .map_err(|e| e.to_string())?;
    let found = updater.check().await.map_err(|e| e.to_string())?;
    let info = found.as_ref().map(|u| UpdateInfo {
        version: u.version.clone(),
        current: u.current_version.clone(),
        notes: u.body.clone().filter(|b| !b.trim().is_empty()),
        date: u.raw_json.get("pub_date").and_then(|d| d.as_str()).map(str::to_string),
    });
    *state.update.lock().unwrap_or_else(|e| e.into_inner()) = found;
    *state.bytes.lock().unwrap_or_else(|e| e.into_inner()) = None; // un controllo nuovo invalida un download vecchio
    Ok(info)
}

/// Scarica l'aggiornamento trovato (firma verificata da `install`). Avanzamento: `update-progress`
/// con (byte ricevuti, totale), al massimo una ventina di volte al secondo.
#[tauri::command]
pub async fn update_download(app: AppHandle, state: State<'_, PendingUpdate>) -> Result<(), String> {
    let update = state
        .update
        .lock()
        .unwrap_or_else(|e| e.into_inner())
        .clone()
        .ok_or("No update to download")?;
    let mut received: u64 = 0;
    let mut last = Instant::now();
    let bytes = update
        .download(
            |chunk, total| {
                received += chunk as u64;
                if last.elapsed().as_millis() >= 50 || Some(received) == total {
                    last = Instant::now();
                    let _ = app.emit("update-progress", (received, total));
                }
            },
            || {},
        )
        .await
        .map_err(|e| e.to_string())?;
    *state.bytes.lock().unwrap_or_else(|e| e.into_inner()) = Some(bytes);
    Ok(())
}

/// Installa l'aggiornamento scaricato. Il frontend ha già salvato e fatto uscire le altre finestre.
/// Su Windows non ritorna (l'installer sostituisce Orbit e lo riapre); altrove riavvia l'app.
#[tauri::command]
pub fn update_install(app: AppHandle, state: State<'_, PendingUpdate>) -> Result<(), String> {
    let update = state
        .update
        .lock()
        .unwrap_or_else(|e| e.into_inner())
        .clone()
        .ok_or("No update to install")?;
    let bytes = state
        .bytes
        .lock()
        .unwrap_or_else(|e| e.into_inner())
        .take()
        .ok_or("The update has not been downloaded")?;
    winsession::write_update_marker(&app, &update.current_version, &update.version);
    winsession::mark_quitting(&app, true);
    if let Err(e) = update.install(bytes) {
        // firma non valida o installer non avviabile: Orbit resta aperto com'era
        winsession::clear_update_marker(&app);
        winsession::mark_quitting(&app, false);
        return Err(e.to_string());
    }
    if cfg!(not(windows)) {
        app.restart();
    }
    Ok(())
}
