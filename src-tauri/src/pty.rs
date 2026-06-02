// Terminale: PTY reale via portable-pty (ConPTY su Windows). Una sessione per id.
// L'output viaggia verso il frontend come eventi `pty-data-<id>` (byte in base64);
// l'input arriva via `pty_write`. La sessione sopravvive allo smonta/rimonta del
// componente (così un `claude` in esecuzione non muore nascondendo il pannello).
use base64::Engine;
use portable_pty::{native_pty_system, CommandBuilder, MasterPty, PtySize};
use std::collections::HashMap;
use std::io::{Read, Write};
use std::sync::Mutex;
use tauri::{AppHandle, Emitter, State};

struct PtySession {
    master: Box<dyn MasterPty + Send>,
    writer: Box<dyn Write + Send>,
    child: Box<dyn portable_pty::Child + Send + Sync>,
}

#[derive(Default)]
pub struct PtyManager {
    sessions: Mutex<HashMap<String, PtySession>>,
}

fn default_shell() -> CommandBuilder {
    if let Ok(s) = std::env::var("LUME_SHELL") {
        return CommandBuilder::new(s);
    }
    #[cfg(windows)]
    {
        CommandBuilder::new("powershell.exe")
    }
    #[cfg(not(windows))]
    {
        let sh = std::env::var("SHELL").unwrap_or_else(|_| "/bin/bash".to_string());
        CommandBuilder::new(sh)
    }
}

#[tauri::command]
pub fn pty_spawn(
    app: AppHandle,
    state: State<PtyManager>,
    id: String,
    cols: u16,
    rows: u16,
    cwd: Option<String>,
) -> Result<(), String> {
    // idempotente: se la sessione esiste già la teniamo viva (re-attach)
    if state.sessions.lock().unwrap().contains_key(&id) {
        return Ok(());
    }

    let pty_system = native_pty_system();
    let pair = pty_system
        .openpty(PtySize {
            rows,
            cols,
            pixel_width: 0,
            pixel_height: 0,
        })
        .map_err(|e| e.to_string())?;

    let mut cmd = default_shell();
    let dir = cwd
        .filter(|c| std::path::Path::new(c).is_dir())
        .or_else(|| std::env::var("LUME_DIR").ok().filter(|c| std::path::Path::new(c).is_dir()));
    if let Some(d) = dir {
        cmd.cwd(d);
    }

    let child = pair.slave.spawn_command(cmd).map_err(|e| e.to_string())?;
    drop(pair.slave); // chiudi il lato slave: serve per rilevare l'EOF all'uscita della shell

    let mut reader = pair.master.try_clone_reader().map_err(|e| e.to_string())?;
    let writer = pair.master.take_writer().map_err(|e| e.to_string())?;

    let app2 = app.clone();
    let id2 = id.clone();
    std::thread::spawn(move || {
        let mut buf = [0u8; 4096];
        let engine = base64::engine::general_purpose::STANDARD;
        loop {
            match reader.read(&mut buf) {
                Ok(0) => break,
                Ok(n) => {
                    let payload = engine.encode(&buf[..n]);
                    if app2.emit(&format!("pty-data-{}", id2), payload).is_err() {
                        break;
                    }
                }
                Err(_) => break,
            }
        }
        let _ = app2.emit(&format!("pty-exit-{}", id2), ());
    });

    state.sessions.lock().unwrap().insert(
        id,
        PtySession {
            master: pair.master,
            writer,
            child,
        },
    );
    Ok(())
}

#[tauri::command]
pub fn pty_write(state: State<PtyManager>, id: String, data: String) -> Result<(), String> {
    let mut sessions = state.sessions.lock().unwrap();
    if let Some(s) = sessions.get_mut(&id) {
        s.writer.write_all(data.as_bytes()).map_err(|e| e.to_string())?;
        s.writer.flush().map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
pub fn pty_resize(state: State<PtyManager>, id: String, cols: u16, rows: u16) -> Result<(), String> {
    let sessions = state.sessions.lock().unwrap();
    if let Some(s) = sessions.get(&id) {
        s.master
            .resize(PtySize {
                rows,
                cols,
                pixel_width: 0,
                pixel_height: 0,
            })
            .map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
pub fn pty_kill(state: State<PtyManager>, id: String) -> Result<(), String> {
    if let Some(mut s) = state.sessions.lock().unwrap().remove(&id) {
        let _ = s.child.kill();
    }
    Ok(())
}
