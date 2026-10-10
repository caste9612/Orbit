// Indice dei simboli del progetto ("rubrica") per la navigazione del codice: Vai alla definizione,
// Simboli del progetto e (Fase 2) correlati contestuali. Estrazione EURISTICA scritta a mano con la
// sola std — NIENTE crate `regex`, NIENTE LSP — riconoscendo la *forma* delle dichiarazioni per
// linguaggio. Coerente coi gate (leggerezza, zero dipendenze). Name-based: per i nomi ambigui il
// frontend mostra un selettore.
use crate::refs;
use serde::Serialize;
use std::collections::{HashMap, HashSet};
use std::path::Path;

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct Symbol {
    name: String,
    kind: String,       // class | interface | struct | enum | record | trait | type | method | function | property
    file: String,       // path relativo alla radice (separatori "/")
    line: u32,          // 1-based
    container: String,  // tipo/funzione che lo contiene (best-effort), "" se top-level
    bases: Vec<String>, // per i tipi: basi/interfacce dichiarate (per i "correlati" della Fase 2)
    is_abstract: bool,  // tipo con modificatore `abstract` → badge distinto nella barra dei correlati
}

#[derive(Clone, Copy)]
enum Lang {
    CSharpLike, // C# / Java
    Cpp,        // C / C++
    Ts,         // TS/JS/Svelte
    Python,
    Rust,
    Go,
}

fn lang_for_ext(ext: &str) -> Option<Lang> {
    Some(match ext {
        "cs" | "java" => Lang::CSharpLike,
        "cpp" | "cxx" | "cc" | "c++" | "hpp" | "hxx" | "hh" | "h++" | "c" | "h" => Lang::Cpp,
        "ts" | "tsx" | "js" | "jsx" | "mts" | "cts" | "mjs" | "cjs" | "svelte" => Lang::Ts,
        "py" => Lang::Python,
        "rs" => Lang::Rust,
        "go" => Lang::Go,
        _ => return None,
    })
}

#[derive(Serialize)]
pub struct ScanResult {
    symbols: Vec<Symbol>,
    // M60 (CodeLens): quante volte compare il nome di ogni simbolo, commenti e stringhe esclusi
    refs: HashMap<String, u32>,
}

/// Scansiona il progetto: le definizioni dei simboli e, nello stesso giro di file, quante volte compare
/// ogni loro nome (i "N references" di CodeLens). Fuori dal thread principale (M60): la scansione riparte
/// a ogni modifica dei file e, su un progetto grande, prima fermava l'interfaccia.
#[tauri::command]
pub async fn scan_symbols(root: String) -> Result<ScanResult, String> {
    tauri::async_runtime::spawn_blocking(move || scan(&root))
        .await
        .map_err(|e| e.to_string())?
}

fn scan(root: &str) -> Result<ScanResult, String> {
    let root_path = Path::new(root);
    let mut out: Vec<Symbol> = Vec::new();
    let mut counts: HashMap<String, u32> = HashMap::new();
    let mut stack = vec![root_path.to_path_buf()];
    'walk: while let Some(dir) = stack.pop() {
        let rd = match std::fs::read_dir(&dir) {
            Ok(r) => r,
            Err(_) => continue,
        };
        for entry in rd.flatten() {
            if out.len() >= 50_000 {
                break 'walk; // cap di sicurezza su repo enormi
            }
            let p = entry.path();
            let fname = entry.file_name().to_string_lossy().to_string();
            let is_dir = entry.file_type().map(|t| t.is_dir()).unwrap_or(false);
            if is_dir {
                if matches!(fname.as_str(), "node_modules" | ".git" | "target" | "dist") {
                    continue;
                }
                stack.push(p);
                continue;
            }
            let ext = match p.extension().and_then(|e| e.to_str()) {
                Some(e) => e.to_lowercase(),
                None => continue,
            };
            // codice (simboli + riferimenti) o markup di C# (solo riferimenti: XAML, Razor)
            let lang = lang_for_ext(&ext);
            let lex = refs::lex_for_ext(&ext);
            if lang.is_none() && lex.is_none() {
                continue;
            }
            if entry.metadata().map(|m| m.len()).unwrap_or(0) > 2_000_000 {
                continue;
            }
            let content = match std::fs::read_to_string(&p) {
                Ok(c) => c,
                Err(_) => continue,
            };
            if let Some(lang) = lang {
                let rel = p
                    .strip_prefix(root_path)
                    .unwrap_or(&p)
                    .to_string_lossy()
                    .replace('\\', "/");
                extract(lang, &content, &rel, &mut out);
            }
            if let Some(lex) = lex {
                refs::count_into(&content, lex, &mut counts);
            }
        }
    }
    // dei conteggi servono solo i nomi dei simboli (non ogni identificatore del progetto)
    let names: HashSet<&str> = out.iter().map(|s| s.name.as_str()).collect();
    counts.retain(|k, _| names.contains(k.as_str()));
    Ok(ScanResult { symbols: out, refs: counts })
}

