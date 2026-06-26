// Vista "Attività": ricostruisce le UNITÀ DI LAVORO di Claude Code dai transcript JSONL
// (~/.claude/projects/<slug>/<sessionId>.jsonl). Niente LSP, niente dipendenze nuove: solo `std` +
// `serde_json` (già presente). Parsing DIFENSIVO — il formato è interno a Claude Code e può cambiare
// (le righe portano un campo `version`): le righe non riconosciute o non parsabili vengono ignorate.
//
// Modello: l'atomo è l'UNITÀ DI LAVORO, non la sessione (la sessione è solo il contenitore/istanza).
// Segmentazione PROMPT-FIRST: ogni prompt umano (più il lavoro che innesca) è un'unità; un nuovo prompt
// chiude la precedente. Il commit, se avviene, etichetta l'unità in cui cade; confine duro anche sul
// cambio di branch. L'etichetta è il messaggio del commit, altrimenti il prompt. I file (+/−) vengono dal `toolUseResult`
// (campo `structuredPatch`); i comandi dal `tool_use` di Bash/PowerShell.
use notify::{recommended_watcher, EventKind, RecommendedWatcher, RecursiveMode, Watcher};
use serde::Serialize;
use serde_json::Value;
use std::path::Path;
use std::sync::mpsc::channel;
use std::sync::Mutex;
use tauri::{AppHandle, Emitter, State};

