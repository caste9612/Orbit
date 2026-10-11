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
use std::collections::{HashMap, HashSet};
use std::path::{Path, PathBuf};
use std::sync::mpsc::channel;
use std::sync::Mutex;
use std::time::SystemTime;
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
    // l'ultima richiesta della sessione, che sopravvive al flush: etichetta di un'unità senza prompt suo
    // (lavoro proseguito su un altro branch o dopo un commit, nello stesso turno)
    last_prompt: Option<String>,
}

impl Acc {
    fn has_work(&self) -> bool {
        !self.files.is_empty() || !self.cmds.is_empty()
    }
    /// Azzera per l'unità successiva, conservando il branch corrente e l'ultima richiesta.
    fn reset(&mut self) {
        let branch = std::mem::take(&mut self.branch);
        let last = self.last_prompt.take();
        *self = Acc::default();
        self.branch = branch;
        self.last_prompt = last;
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

/// Segmenta le righe (già parsate) di UN transcript nelle sue unità di lavoro. La scansione usa `Fold` a
/// pezzi (M62); questa forma "tutto il file" resta per i test.
#[cfg(test)]
fn segment(lines: &[Value], session_id: &str) -> Vec<WorkUnit> {
    let mut f = Fold::default();
    for v in lines {
        f.feed(v, session_id);
    }
    let open = f.open_unit(session_id);
    let mut units = f.units;
    units.extend(open);
    for u in &mut units {
        u.session_title = f.title.clone();
        u.repo = f.repo.clone();
    }
    units
}

/// Stato della segmentazione di UN transcript, riga per riga (M62): quando il file cresce si riprende da
/// qui con le sole righe nuove, invece di rileggere tutto. `segment()` lo usa sull'intero file: stesse unità.
/// Titolo e repo sono della sessione e si applicano in uscita, come faceva la lettura per intero.
#[derive(Default)]
struct Fold {
    acc: Acc,
    idx: u32,
    units: Vec<WorkUnit>, // unità chiuse (titolo e repo vuoti)
    title: String,        // aiTitle dell'ultima riga "ai-title" (l'ultima vince)
    repo: String,         // il cwd della prima riga che ce l'ha
}

impl Fold {
    fn feed(&mut self, v: &Value, session_id: &str) {
        if v["type"] == "ai-title" {
            self.title = v["aiTitle"].as_str().unwrap_or("").to_string();
        }
        if self.repo.is_empty() {
            if let Some(cwd) = v["cwd"].as_str().filter(|s| !s.is_empty()) {
                self.repo = cwd.to_string();
            }
        }
        let acc = &mut self.acc;
        let ts = v["timestamp"].as_str().unwrap_or("");

        // cambio branch = confine forte (chiude l'unità in corso, indipendentemente dal commit).
        if let Some(br) = v["gitBranch"].as_str().filter(|s| !s.is_empty()) {
            if acc.has_work() && !acc.branch.is_empty() && acc.branch != br {
                flush(acc, &mut self.units, &mut self.idx, session_id);
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
                return;
            }
            // prompt umano "vero"?
            if v.get("isMeta").and_then(|b| b.as_bool()) == Some(true) {
                return;
            }
            if let Some(text) = user_prompt_text(v) {
                // prompt-first: ogni nuovo prompt chiude l'unità precedente e ne apre una nuova
                flush(acc, &mut self.units, &mut self.idx, session_id);
                acc.touch(ts);
                acc.last_prompt = Some(text.clone());
                acc.prompts.push(text);
            }
            return;
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
        }
    }

    /// L'unità ancora in corso (quella che la lettura per intero chiude alla fine del file), se ha lavoro.
    fn open_unit(&self, sid: &str) -> Option<WorkUnit> {
        self.acc.has_work().then(|| unit_of(&self.acc, self.idx, sid))
    }
}

// (rimossa close_if_committed: segmentazione prompt-first — il flush avviene a ogni nuovo prompt)

// Materializza l'unità accumulata (se ha lavoro vero: almeno un file o un comando) e azzera l'acc,
// conservando il branch corrente per l'unità successiva.
fn flush(acc: &mut Acc, units: &mut Vec<WorkUnit>, idx: &mut u32, sid: &str) {
    if acc.has_work() {
        units.push(unit_of(acc, *idx, sid));
        *idx += 1;
    }
    acc.reset();
}

/// L'unità di lavoro dell'accumulatore (titolo e repo della sessione si aggiungono in uscita).
fn unit_of(acc: &Acc, idx: u32, sid: &str) -> WorkUnit {
    let (add, del) = acc.files.iter().fold((0u32, 0u32), |(a, d), f| (a + f.add, d + f.del));
    WorkUnit {
        id: format!("{sid}#{idx}"),
        session_id: sid.to_string(),
        session_title: String::new(),
        repo: String::new(),
        branch: acc.branch.clone(),
        kind: infer_kind(acc),
        label: make_label(acc),
        prompts: acc.prompts.clone(),
        files: acc.files.clone(),
        cmds: acc.cmds.clone(),
        committed: acc.committed,
        commit: acc.commit_hash.clone(),
        start: acc.start.clone(),
        end: acc.end.clone(),
        add,
        del,
        live: false,
    }
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
    // nessun prompt suo (lavoro proseguito su un altro branch o dopo un commit): la richiesta che lo ha
    // avviato, segnata come seguito (M60; prima era "(senza titolo)")
    if let Some(p) = &acc.last_prompt {
        return format!("↳ {}", clip(&first_line(p), 88));
    }
    "(untitled)".to_string()
}

/// Posizione di `git commit` usato come comando (non dentro una stringa, non `git commit-tree`).
fn git_commit_at(cmd: &str) -> Option<usize> {
    let mut from = 0;
    while let Some(rel) = cmd[from..].find("git commit") {
        let at = from + rel;
        let end = at + "git commit".len();
        let before_ok = cmd[..at].chars().next_back().map_or(true, |c| c.is_whitespace() || matches!(c, ';' | '&' | '|' | '('));
        let after_ok = cmd[end..].chars().next().map_or(true, char::is_whitespace);
        if before_ok && after_ok {
            return Some(at);
        }
        from = end;
    }
    None
}

fn is_git_commit(cmd: &str) -> bool {
    git_commit_at(cmd).is_some()
}

// Messaggio di un `git commit` (best-effort, per l'etichetta): `-m "…"`/`-m '…'`/`-m parola`, anche nei flag
// uniti (`-am`) e `--message=…`; lo stile heredoc di Claude Code — `-m "$(cat <<'EOF' … EOF)"`, dove il
// messaggio vero inizia dopo la prima newline —, `-F -` con un heredoc e la here-string di PowerShell
// (`-m @'…'@`). Solo i flag DOPO `git commit` e a parola intera: un "-m" dentro un'altra parola
// (`git merge light-mode-strips && git commit …`) dava l'etichetta "ode-strips" (M60).
fn commit_message(cmd: &str) -> Option<String> {
    let mut s = &cmd[git_commit_at(cmd)? + "git commit".len()..];
    loop {
        s = s.trim_start_matches([' ', '\t']);
        if s.is_empty() || s.starts_with(['\n', '\r', '&', ';', '|', ')']) {
            return None;
        }
        if let Some(v) = s.strip_prefix("--message=") {
            return quoted_arg(v);
        }
        let end = s.find(char::is_whitespace).unwrap_or(s.len());
        let (tok, rest) = (&s[..end], s[end..].trim_start_matches([' ', '\t']));
        let short = tok.len() > 1 && tok.starts_with('-') && tok[1..].bytes().all(|b| b.is_ascii_alphabetic());
        if (short && tok.ends_with('m')) || tok == "--message" {
            return quoted_arg(rest);
        }
        if (short && tok.ends_with('F')) || tok == "--file" || tok == "--file=-" {
            // solo da stdin (`-F -`) il messaggio è nel comando: un heredoc
            let is_stdin = tok == "--file=-" || (rest.starts_with('-') && rest[1..].chars().next().map_or(true, char::is_whitespace));
            return if is_stdin { heredoc_body(rest) } else { None };
        }
        s = rest;
    }
}

/// Argomento in testa a `s`: fra virgolette (anche su più righe), here-string di PowerShell o una parola.
fn quoted_arg(s: &str) -> Option<String> {
    if let Some(r) = s.strip_prefix("@'").or_else(|| s.strip_prefix("@\"")) {
        let close = if s.as_bytes()[1] == b'\'' { "'@" } else { "\"@" };
        let body = r.split_once('\n')?.1;
        return Some(body.lines().take_while(|l| !l.starts_with(close)).collect::<Vec<_>>().join("\n"));
    }
    let first = s.chars().next()?;
    if first == '"' || first == '\'' {
        // fino alla virgoletta di chiusura; fra "…" un \" non chiude
        let after = &s[1..];
        let mut end = None;
        let mut esc = false;
        for (i, c) in after.char_indices() {
            if esc {
                esc = false;
            } else if c == '\\' && first == '"' {
                esc = true;
            } else if c == first {
                end = Some(i);
                break;
            }
        }
        let raw = &after[..end?];
        let msg = raw
            .trim_start()
            .strip_prefix("$(cat <<")
            .and_then(|r| r.split_once('\n').map(|(_, body)| body))
            .unwrap_or(raw);
        Some(if first == '"' { msg.replace("\\\"", "\"") } else { msg.to_string() })
    } else {
        s.split_whitespace().next().map(|w| w.to_string())
    }
}

/// Corpo del primo heredoc in `s` (`<<'EOF'`, `<<"EOF"`, `<<EOF`, `<<-EOF`): le righe fino al delimitatore.
fn heredoc_body(s: &str) -> Option<String> {
    let spec = s[s.find("<<")? + 2..].trim_start_matches('-').trim_start_matches([' ', '\t']);
    let (head, body) = spec.split_once('\n')?;
    let delim = head.split_whitespace().next()?.trim_matches(['\'', '"']);
    if delim.is_empty() {
        return None;
    }
    Some(body.lines().take_while(|l| l.trim() != delim).collect::<Vec<_>>().join("\n"))
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

// Cache per transcript (M59): una scansione rilegge solo i transcript cambiati (data di modifica o
// dimensione diverse). Prima ogni scansione rileggeva e ri-analizzava TUTTI i transcript — 206 MiB sul PC
// dell'utente — sul thread principale (comando sincrono), e ripartiva a ogni modifica di un transcript:
// con la vista Attività aperta, mentre Claude lavorava, l'interfaccia si bloccava di continuo.
// M62: un transcript che è solo CRESCIUTO (il caso di quello della chat in corso) si legge dal punto in cui
// ci si era fermati, riprendendo la segmentazione (`Fold`): prima se ne rileggevano ogni volta tutti i MB.
struct Cached {
    mtime: Option<SystemTime>,
    len: u64,
    offset: u64,            // byte dopo l'ultima riga letta
    sig: Vec<u8>,           // gli ultimi byte prima di `offset`: se cambiano, il file è stato riscritto
    pending_nl: bool,       // l'ultima riga letta non aveva ancora l'a capo (era già un JSON completo)
    fold: Fold,             // stato della segmentazione
    open: Option<WorkUnit>, // l'unità ancora in corso, materializzata all'ultima lettura
}
static CACHE: Mutex<Option<HashMap<PathBuf, Cached>>> = Mutex::new(None);
const SIG_LEN: u64 = 64;

/// Scansiona TUTTI i progetti in ~/.claude/projects e ricostruisce le unità di lavoro, dalla più
/// recente. `limit` cappa il numero di unità restituite (default 500). Marca `live` l'ultima unità
/// di una sessione il cui transcript è stato modificato negli ultimi ~2 minuti. Gira fuori dal thread
/// principale (M59): async + spawn_blocking, l'interfaccia resta reattiva anche alla prima scansione.
#[tauri::command]
pub async fn scan_activity(limit: Option<usize>) -> Result<Vec<WorkUnit>, String> {
    tauri::async_runtime::spawn_blocking(move || scan(limit))
        .await
        .map_err(|e| e.to_string())?
}

/// Porta in pari la cache di un transcript: niente se non è cambiato; se è solo cresciuto si leggono le
/// righe nuove; altrimenti (accorciato, riscritto, mai letto) da capo. false = file illeggibile.
fn refresh(map: &mut HashMap<PathBuf, Cached>, p: &Path, sid: &str, mtime: Option<SystemTime>, len: u64) -> bool {
    if let Some(c) = map.get_mut(p) {
        if c.mtime == mtime && c.len == len {
            return true;
        }
        if len > c.len && same_bytes(p, c.offset, &c.sig) && read_more(c, p, sid, len).is_some() {
            c.mtime = mtime;
            c.len = len;
            return true;
        }
    }
    let mut c = Cached { mtime, len, offset: 0, sig: Vec::new(), pending_nl: false, fold: Fold::default(), open: None };
    if read_more(&mut c, p, sid, len).is_none() {
        map.remove(p);
        return false;
    }
    map.insert(p.to_path_buf(), c);
    true
}

/// I byte che precedono `offset` sono ancora quelli letti l'ultima volta? (il file è solo cresciuto)
fn same_bytes(p: &Path, offset: u64, sig: &[u8]) -> bool {
    use std::io::{Read, Seek, SeekFrom};
    let Ok(mut f) = std::fs::File::open(p) else { return false };
    let mut buf = vec![0u8; sig.len()];
    f.seek(SeekFrom::Start(offset - sig.len() as u64)).is_ok() && f.read_exact(&mut buf).is_ok() && buf == sig
}

/// Legge il transcript da `c.offset` fino a `len` e passa le righe nuove alla segmentazione. Come la lettura
/// per intero, conta anche l'ultima riga senza a capo se è già un JSON completo; il suo a capo arriverà dopo.
/// None = file illeggibile, o cresciuto in un modo che non è un'aggiunta di righe (si rilegge da capo).
fn read_more(c: &mut Cached, p: &Path, sid: &str, len: u64) -> Option<()> {
    use std::io::{Read, Seek, SeekFrom};
    let mut f = std::fs::File::open(p).ok()?;
    f.seek(SeekFrom::Start(c.offset)).ok()?;
    let mut buf = Vec::with_capacity(len.saturating_sub(c.offset) as usize);
    f.by_ref().take(len.saturating_sub(c.offset)).read_to_end(&mut buf).ok()?;
    let mut at = 0;
    if c.pending_nl {
        if buf.first() != Some(&b'\n') {
            return None; // la riga che sembrava completa è continuata: non è più quella letta
        }
        at = 1;
        c.pending_nl = false;
    }
    while let Some(rel) = buf[at..].iter().position(|&b| b == b'\n') {
        if let Ok(v) = serde_json::from_slice::<Value>(&buf[at..at + rel]) {
            c.fold.feed(&v, sid);
        }
        at += rel + 1;
    }
    if at < buf.len() {
        if let Ok(v) = serde_json::from_slice::<Value>(&buf[at..]) {
            c.fold.feed(&v, sid);
            at = buf.len();
            c.pending_nl = true;
        }
    }
    let end = c.offset + at as u64;
    // firma: gli ultimi byte fino a `end` (dal buffer, o dal file se il buffer è più corto)
    let from = end.saturating_sub(SIG_LEN);
    c.sig = if from >= c.offset {
        buf[(from - c.offset) as usize..at].to_vec()
    } else {
        let mut sig = vec![0u8; (end - from) as usize];
        f.seek(SeekFrom::Start(from)).ok()?;
        f.read_exact(&mut sig).ok()?;
        sig
    };
    c.offset = end;
    c.open = c.fold.open_unit(sid);
    Some(())
}

fn scan(limit: Option<usize>) -> Result<Vec<WorkUnit>, String> {
    let home = std::env::var("USERPROFILE")
        .ok()
        .or_else(|| std::env::var("HOME").ok())
        .ok_or_else(|| "home dir not found".to_string())?;
    Ok(scan_in(&Path::new(&home).join(".claude").join("projects"), limit))
}

/// Unità di lavoro di tutti i transcript sotto `dir` (una sottocartella per progetto).
fn scan_in(dir: &Path, limit: Option<usize>) -> Vec<WorkUnit> {
    let now = std::time::SystemTime::now();
    let mut guard = CACHE.lock().unwrap_or_else(|e| e.into_inner());
    let map = guard.get_or_insert_with(HashMap::new);
    // transcript leggibili in ordine di visita, col flag "scritto negli ultimi 2 minuti"
    let mut order: Vec<(PathBuf, bool)> = Vec::new();

    let projects = match std::fs::read_dir(dir) {
        Ok(r) => r,
        Err(_) => return Vec::new(), // nessuna cartella → nessuna attività
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
            let meta = entry.metadata().ok();
            let mtime = meta.as_ref().and_then(|m| m.modified().ok());
            let len = meta.as_ref().map(|m| m.len()).unwrap_or(0);
            let fresh = mtime
                .and_then(|t| now.duration_since(t).ok())
                .map(|d| d.as_secs() < 120)
                .unwrap_or(false);
            if refresh(map, &p, &sid, mtime, len) {
                order.push((p, fresh));
            }
        }
    }
    // la cache tiene solo i transcript che esistono ancora
    let seen: HashSet<&PathBuf> = order.iter().map(|(p, _)| p).collect();
    map.retain(|k, _| seen.contains(k));
    // più recenti in cima (il timestamp ISO ordina lessicograficamente; a pari data resta l'ordine di
    // visita). Si scelgono per riferimento e si clonano solo quelle restituite (prima: tutte, ogni volta).
    let mut all: Vec<(&WorkUnit, &Fold, bool)> = Vec::new();
    for (p, fresh) in &order {
        let c = &map[p];
        let n = c.fold.units.len() + usize::from(c.open.is_some());
        for (i, u) in c.fold.units.iter().chain(c.open.iter()).enumerate() {
            all.push((u, &c.fold, *fresh && i + 1 == n)); // `live`: l'ultima unità di un transcript fresco
        }
    }
    all.sort_by(|a, b| b.0.end.cmp(&a.0.end));
    all.truncate(limit.unwrap_or(500));
    all.into_iter()
        .map(|(u, f, live)| WorkUnit { session_title: f.title.clone(), repo: f.repo.clone(), live, ..u.clone() })
        .collect()
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

    #[test]
    fn commit_message_plain_and_heredoc() {
        // -m "msg" classico
        assert_eq!(commit_message(r#"git commit -m "fix: bug""#).as_deref(), Some("fix: bug"));
        // stile heredoc di Claude Code: il messaggio inizia dopo la prima newline
        let cmd = "git commit -m \"$(cat <<'EOF'\nfeat: cosa fatta\n\ndettagli\nEOF\n)\"";
        let msg = commit_message(cmd).unwrap();
        assert!(msg.starts_with("feat: cosa fatta"), "got: {msg}");
    }

    #[test]
    fn commit_message_only_from_flags_after_git_commit() {
        // un "-m" dentro un'altra parola prima del commit dava l'etichetta "ode-strips" (M60)
        let cmd = "git checkout main && git merge --ff-only light-mode-strips && git commit -m \"docs: allinea\"";
        assert_eq!(commit_message(cmd).as_deref(), Some("docs: allinea"));
        assert!(!is_git_commit("git merge --ff-only light-mode-strips"));
        assert!(!is_git_commit("echo \"git commit -m x\""));
        assert_eq!(commit_message("git commit -qam 'fix: y'").as_deref(), Some("fix: y"));
        assert_eq!(commit_message("git commit --message=\"feat: z\"").as_deref(), Some("feat: z"));
        assert_eq!(commit_message("git commit -m \"fix: \\\"a\\\" b\"").as_deref(), Some("fix: \"a\" b"));
        assert_eq!(commit_message("git commit --amend --no-edit"), None);
        // `-F -` con un heredoc e la here-string di PowerShell
        let heredoc = "git add -A && git commit -q -F - <<'EOF'\nfeat: heredoc\n\ncorpo\nEOF\ngit log -1";
        assert_eq!(commit_message(heredoc).as_deref(), Some("feat: heredoc\n\ncorpo"));
        assert_eq!(commit_message("git commit -m @'\nfix: ps\n\ncorpo\n'@").as_deref(), Some("fix: ps\n\ncorpo"));
    }

    #[test]
    fn unit_without_its_own_prompt_continues_the_last_request() {
        // cambio branch a metà turno: la seconda unità non ha un prompt suo (prima: "(senza titolo)")
        let lines = vec![
            prompt("2026-06-25T10:00:00Z", "main", "unisci e pubblica"),
            edit("2026-06-25T10:01:00Z", "main", "/repo/a.ts", 2, 0),
            edit("2026-06-25T10:02:00Z", "release", "/repo/b.ts", 1, 0),
        ];
        let u = segment(&lines, "S6");
        assert_eq!(u.len(), 2);
        assert_eq!(u[0].label, "unisci e pubblica");
        assert_eq!(u[1].label, "↳ unisci e pubblica");
        assert!(u[1].prompts.is_empty());
    }

    // ---- riferimento: la segmentazione com'era prima della M62 (tutto il file in una volta) ----------
    fn segment_old(lines: &[Value], session_id: &str) -> Vec<WorkUnit> {
        let title = lines.iter().rev().find(|v| v["type"] == "ai-title").and_then(|v| v["aiTitle"].as_str()).unwrap_or("").to_string();
        let repo = lines.iter().find_map(|v| v["cwd"].as_str().filter(|s| !s.is_empty())).unwrap_or("").to_string();
        let mut units: Vec<WorkUnit> = Vec::new();
        let mut acc = Acc::default();
        let mut idx: u32 = 0;
        for v in lines {
            let ts = v["timestamp"].as_str().unwrap_or("");
            if let Some(br) = v["gitBranch"].as_str().filter(|s| !s.is_empty()) {
                if acc.has_work() && !acc.branch.is_empty() && acc.branch != br {
                    flush_old(&mut acc, &mut units, &mut idx, session_id, &title, &repo);
                }
                acc.branch = br.to_string();
            }
            let typ = v["type"].as_str().unwrap_or("");
            if typ == "user" {
                if let Some(tr) = v.get("toolUseResult").filter(|t| !t.is_null()) {
                    if let Some(fp) = tr.get("filePath").and_then(|x| x.as_str()) {
                        acc.touch(ts);
                        let is_create = tr.get("type").and_then(|t| t.as_str()) == Some("create");
                        let um = tr.get("userModified").and_then(|b| b.as_bool()).unwrap_or(false);
                        let (a, d) = patch_counts(tr);
                        acc.add_file(if is_create { "A" } else { "M" }, fp, a, d, um);
                    } else if acc.committed && acc.commit_hash.is_none() {
                        if let Some(h) = extract_commit_hash(tr) {
                            acc.commit_hash = Some(h);
                        }
                    }
                    continue;
                }
                if v.get("isMeta").and_then(|b| b.as_bool()) == Some(true) {
                    continue;
                }
                if let Some(text) = user_prompt_text(v) {
                    flush_old(&mut acc, &mut units, &mut idx, session_id, &title, &repo);
                    acc.touch(ts);
                    acc.last_prompt = Some(text.clone());
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
                            acc.touch(ts);
                            if is_git_commit(&cmd) {
                                acc.cmds.push(cmd.clone());
                                acc.committed = true;
                                if acc.commit_msg.is_none() {
                                    acc.commit_msg = commit_message(&cmd);
                                }
                            } else {
                                acc.cmds.push(cmd);
                            }
                        }
                    }
                }
            }
        }
        flush_old(&mut acc, &mut units, &mut idx, session_id, &title, &repo);
        units
    }
    fn flush_old(acc: &mut Acc, units: &mut Vec<WorkUnit>, idx: &mut u32, sid: &str, title: &str, repo: &str) {
        if !acc.has_work() {
            acc.reset();
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
        acc.reset();
    }
    fn parse_all(content: &str) -> Vec<Value> {
        content.lines().filter_map(|l| serde_json::from_str(l).ok()).collect()
    }
    fn json(units: &[WorkUnit]) -> String {
        serde_json::to_string(units).unwrap()
    }
    /// Le unità che la cache di un transcript restituirebbe (come in scan_in, senza `live`).
    fn cached_units(c: &Cached) -> Vec<WorkUnit> {
        c.fold.units.iter().chain(c.open.iter()).map(|u| WorkUnit { session_title: c.fold.title.clone(), repo: c.fold.repo.clone(), ..u.clone() }).collect()
    }
    fn transcript(seed: u64, turns: usize) -> String {
        let mut g = Gen::new(seed);
        let mut s = String::new();
        for _ in 0..turns {
            for l in g.turn() {
                s.push_str(&l);
                s.push('\n');
            }
        }
        s
    }
    fn tmp_file(name: &str) -> PathBuf {
        let d = std::env::temp_dir().join("orbit-activity-tests");
        std::fs::create_dir_all(&d).unwrap();
        d.join(name)
    }
    fn refresh_now(map: &mut HashMap<PathBuf, Cached>, p: &Path) {
        let m = std::fs::metadata(p).unwrap();
        assert!(refresh(map, p, "S", m.modified().ok(), m.len()));
    }

    #[test]
    fn fold_matches_the_old_full_parse() {
        for seed in 1..40u64 {
            let lines = parse_all(&transcript(seed, 60));
            assert_eq!(json(&segment(&lines, "S")), json(&segment_old(&lines, "S")), "seed {seed}");
        }
    }

    #[test]
    fn incremental_reads_in_random_chunks_match_the_full_parse() {
        for seed in 1..9u64 {
            let content = transcript(seed, 50);
            let want = json(&segment_old(&parse_all(&content), "S"));
            let p = tmp_file(&format!("chunks-{seed}.jsonl"));
            std::fs::write(&p, "").unwrap();
            let mut map = HashMap::new();
            let mut g = Gen::new(seed * 31);
            let bytes = content.as_bytes();
            let mut at = 0;
            while at < bytes.len() {
                // pezzi casuali: spesso a metà riga (e a metà di un carattere UTF-8, se capita)
                let n = (1 + g.next(16_000) as usize).min(bytes.len() - at);
                let mut f = std::fs::OpenOptions::new().append(true).open(&p).unwrap();
                std::io::Write::write_all(&mut f, &bytes[at..at + n]).unwrap();
                drop(f);
                at += n;
                refresh_now(&mut map, &p);
            }
            assert_eq!(json(&cached_units(&map[&p])), want, "seed {seed}");
            let _ = std::fs::remove_file(&p);
        }
    }

    #[test]
    fn rewritten_or_shrunk_file_is_read_again() {
        let p = tmp_file("rewrite.jsonl");
        let mut map = HashMap::new();
        std::fs::write(&p, transcript(3, 40)).unwrap();
        refresh_now(&mut map, &p);
        // riscritto con altro contenuto, più lungo: i byte prima del vecchio offset non tornano più
        let other = transcript(4, 60);
        std::fs::write(&p, &other).unwrap();
        refresh_now(&mut map, &p);
        assert_eq!(json(&cached_units(&map[&p])), json(&segment_old(&parse_all(&other), "S")));
        // accorciato
        let short = transcript(5, 10);
        std::fs::write(&p, &short).unwrap();
        refresh_now(&mut map, &p);
        assert_eq!(json(&cached_units(&map[&p])), json(&segment_old(&parse_all(&short), "S")));
        let _ = std::fs::remove_file(&p);
    }

    #[test]
    fn last_line_without_newline_counts_like_the_full_read() {
        let p = tmp_file("tail.jsonl");
        let mut map = HashMap::new();
        let content = transcript(9, 30);
        let trimmed = content.trim_end_matches('\n');
        // l'ultima riga è un JSON completo ma senza a capo: la lettura per intero la conta già
        std::fs::write(&p, trimmed).unwrap();
        refresh_now(&mut map, &p);
        assert_eq!(json(&cached_units(&map[&p])), json(&segment_old(&parse_all(trimmed), "S")));
        // poi arrivano l'a capo e altre righe
        let more = format!("{content}{}", transcript(10, 5));
        std::fs::write(&p, &more).unwrap();
        refresh_now(&mut map, &p);
        assert_eq!(json(&cached_units(&map[&p])), json(&segment_old(&parse_all(&more), "S")));
        let _ = std::fs::remove_file(&p);
    }

    #[test]
    fn scan_orders_and_marks_live_like_before() {
        let dir = std::env::temp_dir().join("orbit-activity-scan-test").join("projects");
        let _ = std::fs::remove_dir_all(&dir);
        let mut want: Vec<WorkUnit> = Vec::new();
        for i in 0..6u64 {
            let p = dir.join(format!("D--p{}", i % 2)).join(format!("s{i}.jsonl"));
            std::fs::create_dir_all(p.parent().unwrap()).unwrap();
            let content = transcript(20 + i, 25);
            std::fs::write(&p, &content).unwrap();
        }
        // riferimento: com'era scan() — ogni transcript per intero, in ordine di visita, ordinamento stabile
        for proj in std::fs::read_dir(&dir).unwrap().flatten() {
            for e in std::fs::read_dir(proj.path()).unwrap().flatten() {
                let sid = e.path().file_stem().unwrap().to_string_lossy().to_string();
                let mut units = segment_old(&parse_all(&std::fs::read_to_string(e.path()).unwrap()), &sid);
                if let Some(last) = units.last_mut() {
                    last.live = true; // appena scritti: tutti "freschi"
                }
                want.extend(units);
            }
        }
        want.sort_by(|a, b| b.end.cmp(&a.end));
        want.truncate(40);
        assert_eq!(json(&scan_in(&dir, Some(40))), json(&want));
        let _ = std::fs::remove_dir_all(dir.parent().unwrap());
    }

    // ---- transcript sintetici (benchmark e test di equivalenza) ----------------------------------
    // Righe con la forma di quelle di Claude Code: prompt, testo + tool_use (Bash/Edit), risultati con
    // output lunghi e `structuredPatch`, commit, cambi di branch, ai-title. Deterministici (LCG).
    pub(super) struct Gen {
        seed: u64,
        sec: u64,
        turn: u32,
        branch: String,
    }
    impl Gen {
        pub(super) fn new(seed: u64) -> Self {
            Gen { seed: seed.wrapping_mul(6364136223846793005).wrapping_add(1), sec: seed * 7919, turn: 0, branch: "main".into() }
        }
        fn next(&mut self, n: u64) -> u64 {
            self.seed = self.seed.wrapping_mul(6364136223846793005).wrapping_add(1442695040888963407);
            (self.seed >> 33) % n.max(1)
        }
        fn ts(&mut self) -> String {
            self.sec += 1 + self.next(40);
            let s = self.sec;
            format!("2026-10-{:02}T{:02}:{:02}:{:02}.000Z", 1 + (s / 86400) % 28, (s / 3600) % 24, (s / 60) % 60, s % 60)
        }
        fn words(&mut self, n: usize) -> String {
            const W: &[&str] = &["index", "render", "the", "panel", "fix", "scan", "update", "terminal", "file", "cache", "state", "of", "and", "with", "symbol", "repo"];
            (0..n).map(|_| W[self.next(W.len() as u64) as usize]).collect::<Vec<_>>().join(" ")
        }
        fn base(&mut self, typ: &str) -> Value {
            let ts = self.ts();
            json!({"type": typ, "timestamp": ts, "gitBranch": self.branch, "cwd": "D:/bench/repo", "version": "2.1.0", "sessionId": "S"})
        }
        /// Un "turno": a volte un prompt, poi comandi e modifiche con i loro risultati; ogni tanto un commit,
        /// un cambio di branch o un ai-title. Restituisce le righe JSON.
        pub(super) fn turn(&mut self) -> Vec<String> {
            self.turn += 1;
            let mut out = Vec::new();
            if self.next(9) == 0 {
                self.branch = if self.branch == "main" { format!("feature/b{}", self.turn) } else { "main".into() };
            }
            if self.next(3) == 0 {
                let mut v = self.base("user");
                v["message"] = json!({"role": "user", "content": format!("Please {} {}", self.words(30), self.turn)});
                out.push(v.to_string());
            }
            for _ in 0..1 + self.next(5) {
                let file = format!("D:/bench/repo/src/file{}.ts", self.next(80));
                if self.next(2) == 0 {
                    let cmd = if self.next(8) == 0 { format!("git add -A && git commit -m \"feat: step {}\"", self.turn) } else { format!("npm run build -- --filter {}", self.next(9)) };
                    let mut a = self.base("assistant");
                    a["message"] = json!({"role": "assistant", "content": [{"type": "text", "text": self.words(40)}, {"type": "tool_use", "id": "toolu_1", "name": "Bash", "input": {"command": cmd}}]});
                    out.push(a.to_string());
                    let (n, hash) = (500 + self.next(1200) as usize, self.next(0xfffffff));
                    let stdout = if cmd.contains("git commit") { format!("[{} {hash:07x}] feat: step {}\n 2 files changed", self.branch, self.turn) } else { self.words(n) };
                    let mut r = self.base("user");
                    r["toolUseResult"] = json!({"stdout": stdout, "stderr": "", "interrupted": false});
                    r["message"] = json!({"role": "user", "content": [{"type": "tool_result", "tool_use_id": "toolu_1", "content": "ok"}]});
                    out.push(r.to_string());
                } else {
                    let (old, new) = (self.words(30), self.words(45));
                    let mut a = self.base("assistant");
                    a["message"] = json!({"role": "assistant", "content": [{"type": "tool_use", "id": "toolu_2", "name": "Edit", "input": {"file_path": file, "old_string": old, "new_string": new}}]});
                    out.push(a.to_string());
                    let lines: Vec<String> = (0..2 + self.next(12)).map(|i| format!("{}{}", ["+", "-", " "][(i % 3) as usize], self.words(8))).collect();
                    let mut r = self.base("user");
                    r["toolUseResult"] = json!({"filePath": file, "oldString": old, "newString": new, "userModified": false,
                        "structuredPatch": [{"oldStart": 10, "oldLines": 3, "newStart": 10, "newLines": 5, "lines": lines}]});
                    r["message"] = json!({"role": "user", "content": [{"type": "tool_result", "tool_use_id": "toolu_2", "content": "ok"}]});
                    out.push(r.to_string());
                }
            }
            if self.next(25) == 0 {
                out.push(json!({"type": "ai-title", "aiTitle": format!("Bench {}", self.turn), "sessionId": "S"}).to_string());
            }
            out
        }
    }

    /// Scrive un transcript di circa `bytes` byte.
    pub(super) fn write_transcript(path: &Path, bytes: usize, seed: u64) -> Gen {
        let mut g = Gen::new(seed);
        let mut s = String::new();
        while s.len() < bytes {
            for l in g.turn() {
                s.push_str(&l);
                s.push('\n');
            }
        }
        std::fs::create_dir_all(path.parent().unwrap()).unwrap();
        std::fs::write(path, s).unwrap();
        g
    }

    /// Benchmark (transcript sintetici in una cartella temporanea; niente ~/.claude): scansione completa,
    /// scansione dalla cache e scansione "live" dopo ogni aggiunta di un turno al transcript grande, come
    /// mentre Claude lavora con la vista Attività aperta. In release:
    /// `cargo test --release --lib activity::tests::scan_live_bench -- --ignored --nocapture`
    #[test]
    #[ignore]
    fn scan_live_bench() {
        use std::io::Write;
        let root = std::env::temp_dir().join("orbit-activity-bench");
        let _ = std::fs::remove_dir_all(&root);
        let projects = root.join("projects");
        for i in 0..60u64 {
            write_transcript(&projects.join(format!("D--p{}", i % 6)).join(format!("small-{i}.jsonl")), 200_000 + (i as usize % 9) * 200_000, 100 + i);
        }
        let big = projects.join("D--bench-repo").join("big.jsonl");
        let mut g = write_transcript(&big, 40_000_000, 7);
        *CACHE.lock().unwrap_or_else(|e| e.into_inner()) = None;
        let t = std::time::Instant::now();
        let a = scan_in(&projects, Some(500));
        let full = t.elapsed();
        let t = std::time::Instant::now();
        let b = scan_in(&projects, Some(500));
        let cached = t.elapsed();
        assert_eq!(a.len(), b.len());
        let mut live = Vec::new();
        for _ in 0..30 {
            let mut f = std::fs::OpenOptions::new().append(true).open(&big).unwrap();
            for l in g.turn() {
                writeln!(f, "{l}").unwrap();
            }
            drop(f);
            let t = std::time::Instant::now();
            let r = scan_in(&projects, Some(500));
            live.push(t.elapsed().as_secs_f64() * 1000.0);
            assert!(!r.is_empty());
        }
        let mean = live.iter().sum::<f64>() / live.len() as f64;
        let max = live.iter().cloned().fold(0.0, f64::max);
        let size: u64 = std::fs::metadata(&big).unwrap().len();
        println!(
            "unità {} · grande {:.1} MB · completa {full:?} · cache {cached:?} · live: media {mean:.1} ms, max {max:.1} ms",
            a.len(),
            size as f64 / 1e6
        );
        let _ = std::fs::remove_dir_all(&root);
    }

    /// Misura (sui transcript VERI di questo PC, in sola lettura): la prima scansione legge tutto, come
    /// faceva ogni scansione prima della M59; la seconda usa la cache. A mano, in release:
    /// `cargo test --release --lib activity::tests::scan_timing -- --ignored --nocapture`
    #[test]
    #[ignore]
    fn scan_timing() {
        let t = std::time::Instant::now();
        let a = scan(Some(500)).unwrap();
        let full = t.elapsed();
        let t = std::time::Instant::now();
        let b = scan(Some(500)).unwrap();
        let cached = t.elapsed();
        assert_eq!(a.len(), b.len());
        println!("unità: {} · prima scansione (tutto): {full:?} · seconda (cache): {cached:?}", a.len());
    }
}