// ---- helper di parsing (solo std) -------------------------------------------

fn is_word(c: char) -> bool {
    c.is_alphanumeric() || c == '_'
}

/// Identificatore iniziale di `s` (alfanumerici + _ / $); "" se non inizia con un identificatore.
fn lead_ident(s: &str) -> &str {
    let mut end = 0;
    for (i, c) in s.char_indices() {
        if c.is_alphanumeric() || c == '_' || c == '$' {
            end = i + c.len_utf8();
        } else {
            break;
        }
    }
    &s[..end]
}

/// Identificatore finale di `s` (per il nome di metodo subito prima della '(').
fn trail_ident(s: &str) -> &str {
    let s = s.trim_end();
    let mut start = s.len();
    for (i, c) in s.char_indices().rev() {
        if c.is_alphanumeric() || c == '_' || c == '$' {
            start = i;
        } else {
            break;
        }
    }
    &s[start..]
}

/// True se il carattere "di parola" TERMINA appena prima dell'offset di byte `at` (sicuro con UTF-8:
/// niente reinterpretazione di un singolo byte come char accanto a identificatori non-ASCII).
fn word_before(t: &str, at: usize) -> bool {
    t[..at].chars().next_back().map_or(false, is_word)
}
/// True se un carattere "di parola" INIZIA all'offset di byte `at`.
fn word_at(t: &str, at: usize) -> bool {
    t[at..].chars().next().map_or(false, is_word)
}

/// Sottostringa dopo la parola-chiave `kw` (confini di parola) SOLO se ciò che la precede sulla riga
/// sono modificatori ammessi o nulla → evita falsi positivi dentro stringhe/espressioni.
fn decl_after<'a>(t: &'a str, kw: &str, allowed: &[&str]) -> Option<&'a str> {
    let mut from = 0;
    while let Some(rel) = t[from..].find(kw) {
        let at = from + rel;
        let before_ok = at == 0 || !word_before(t, at);
        let aft = at + kw.len();
        let after_ok = aft == t.len() || !word_at(t, aft);
        if before_ok && after_ok {
            let prefix = t[..at].trim();
            if prefix.split_whitespace().all(|w| allowed.contains(&w)) {
                return Some(t[aft..].trim_start());
            }
        }
        from = at + kw.len();
    }
    None
}

/// Parola-chiave come parola, con QUALSIASI prefisso (per `extends`/`implements`/`for`/`impl`).
fn after_word_anyprefix<'a>(t: &'a str, kw: &str) -> Option<&'a str> {
    let mut from = 0;
    while let Some(rel) = t[from..].find(kw) {
        let at = from + rel;
        let before_ok = at == 0 || !word_before(t, at);
        let aft = at + kw.len();
        let after_ok = aft == t.len() || !word_at(t, aft);
        if before_ok && after_ok {
            return Some(t[aft..].trim_start());
        }
        from = at + kw.len();
    }
    None
}

const CS_MODS: &[&str] = &[
    "public", "private", "protected", "internal", "static", "sealed", "abstract", "partial", "new",
    "virtual", "override", "async", "extern", "unsafe", "readonly", "final", "synchronized",
    "native", "default", "volatile", "transient", "strictfp",
];
const TS_MODS: &[&str] = &["export", "default", "abstract", "declare"];
const TS_FN_MODS: &[&str] = &["export", "default", "async", "declare"];
const RS_MODS: &[&str] = &["pub", "pub(crate)", "pub(super)"];
const RS_FN_MODS: &[&str] = &["pub", "pub(crate)", "pub(super)", "async", "const", "unsafe", "extern"];

/// True se prima della parola-chiave `kw` compare il token `word` (es. "abstract" prima di "class").
fn before_has(t: &str, kw: &str, word: &str) -> bool {
    t.split(kw).next().map_or(false, |p| p.split_whitespace().any(|w| w == word))
}

fn is_control_kw(name: &str) -> bool {
    matches!(
        name,
        "if" | "for" | "while" | "switch" | "foreach" | "catch" | "using" | "lock" | "return"
            | "fixed" | "do" | "else" | "throw" | "await" | "yield" | "when" | "in" | "is" | "as"
            | "where" | "select" | "from" | "get" | "set" | "new" | "namespace" | "class" | "struct"
            | "interface" | "enum" | "record" | "void" | "case" | "default" | "sizeof" | "typeof"
            | "nameof" | "checked" | "unchecked"
    )
}

// ---- dispatch ---------------------------------------------------------------