#[derive(Serialize, Clone, Default)]
#[serde(rename_all = "camelCase")]
pub struct UnitFile {
    op: String,   // "A" = creato | "M" = modificato
    path: String, // path come riportato dal transcript (assoluto; lo slug della cartella è lossy)
    add: u32,
    del: u32,
    user_modified: bool, // l'utente ha poi ritoccato a mano il file dopo l'edit di Claude
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct WorkUnit {
    id: String,            // "<sessionId>#<indice>"
    session_id: String,
    session_title: String, // aiTitle della sessione (può essere vuoto)
    repo: String,          // cwd reale del repo (letto dalle righe, non dallo slug)
    branch: String,
    kind: String,          // feat | fix | docs | refactor | perf | chore
    label: String,         // messaggio di commit, altrimenti il primo prompt
    prompts: Vec<String>,
    files: Vec<UnitFile>,
    cmds: Vec<String>,
    committed: bool,
    commit: Option<String>, // hash breve, best-effort (può mancare anche se committed)
    start: String,          // timestamp ISO del primo evento dell'unità
    end: String,            // timestamp ISO dell'ultimo evento
    add: u32,               // churn totale (somma dei file)
    del: u32,
    live: bool,             // ultima unità di una sessione il cui transcript è stato scritto da poco
}

// Accumulatore dell'unità in costruzione.
#[derive(Default)]
struct Acc {
    prompts: Vec<String>,
    files: Vec<UnitFile>,
    cmds: Vec<String>,
    branch: String,
    start: String,
    end: String,
    committed: bool,
    commit_msg: Option<String>,
    commit_hash: Option<String>,
}

impl Acc {
    fn has_work(&self) -> bool {
        !self.files.is_empty() || !self.cmds.is_empty()
    }
    fn touch(&mut self, ts: &str) {
        if ts.is_empty() {
            return;
        }
        if self.start.is_empty() {
            self.start = ts.to_string();
        }
        self.end = ts.to_string();
    }
    fn add_file(&mut self, op: &str, path: &str, add: u32, del: u32, um: bool) {
        if let Some(f) = self.files.iter_mut().find(|f| f.path == path) {
            f.add += add;
            f.del += del;
            if op == "A" {
                f.op = "A".into(); // se mai creato nell'unità, conta come nuovo
            }
            f.user_modified |= um;
        } else {
            self.files.push(UnitFile { op: op.into(), path: path.into(), add, del, user_modified: um });
        }
    }
}

/// Segmenta le righe (già parsate) di UN transcript nelle sue unità di lavoro.
fn segment(lines: &[Value], session_id: &str) -> Vec<WorkUnit> {
    // aiTitle: una sola per sessione (l'ultima vince); il cwd dalla prima riga che ce l'ha.
    let title = lines
        .iter()
        .rev()
        .find(|v| v["type"] == "ai-title")
        .and_then(|v| v["aiTitle"].as_str())
        .unwrap_or("")
        .to_string();
    let repo = lines
        .iter()
        .find_map(|v| v["cwd"].as_str().filter(|s| !s.is_empty()))
        .unwrap_or("")
        .to_string();

    let mut units: Vec<WorkUnit> = Vec::new();
    let mut acc = Acc::default();
    let mut idx: u32 = 0;

    for v in lines {
        let ts = v["timestamp"].as_str().unwrap_or("");

        // cambio branch = confine forte (chiude l'unità in corso, indipendentemente dal commit).
        if let Some(br) = v["gitBranch"].as_str().filter(|s| !s.is_empty()) {
            if acc.has_work() && !acc.branch.is_empty() && acc.branch != br {
                flush(&mut acc, &mut units, &mut idx, session_id, &title, &repo);
            }
            acc.branch = br.to_string();
        }

        let typ = v["type"].as_str().unwrap_or("");
        if typ == "user" {
            // risultato di un tool (edit di file o output di un comando), NON un prompt umano.
            if let Some(tr) = v.get("toolUseResult").filter(|t| !t.is_null()) {
                if let Some(fp) = tr.get("filePath").and_then(|x| x.as_str()) {
                    acc.touch(ts);
                    let is_create = tr.get("type").and_then(|t| t.as_str()) == Some("create");
                    let um = tr.get("userModified").and_then(|b| b.as_bool()).unwrap_or(false);
                    let (a, d) = patch_counts(tr);
                    acc.add_file(if is_create { "A" } else { "M" }, fp, a, d, um);
                } else if acc.committed && acc.commit_hash.is_none() {
                    // output di un comando: se aspettiamo l'hash del commit appena fatto, prendilo.
                    if let Some(h) = extract_commit_hash(tr) {
                        acc.commit_hash = Some(h);
                    }
                }
                continue;
            }
            // prompt umano "vero"?
            if v.get("isMeta").and_then(|b| b.as_bool()) == Some(true) {
                continue;
            }
            if let Some(text) = user_prompt_text(v) {
                // prompt-first: ogni nuovo prompt chiude l'unità precedente e ne apre una nuova
                flush(&mut acc, &mut units, &mut idx, session_id, &title, &repo);
                acc.touch(ts);
                acc.prompts.push(text);
            }
            continue;
        }

        if typ == "assistant" {
            if let Some(content) = v["message"]["content"].as_array() {
                for b in content {
                    if b["type"] != "tool_use" {
                        continue;
                    }
                    let name = b["name"].as_str().unwrap_or("");
                    if name == "Bash" || name == "PowerShell" {
                        let cmd = b["input"]["command"].as_str().unwrap_or("").to_string();
                        if cmd.is_empty() {
                            continue;
                        }
                        if is_git_commit(&cmd) {
                            // il commit appartiene all'unità corrente e la chiude: NON faccio flush
                            // qui, aspetto il prossimo contenuto così catturo l'hash dal risultato.
                            acc.touch(ts);
                            acc.cmds.push(cmd.clone());
                            acc.committed = true;
                            if acc.commit_msg.is_none() {
                                acc.commit_msg = commit_message(&cmd);
                            }
                        } else {
                            acc.touch(ts);
                            acc.cmds.push(cmd);
                        }
                    }
                    // Write/Edit/MultiEdit: i file li contiamo dal toolUseResult (sopra), non qui.
                }
            }
            continue;
        }
    }

    flush(&mut acc, &mut units, &mut idx, session_id, &title, &repo);
    units
}

// (rimossa close_if_committed: segmentazione prompt-first — il flush avviene a ogni nuovo prompt)

// Materializza l'unità accumulata (se ha lavoro vero: almeno un file o un comando) e azzera l'acc,
// conservando il branch corrente per l'unità successiva.
fn flush(acc: &mut Acc, units: &mut Vec<WorkUnit>, idx: &mut u32, sid: &str, title: &str, repo: &str) {
    if !acc.has_work() {
        let branch = std::mem::take(&mut acc.branch);
        *acc = Acc::default();
        acc.branch = branch;
        return;
    }
    let (add, del) = acc.files.iter().fold((0u32, 0u32), |(a, d), f| (a + f.add, d + f.del));
    let kind = infer_kind(acc);
    let label = make_label(acc);
    units.push(WorkUnit {
        id: format!("{sid}#{}", *idx),
        session_id: sid.to_string(),
        session_title: title.to_string(),
        repo: repo.to_string(),
        branch: acc.branch.clone(),
        kind,
        label,
        prompts: std::mem::take(&mut acc.prompts),
        files: std::mem::take(&mut acc.files),
        cmds: std::mem::take(&mut acc.cmds),
        committed: acc.committed,
        commit: acc.commit_hash.take(),
        start: std::mem::take(&mut acc.start),
        end: std::mem::take(&mut acc.end),
        add,
        del,
        live: false,
    });
    *idx += 1;
    let branch = std::mem::take(&mut acc.branch);
    *acc = Acc::default();
    acc.branch = branch;
}

fn infer_kind(acc: &Acc) -> String {
    if acc.committed {
        if let Some(k) = acc.commit_msg.as_deref().and_then(conventional_kind) {
            return k.to_string();
        }
    }
    if let Some(k) = branch_kind(&acc.branch) {
        return k.to_string();
    }
    if !acc.files.is_empty() && acc.files.iter().all(|f| is_doc(&f.path)) {
        return "docs".to_string();
    }
    "chore".to_string()
}

// Prefisso "conventional commit" → tipo dell'unità.
fn conventional_kind(msg: &str) -> Option<&'static str> {
    let low = msg.trim().to_lowercase();
    let head: String = low.chars().take_while(|c| c.is_ascii_alphabetic()).collect();
    match head.as_str() {
        "feat" => Some("feat"),
        "fix" => Some("fix"),
        "docs" => Some("docs"),
        "refactor" => Some("refactor"),
        "perf" => Some("perf"),
        "test" | "style" | "build" | "ci" | "chore" | "revert" => Some("chore"),
        _ => None,
    }
}

