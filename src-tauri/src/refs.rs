// Riferimenti per CodeLens (M60): le occorrenze di un identificatore nel progetto, per NOME — niente LSP,
// come il resto della navigazione del codice (symbols.rs). Un lexer leggero per famiglia di linguaggio
// salta commenti e stringhe ma entra nelle interpolazioni (`$"…{x}…"` in C#, `${x}` nei template JS,
// le f-string Python), dove i riferimenti ci sono davvero. Nel markup di C# (XAML, Razor) contano anche
// gli attributi: `Click="OnSave"` e i binding sono riferimenti al codice.
use serde::Serialize;
use std::collections::HashMap;
use std::path::Path;

#[derive(Clone, Copy, PartialEq, Debug)]
pub enum Lex {
    CLike,  // C#, Java, C/C++, Rust, Go: ' = carattere (o lifetime Rust)
    CSharp, // come CLike + @"…" (verbatim), $"…{…}…" (interpolate), """…""" (raw)
    Js,     // TS/JS/Svelte: ' = stringa, `…${…}…` template, $ fa parte degli identificatori
    Go,     // come CLike + `…` raw string
    Python, // # commenti, '…' "…" '''…''' """…""", f-string
    Markup, // XAML/Razor: si saltano solo i commenti <!-- … -->
}

/// Famiglia del lexer per estensione; None = file che non contiene riferimenti al codice.
pub fn lex_for_ext(ext: &str) -> Option<Lex> {
    Some(match ext {
        "cs" => Lex::CSharp,
        "java" | "cpp" | "cxx" | "cc" | "c++" | "hpp" | "hxx" | "hh" | "h++" | "c" | "h" | "rs" => Lex::CLike,
        "go" => Lex::Go,
        "ts" | "tsx" | "js" | "jsx" | "mts" | "cts" | "mjs" | "cjs" | "svelte" => Lex::Js,
        "py" => Lex::Python,
        "xaml" | "axaml" | "razor" | "cshtml" => Lex::Markup,
        _ => return None,
    })
}

fn is_ident_start(c: u8, lex: Lex) -> bool {
    c.is_ascii_alphabetic() || c == b'_' || c >= 0x80 || (c == b'$' && lex == Lex::Js)
}
fn is_ident(c: u8, lex: Lex) -> bool {
    is_ident_start(c, lex) || c.is_ascii_digit()
}

struct Lexer<'a, F: FnMut(&'a str, u32)> {
    src: &'a str,
    b: &'a [u8],
    lex: Lex,
    line: u32,
    f: F,
}

