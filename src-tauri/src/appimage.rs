// Orbit dentro un AppImage (M75). Il runtime dell'AppImage monta il pacchetto in una cartella temporanea
// (`$APPDIR`, es. /tmp/.mount_OrbitXXXX) e il suo AppRun aggiunge all'ambiente percorsi che puntano lì dentro
// (librerie e moduli GTK/GIO/GStreamer, XDG_DATA_DIRS…). Tre conseguenze per i processi che Orbit avvia:
// - un'altra finestra va lanciata dal file .AppImage (`$APPIMAGE`), non dal binario nel mount, che sparisce
//   quando esce il processo che l'ha montato;
// - le shell del terminale, xdg-open e le finestre nuove non devono ereditare quei percorsi: un programma
//   GTK aperto dal terminale caricherebbe i moduli di Orbit (o di un mount già smontato) e potrebbe rompersi;
// - né i descrittori aperti, fra cui quello che tiene vivo il mount (vedi `clean_command`).
// Fuori da un AppImage (Windows, .deb, .rpm, dev) l'ambiente resta com'era; su Linux i descrittori si chiudono
// comunque.
use std::path::PathBuf;

/// L'eseguibile da rilanciare per aprire un'altra istanza di Orbit.
pub fn self_exe() -> std::io::Result<PathBuf> {
    #[cfg(target_os = "linux")]
    if let Some(p) = std::env::var_os("APPIMAGE").map(PathBuf::from).filter(|p| p.is_file()) {
        return Ok(p);
    }
    std::env::current_exe()
}

/// Variabili d'ambiente da cambiare in un processo figlio: `(nome, None)` la toglie, `(nome, Some(v))` la
/// sostituisce. Vuoto fuori da un AppImage.
pub fn child_env_fixes() -> Vec<(String, Option<String>)> {
    if !cfg!(target_os = "linux") {
        return Vec::new();
    }
    let Some(appdir) = std::env::var("APPDIR").ok().filter(|d| !d.is_empty()) else {
        return Vec::new();
    };
    if std::env::var_os("APPIMAGE").is_none() {
        return Vec::new(); // APPDIR da solo non basta: potrebbe averlo l'utente per altro
    }
    env_fixes(std::env::vars(), &appdir)
}

/// Il calcolo puro di `child_env_fixes`, testato a parte. Cosa fa l'AppRun di Tauri (linuxdeploy con l'hook
/// GTK, verificato su un AppImage di Orbit): aggiunge `$APPDIR/usr/share` a XDG_DATA_DIRS, mette dentro
/// `$APPDIR` GTK_PATH, GDK_PIXBUF_MODULE_FILE, GSETTINGS_SCHEMA_DIR, GIO_EXTRA_MODULES & co., e impone
/// `GTK_THEME=Adwaita:dark|light` (fino al Tauri CLI 2.11 anche `GDK_BACKEND=x11`), senza salvare i valori di
/// prima. Quindi:
/// - le variabili del runtime (`APPDIR`, `APPIMAGE`, `ARGV0`, `OWD`) si tolgono;
/// - una lista di percorsi perde le voci dentro `$APPDIR`; se non resta nulla si toglie;
/// - qualunque altra variabile che punta dentro `$APPDIR` si toglie;
/// - `GDK_BACKEND=x11` e `GTK_THEME=Adwaita:dark|light` si tolgono: un programma GTK aperto dal terminale
///   usa di nuovo il backend e il tema del sistema (chi li aveva impostati così a mano li perde solo lì).
pub(crate) fn env_fixes(vars: impl Iterator<Item = (String, String)>, appdir: &str) -> Vec<(String, Option<String>)> {
    let appdir = appdir.trim_end_matches('/');
    let inside = |p: &str| p == appdir || p.starts_with(&format!("{appdir}/"));
    let mut out = Vec::new();
    for (k, v) in vars {
        if matches!(k.as_str(), "APPDIR" | "APPIMAGE" | "ARGV0" | "OWD") {
            out.push((k, None));
        } else if (k == "GDK_BACKEND" && v == "x11") || (k == "GTK_THEME" && matches!(v.as_str(), "Adwaita:dark" | "Adwaita:light")) {
            out.push((k, None));
        } else if !v.contains(appdir) {
            continue;
        } else if v.contains(':') {
            let kept: Vec<&str> = v.split(':').filter(|p| !p.is_empty() && !inside(p)).collect();
            let kept = if kept.is_empty() { None } else { Some(kept.join(":")) };
            out.push((k, kept));
        } else if inside(&v) {
            out.push((k, None));
        }
    }
    out
}