fn branch_kind(branch: &str) -> Option<&'static str> {
    let b = branch.to_lowercase();
    if b.starts_with("feature/") || b.starts_with("feat/") {
        Some("feat")
    } else if b.starts_with("fix/") || b.starts_with("bugfix/") || b.starts_with("hotfix/") {
        Some("fix")
    } else if b.starts_with("perf/") {
        Some("perf")
    } else if b.starts_with("docs/") {
        Some("docs")
    } else if b.starts_with("refactor/") {
        Some("refactor")
    } else {
        None
    }
}

fn is_doc(path: &str) -> bool {
    let p = path.to_lowercase();
    p.ends_with(".md") || p.ends_with(".mdx") || p.ends_with(".markdown") || p.ends_with(".txt") || p.ends_with(".rst")
}

fn make_label(acc: &Acc) -> String {
    if acc.committed {
        if let Some(m) = &acc.commit_msg {
            let s = first_line(m);
            if !s.is_empty() {
                return clip(&s, 90);
            }
        }
    }
    if let Some(p) = acc.prompts.first() {
        return clip(&first_line(p), 90);
    }
    if let Some(m) = &acc.commit_msg {
        return clip(&first_line(m), 90);
    }
    "(senza titolo)".to_string()
}

fn is_git_commit(cmd: &str) -> bool {
    cmd.contains("git commit")
}

// Estrae il messaggio da `git commit -m "..."` (o '...'), o la parola dopo -m se non quotato.
fn commit_message(cmd: &str) -> Option<String> {
    let idx = cmd.find("-m")?;
    let rest = cmd[idx + 2..].trim_start();
    let first = rest.chars().next()?;
    if first == '"' || first == '\'' {
        let after = &rest[first.len_utf8()..];
        let end = after.find(first)?;
        Some(after[..end].to_string())
    } else {
        rest.split_whitespace().next().map(|s| s.to_string())
    }
}

// Hash del commit dall'output (best-effort): "[main 1a2b3c4] msg" / "[main (root-commit) 1a2b3c4]".
fn extract_commit_hash(tr: &Value) -> Option<String> {
    let out = tr
        .get("stdout")
        .and_then(|s| s.as_str())
        .or_else(|| tr.get("output").and_then(|s| s.as_str()))
        .or_else(|| tr.as_str())?;
    let start = out.find('[')?;
    let rel_end = out[start..].find(']')?;
    let inside = &out[start + 1..start + rel_end];
    inside
        .split_whitespace()
        .map(|w| w.trim_matches(|c| c == '(' || c == ')'))
        .find(|w| (7..=40).contains(&w.len()) && w.chars().all(|c| c.is_ascii_hexdigit()))
        .map(|w| w.to_string())
}