impl<'a, F: FnMut(&'a str, u32)> Lexer<'a, F> {
    fn at(&self, i: usize, s: &str) -> bool {
        self.b[i..].starts_with(s.as_bytes())
    }

    /// Codice da `i`. Con `in_braces` si ferma (restituendo l'indice) alla `}` che chiude l'interpolazione.
    fn code(&mut self, mut i: usize, in_braces: bool) -> usize {
        let n = self.b.len();
        let mut depth = 0u32;
        while i < n {
            let c = self.b[i];
            match c {
                b'\n' => {
                    self.line += 1;
                    i += 1;
                }
                b'{' if in_braces => {
                    depth += 1;
                    i += 1;
                }
                b'}' if in_braces => {
                    if depth == 0 {
                        return i;
                    }
                    depth -= 1;
                    i += 1;
                }
                _ if self.lex == Lex::Markup => {
                    if self.at(i, "<!--") {
                        i = self.skip_until(i + 4, "-->");
                    } else if is_ident_start(c, self.lex) {
                        i = self.ident(i);
                    } else {
                        i += 1;
                    }
                }
                b'#' if self.lex == Lex::Python => i = self.skip_line(i),
                b'/' if self.lex != Lex::Python && self.at(i, "//") => i = self.skip_line(i),
                b'/' if self.lex != Lex::Python && self.at(i, "/*") => i = self.skip_until(i + 2, "*/"),
                b'"' | b'\'' if self.lex == Lex::Python => i = self.python_string(i, false),
                b'"' => i = self.c_string(i),
                b'\'' if self.lex == Lex::Js => i = self.quoted(i + 1, b'\'', false, Interp::None),
                b'\'' => i = self.char_literal(i),
                b'`' if self.lex == Lex::Js => i = self.quoted(i + 1, b'`', true, Interp::Dollar),
                b'`' if self.lex == Lex::Go => i = self.skip_until(i + 1, "`"),
                b'$' | b'@' if self.lex == Lex::CSharp && self.cs_prefixed_string(i) => i = self.cs_string(i),
                _ if c.is_ascii_digit() => {
                    // numeri (0x1F, 1e5, 3.14f): "e5" o "f" non sono identificatori
                    while i < n && (self.b[i].is_ascii_alphanumeric() || self.b[i] == b'_' || self.b[i] == b'.') {
                        i += 1;
                    }
                }
                _ if is_ident_start(c, self.lex) => {
                    // prefissi di stringa Python (f"…", rb'…'): non sono identificatori
                    if self.lex == Lex::Python {
                        if let Some(end) = self.python_prefixed(i) {
                            i = end;
                            continue;
                        }
                    }
                    if self.lex == Lex::CLike && c == b'r' {
                        if let Some(end) = self.rust_raw_string(i) {
                            i = end;
                            continue;
                        }
                    }
                    i = self.ident(i);
                }
                _ => i += 1,
            }
        }
        n
    }

    fn ident(&mut self, start: usize) -> usize {
        let mut i = start;
        while i < self.b.len() && is_ident(self.b[i], self.lex) {
            i += 1;
        }
        // i confini sono ASCII (o fine stringa): la fetta è UTF-8 valida
        if let Some(id) = self.src.get(start..i) {
            (self.f)(id, self.line);
        }
        i
    }

    fn skip_line(&mut self, mut i: usize) -> usize {
        while i < self.b.len() && self.b[i] != b'\n' {
            i += 1;
        }
        i
    }

    /// Salta fino a `close` compreso, contando le righe.
    fn skip_until(&mut self, mut i: usize, close: &str) -> usize {
        while i < self.b.len() {
            if self.at(i, close) {
                return i + close.len();
            }
            if self.b[i] == b'\n' {
                self.line += 1;
            }
            i += 1;
        }
        i
    }

    /// Stringa che si chiude con `quote`. `multiline`: può andare a capo (template, verbatim); altrimenti
    /// una stringa non chiusa finisce alla riga. Le interpolazioni si leggono come codice.
    fn quoted(&mut self, mut i: usize, quote: u8, multiline: bool, interp: Interp) -> usize {
        let n = self.b.len();
        while i < n {
            let c = self.b[i];
            if c == quote {
                // C# verbatim: "" è una virgoletta dentro la stringa
                if interp.doubled_quote() && i + 1 < n && self.b[i + 1] == quote {
                    i += 2;
                    continue;
                }
                return i + 1;
            }
            match c {
                b'\\' if !interp.doubled_quote() => {
                    if i + 1 < n && self.b[i + 1] == b'\n' {
                        self.line += 1;
                    }
                    i += 2;
                }
                b'\n' => {
                    self.line += 1;
                    if !multiline {
                        return i + 1;
                    }
                    i += 1;
                }
                b'{' if interp.braces() => {
                    if i + 1 < n && self.b[i + 1] == b'{' {
                        i += 2; // {{ = graffa letterale
                    } else {
                        i = self.code(i + 1, true) + 1;
                    }
                }
                b'$' if interp == Interp::Dollar && i + 1 < n && self.b[i + 1] == b'{' => {
                    i = self.code(i + 2, true) + 1;
                }
                _ => i += 1,
            }
        }
        n
    }

    fn c_string(&mut self, i: usize) -> usize {
        if self.lex == Lex::CSharp && self.at(i, "\"\"\"") {
            return self.skip_until(i + 3, "\"\"\""); // raw string C# 11
        }
        self.quoted(i + 1, b'"', false, Interp::None)
    }

    /// C#: $"…", @"…", $@"…", @$"…" a partire dal prefisso.
    fn cs_prefixed_string(&self, i: usize) -> bool {
        let rest = &self.b[i..];
        rest.starts_with(b"$\"") || rest.starts_with(b"@\"") || rest.starts_with(b"$@\"") || rest.starts_with(b"@$\"")
    }
    fn cs_string(&mut self, i: usize) -> usize {
        let mut j = i;
        let (mut dollar, mut at) = (false, false);
        while self.b[j] != b'"' {
            if self.b[j] == b'$' {
                dollar = true;
            } else {
                at = true;
            }
            j += 1;
        }
        let interp = match (dollar, at) {
            (true, true) => Interp::BracesVerbatim,
            (true, false) => Interp::Braces,
            (false, true) => Interp::Verbatim,
            _ => Interp::None,
        };
        self.quoted(j + 1, b'"', at, interp)
    }

    /// Carattere ('a', '\n', '\u{1F600}') o lifetime Rust ('a): carattere solo se si chiude subito.
    fn char_literal(&mut self, i: usize) -> usize {
        let n = self.b.len();
        let mut j = i + 1;
        if j < n && self.b[j] == b'\\' {
            j += 2;
            while j < n && j < i + 12 && self.b[j] != b'\'' && self.b[j] != b'\n' {
                j += 1;
            }
            return if j < n && self.b[j] == b'\'' { j + 1 } else { i + 1 };
        }
        // un carattere (anche UTF-8 multibyte) e la chiusura
        if j < n {
            let w = utf8_len(self.b[j]);
            if j + w < n && self.b[j + w] == b'\'' {
                return j + w + 1;
            }
        }
        i + 1 // lifetime o apice isolato: si salta solo l'apice
    }

    /// Rust: r"…" o r#"…"#; Some(fine) se a `i` comincia una raw string.
    fn rust_raw_string(&self, i: usize) -> Option<usize> {
        if i > 0 && is_ident(self.b[i - 1], self.lex) {
            return None;
        }
        let mut j = i + 1;
        let mut hashes = 0;
        while j < self.b.len() && self.b[j] == b'#' {
            hashes += 1;
            j += 1;
        }
        if j >= self.b.len() || self.b[j] != b'"' {
            return None;
        }
        let close = format!("\"{}", "#".repeat(hashes));
        let mut k = j + 1;
        while k < self.b.len() {
            if self.b[k..].starts_with(close.as_bytes()) {
                return Some(k + close.len());
            }
            k += 1;
        }
        Some(self.b.len())
    }

    /// Python: prefisso di stringa (r, b, u, f e combinazioni) seguito dalla virgoletta → salta la stringa.
    fn python_prefixed(&mut self, i: usize) -> Option<usize> {
        let mut j = i;
        let mut f = false;
        while j < self.b.len() && j < i + 2 && matches!(self.b[j].to_ascii_lowercase(), b'r' | b'b' | b'u' | b'f') {
            f |= self.b[j].to_ascii_lowercase() == b'f';
            j += 1;
        }
        if j == i || j >= self.b.len() || !matches!(self.b[j], b'"' | b'\'') {
            return None;
        }
        if i > 0 && is_ident(self.b[i - 1], self.lex) {
            return None;
        }
        Some(self.python_string(j, f))
    }

    fn python_string(&mut self, i: usize, f: bool) -> usize {
        let q = self.b[i];
        let triple = self.b[i..].starts_with(&[q, q, q]);
        if triple {
            // triple: multi-riga; le f-string triple non si leggono dentro (rare)
            let close = if q == b'"' { "\"\"\"" } else { "'''" };
            return self.skip_until(i + 3, close);
        }
        self.quoted(i + 1, q, false, if f { Interp::Braces } else { Interp::None })
    }
}