fn extract(lang: Lang, content: &str, file: &str, out: &mut Vec<Symbol>) {
    let mut container = String::new();
    // TS/JS: rientro del livello più esterno (0, o quello dello <script> di un componente Svelte); una
    // funzione più rientrata sta dentro un'altra funzione o un blocco
    let base = if matches!(lang, Lang::Ts) && file.ends_with(".svelte") { svelte_script_indent(content) } else { 0 };
    for (i, raw) in content.lines().enumerate() {
        let line = (i as u32) + 1;
        let t = raw.trim_start();
        if t.is_empty() {
            continue;
        }
        match lang {
            Lang::CSharpLike => cs(t, file, line, &mut container, out),
            Lang::Cpp => cpp(t, file, line, &mut container, out),
            Lang::Ts => ts(t, raw.len() - t.len() > base, file, line, &mut container, out),
            Lang::Python => py(raw, t, file, line, &mut container, out),
            Lang::Rust => rs(t, file, line, &mut container, out),
            Lang::Go => go(t, file, line, &mut container, out),
        }
    }
}

fn push(out: &mut Vec<Symbol>, name: &str, kind: &str, file: &str, line: u32, container: &str, bases: Vec<String>) {
    out.push(Symbol {
        name: name.to_string(),
        kind: kind.to_string(),
        file: file.to_string(),
        line,
        container: container.to_string(),
        bases,
        is_abstract: false,
    });
}

// ---- C# / Java --------------------------------------------------------------

fn cs_bases(after_name: &str) -> Vec<String> {
    let mut s = after_name.trim_start();
    if s.starts_with('<') {
        if let Some(i) = s.find('>') {
            s = s[i + 1..].trim_start();
        }
    }
    if !s.starts_with(':') {
        return vec![];
    }
    let mut seg = &s[1..];
    if let Some(i) = seg.find('{') {
        seg = &seg[..i];
    }
    if let Some(i) = seg.find(" where ") {
        seg = &seg[..i];
    }
    seg.split(',')
        .filter_map(|p| {
            let id = lead_ident(p.trim());
            (!id.is_empty()).then(|| id.to_string())
        })
        .collect()
}

fn cs(t: &str, file: &str, line: u32, container: &mut String, out: &mut Vec<Symbol>) {
    if t.starts_with("//") || t.starts_with('*') || t.starts_with("/*") {
        return;
    }
    for kw in ["class", "interface", "struct", "enum", "record"] {
        if let Some(rest) = decl_after(t, kw, CS_MODS) {
            let name = lead_ident(rest);
            if !name.is_empty() {
                let bases = cs_bases(&rest[name.len()..]);
                push(out, name, kw, file, line, container, bases);
                if kw == "class" && before_has(t, "class", "abstract") {
                    if let Some(s) = out.last_mut() {
                        s.is_abstract = true;
                    }
                }
                *container = name.to_string();
                return;
            }
        }
    }
    // M59: il modificatore va cercato SOLO prima del nome. Prima bastava una parola di CS_MODS in un
    // punto qualsiasi della riga, e `new` è anche un modificatore → `var m = new Foo();` diventava il
    // "metodo" Foo, come `obj.Call(… new X())` (su Quiver un "metodo" C# su quattro era una chiamata).
    let t = strip_leading_attributes(t);
    // proprietà auto: "... Name { get ..."
    if let Some(pos) = t.find("{ get").or_else(|| t.find("{get")) {
        if let Some(name) = cs_declared_name(&t[..pos]) {
            push(out, name, "property", file, line, container, vec![]);
            return;
        }
    }
    // proprietà con corpo a espressione: "public string Key => KeyOf(x);" (nessuna '(' prima di "=>";
    // un metodo `Foo() => …` ce l'ha). Prima qui finiva nell'indice il metodo CHIAMATO (KeyOf).
    if let Some(pos) = t.find("=>") {
        if !t[..pos].contains('(') {
            if let Some(name) = cs_declared_name(&t[..pos]) {
                push(out, name, "property", file, line, container, vec![]);
                return;
            }
        }
    }
    // metodo/costruttore: il primo identificatore seguito da '(' con una dichiarazione davanti (con un
    // tipo di ritorno tupla la prima '(' è quella del tipo, quindi si provano tutte)
    let mut from = 0;
    while let Some(rel) = t[from..].find('(') {
        let pos = from + rel;
        if let Some(name) = cs_declared_name(&t[..pos]) {
            push(out, name, "method", file, line, container, vec![]);
            return;
        }
        from = pos + 1;
    }
}

/// Toglie dall'inizio della riga gli attributi C# (`[Fact]`, `[DllImport("x.dll")]`) e le annotazioni
/// Java (`@Override`, `@SuppressWarnings("x")`): le loro virgolette e parentesi non sono la dichiarazione.
fn strip_leading_attributes(mut t: &str) -> &str {
    loop {
        t = t.trim_start();
        let rest = if t.starts_with('[') {
            balanced_end(t, '[', ']').map(|end| &t[end..])
        } else if let Some(after_at) = t.strip_prefix('@') {
            let name = lead_ident(after_at);
            if name.is_empty() || name == "interface" {
                None
            } else {
                let tail = &after_at[name.len()..];
                if tail.starts_with('(') {
                    balanced_end(tail, '(', ')').map(|end| &tail[end..])
                } else {
                    Some(tail)
                }
            }
        } else {
            None
        };
        match rest {
            Some(r) => t = r,
            None => return t,
        }
    }
}

