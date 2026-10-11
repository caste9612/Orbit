// Chat di Claude dentro i terminali di Orbit (M66). Claude Code tiene un registro delle sessioni aperte,
// `<config>/sessions/<pid>.json` (pid del processo `claude`, sessionId, cwd, startedAt…), aggiornato
// finché la chat è viva. Per sapere quale conversazione gira in una scheda si cerca, fra i discendenti
// della sua shell, il processo che ha un file nel registro: così Orbit riprende al riavvio la chat giusta
// (`claude --resume <id>`), anche se dentro la chat si è fatto /clear o /resume, e anche se `claude` è
// stato lanciato a mano in una shell. Niente dipendenze: la tabella dei processi viene da ToolHelp
// (Windows) o da `ps` (macOS/Linux).
use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet, VecDeque};
use std::path::{Path, PathBuf};

/// Conversazione in corso in una scheda: id da passare a `--resume` e cartella in cui riprenderla
/// (Claude Code cerca la sessione fra quelle della cartella corrente).
#[derive(Serialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ChatInfo {
    pub session_id: String,
    pub cwd: Option<String>,
}

/// Voce del registro di Claude Code (solo i campi che servono; gli altri si ignorano).
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct RegEntry {
    pid: Option<u32>,
    session_id: Option<String>,
    cwd: Option<String>,
    started_at: Option<u64>, // ms dall'epoch
}

/// Cartella di configurazione di Claude Code: `CLAUDE_CONFIG_DIR` se impostata, altrimenti `~/.claude`.
pub fn claude_dir() -> Option<PathBuf> {
    if let Some(d) = std::env::var_os("CLAUDE_CONFIG_DIR").filter(|d| !d.is_empty()) {
        return Some(PathBuf::from(d));
    }
    let home = std::env::var_os("USERPROFILE").or_else(|| std::env::var_os("HOME"))?;
    Some(Path::new(&home).join(".claude"))
}

/// Un id di sessione è un UUID: solo lettere, cifre e trattini (niente percorsi nei nomi di file).
fn valid_id(id: &str) -> bool {
    !id.is_empty() && id.len() <= 64 && id.chars().all(|c| c.is_ascii_alphanumeric() || c == '-')
}

/// La chat registrata per il processo `pid`, se è partita dopo `not_before_ms` (un pid riciclato da un
/// processo più vecchio non conta).
fn registered_chat(dir: &Path, pid: u32, not_before_ms: u64) -> Option<ChatInfo> {
    let raw = std::fs::read_to_string(dir.join(format!("{pid}.json"))).ok()?;
    let e: RegEntry = serde_json::from_str(&raw).ok()?;
    if e.pid.is_some_and(|p| p != pid) || e.started_at.is_some_and(|t| t + 2_000 < not_before_ms) {
        return None;
    }
    let session_id = e.session_id.filter(|s| valid_id(s))?;
    Some(ChatInfo { session_id, cwd: e.cwd.filter(|c| !c.is_empty()) })
}

/// Per ogni scheda (id, pid della sua shell), la chat trovata visitando i discendenti in ampiezza: la più
/// vicina alla shell, cioè quella interattiva e non un suo eventuale sottoprocesso. Pura (la tabella dei
/// processi e la lettura del registro arrivano da fuori), quindi testabile.
fn find_chats(
    roots: &[(String, u32)],
    table: &[(u32, u32)],
    lookup: impl Fn(u32) -> Option<ChatInfo>,
) -> HashMap<String, ChatInfo> {
    let mut children: HashMap<u32, Vec<u32>> = HashMap::new();
    for &(pid, ppid) in table {
        if pid != ppid {
            children.entry(ppid).or_default().push(pid);
        }
    }
    let mut out = HashMap::new();
    for (id, root) in roots {
        let mut seen = HashSet::from([*root]);
        let mut queue = VecDeque::from([*root]);
        while let Some(p) = queue.pop_front() {
            if p != *root {
                if let Some(chat) = lookup(p) {
                    out.insert(id.clone(), chat);
                    break;
                }
            }
            for &c in children.get(&p).map(Vec::as_slice).unwrap_or(&[]) {
                if seen.insert(c) && seen.len() < 4096 {
                    queue.push_back(c);
                }
            }
        }
    }
    out
}

/// Chat in corso sotto ciascuna shell: `roots` = (id della scheda, pid della shell, avvio della shell in
/// ms dall'epoch). Le schede senza chat non compaiono.
pub fn chats_under(roots: &[(String, u32, u64)]) -> HashMap<String, ChatInfo> {
    let Some(dir) = claude_dir().map(|d| d.join("sessions")).filter(|d| d.is_dir()) else {
        return HashMap::new();
    };
    let table = process_table();
    let mut out = HashMap::new();
    // una visita per scheda: ognuna ha il suo "non prima di" (l'avvio della propria shell)
    for (id, pid, spawned) in roots {
        let found = find_chats(&[(id.clone(), *pid)], &table, |p| registered_chat(&dir, p, *spawned));
        out.extend(found);
    }
    out
}