// Conta righe aggiunte/rimosse dal `structuredPatch`; per i file creati (patch vuota) usa il `content`.
fn patch_counts(tr: &Value) -> (u32, u32) {
    if let Some(hunks) = tr.get("structuredPatch").and_then(|p| p.as_array()) {
        if !hunks.is_empty() {
            let mut a = 0u32;
            let mut d = 0u32;
            for h in hunks {
                if let Some(ls) = h.get("lines").and_then(|l| l.as_array()) {
                    for l in ls {
                        if let Some(s) = l.as_str() {
                            if s.starts_with('+') {
                                a += 1;
                            } else if s.starts_with('-') {
                                d += 1;
                            }
                        }
                    }
                }
            }
            return (a, d);
        }
    }
    if tr.get("type").and_then(|t| t.as_str()) == Some("create") {
        if let Some(c) = tr.get("content").and_then(|c| c.as_str()) {
            return (c.lines().count() as u32, 0);
        }
    }
    (0, 0)
}

// Testo del prompt umano, oppure None se la riga è un tool_result / system-reminder / boilerplate.
fn user_prompt_text(v: &Value) -> Option<String> {
    let content = &v["message"]["content"];
    let text = if let Some(s) = content.as_str() {
        s.to_string()
    } else if let Some(arr) = content.as_array() {
        if arr.iter().any(|b| b["type"] == "tool_result") {
            return None;
        }
        arr.iter().find_map(|b| {
            if b["type"] == "text" {
                b["text"].as_str().map(String::from)
            } else {
                None
            }
        })?
    } else {
        return None;
    };
    let t = text.trim();
    if t.is_empty() || t.starts_with('<') {
        return None;
    }
    let low = t.to_lowercase();
    if low.starts_with("caveat:")
        || low.starts_with("this session is being continued")
        || low.starts_with("continue from where you left off")
    {
        return None;
    }
    Some(clip(t, 4000)) // prompt INTERO (per il digest); l'etichetta corta la ricava make_label
}

fn first_line(s: &str) -> String {
    s.lines().next().unwrap_or("").trim().to_string()
}

fn clip(s: &str, n: usize) -> String {
    let s = s.trim();
    if s.chars().count() <= n {
        s.to_string()
    } else {
        let cut: String = s.chars().take(n).collect();
        format!("{cut}…")
    }
}

/// Scansiona TUTTI i progetti in ~/.claude/projects e ricostruisce le unità di lavoro, dalla più
/// recente. `limit` cappa il numero di unità restituite (default 500). Marca `live` l'ultima unità
/// di una sessione il cui transcript è stato modificato negli ultimi ~2 minuti.
#[tauri::command]
pub fn scan_activity(limit: Option<usize>) -> Result<Vec<WorkUnit>, String> {
    let home = std::env::var("USERPROFILE")
        .ok()
        .or_else(|| std::env::var("HOME").ok())
        .ok_or_else(|| "home dir not found".to_string())?;
    let dir = Path::new(&home).join(".claude").join("projects");
    let now = std::time::SystemTime::now();
    let mut out: Vec<WorkUnit> = Vec::new();

    let projects = match std::fs::read_dir(&dir) {
        Ok(r) => r,
        Err(_) => return Ok(out), // nessuna cartella → nessuna attività
    };
    for proj in projects.flatten() {
        let pdir = proj.path();
        if !pdir.is_dir() {
            continue;
        }
        let rd = match std::fs::read_dir(&pdir) {
            Ok(r) => r,
            Err(_) => continue,
        };
        for entry in rd.flatten() {
            let p = entry.path();
            if p.extension().and_then(|e| e.to_str()) != Some("jsonl") {
                continue;
            }
            let sid = match p.file_stem().and_then(|s| s.to_str()) {
                Some(s) if !s.is_empty() => s.to_string(),
                _ => continue,
            };
            let fresh = entry
                .metadata()
                .ok()
                .and_then(|m| m.modified().ok())
                .and_then(|t| now.duration_since(t).ok())
                .map(|d| d.as_secs() < 120)
                .unwrap_or(false);
            // TODO(perf): per transcript grandi conviene una cache in .orbit/index keyed sull'mtime.
            let content = match std::fs::read_to_string(&p) {
                Ok(c) => c,
                Err(_) => continue,
            };
            let lines: Vec<Value> = content.lines().filter_map(|l| serde_json::from_str(l).ok()).collect();
            let mut units = segment(&lines, &sid);
            if fresh {
                if let Some(last) = units.last_mut() {
                    last.live = true;
                }
            }
            out.extend(units);
        }
    }
    // più recenti in cima (il timestamp ISO ordina lessicograficamente).
    out.sort_by(|a, b| b.end.cmp(&a.end));
    out.truncate(limit.unwrap_or(500));
    Ok(out)
}