/// Offset subito dopo la chiusura che bilancia l'apertura iniziale di `s` (None se non si chiude).
fn balanced_end(s: &str, open: char, close: char) -> Option<usize> {
    let mut depth = 0i32;
    for (i, c) in s.char_indices() {
        if c == open {
            depth += 1;
        } else if c == close {
            depth -= 1;
            if depth == 0 {
                return Some(i + c.len_utf8());
            }
        }
    }
    None
}

/// Nome dichiarato alla fine di `before` (il testo prima di '(' o di '{ get'), se ciò che lo precede è
/// davvero una dichiarazione: almeno un modificatore, nessuna espressione (`=`, stringhe, accesso con
/// `.`, parentesi aperte) e l'ultima parola non è `new`/`return`/`await`… Gli argomenti generici
/// (`Load<T>`) si saltano: prima un metodo generico non entrava nell'indice.
fn cs_declared_name(before: &str) -> Option<&str> {
    let mut b = before.trim_end();
    if b.ends_with('>') {
        let bytes = b.as_bytes();
        let mut depth = 0i32;
        let mut cut = None;
        for i in (0..bytes.len()).rev() {
            match bytes[i] {
                b'>' => depth += 1,
                b'<' => {
                    depth -= 1;
                    if depth == 0 {
                        cut = Some(i);
                        break;
                    }
                }
                _ => {}
            }
        }
        b = b[..cut?].trim_end();
    }
    let name = trail_ident(b);
    if name.is_empty() || is_control_kw(name) || name.chars().next().is_some_and(|c| c.is_ascii_digit()) {
        return None;
    }
    let prefix = b[..b.len() - name.len()].trim_end();
    if prefix.is_empty() || prefix.ends_with('.') || prefix.contains(['=', '"', '\'']) {
        return None;
    }
    let mut depth = 0i32;
    for c in prefix.chars() {
        match c {
            '(' => depth += 1,
            ')' => {
                depth -= 1;
                if depth < 0 {
                    return None;
                }
            }
            _ => {}
        }
    }
    if depth != 0 {
        return None; // dentro gli argomenti di una chiamata
    }
    let words: Vec<&str> = prefix.split_whitespace().collect();
    let last = *words.last()?;
    if matches!(
        last,
        "new" | "return" | "await" | "throw" | "yield" | "else" | "case" | "in" | "is" | "as" | "using" | "var" | "goto"
    ) {
        return None;
    }
    words.iter().any(|w| CS_MODS.contains(w)).then_some(name)
}

// ---- C / C++ ----------------------------------------------------------------
// Solo std, euristico e CONSERVATIVO: tipi da class/struct/union/enum a inizio riga; funzioni/metodi
// solo da righe che APRONO un corpo (terminano con '{' o ':' della init-list) con un identificatore
// valido prima della '(' e un "ritorno" davanti → niente chiamate (terminano con ';') né if/for/while.
const CPP_TYPE_MODS: &[&str] = &["typedef"];

fn cpp(t: &str, file: &str, line: u32, container: &mut String, out: &mut Vec<Symbol>) {
    if t.starts_with("//") || t.starts_with('*') || t.starts_with("/*") || t.starts_with('#') {
        return; // commenti e direttive del preprocessore
    }
    // tipi: class / struct / union / enum (anche "enum class Foo" / "enum struct Foo")
    for kw in ["class", "struct", "union", "enum"] {
        if let Some(rest) = decl_after(t, kw, CPP_TYPE_MODS) {
            let rest = rest
                .strip_prefix("class ")
                .or_else(|| rest.strip_prefix("struct "))
                .unwrap_or(rest)
                .trim_start();
            let name = lead_ident(rest);
            if !name.is_empty() && !is_control_kw(name) {
                let kind = if kw == "union" { "struct" } else { kw };
                push(out, name, kind, file, line, container, vec![]);
                *container = name.to_string();
                return;
            }
        }
    }
    // funzioni/metodi: solo se la riga apre un corpo ('{' finale) o è una init-list di costruttore (':')
    let code = t.split("//").next().unwrap_or(t).trim_end();
    if !code.ends_with('{') && !code.ends_with(':') {
        return;
    }
    if let Some(pos) = t.find('(') {
        let head = &t[..pos];
        let name = trail_ident(head);
        if name.is_empty() || is_control_kw(name) {
            return;
        }
        let qualified = head.contains("::"); // Class::method(...)
        // serve un tipo di ritorno (≥2 token) o la qualifica: distingue da una chiamata "foo() {"
        if !qualified && head.trim().split_whitespace().count() < 2 {
            return;
        }
        let kind = if qualified || !container.is_empty() { "method" } else { "function" };
        push(out, name, kind, file, line, container, vec![]);
    }
}