/// Applica le correzioni a un `std::process::Command`. Su Linux, in più, il figlio non eredita i descrittori
/// aperti oltre stdin/stdout/stderr. Ne restano aperti senza CLOEXEC: WebKitGTK tiene /proc/meminfo, i file dei
/// cgroup e /dev/urandom, e il runtime dell'AppImage passa all'app un descrittore della cartella del suo mount
/// per tenerlo vivo. Ereditato da un Orbit nuovo (una finestra, il riavvio dopo un aggiornamento), quel
/// descrittore teneva occupato il mount vecchio: smontarlo falliva e il suo processo restava lì per sempre
/// (verificato su CachyOS, M75). Le shell del terminale non ne hanno bisogno: portable-pty li chiude già.
pub fn clean_command(cmd: &mut std::process::Command) {
    for (k, v) in child_env_fixes() {
        match v {
            Some(v) => cmd.env(k, v),
            None => cmd.env_remove(k),
        };
    }
    #[cfg(target_os = "linux")]
    {
        use std::os::unix::process::CommandExt;
        // SAFETY: gira nel figlio fra fork ed exec, e fa solo chiamate di sistema (async-signal-safe).
        // close_range esiste da Linux 5.9; prima, i descrittori si chiudono uno per uno.
        unsafe {
            cmd.pre_exec(|| {
                if libc::syscall(libc::SYS_close_range, 3u32, u32::MAX, 0u32) != 0 {
                    for fd in 3..4096 {
                        libc::close(fd);
                    }
                }
                Ok(())
            });
        }
    }
}

/// Avvia un processo che vive per conto suo (un'altra finestra di Orbit, xdg-open) e ne raccoglie l'uscita da
/// un thread. Fuori da Windows un figlio finito resta "zombie" finché il genitore non lo attende: ogni finestra
/// aperta e chiusa da qui ne lasciava uno fino all'uscita di questa (visto su CachyOS, M75).
pub fn spawn_detached(cmd: &mut std::process::Command) -> std::io::Result<()> {
    let mut child = cmd.spawn()?;
    if cfg!(unix) {
        std::thread::spawn(move || {
            let _ = child.wait();
        });
    }
    Ok(())
}

/// Applica le correzioni a una shell del terminale.
pub fn clean_pty(cmd: &mut portable_pty::CommandBuilder) {
    for (k, v) in child_env_fixes() {
        match v {
            Some(v) => cmd.env(k, v),
            None => cmd.env_remove(k),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn fixes(vars: &[(&str, &str)]) -> Vec<(String, Option<String>)> {
        env_fixes(vars.iter().map(|(k, v)| (k.to_string(), v.to_string())), "/tmp/.mount_OrbitAB12")
    }

    #[test]
    fn runtime_vars_go_away() {
        let f = fixes(&[("APPDIR", "/tmp/.mount_OrbitAB12"), ("APPIMAGE", "/home/u/Orbit.AppImage"), ("OWD", "/home/u"), ("HOME", "/home/u")]);
        assert_eq!(f, vec![("APPDIR".into(), None), ("APPIMAGE".into(), None), ("OWD".into(), None)]);
    }

    #[test]
    fn path_lists_lose_the_mount_entries() {
        let f = fixes(&[
            ("XDG_DATA_DIRS", "/tmp/.mount_OrbitAB12/usr/share:/usr/local/share:/usr/share"),
            ("LD_LIBRARY_PATH", "/tmp/.mount_OrbitAB12/usr/lib"),
            ("PATH", "/usr/bin:/tmp/.mount_OrbitAB12/usr/bin"),
        ]);
        assert_eq!(
            f,
            vec![
                ("XDG_DATA_DIRS".into(), Some("/usr/local/share:/usr/share".into())),
                ("LD_LIBRARY_PATH".into(), None),
                ("PATH".into(), Some("/usr/bin".into())),
            ]
        );
    }

    #[test]
    fn single_paths_inside_go_away_others_stay() {
        let f = fixes(&[
            ("GTK_PATH", "/tmp/.mount_OrbitAB12/usr/lib/gtk-3.0"),
            ("GDK_PIXBUF_MODULE_FILE", "/tmp/.mount_OrbitAB12/usr/lib/loaders.cache"),
            ("EDITOR", "nvim"),
            ("SIMILAR", "/tmp/.mount_OrbitAB123/x"), // un altro mount con un nome che comincia uguale
        ]);
        assert_eq!(f, vec![("GTK_PATH".into(), None), ("GDK_PIXBUF_MODULE_FILE".into(), None)]);
    }

    #[test]
    fn gtk_hook_overrides_go_away() {
        let f = fixes(&[("GDK_BACKEND", "x11"), ("GTK_THEME", "Adwaita:dark"), ("GTK_DATA_PREFIX", "/tmp/.mount_OrbitAB12")]);
        assert_eq!(f, vec![("GDK_BACKEND".into(), None), ("GTK_THEME".into(), None), ("GTK_DATA_PREFIX".into(), None)]);
        // scelte dell'utente diverse da quelle dell'hook restano
        assert!(fixes(&[("GDK_BACKEND", "wayland"), ("GTK_THEME", "Breeze-Dark")]).is_empty());
    }
}