// ---- watcher live su ~/.claude/projects -----------------------------------
// La vista Attività è globale e i transcript vivono FUORI dalla cartella di progetto, quindi il
// watcher del progetto (`fs-changed`) non li vede: serve un watcher dedicato.

#[derive(Default)]
pub struct ActivityWatchState {
    watcher: Mutex<Option<RecommendedWatcher>>,
}

fn claude_projects_dir() -> Option<std::path::PathBuf> {
    let home = std::env::var("USERPROFILE").ok().or_else(|| std::env::var("HOME").ok())?;
    let dir = Path::new(&home).join(".claude").join("projects");
    if dir.is_dir() {
        Some(dir)
    } else {
        None
    }
}

/// Avvia (una volta sola) un watcher su ~/.claude/projects: quando un transcript `.jsonl` cambia,
/// emette `activity-changed` (debounced ~400ms) → il frontend ri-scansiona. Idempotente: se è già
/// attivo non fa nulla; se la cartella non esiste ancora ritorna Ok (un mount successivo riprova).
#[tauri::command]
pub fn watch_activity(app: AppHandle, state: State<ActivityWatchState>) -> Result<(), String> {
    if state.watcher.lock().unwrap().is_some() {
        return Ok(()); // già attivo
    }
    let dir = match claude_projects_dir() {
        Some(d) => d,
        None => return Ok(()), // ~/.claude/projects non esiste ancora: niente da osservare
    };

    let (tx, rx) = channel::<()>();
    let mut watcher = recommended_watcher(move |res: Result<notify::Event, notify::Error>| {
        if let Ok(ev) = res {
            if matches!(ev.kind, EventKind::Access(_)) {
                return; // ignora i soli accessi in lettura
            }
            // reagisci solo ai transcript (.jsonl), non a eventuali altri file sotto projects/
            let touched = ev
                .paths
                .iter()
                .any(|p| p.extension().and_then(|e| e.to_str()) == Some("jsonl"));
            if touched {
                let _ = tx.send(());
            }
        }
    })
    .map_err(|e| e.to_string())?;

    watcher
        .watch(&dir, RecursiveMode::Recursive)
        .map_err(|e| e.to_string())?;

    // Thread di debounce: coalizza i burst e emette un solo `activity-changed` ogni ~400ms.
    let app2 = app.clone();
    std::thread::spawn(move || loop {
        if rx.recv().is_err() {
            break; // watcher distrutto → il sender è caduto
        }
        std::thread::sleep(std::time::Duration::from_millis(400));
        while rx.try_recv().is_ok() {} // svuota il resto del burst
        let _ = app2.emit("activity-changed", ());
    });

    *state.watcher.lock().unwrap() = Some(watcher);
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn prompt(ts: &str, br: &str, text: &str) -> Value {
        json!({"type":"user","timestamp":ts,"gitBranch":br,"cwd":"/repo","message":{"content":text}})
    }
    fn edit(ts: &str, br: &str, path: &str, add: usize, del: usize) -> Value {
        let mut lines: Vec<String> = Vec::new();
        for _ in 0..del {
            lines.push("-old".into());
        }
        for _ in 0..add {
            lines.push("+new".into());
        }
        json!({"type":"user","timestamp":ts,"gitBranch":br,"cwd":"/repo",
            "toolUseResult":{"filePath":path,"userModified":false,
                "structuredPatch":[{"oldStart":1,"oldLines":del,"newStart":1,"newLines":add,"lines":lines}]},
            "message":{"content":[{"type":"tool_result","content":"ok"}]}})
    }
    fn create(ts: &str, br: &str, path: &str, body: &str) -> Value {
        json!({"type":"user","timestamp":ts,"gitBranch":br,"cwd":"/repo",
            "toolUseResult":{"type":"create","filePath":path,"content":body,"structuredPatch":[]},
            "message":{"content":[{"type":"tool_result","content":"ok"}]}})
    }
    fn bash(ts: &str, br: &str, cmd: &str) -> Value {
        json!({"type":"assistant","timestamp":ts,"gitBranch":br,"cwd":"/repo",
            "message":{"content":[{"type":"tool_use","name":"Bash","input":{"command":cmd}}]}})
    }
    fn commit_out(ts: &str, br: &str, out: &str) -> Value {
        json!({"type":"user","timestamp":ts,"gitBranch":br,"cwd":"/repo",
            "toolUseResult":{"stdout":out},"message":{"content":[{"type":"tool_result","content":"ok"}]}})
    }

    #[test]
    fn hybrid_splits_on_commits() {
        let lines = vec![
            prompt("2026-06-25T10:00:00Z", "main", "fix the search race"),
            edit("2026-06-25T10:01:00Z", "main", "/repo/search.ts", 3, 1),
            bash("2026-06-25T10:02:00Z", "main", "git commit -m \"fix: race ricerca\""),
            commit_out("2026-06-25T10:02:01Z", "main", "[main 1a2b3c4] fix: race ricerca"),
            prompt("2026-06-25T10:05:00Z", "main", "add follow active file"),
            create("2026-06-25T10:06:00Z", "main", "/repo/follow.ts", "a\nb\nc"),
            bash("2026-06-25T10:07:00Z", "main", "git commit -m \"feat: follow active file\""),
        ];
        let u = segment(&lines, "S1");
        assert_eq!(u.len(), 2, "due commit → due unità");
        assert_eq!(u[0].kind, "fix");
        assert_eq!(u[0].label, "fix: race ricerca");
        assert!(u[0].committed);
        assert_eq!(u[0].commit.as_deref(), Some("1a2b3c4"));
        assert_eq!(u[0].files.len(), 1);
        assert_eq!((u[0].add, u[0].del), (3, 1));
        assert_eq!(u[0].files[0].op, "M");
        assert_eq!(u[1].kind, "feat");
        assert_eq!(u[1].label, "feat: follow active file");
        assert_eq!(u[1].files[0].op, "A");
        assert_eq!(u[1].add, 3);
    }

    #[test]
    fn branch_change_splits() {
        let lines = vec![
            prompt("2026-06-25T10:00:00Z", "main", "lavoro su main"),
            edit("2026-06-25T10:01:00Z", "main", "/repo/a.ts", 2, 0),
            prompt("2026-06-25T10:05:00Z", "feature/login", "lavoro sulla feature"),
            edit("2026-06-25T10:06:00Z", "feature/login", "/repo/b.ts", 5, 0),
        ];
        let u = segment(&lines, "S2");
        assert_eq!(u.len(), 2, "cambio branch → due unità");
        assert_eq!(u[0].branch, "main");
        assert_eq!(u[1].branch, "feature/login");
        assert_eq!(u[1].kind, "feat", "kind dal prefisso del branch");
    }

    #[test]
    fn each_prompt_is_its_own_unit() {
        let lines = vec![
            prompt("2026-06-25T10:00:00Z", "main", "primo prompt"),
            edit("2026-06-25T10:01:00Z", "main", "/repo/a.ts", 2, 0),
            prompt("2026-06-25T10:02:00Z", "main", "secondo prompt"),
            edit("2026-06-25T10:03:00Z", "main", "/repo/b.ts", 4, 1),
        ];
        let u = segment(&lines, "S3");
        assert_eq!(u.len(), 2, "prompt-first: ogni prompt con lavoro è la sua unità");
        assert_eq!(u[0].prompts, vec!["primo prompt".to_string()]);
        assert_eq!(u[0].files.len(), 1);
        assert!(!u[0].committed);
        assert_eq!(u[0].kind, "chore");
        assert_eq!(u[1].prompts, vec!["secondo prompt".to_string()]);
        assert_eq!(u[1].files.len(), 1);
    }

    #[test]
    fn docs_kind_from_files() {
        let lines = vec![
            prompt("2026-06-25T10:00:00Z", "main", "aggiorna i documenti"),
            edit("2026-06-25T10:01:00Z", "main", "/repo/README.md", 10, 2),
        ];
        let u = segment(&lines, "S4");
        assert_eq!(u.len(), 1);
        assert_eq!(u[0].kind, "docs");
    }

    #[test]
    fn pure_conversation_is_dropped() {
        // prompt senza alcun lavoro (niente file/comandi) → nessuna unità.
        let lines = vec![prompt("2026-06-25T10:00:00Z", "main", "che ne pensi?")];
        let u = segment(&lines, "S5");
        assert!(u.is_empty());
    }
}
