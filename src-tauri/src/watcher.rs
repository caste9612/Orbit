// File watcher: osserva la cartella di progetto e notifica il frontend (debounced)
// così albero e stato git restano aggiornati in tempo reale.
use notify::{recommended_watcher, EventKind, RecommendedWatcher, RecursiveMode, Watcher};
use std::path::Path;
use std::sync::mpsc::channel;
use std::sync::Mutex;
use tauri::{AppHandle, Emitter, State};

#[derive(Default)]
pub struct WatchState {
    watcher: Mutex<Option<RecommendedWatcher>>,
}

// Cartelle rumorose/pesanti da ignorare (riduce eventi e, su Linux, il numero di watch).
fn is_excluded(p: &Path) -> bool {
    p.components().any(|c| {
        matches!(
            c.as_os_str().to_str(),
            Some("node_modules") | Some("target") | Some("dist") | Some(".git")
        )
    })
}

#[tauri::command]
pub fn watch_start(app: AppHandle, state: State<WatchState>, root: String) -> Result<(), String> {
    let (tx, rx) = channel::<()>();

    let mut watcher = recommended_watcher(move |res: Result<notify::Event, notify::Error>| {
        if let Ok(ev) = res {
            if matches!(ev.kind, EventKind::Access(_)) {
                return; // ignora i soli accessi in lettura
            }
            if ev.paths.iter().any(|p| !is_excluded(p)) {
                let _ = tx.send(());
            }
        }
    })
    .map_err(|e| e.to_string())?;

    watcher
        .watch(Path::new(&root), RecursiveMode::Recursive)
        .map_err(|e| e.to_string())?;

    // Thread di debounce: coalizza i burst in un solo evento ogni ~250ms.
    let app2 = app.clone();
    std::thread::spawn(move || loop {
        if rx.recv().is_err() {
            break; // watcher sostituito/distrutto -> il sender è caduto
        }
        std::thread::sleep(std::time::Duration::from_millis(250));
        while rx.try_recv().is_ok() {}
        let _ = app2.emit("fs-changed", ());
    });

    // Sostituire il watcher precedente lo distrugge (e ferma il suo thread).
    *state.watcher.lock().unwrap() = Some(watcher);
    Ok(())
}