// ---- TypeScript / JS / Svelte ----------------------------------------------

fn ts_bases(rest: &str) -> Vec<String> {
    let mut v = vec![];
    if let Some(a) = after_word_anyprefix(rest, "extends") {
        let id = lead_ident(a);
        if !id.is_empty() {
            v.push(id.to_string());
        }
    }
    if let Some(a) = after_word_anyprefix(rest, "implements") {
        let mut seg = a;
        if let Some(i) = seg.find('{') {
            seg = &seg[..i];
        }
        for p in seg.split(',') {
            let id = lead_ident(p.trim());
            if !id.is_empty() {
                v.push(id.to_string());
            }
        }
    }
    v
}

/// Rientro della prima riga di codice nel primo <script> di un componente Svelte (di solito 2 spazi).
fn svelte_script_indent(content: &str) -> usize {
    let mut lines = content.lines().skip_while(|l| !l.trim_start().starts_with("<script"));
    lines.next();
    lines
        .find(|l| !l.trim().is_empty())
        .filter(|l| !l.trim_start().starts_with("</script"))
        .map_or(0, |l| l.len() - l.trim_start().len())
}

/// `s` comincia con la parola `w` (non con un identificatore più lungo: `async` sì, `asyncResult` no).
fn starts_with_word(s: &str, w: &str) -> bool {
    s.starts_with(w) && !s[w.len()..].starts_with(|c: char| c.is_alphanumeric() || c == '_' || c == '$')
}

/// Parametri di una arrow function: `(…) =>` o `(…): T =>`, oppure parentesi ancora aperta a fine riga
/// (parametri su più righe). Non `(a ?? 0) - b` né `(await f()).map((x) => x)`.
fn paren_arrow(rhs: &str) -> bool {
    if !rhs.starts_with('(') {
        return false;
    }
    let mut depth = 0;
    for (i, c) in rhs.char_indices() {
        if c == '(' {
            depth += 1;
        } else if c == ')' {
            depth -= 1;
            if depth == 0 {
                let rest = rhs[i + 1..].trim_start();
                return rest.starts_with("=>") || (rest.starts_with(':') && rest.contains("=>"));
            }
        }
    }
    true
}

/// Il valore assegnato è una funzione: `function`, `async …`, `(…) =>`, `<T,>(…) =>`, `x =>`. Una
/// chiamata con una callback (`ids.filter((_, i) => …)`) è un valore, non una funzione (M60).
fn ts_fn_value(rhs: &str) -> bool {
    let id = lead_ident(rhs);
    starts_with_word(rhs, "function")
        || starts_with_word(rhs, "async")
        || paren_arrow(rhs)
        || rhs.strip_prefix('<').and_then(|r| r.find('>').map(|i| r[i + 1..].trim_start())).map_or(false, paren_arrow)
        || (!id.is_empty() && rhs[id.len()..].trim_start().starts_with("=>"))
}

fn ts(t: &str, nested: bool, file: &str, line: u32, container: &mut String, out: &mut Vec<Symbol>) {
    if t.starts_with("//") || t.starts_with('*') || t.starts_with("/*") {
        return;
    }
    for (kw, kind) in [("class", "class"), ("interface", "interface"), ("enum", "enum"), ("type", "type")] {
        if let Some(rest) = decl_after(t, kw, TS_MODS) {
            let name = lead_ident(rest);
            if !name.is_empty() {
                let bases = if kind == "class" || kind == "interface" {
                    ts_bases(&rest[name.len()..])
                } else {
                    vec![]
                };
                push(out, name, kind, file, line, container, bases);
                if kind == "class" && before_has(t, "class", "abstract") {
                    if let Some(s) = out.last_mut() {
                        s.is_abstract = true;
                    }
                }
                if kind == "class" || kind == "interface" {
                    *container = name.to_string();
                }
                return;
            }
        }
    }
    // le funzioni dentro altre funzioni (o blocchi) sono aiutanti locali: fuori dalla rubrica del
    // progetto, quindi niente lente con il conteggio per nome di `score` o `next` (M60)
    if nested {
        return;
    }
    if let Some(rest) = decl_after(t, "function", TS_FN_MODS) {
        let name = lead_ident(rest);
        if !name.is_empty() {
            push(out, name, "function", file, line, container, vec![]);
            return;
        }
    }
    // arrow/expression function: const X = (...) => / = async (...) => / = function
    for kw in ["const", "let", "var"] {
        if let Some(rest) = decl_after(t, kw, &["export", "default"]) {
            let name = lead_ident(rest);
            if name.is_empty() {
                return;
            }
            let after = rest[name.len()..].trim_start();
            if after.starts_with('=') && ts_fn_value(after[1..].trim_start()) {
                push(out, name, "function", file, line, container, vec![]);
            }
            return;
        }
    }
}

// ---- Python -----------------------------------------------------------------