#[derive(Clone, Copy, PartialEq)]
enum Interp {
    None,
    Braces,         // C# $"…{x}…", f-string Python: {{ = graffa letterale
    BracesVerbatim, // C# $@"…": interpolata e verbatim ("" = virgoletta, niente escape \)
    Verbatim,       // C# @"…"
    Dollar,         // template JS: ${x}
}
impl Interp {
    fn braces(self) -> bool {
        matches!(self, Interp::Braces | Interp::BracesVerbatim)
    }
    fn doubled_quote(self) -> bool {
        matches!(self, Interp::Verbatim | Interp::BracesVerbatim)
    }
}

fn utf8_len(first: u8) -> usize {
    match first {
        0xF0..=0xFF => 4,
        0xE0..=0xEF => 3,
        0xC0..=0xDF => 2,
        _ => 1,
    }
}

/// Chiama `f(identificatore, riga 1-based)` per ogni identificatore fuori da commenti e stringhe.
pub fn for_each_ident<'a>(content: &'a str, lex: Lex, f: impl FnMut(&'a str, u32)) {
    let mut lx = Lexer { src: content, b: content.as_bytes(), lex, line: 1, f };
    lx.code(0, false);
}

/// Somma in `counts`, per ogni identificatore del file, le RIGHE in cui compare (allocazione solo per i nomi
/// nuovi). Righe e non occorrenze: `Section s = Section.General` è un posto solo, come nell'elenco che si
/// apre dalla lente — così il numero della lente e le righe dell'elenco coincidono sempre.
pub fn count_into(content: &str, lex: Lex, counts: &mut HashMap<String, u32>) {
    let mut last_line: HashMap<&str, u32> = HashMap::new();
    for_each_ident(content, lex, |id, line| {
        if last_line.insert(id, line) == Some(line) {
            return; // già contato su questa riga
        }
        if let Some(n) = counts.get_mut(id) {
            *n += 1;
        } else {
            counts.insert(id.to_string(), 1);
        }
    });
}

