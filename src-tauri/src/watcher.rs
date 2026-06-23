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
    // cache dell'indice simboli: scriverla NON deve ri-scatenare lo scan (eviterebbe un loop).
    // Le altre .orbit/*.json (run/claude/shelf) restano osservate.
    let s = p.to_string_lossy();
    if s.contains(".orbit/index") || s.contains(".orbit\\index") {
        return true;
    }
    p.components().any(|c| {
        matches!(
            c.as_os_str().to_str(),
            Some("node_modules") | Some("target") | Some("dist") | Some(".git")
        )
    })
}

#[tauri::command]
pub fn watch_start(app: AppHandle, state: State<WatchState>, root: String) -> Result<(), String> {
    let (tx, rx) = channel::<Vec<String>>();

    let mut watcher = recommended_watcher(move |res: Result<notify::Event, notify::Error>| {
        if let Ok(ev) = res {
            if matches!(ev.kind, EventKind::Access(_)) {
                return; // ignora i soli accessi in lettura
            }
            // manda i path cambiati (non esclusi): il frontend li usa per ricaricare in modo
            // SELETTIVO (solo i file aperti cambiati, solo i config .orbit toccati).
            let paths: Vec<String> = ev
                .paths
                .iter()
                .filter(|p| !is_excluded(p))
                .map(|p| p.to_string_lossy().to_string())
                .collect();
            if !paths.is_empty() {
                let _ = tx.send(paths);
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
        // primo evento del burst (bloccante); poi coalizza ~250ms accumulando i path.
        let mut paths = match rx.recv() {
            Ok(p) => p,
            Err(_) => break, // watcher sostituito/distrutto -> il sender è caduto
        };
        std::thread::sleep(std::time::Duration::from_millis(250));
        while let Ok(more) = rx.try_recv() {
            paths.extend(more);
        }
        paths.sort();
        paths.dedup();
        let _ = app2.emit("fs-changed", paths);
    });

    // Sostituire il watcher precedente lo distrugge (e ferma il suo thread).
    *state.watcher.lock().unwrap() = Some(watcher);
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::is_excluded;
    use std::path::Path;

    #[test]
    fn excludes_noise_and_index_cache_but_not_orbit_configs() {
        // cartelle rumore/pesanti: escluse ovunque (anche annidate)
        assert!(is_excluded(Path::new("/proj/node_modules/lib/x.js")));
        assert!(is_excluded(Path::new("/proj/src-tauri/target/debug/y")));
        assert!(is_excluded(Path::new("/proj/dist/app.js")));
        assert!(is_excluded(Path::new("/proj/.git/HEAD")));
        // cache dell'indice simboli: esclusa (scriverla NON deve ri-scatenare lo scan → loop)
        assert!(is_excluded(Path::new("/proj/.orbit/index/symbols.json")));
        assert!(is_excluded(Path::new("/proj/docs/.orbit/index/symbols.json")));
        // i config .orbit/* restano OSSERVATI (Claude può toccarli → il menu si ricarica)
        assert!(!is_excluded(Path::new("/proj/.orbit/run.json")));
        assert!(!is_excluded(Path::new("/proj/.orbit/claude.json")));
        assert!(!is_excluded(Path::new("/proj/.orbit/shelf.json")));
        // sorgenti normali: non esclusi
        assert!(!is_excluded(Path::new("/proj/src/main.rs")));
        assert!(!is_excluded(Path::new("/proj/README.md")));
    }
}