fn py(raw: &str, t: &str, file: &str, line: u32, container: &mut String, out: &mut Vec<Symbol>) {
    if t.starts_with('#') {
        return;
    }
    if let Some(rest) = decl_after(t, "class", &[]) {
        let name = lead_ident(rest);
        if !name.is_empty() {
            let after = &rest[name.len()..];
            let bases = if let Some(open) = after.find('(') {
                let seg = &after[open + 1..];
                let seg = seg.split(')').next().unwrap_or("");
                seg.split(',')
                    .filter_map(|p| {
                        let id = lead_ident(p.trim());
                        (!id.is_empty()).then(|| id.to_string())
                    })
                    .collect()
            } else {
                vec![]
            };
            push(out, name, "class", file, line, container, bases);
            *container = name.to_string();
            return;
        }
    }
    if let Some(rest) = decl_after(t, "def", &["async"]) {
        let name = lead_ident(rest);
        if !name.is_empty() {
            let indented = raw.starts_with(' ') || raw.starts_with('\t');
            if indented && !container.is_empty() {
                push(out, name, "method", file, line, container, vec![]);
            } else {
                push(out, name, "function", file, line, "", vec![]);
            }
        }
    }
}

// ---- Rust -------------------------------------------------------------------

fn rs(t: &str, file: &str, line: u32, container: &mut String, out: &mut Vec<Symbol>) {
    if t.starts_with("//") || t.starts_with('*') || t.starts_with("/*") {
        return;
    }
    for (kw, kind) in [("struct", "struct"), ("enum", "enum"), ("trait", "trait")] {
        if let Some(rest) = decl_after(t, kw, RS_MODS) {
            let name = lead_ident(rest);
            if !name.is_empty() {
                push(out, name, kind, file, line, "", vec![]);
                *container = name.to_string();
                return;
            }
        }
    }
    // impl Type { } / impl Trait for Type { } → fissa il container per le fn seguenti
    if let Some(rest) = after_word_anyprefix(t, "impl") {
        let target = after_word_anyprefix(rest, "for").unwrap_or(rest);
        let name = lead_ident(target.trim_start());
        if !name.is_empty() {
            *container = name.to_string();
        }
    }
    if let Some(rest) = decl_after(t, "fn", RS_FN_MODS) {
        let name = lead_ident(rest);
        if !name.is_empty() {
            let kind = if container.is_empty() { "function" } else { "method" };
            push(out, name, kind, file, line, container, vec![]);
        }
    }
}

// ---- Go ---------------------------------------------------------------------