#[derive(Serialize)]
pub struct RefHit {
    file: String, // relativo alla radice, separatori "/"
    line: u32,
    text: String, // la riga, ripulita e accorciata
}

const MAX_HITS: usize = 2000;

/// Occorrenze di `name` nel progetto (stesso giro di file dell'indice dei simboli, più il markup di C#),
/// al massimo 2000. Per l'elenco che si apre cliccando "N references". Fuori dal thread principale.
#[tauri::command]
pub async fn ref_list(root: String, name: String) -> Result<Vec<RefHit>, String> {
    tauri::async_runtime::spawn_blocking(move || list(&root, &name))
        .await
        .map_err(|e| e.to_string())
}

fn list(root: &str, name: &str) -> Vec<RefHit> {
    let root_path = Path::new(root);
    let mut out = Vec::new();
    let mut stack = vec![root_path.to_path_buf()];
    while let Some(dir) = stack.pop() {
        let Ok(rd) = std::fs::read_dir(&dir) else { continue };
        for entry in rd.flatten() {
            let p = entry.path();
            let is_dir = entry.file_type().map(|t| t.is_dir()).unwrap_or(false);
            if is_dir {
                let fname = entry.file_name();
                if !matches!(fname.to_string_lossy().as_ref(), "node_modules" | ".git" | "target" | "dist") {
                    stack.push(p);
                }
                continue;
            }
            let Some(lex) = p.extension().and_then(|e| e.to_str()).and_then(|e| lex_for_ext(&e.to_lowercase())) else {
                continue;
            };
            if entry.metadata().map(|m| m.len()).unwrap_or(0) > 2_000_000 {
                continue;
            }
            let Ok(content) = std::fs::read_to_string(&p) else { continue };
            if !content.contains(name) {
                continue;
            }
            let rel = p.strip_prefix(root_path).unwrap_or(&p).to_string_lossy().replace('\\', "/");
            let lines: Vec<&str> = content.lines().collect();
            let mut last_line = 0;
            for_each_ident(&content, lex, |id, line| {
                // una riga sola anche con più occorrenze sulla stessa riga
                if id == name && line != last_line && out.len() < MAX_HITS {
                    last_line = line;
                    let text = lines.get(line as usize - 1).map(|l| l.trim()).unwrap_or("");
                    let text: String = text.chars().take(200).collect();
                    out.push(RefHit { file: rel.clone(), line, text });
                }
            });
            if out.len() >= MAX_HITS {
                return out;
            }
        }
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    fn idents(src: &str, lex: Lex) -> Vec<(String, u32)> {
        let mut v = Vec::new();
        for_each_ident(src, lex, |id, line| v.push((id.to_string(), line)));
        v
    }
    fn names(src: &str, lex: Lex) -> Vec<String> {
        idents(src, lex).into_iter().map(|(n, _)| n).collect()
    }

    #[test]
    fn csharp_comments_strings_and_interpolation() {
        let src = concat!(
            "// Foo nel commento\n",
            "/* Foo\n Foo */ var a = Load(\"Foo\");\n",
            "var b = $\"{Load(x)} e {{Foo}}\";\n",
            "var c = @\"C:\\Foo\"\"Foo\"\"\" + Store.Name;\n",
            "var d = $@\"{Store.Name} \"\"Foo\"\"\";\n",
            "char e = '\\''; char f = 'F'; Save();\n",
        );
        let v = idents(src, Lex::CSharp);
        let n: Vec<&str> = v.iter().map(|(s, _)| s.as_str()).collect();
        assert!(!n.contains(&"Foo"), "Foo è solo in commenti e stringhe: {n:?}");
        assert_eq!(n.iter().filter(|x| **x == "Load").count(), 2, "{n:?}");
        assert_eq!(n.iter().filter(|x| **x == "Name").count(), 2, "{n:?}");
        assert!(n.contains(&"Save"));
        // le righe contano anche dentro il commento a blocco
        assert_eq!(v.iter().find(|(s, _)| s == "a").unwrap().1, 3);
        assert_eq!(v.iter().find(|(s, _)| s == "Save").unwrap().1, 7);
    }

    #[test]
    fn js_template_literals_and_single_quotes() {
        let src = "const s = 'load(x)'; const t = `hi ${user.name} and ${fmt(`${inner}`)}`;\nimport { a } from './Foo';\n$store.go();";
        let n = names(src, Lex::Js);
        for want in ["s", "t", "user", "name", "fmt", "inner", "import", "a", "from", "$store", "go"] {
            assert!(n.contains(&want.to_string()), "manca {want}: {n:?}");
        }
        assert!(!n.contains(&"load".to_string()) && !n.contains(&"hi".to_string()) && !n.contains(&"Foo".to_string()));
    }

    #[test]
    fn rust_lifetimes_chars_and_raw_strings() {
        let src = "fn parse<'a>(input: &'a str) -> Token<'a> { let c = 'x'; let r = r#\"Token \"q\" \"#; lex(input) }";
        let n = names(src, Lex::CLike);
        assert_eq!(n.iter().filter(|x| *x == "Token").count(), 1, "{n:?}");
        assert_eq!(n.iter().filter(|x| *x == "input").count(), 2, "{n:?}");
        assert!(n.contains(&"lex".to_string()) && n.contains(&"str".to_string()));
    }

    #[test]
    fn python_strings_comments_fstrings() {
        let src = "# load qui no\nx = load(a)  # load\ny = f\"{load(b)} {{load}}\"\nz = '''\nload\n''' + rb'load'\nprint(load)";
        let v = idents(src, Lex::Python);
        let loads: Vec<u32> = v.iter().filter(|(s, _)| s == "load").map(|(_, l)| *l).collect();
        assert_eq!(loads, vec![2, 3, 7], "{v:?}");
        assert!(!v.iter().any(|(s, _)| s == "f" || s == "rb"), "i prefissi non sono identificatori: {v:?}");
    }

    #[test]
    fn go_raw_strings_and_markup_attributes() {
        let n = names("s := `Load ${x}`\nLoad(y)", Lex::Go);
        assert_eq!(n.iter().filter(|x| *x == "Load").count(), 1, "{n:?}");
        let m = names("<!-- OnSave -->\n<Button Click=\"OnSave\" Content=\"{Binding Title}\"/>", Lex::Markup);
        assert_eq!(m.iter().filter(|x| *x == "OnSave").count(), 1, "{m:?}");
        assert!(m.contains(&"Title".to_string()) && m.contains(&"Binding".to_string()));
    }

    #[test]
    fn numbers_are_not_identifiers() {
        let n = names("var x = 0x1F + 1e5 + 3.14f + 10L;", Lex::CLike);
        assert_eq!(n, vec!["var", "x"]);
    }

    #[test]
    fn counts_lines_not_occurrences() {
        let mut counts = HashMap::new();
        count_into("Load(); Load(); // Load\nLoad();", Lex::CLike, &mut counts);
        count_into("x = Load", Lex::Js, &mut counts);
        // riga 1 (due occorrenze) + riga 2 del primo file + il secondo file
        assert_eq!(counts.get("Load"), Some(&3));
    }
}
