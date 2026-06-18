// Persistenza della geometria della finestra principale: posizione, dimensione e stato massimizzato
// vengono salvati all'uscita e ripristinati all'avvio (Orbit ripartiva sempre centrato a 1280x800).
// Zero dipendenze extra: solo std + serde + le API finestra di Tauri. Lo stato vive accanto alle
// sessioni in app_config_dir (window.json). Si applica SOLO alla finestra "main": le finestre
// flottanti del terminale ("term-float-*") restano effimere.
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::sync::Mutex;
use tauri::{AppHandle, Manager, PhysicalPosition, PhysicalSize, WebviewWindow, WindowEvent};

#[derive(Serialize, Deserialize, Clone, Copy)]
struct WinGeom {
    x: i32,
    y: i32,
    width: u32,
    height: u32,
    maximized: bool,
}

// Ultima geometria "normale" (non massimizzata/minimizzata), aggiornata sui Moved/Resized: è ciò che
// salviamo, così ripristinando e poi de-massimizzando la finestra torna a una dimensione sensata.
#[derive(Default)]
pub struct LastNormal(pub Mutex<Option<(i32, i32, u32, u32)>>);

fn state_path(app: &AppHandle) -> Option<PathBuf> {
    app.path().app_config_dir().ok().map(|d| d.join("window.json"))
}

fn load(app: &AppHandle) -> Option<WinGeom> {
    let raw = std::fs::read_to_string(state_path(app)?).ok()?;
    serde_json::from_str(&raw).ok()
}

/// Geometria corrente (fisica), o None se le API falliscono.
fn current_geom(win: &WebviewWindow) -> Option<(i32, i32, u32, u32)> {
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

/// Applica la geometria salvata alla finestra `main` e poi la mostra (la config la crea nascosta:
/// così non si vede il "salto" dalla posizione centrata di default a quella ripristinata).
fn restore(win: &WebviewWindow) {
    if let Some(g) = load(win.app_handle()) {
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
    let _ = win.show();
}

/// Scrive su disco la geometria da salvare: l'ultima "normale" tracciata (o quella corrente come
/// fallback) + lo stato massimizzato attuale. Idempotente: si può chiamare più volte all'uscita.
pub fn save(win: &WebviewWindow, last: &LastNormal) {
    let maximized = win.is_maximized().unwrap_or(false);
    let normal = *last.0.lock().unwrap();
    let (x, y, width, height) = match normal.or_else(|| current_geom(win)) {
        Some(g) => g,
        None => return,
    };
    let g = WinGeom { x, y, width, height, maximized };
    let Some(path) = state_path(win.app_handle()) else { return };
    if let Some(parent) = path.parent() {
        let _ = std::fs::create_dir_all(parent);
    }
    if let Ok(json) = serde_json::to_string(&g) {
        let _ = std::fs::write(path, json);
    }
}

/// Ripristina la geometria e installa i listener (traccia la geometria "normale", salva alla
/// chiusura). Chiamata in `setup()` per la finestra `main`.
pub fn init(win: &WebviewWindow) {
    restore(win);
    let w = win.clone();
    win.on_window_event(move |event| match event {
        WindowEvent::Moved(_) | WindowEvent::Resized(_) => {
            // aggiorna la geometria "normale" solo in stato normale (non max/min): da minimizzata
            // Windows riporta coordinate sentinella tipo -32000, da scartare.
            let maxed = w.is_maximized().unwrap_or(false);
            let mind = w.is_minimized().unwrap_or(false);
            if !maxed && !mind {
                if let Some(g @ (x, y, _, _)) = current_geom(&w) {
                    if x > -30000 && y > -30000 {
                        *w.app_handle().state::<LastNormal>().0.lock().unwrap() = Some(g);
                    }
                }
            }
        }
        WindowEvent::CloseRequested { .. } => {
            save(&w, &w.app_handle().state::<LastNormal>());
        }
        _ => {}
    });
}
