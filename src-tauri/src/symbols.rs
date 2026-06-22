// Indice dei simboli del progetto ("rubrica") per la navigazione del codice: Vai alla definizione,
// Simboli del progetto e (Fase 2) correlati contestuali. Estrazione EURISTICA scritta a mano con la
// sola std — NIENTE crate `regex`, NIENTE LSP — riconoscendo la *forma* delle dichiarazioni per
// linguaggio. Coerente coi gate (leggerezza, zero dipendenze). Name-based: per i nomi ambigui il
// frontend mostra un selettore.
use serde::Serialize;
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

/// Scansiona il progetto ed estrae le definizioni dei simboli (stesso walk/esclusioni del resto).
#[tauri::command]
pub fn scan_symbols(root: String) -> Result<Vec<Symbol>, String> {
    let root_path = Path::new(&root);
    let mut out: Vec<Symbol> = Vec::new();
    let mut stack = vec![root_path.to_path_buf()];
    while let Some(dir) = stack.pop() {
        let rd = match std::fs::read_dir(&dir) {
            Ok(r) => r,
            Err(_) => continue,
        };
        for entry in rd.flatten() {
            if out.len() >= 50_000 {
                return Ok(out); // cap di sicurezza su repo enormi
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
            let lang = match lang_for_ext(&ext) {
                Some(l) => l,
                None => continue,
            };
            if entry.metadata().map(|m| m.len()).unwrap_or(0) > 2_000_000 {
                continue;
            }
            let content = match std::fs::read_to_string(&p) {
                Ok(c) => c,
                Err(_) => continue,
            };
            let rel = p
                .strip_prefix(root_path)
                .unwrap_or(&p)
                .to_string_lossy()
                .replace('\\', "/");
            extract(lang, &content, &rel, &mut out);
        }
    }
    Ok(out)
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

fn has_any(t: &str, set: &[&str]) -> bool {
    t.split_whitespace().any(|w| set.contains(&w))
}

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
    for (i, raw) in content.lines().enumerate() {
        let line = (i as u32) + 1;
        let t = raw.trim_start();
        if t.is_empty() {
            continue;
        }
        match lang {
            Lang::CSharpLike => cs(t, file, line, &mut container, out),
            Lang::Cpp => cpp(t, file, line, &mut container, out),
            Lang::Ts => ts(t, file, line, &mut container, out),
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
    if !has_any(t, CS_MODS) {
        return; // metodi/proprietà: senza un modificatore è troppo rischioso
    }
    // proprietà auto: "... Name { get ..."
    if let Some(pos) = t.find("{ get").or_else(|| t.find("{get")) {
        let name = trail_ident(&t[..pos]);
        if !name.is_empty() && !is_control_kw(name) {
            push(out, name, "property", file, line, container, vec![]);
            return;
        }
    }
    // metodo: identificatore subito prima della prima '('
    if let Some(pos) = t.find('(') {
        let name = trail_ident(&t[..pos]);
        if !name.is_empty() && !is_control_kw(name) {
            push(out, name, "method", file, line, container, vec![]);
        }
    }
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

fn ts(t: &str, file: &str, line: u32, container: &mut String, out: &mut Vec<Symbol>) {
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
            if after.starts_with('=') {
                let rhs = after[1..].trim_start();
                let looks_fn = rhs.starts_with("function")
                    || rhs.starts_with("async")
                    || rhs.starts_with('(')
                    || (rhs.starts_with(|c: char| c.is_alphanumeric() || c == '_') && after.contains("=>"));
                if looks_fn {
                    push(out, name, "function", file, line, container, vec![]);
                }
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