/// Quali delle conversazioni `ids` hanno un transcript su disco (`<config>/projects/*/<id>.jsonl`): una
/// chat aperta e mai usata non ne ha, e `--resume` fallirebbe.
pub fn transcripts_exist(ids: &[String]) -> Vec<bool> {
    let Some(projects) = claude_dir().map(|d| d.join("projects")) else {
        return vec![false; ids.len()];
    };
    let dirs: Vec<PathBuf> = std::fs::read_dir(&projects)
        .map(|rd| rd.flatten().map(|e| e.path()).filter(|p| p.is_dir()).collect())
        .unwrap_or_default();
    ids.iter()
        .map(|id| valid_id(id) && dirs.iter().any(|d| d.join(format!("{id}.jsonl")).is_file()))
        .collect()
}

/// (pid, pid del genitore) di tutti i processi.
#[cfg(windows)]
fn process_table() -> Vec<(u32, u32)> {
    use windows_sys::Win32::Foundation::{CloseHandle, INVALID_HANDLE_VALUE};
    use windows_sys::Win32::System::Diagnostics::ToolHelp::{
        CreateToolhelp32Snapshot, Process32FirstW, Process32NextW, PROCESSENTRY32W, TH32CS_SNAPPROCESS,
    };
    let mut out = Vec::new();
    // SAFETY: API Win32 con struct dimensionata qui; l'handle dello snapshot viene chiuso.
    unsafe {
        let snap = CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0);
        if snap == INVALID_HANDLE_VALUE {
            return out;
        }
        let mut pe: PROCESSENTRY32W = std::mem::zeroed();
        pe.dwSize = std::mem::size_of::<PROCESSENTRY32W>() as u32;
        let mut more = Process32FirstW(snap, &mut pe) != 0;
        while more {
            out.push((pe.th32ProcessID, pe.th32ParentProcessID));
            more = Process32NextW(snap, &mut pe) != 0;
        }
        CloseHandle(snap);
    }
    out
}

#[cfg(unix)]
fn process_table() -> Vec<(u32, u32)> {
    let Ok(o) = std::process::Command::new("ps").args(["-A", "-o", "pid=", "-o", "ppid="]).output() else {
        return Vec::new();
    };
    String::from_utf8_lossy(&o.stdout)
        .lines()
        .filter_map(|l| {
            let mut it = l.split_whitespace().map(|x| x.parse::<u32>());
            Some((it.next()?.ok()?, it.next()?.ok()?))
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn chat(id: &str) -> ChatInfo {
        ChatInfo { session_id: id.into(), cwd: Some("C:/repo".into()) }
    }

    #[test]
    fn trova_la_chat_sotto_la_shell_giusta() {
        // shell 10 → claude 11 (chat A) → bash 12; shell 20 → node 21 → claude 22 (chat B); shell 30 senza chat
        let table = [(10, 1), (11, 10), (12, 11), (20, 1), (21, 20), (22, 21), (30, 1), (31, 30)];
        let reg = |p: u32| match p {
            11 => Some(chat("A")),
            12 => Some(chat("sotto-A")), // un sottoprocesso con una sua voce: vince la più vicina alla shell
            22 => Some(chat("B")),
            _ => None,
        };
        let roots = [("t1".to_string(), 10), ("t2".to_string(), 20), ("t3".to_string(), 30)];
        let got = find_chats(&roots, &table, reg);
        assert_eq!(got.get("t1"), Some(&chat("A")));
        assert_eq!(got.get("t2"), Some(&chat("B")));
        assert!(!got.contains_key("t3"));
    }

    #[test]
    fn non_si_perde_nei_cicli_e_ignora_la_shell_stessa() {
        // pid riciclati: 40 ↔ 41 si fanno da genitore a vicenda; la shell stessa ha una voce (non conta)
        let table = [(40, 41), (41, 40), (42, 41)];
        let reg = |p: u32| if p == 40 { Some(chat("shell")) } else { None };
        let got = find_chats(&[("t".to_string(), 40)], &table, reg);
        assert!(got.is_empty());
    }

    #[test]
    fn registro_scartato_se_piu_vecchio_della_shell_o_di_un_altro_pid() {
        let dir = std::env::temp_dir().join(format!("orbit-claudeproc-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let write = |pid: u32, body: &str| std::fs::write(dir.join(format!("{pid}.json")), body).unwrap();
        write(100, r#"{"pid":100,"sessionId":"aaaa-1","cwd":"C:\\r","startedAt":5000}"#);
        write(101, r#"{"pid":999,"sessionId":"bbbb-2","startedAt":5000}"#); // pid diverso dal nome
        write(102, r#"{"pid":102,"sessionId":"../../x","startedAt":5000}"#); // id non valido
        assert_eq!(
            registered_chat(&dir, 100, 4000),
            Some(ChatInfo { session_id: "aaaa-1".into(), cwd: Some("C:\\r".into()) })
        );
        assert_eq!(registered_chat(&dir, 100, 60_000), None); // partita prima della shell: pid riciclato
        assert_eq!(registered_chat(&dir, 101, 0), None);
        assert_eq!(registered_chat(&dir, 102, 0), None);
        assert_eq!(registered_chat(&dir, 103, 0), None); // nessun file
        std::fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn id_validi() {
        assert!(valid_id("8a1c2f3e-0000-4000-8000-1234567890ab"));
        assert!(!valid_id(""));
        assert!(!valid_id("../x"));
        assert!(!valid_id("a/b"));
    }
}