fn go(t: &str, file: &str, line: u32, _container: &mut String, out: &mut Vec<Symbol>) {
    if t.starts_with("//") {
        return;
    }
    if let Some(rest) = decl_after(t, "type", &[]) {
        let name = lead_ident(rest);
        if !name.is_empty() {
            let kind = if rest.contains("interface") {
                "interface"
            } else if rest.contains("struct") {
                "struct"
            } else {
                "type"
            };
            push(out, name, kind, file, line, "", vec![]);
            return;
        }
    }
    if let Some(rest) = decl_after(t, "func", &[]) {
        let r = rest.trim_start();
        if let Some(stripped) = r.strip_prefix('(') {
            // metodo con receiver: func (s *T) Name(...)
            if let Some(close) = stripped.find(')') {
                let recv = &stripped[..close];
                let recv_type = recv
                    .split_whitespace()
                    .last()
                    .unwrap_or("")
                    .trim_start_matches('*');
                let after = stripped[close + 1..].trim_start();
                let name = lead_ident(after);
                if !name.is_empty() {
                    push(out, name, "method", file, line, lead_ident(recv_type), vec![]);
                }
            }
        } else {
            let name = lead_ident(r);
            if !name.is_empty() {
                push(out, name, "function", file, line, "", vec![]);
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn names(out: &[Symbol]) -> Vec<&str> {
        out.iter().map(|s| s.name.as_str()).collect()
    }

    #[test]
    fn csharp_types_methods_bases() {
        let src = "namespace N {\n  public class OrderService : IOrderService, Base {\n    public async Task<int> GetTotal(int x) { return x; }\n    public string Name { get; set; }\n  }\n  public interface IOrderService { }\n}";
        let mut out = vec![];
        extract(Lang::CSharpLike, src, "a.cs", &mut out);
        let n = names(&out);
        assert!(n.contains(&"OrderService"));
        assert!(n.contains(&"GetTotal"));
        assert!(n.contains(&"Name"));
        assert!(n.contains(&"IOrderService"));
        let cls = out.iter().find(|s| s.name == "OrderService").unwrap();
        assert!(cls.bases.contains(&"IOrderService".to_string()));
        assert!(cls.bases.contains(&"Base".to_string()));
        let m = out.iter().find(|s| s.name == "GetTotal").unwrap();
        assert_eq!(m.kind, "method");
        assert_eq!(m.container, "OrderService");
    }

    #[test]
    fn csharp_calls_are_not_declarations() {
        // M59: righe vere di Quiver che finivano nell'indice come "metodi"
        let src = concat!(
            "public class Adorner {\n",
            "    var metadata = new ArchiveMetadata();\n",
            "    using var archive = new TempArchive();\n",
            "    drawingContext.DrawText(_text, new Point(rect.X + Padding.Width, rect.Y));\n",
            "            new Typeface(font, FontStyles.Normal, FontWeights.Medium, FontStretches.Normal), 12, foreground,\n",
            "    Converters = { new JsonStringEnumConverter(JsonNamingPolicy.CamelCase) },\n",
            "    CopyCheck.Differences(Path.Combine(_temp.Root, \"A\"), new string[0]);\n",
            "    private readonly Foo _foo = new Foo();\n",
            "    return new Result(x);\n",
            "    Console.WriteLine(\"public void Fake()\");\n",
            "}\n",
        );
        let mut out = vec![];
        extract(Lang::CSharpLike, src, "a.cs", &mut out);
        assert_eq!(names(&out), vec!["Adorner"]);
    }

    #[test]
    fn csharp_declarations_still_found() {
        let src = concat!(
            "public class Store {\n",
            "    public void Dispose() => _temp.Dispose();\n",
            "    public static T Load<T>(string path) where T : new() {\n",
            "    public (int a, int b) Pair() => (1, 2);\n",
            "    [DllImport(\"user32.dll\")] public static extern int MessageBox(IntPtr h);\n",
            "    public override string ToString() { return \"x\"; }\n",
            "    public Store(int x) : base(x) { }\n",
            "    protected new void Hide() { }\n",
            "    [JsonPropertyName(\"n\")] public string Name { get; set; }\n",
            "    @Override public String toString() {\n",
            "    public string Key => KeyOf(FolderPath, IsGeneral);\n",
            "    public int Count => items.Count(x => x > 0);\n",
            "    private readonly Func<int> f = () => 1;\n",
            "}\n",
        );
        let mut out = vec![];
        extract(Lang::CSharpLike, src, "a.cs", &mut out);
        let n = names(&out);
        for want in ["Store", "Dispose", "Load", "Pair", "MessageBox", "ToString", "Hide", "Name", "toString", "Key", "Count"] {
            assert!(n.contains(&want), "manca {want}: {n:?}");
        }
        assert_eq!(n.iter().filter(|x| **x == "Dispose").count(), 1);
        assert!(!n.contains(&"KeyOf") && !n.contains(&"f"), "chiamate o campi presi per membri: {n:?}");
        for p in ["Name", "Key", "Count"] {
            assert_eq!(out.iter().find(|s| s.name == p).unwrap().kind, "property", "{p}");
        }
    }

    #[test]
    fn abstract_class_flag() {
        let mut out = vec![];
        extract(Lang::CSharpLike, "public abstract class Base { }\npublic class Impl : Base { }", "a.cs", &mut out);
        assert!(out.iter().find(|s| s.name == "Base").unwrap().is_abstract);
        assert!(!out.iter().find(|s| s.name == "Impl").unwrap().is_abstract);
    }

    #[test]
    fn cpp_types_and_functions() {
        let src = concat!(
            "class Widget : public Base {\n",
            "  int compute(int x) {\n",
            "};\n",
            "struct Point {};\n",
            "enum class Color { Red, Green };\n",
            "int main() {\n",
            "void Widget::draw() {\n",
        );
        let mut out = vec![];
        extract(Lang::Cpp, src, "a.cpp", &mut out);
        let n = names(&out);
        assert!(n.contains(&"Widget"));
        assert!(n.contains(&"Point"));
        assert!(n.contains(&"Color"));
        assert!(n.contains(&"compute"));
        assert!(n.contains(&"main"));
        assert!(n.contains(&"draw"));
        assert_eq!(out.iter().find(|s| s.name == "Widget").unwrap().kind, "class");
        assert_eq!(out.iter().find(|s| s.name == "Point").unwrap().kind, "struct");
        assert_eq!(out.iter().find(|s| s.name == "Color").unwrap().kind, "enum");
    }

    #[test]
    fn cpp_no_false_positive_on_calls_and_control() {
        let src = "if (ready) {\n  doThing(x);\n  return compute(y);\n}\nfor (int i = 0; i < n; i++) {\n";
        let mut out = vec![];
        extract(Lang::Cpp, src, "a.cpp", &mut out);
        assert!(out.is_empty(), "chiamate e costrutti di controllo non sono simboli: {:?}", names(&out));
    }

    #[test]
    fn no_false_positive_in_string() {
        let src = "var s = \"public class Foo\";\nlet x = 1;";
        let mut out = vec![];
        extract(Lang::Ts, src, "a.ts", &mut out);
        assert!(!names(&out).contains(&"Foo"), "non deve estrarre simboli dentro stringhe");
    }

    #[test]
    fn ts_class_function_arrow() {
        let src = "export class A extends B implements C {}\nexport function f() {}\nconst g = () => 1;\nconst n = 5;";
        let mut out = vec![];
        extract(Lang::Ts, src, "a.ts", &mut out);
        let n = names(&out);
        assert!(n.contains(&"A"));
        assert!(n.contains(&"f"));
        assert!(n.contains(&"g"));
        assert!(!n.contains(&"n"), "una const non-funzione non è un simbolo");
        let a = out.iter().find(|s| s.name == "A").unwrap();
        assert!(a.bases.contains(&"B".to_string()) && a.bases.contains(&"C".to_string()));
    }

    /// Misura (in sola lettura) la scansione con i riferimenti di CodeLens su progetti veri. A mano, in release:
    /// `ORBIT_SCAN_ROOTS="D:/a;D:/b" cargo test --release --lib symbols::tests::scan_timing -- --ignored --nocapture`
    #[test]
    #[ignore]
    fn scan_timing() {
        let roots = std::env::var("ORBIT_SCAN_ROOTS").unwrap_or_else(|_| env!("CARGO_MANIFEST_DIR").to_string());
        for root in roots.split(';').filter(|r| !r.is_empty()) {
            let t = std::time::Instant::now();
            let r = scan(root).unwrap();
            println!("{root}: {} simboli, {} nomi contati, {:?}", r.symbols.len(), r.refs.len(), t.elapsed());
        }
    }

    #[test]
    fn ts_parenthesized_values_are_not_functions() {
        let src = "const all = (refs[name] ?? 0) - decls;\nconst h = (x: number): string => `${x}`;\nexport const k = (\n  a,\n) => a;";
        let mut out = vec![];
        extract(Lang::Ts, src, "a.ts", &mut out);
        let n = names(&out);
        assert!(!n.contains(&"all"), "{n:?}");
        assert!(n.contains(&"h") && n.contains(&"k"), "{n:?}");
    }

    #[test]
    fn ts_values_built_with_callbacks_are_not_functions() {
        let src = "const left = ids.filter((_, i) => i % 2 === 0);\nconst next = clean(layout.map((c) => c));\n\
                   const r = asyncResult();\nconst s = (await load()).map((x) => x);\nconst f = x => x + 1;\n\
                   const g = async (a) => a;\nconst h = async x => x;\nconst k = function* () {};\n\
                   const id = <T,>(x: T): T => x;";
        let mut out = vec![];
        extract(Lang::Ts, src, "a.ts", &mut out);
        assert_eq!(names(&out), ["f", "g", "h", "k", "id"]);
    }

    #[test]
    fn ts_nested_functions_are_local() {
        let src = "export function outer() {\n  const score = (w: number) => w;\n  function inner() {}\n}\n\
                   export const top = () => 1;";
        let mut out = vec![];
        extract(Lang::Ts, src, "a.ts", &mut out);
        assert_eq!(names(&out), ["outer", "top"]);
        // in un componente Svelte il livello esterno è il rientro dello <script>
        let svelte = concat!(
            "<script lang=\"ts\">\n  import x from \"y\";\n  export function a() {}\n  const b = () => 1;\n",
            "  function c() {\n    const d = () => 2;\n  }\n</script>\n\n<button onclick={() => a()}>x</button>\n",
        );
        let mut out2 = vec![];
        extract(Lang::Ts, svelte, "src/C.svelte", &mut out2);
        assert_eq!(names(&out2), ["a", "b", "c"]);
    }

    #[test]
    fn python_class_methods_functions() {
        let src = "class Foo(Base):\n    def bar(self):\n        pass\n\ndef top():\n    pass";
        let mut out = vec![];
        extract(Lang::Python, src, "a.py", &mut out);
        assert!(out.iter().any(|s| s.name == "Foo" && s.kind == "class" && s.bases == vec!["Base".to_string()]));
        assert!(out.iter().any(|s| s.name == "bar" && s.kind == "method" && s.container == "Foo"));
        assert!(out.iter().any(|s| s.name == "top" && s.kind == "function"));
    }

    #[test]
    fn rust_and_go() {
        let mut out = vec![];
        extract(Lang::Rust, "pub struct S;\nimpl S {\n    pub fn make() {}\n}\nfn helper() {}", "a.rs", &mut out);
        assert!(out.iter().any(|s| s.name == "S" && s.kind == "struct"));
        assert!(out.iter().any(|s| s.name == "make" && s.kind == "method" && s.container == "S"));
        let mut out2 = vec![];
        extract(Lang::Go, "type Server struct {}\nfunc (s *Server) Start() {}\nfunc New() {}", "a.go", &mut out2);
        assert!(out2.iter().any(|s| s.name == "Server" && s.kind == "struct"));
        assert!(out2.iter().any(|s| s.name == "Start" && s.kind == "method" && s.container == "Server"));
        assert!(out2.iter().any(|s| s.name == "New" && s.kind == "function"));
    }
}
