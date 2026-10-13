//! Vista Solution dell'Explorer (M70): soluzioni e progetti di Visual Studio letti senza MSBuild.
//!
//! - `sln_find`: le soluzioni (.sln, .slnx) di una repo, fino a tre livelli sotto la radice.
//! - `sln_load`: cartelle di soluzione, progetti e file della soluzione, più le cartelle che «Other files»
//!   non deve ripetere (quelle dei progetti e quelle che contengono solo progetti).
//! - `proj_load`: il contenuto di un progetto come lo mostra il Solution Explorer. Per i progetti SDK è la
//!   cartella del progetto meno le esclusioni (bin, obj, `Remove`) più i file collegati; per quelli vecchio
//!   stile e C++ sono gli item dichiarati, con le cartelle virtuali del `.vcxproj.filters`. In più i
//!   riferimenti (framework, pacchetti, progetti, assembly) per il nodo Dependencies.
//! - `msbuild_path`: l'MSBuild di Visual Studio (via vswhere), per Build/Rebuild/Clean.
//!
//! La valutazione è una versione ridotta di quella di MSBuild: proprietà (con Directory.Build.props e
//! .targets e gli Import locali), condizioni semplici (confronti, Exists, and/or/!), glob, Include, Exclude,
//! Remove, Update e i metadati che contano per la vista (Link, LinkBase, DependentUpon, Visible). Quello
//! che non sa valutare (funzioni di proprietà rare, item transform) lo considera vero: meglio un file in
//! più che uno in meno.

use quick_xml::events::{BytesStart, Event};
use quick_xml::Reader;
use serde::Serialize;
use std::collections::{HashMap, HashSet};
use std::path::{Component, Path, PathBuf};
use std::rc::Rc;
use std::sync::OnceLock;

// ---- XML minimo ---------------------------------------------------------------------------------

#[derive(Debug, Default, Clone)]
struct El {
    name: String,
    attrs: Vec<(String, String)>,
    children: Vec<El>,
    text: String,
}

impl El {
    fn attr(&self, key: &str) -> Option<&str> {
        self.attrs.iter().find(|(k, _)| k.eq_ignore_ascii_case(key)).map(|(_, v)| v.as_str())
    }
    fn is(&self, name: &str) -> bool {
        self.name.eq_ignore_ascii_case(name)
    }
}

/// Albero dell'XML sotto una radice fittizia (i suoi figli sono gli elementi di primo livello).
fn parse_xml(text: &str) -> Result<El, String> {
    let mut reader = Reader::from_str(text);
    let mut stack: Vec<El> = vec![El::default()];
    loop {
        match reader.read_event() {
            Ok(Event::Start(e)) => stack.push(start_el(&e)),
            Ok(Event::Empty(e)) => {
                let el = start_el(&e);
                stack.last_mut().unwrap().children.push(el);
            }
            Ok(Event::End(_)) => {
                if stack.len() > 1 {
                    let el = stack.pop().unwrap();
                    stack.last_mut().unwrap().children.push(el);
                }
            }
            Ok(Event::Text(t)) => {
                if let Ok(s) = t.decode() {
                    stack.last_mut().unwrap().text.push_str(&s);
                }
            }
            Ok(Event::CData(t)) => {
                if let Ok(s) = t.decode() {
                    stack.last_mut().unwrap().text.push_str(&s);
                }
            }
            Ok(Event::GeneralRef(r)) => {
                let top = stack.last_mut().unwrap();
                if let Ok(Some(c)) = r.resolve_char_ref() {
                    top.text.push(c);
                } else if let Ok(name) = r.decode() {
                    if let Some(v) = quick_xml::escape::resolve_predefined_entity(&name) {
                        top.text.push_str(v);
                    }
                }
            }
            Ok(Event::Eof) => break,
            Ok(_) => {}
            Err(e) => return Err(format!("XML: {e}")),
        }
    }
    while stack.len() > 1 {
        let el = stack.pop().unwrap();
        stack.last_mut().unwrap().children.push(el);
    }
    Ok(stack.pop().unwrap())
}

fn start_el(e: &BytesStart) -> El {
    let name = String::from_utf8_lossy(e.local_name().as_ref()).into_owned();
    let mut attrs = Vec::new();
    let mut it = e.attributes();
    it.with_checks(false);
    for a in it.flatten() {
        if a.key.as_ref().starts_with(b"xmlns") {
            continue;
        }
        let key = String::from_utf8_lossy(a.key.local_name().as_ref()).into_owned();
        let val = a
            .decode_and_unescape_value(e.decoder())
            .map(|v| v.into_owned())
            .unwrap_or_else(|_| String::from_utf8_lossy(&a.value).into_owned());
        attrs.push((key, val));
    }
    El { name, attrs, ..Default::default() }
}

/// Testo di un file: UTF-8 (con o senza BOM) o UTF-16 con BOM, come li scrive Visual Studio.
fn read_text(path: &Path) -> Result<String, String> {
    let b = std::fs::read(path).map_err(|e| format!("{}: {e}", path.display()))?;
    Ok(decode_text(&b))
}

fn decode_text(b: &[u8]) -> String {
    if let Some(rest) = b.strip_prefix(&[0xEF, 0xBB, 0xBF]) {
        return String::from_utf8_lossy(rest).into_owned();
    }
    let utf16 = |rest: &[u8], le: bool| {
        let units: Vec<u16> = rest
            .chunks_exact(2)
            .map(|c| if le { u16::from_le_bytes([c[0], c[1]]) } else { u16::from_be_bytes([c[0], c[1]]) })
            .collect();
        String::from_utf16_lossy(&units)
    };
    if let Some(rest) = b.strip_prefix(&[0xFF, 0xFE]) {
        return utf16(rest, true);
    }
    if let Some(rest) = b.strip_prefix(&[0xFE, 0xFF]) {
        return utf16(rest, false);
    }
    String::from_utf8_lossy(b).into_owned()
}

// ---- percorsi ------------------------------------------------------------------------------------

/// `rel` (con `\` o `/`, relativo o assoluto) unito a `base` e normalizzato senza toccare il disco.
fn join_norm(base: &Path, rel: &str) -> PathBuf {
    let rel = rel.trim().replace('\\', "/");
    let p = Path::new(&rel);
    let joined = if p.is_absolute() || p.has_root() { p.to_path_buf() } else { base.join(p) };
    normalize(&joined)
}

fn normalize(p: &Path) -> PathBuf {
    let mut out = PathBuf::new();
    for c in p.components() {
        match c {
            Component::ParentDir => {
                let at_root = matches!(out.components().next_back(), None | Some(Component::RootDir | Component::Prefix(_)));
                if !at_root {
                    out.pop();
                }
            }
            Component::CurDir => {}
            other => out.push(other.as_os_str()),
        }
    }
    out
}

/// Chiave di confronto, come `pathKey` del frontend: `/` come separatore, minuscole su Windows.
fn pkey(p: &Path) -> String {
    let s = p.to_string_lossy().replace('\\', "/");
    let s = s.trim_end_matches('/').to_string();
    if cfg!(windows) {
        s.to_lowercase()
    } else {
        s
    }
}

fn lc(s: &str) -> String {
    if cfg!(windows) {
        s.to_lowercase()
    } else {
        s.to_string()
    }
}

fn s(p: &Path) -> String {
    p.to_string_lossy().into_owned()
}

fn under(key: &str, dir_key: &str) -> bool {
    key.len() > dir_key.len() && key.starts_with(dir_key) && key.as_bytes()[dir_key.len()] == b'/'
}

fn has_wild(spec: &str) -> bool {
    spec.contains('*') || spec.contains('?')
}

/// Elementi di una lista MSBuild (`a;b;c`), senza i vuoti.
fn specs(list: &str) -> impl Iterator<Item = &str> {
    list.split(';').map(str::trim).filter(|x| !x.is_empty())
}

/// Primo `name` in `start` o in una cartella sopra (come cerca MSBuild Directory.Build.props).
fn find_up(start: &Path, name: &str) -> Option<PathBuf> {
    let mut d = Some(start);
    while let Some(dir) = d {
        let p = dir.join(name);
        if p.is_file() {
            return Some(p);
        }
        d = dir.parent();
    }
    None
}

// ---- glob ----------------------------------------------------------------------------------------

/// Un segmento con `*` e `?` (senza separatori).
fn seg_match(p: &str, s: &str) -> bool {
    let p: Vec<char> = p.chars().collect();
    let s: Vec<char> = s.chars().collect();
    let (mut i, mut j) = (0, 0);
    let (mut star, mut mark) = (None::<usize>, 0);
    while j < s.len() {
        if i < p.len() && (p[i] == '?' || p[i] == s[j]) {
            i += 1;
            j += 1;
        } else if i < p.len() && p[i] == '*' {
            star = Some(i);
            mark = j;
            i += 1;
        } else if let Some(st) = star {
            i = st + 1;
            mark += 1;
            j = mark;
        } else {
            return false;
        }
    }
    while i < p.len() && p[i] == '*' {
        i += 1;
    }
    i == p.len()
}

/// Percorso (a segmenti) contro un pattern MSBuild: `**` = zero o più cartelle; in fondo vale `**/*`
/// (almeno il nome del file: `.*/**` sono i file DENTRO le cartelle col punto, non `.gitignore`).
fn glob_match(pat: &[String], path: &[&str]) -> bool {
    match pat.first() {
        None => path.is_empty(),
        Some(first) if first == "**" && pat.len() == 1 => !path.is_empty(),
        Some(first) if first == "**" => (0..=path.len()).any(|i| glob_match(&pat[1..], &path[i..])),
        Some(first) => !path.is_empty() && seg_match(first, path[0]) && glob_match(&pat[1..], &path[1..]),
    }
}

fn key_segs(key: &str) -> Vec<&str> {
    key.split('/').filter(|x| !x.is_empty()).collect()
}

/// Un elemento di Exclude/Remove/Update (o di DefaultItemExcludes): un file preciso o un glob.
struct Matcher {
    key: String,
    wild: bool,
    segs: Vec<String>,
}

impl Matcher {
    fn new(dir: &Path, spec: &str) -> Matcher {
        let key = pkey(&join_norm(dir, spec));
        let wild = has_wild(spec);
        let segs = if wild { key_segs(&key).into_iter().map(String::from).collect() } else { Vec::new() };
        Matcher { key, wild, segs }
    }
    fn matches(&self, key: &str) -> bool {
        if self.wild {
            glob_match(&self.segs, &key_segs(key))
        } else {
            self.key == key
        }
    }
    /// `<cartella>/**` senza altri caratteri jolly: la cartella si può saltare in blocco.
    fn whole_dir(&self) -> Option<String> {
        let head = self.key.strip_suffix("/**")?;
        (!has_wild(head)).then(|| head.to_string())
    }
}

// ---- scansione delle cartelle -----------------------------------------------------------------------

const MAX_FILES: usize = 50_000;

#[derive(Default)]
struct Scan {
    files: Vec<(String, PathBuf)>, // chiave assoluta, percorso
    skipped: Vec<PathBuf>,         // cartelle saltate (bin, obj, nascoste…): per Show All Files
    truncated: bool,
}

/// File sotto `root`, saltando le cartelle per cui `skip(chiave, nome)` è vero.
fn scan_dir(root: &Path, skip: &dyn Fn(&str, &str) -> bool) -> Scan {
    let mut out = Scan::default();
    let mut stack = vec![root.to_path_buf()];
    while let Some(dir) = stack.pop() {
        let Ok(rd) = std::fs::read_dir(&dir) else { continue };
        for e in rd.flatten() {
            let path = e.path();
            let Ok(ft) = e.file_type() else { continue };
            let name = e.file_name().to_string_lossy().into_owned();
            if ft.is_dir() {
                if skip(&pkey(&path), &name) {
                    out.skipped.push(path);
                } else {
                    stack.push(path);
                }
            } else {
                if out.files.len() >= MAX_FILES {
                    out.truncated = true;
                    return out;
                }
                out.files.push((pkey(&path), path));
            }
        }
    }
    out
}

/// Cartelle che la vista non attraversa mai: nascoste, dipendenze JavaScript e output di Visual Studio.
fn noise_dir(name: &str) -> bool {
    name.starts_with('.') || name.eq_ignore_ascii_case("node_modules")
}

// ---- soluzioni ---------------------------------------------------------------------------------------

const FOLDER_TYPE: &str = "2150E333-8FDC-42A3-9474-1A3956D46DE8";

#[derive(Serialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct SlnNode {
    pub id: String,
    pub name: String,
    /// "folder" (cartella di soluzione) o "project"
    pub kind: String,
    /// progetto: il suo file, assoluto
    pub path: Option<String>,
    pub parent: Option<String>,
    pub exists: bool,
    /// cartella: i file della soluzione (Solution Items), assoluti
    pub files: Vec<String>,
}

#[derive(Serialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct SlnModel {
    pub path: String,
    pub name: String,
    pub nodes: Vec<SlnNode>,
    /// chiavi (come `pathKey`) delle cartelle da non ripetere in «Other files»
    pub hidden_dirs: Vec<String>,
    /// un progetto ha come cartella la radice della repo
    pub root_is_project: bool,
}

fn clean_guid(x: &str) -> String {
    x.trim().trim_matches(|c| c == '{' || c == '}').to_uppercase()
}

/// `.sln` testuale: righe `Project("{tipo}") = "Nome", "percorso", "{guid}"`, i file delle cartelle in
/// `ProjectSection(SolutionItems)` e la gerarchia in `GlobalSection(NestedProjects)`.
fn parse_sln(path: &Path, text: &str) -> Vec<SlnNode> {
    let dir = path.parent().unwrap_or(Path::new("."));
    let mut nodes: Vec<SlnNode> = Vec::new();
    let mut nested: HashMap<String, String> = HashMap::new();
    let mut cur: Option<SlnNode> = None;
    let (mut in_items, mut in_nested) = (false, false);
    for raw in text.lines() {
        let line = raw.trim();
        if line.starts_with("Project(") {
            let parts: Vec<&str> = line.split('"').collect();
            if parts.len() >= 8 {
                let folder = clean_guid(parts[1]) == FOLDER_TYPE;
                let (path, exists) = if folder {
                    (None, true)
                } else {
                    let p = join_norm(dir, parts[5]);
                    let e = p.exists();
                    (Some(s(&p)), e)
                };
                cur = Some(SlnNode {
                    id: clean_guid(parts[7]),
                    name: parts[3].to_string(),
                    kind: if folder { "folder" } else { "project" }.into(),
                    path,
                    parent: None,
                    exists,
                    files: Vec::new(),
                });
            }
        } else if line == "EndProject" {
            if let Some(n) = cur.take() {
                nodes.push(n);
            }
            in_items = false;
        } else if line.starts_with("ProjectSection(SolutionItems)") {
            in_items = true;
        } else if line.starts_with("EndProjectSection") {
            in_items = false;
        } else if in_items {
            if let (Some(n), Some((a, _))) = (cur.as_mut(), line.split_once('=')) {
                n.files.push(s(&join_norm(dir, a)));
            }
        } else if line.starts_with("GlobalSection(NestedProjects)") {
            in_nested = true;
        } else if line.starts_with("EndGlobalSection") {
            in_nested = false;
        } else if in_nested {
            if let Some((a, b)) = line.split_once('=') {
                nested.insert(clean_guid(a), clean_guid(b));
            }
        }
    }
    for n in nodes.iter_mut() {
        n.parent = nested.get(&n.id).cloned();
    }
    fix_parents(&mut nodes);
    nodes
}

/// `.slnx` (XML): `<Folder Name="/a/b/">` con dentro `<Project Path>` e `<File Path>`; i progetti fuori
/// dalle cartelle stanno in radice. La gerarchia delle cartelle è nel nome.
fn parse_slnx(path: &Path, text: &str) -> Result<Vec<SlnNode>, String> {
    let dir = path.parent().unwrap_or(Path::new("."));
    let doc = parse_xml(text)?;
    let sol = doc.children.iter().find(|e| e.is("Solution")).ok_or("missing <Solution>")?;
    let mut nodes: Vec<SlnNode> = Vec::new();
    let mut folders: HashMap<String, usize> = HashMap::new();
    fn ensure(name: &str, nodes: &mut Vec<SlnNode>, folders: &mut HashMap<String, usize>) -> Option<String> {
        let segs: Vec<&str> = name.split('/').filter(|x| !x.is_empty()).collect();
        let mut parent: Option<String> = None;
        for i in 0..segs.len() {
            let key = format!("/{}/", segs[..=i].join("/"));
            let id = format!("folder:{}", key.to_lowercase());
            if let std::collections::hash_map::Entry::Vacant(e) = folders.entry(key.to_lowercase()) {
                e.insert(nodes.len());
                nodes.push(SlnNode {
                    id: id.clone(),
                    name: segs[i].to_string(),
                    kind: "folder".into(),
                    path: None,
                    parent: parent.clone(),
                    exists: true,
                    files: Vec::new(),
                });
            }
            parent = Some(id);
        }
        parent
    }
    let project = |el: &El, parent: Option<String>| -> Option<SlnNode> {
        let rel = el.attr("Path")?;
        let p = join_norm(dir, rel);
        let name = el
            .attr("DisplayName")
            .map(str::to_string)
            .unwrap_or_else(|| p.file_stem().map(|x| x.to_string_lossy().into_owned()).unwrap_or_default());
        Some(SlnNode {
            id: format!("proj:{}", pkey(&p)),
            name,
            kind: "project".into(),
            exists: p.exists(),
            path: Some(s(&p)),
            parent,
            files: Vec::new(),
        })
    };
    for el in &sol.children {
        if el.is("Folder") {
            let Some(fid) = ensure(el.attr("Name").unwrap_or(""), &mut nodes, &mut folders) else { continue };
            let idx = nodes.iter().position(|n| n.id == fid).unwrap();
            for c in &el.children {
                if c.is("Project") {
                    if let Some(n) = project(c, Some(fid.clone())) {
                        nodes.push(n);
                    }
                } else if c.is("File") {
                    if let Some(p) = c.attr("Path") {
                        let abs = s(&join_norm(dir, p));
                        nodes[idx].files.push(abs);
                    }
                }
            }
        } else if el.is("Project") {
            if let Some(n) = project(el, None) {
                nodes.push(n);
            }
        }
    }
    fix_parents(&mut nodes);
    Ok(nodes)
}

/// Genitori inesistenti o cicli (file scritti a mano): il nodo va in radice.
fn fix_parents(nodes: &mut [SlnNode]) {
    let parent: HashMap<String, Option<String>> = nodes.iter().map(|n| (n.id.clone(), n.parent.clone())).collect();
    for n in nodes.iter_mut() {
        let mut seen = HashSet::from([n.id.clone()]);
        let mut cur = n.parent.clone();
        while let Some(p) = cur {
            if !parent.contains_key(&p) || !seen.insert(p.clone()) {
                n.parent = None;
                break;
            }
            cur = parent.get(&p).cloned().flatten();
        }
    }
}

/// Cartelle che «Other files» non deve ripetere: quelle dei progetti sotto la radice e quelle che
/// contengono solo cartelle di progetti (es. `src/` con dentro i soli progetti).
fn hidden_dirs(root: &Path, project_dirs: &[PathBuf]) -> (Vec<String>, bool) {
    let rk = pkey(root);
    let mut hidden: HashSet<String> = HashSet::new();
    let mut root_is_project = false;
    let mut cands: HashMap<String, PathBuf> = HashMap::new();
    for d in project_dirs {
        let k = pkey(d);
        if k == rk {
            root_is_project = true;
            continue;
        }
        if !under(&k, &rk) {
            continue;
        }
        hidden.insert(k);
        let mut a = d.parent();
        while let Some(p) = a {
            let pk = pkey(p);
            if !under(&pk, &rk) {
                break;
            }
            cands.insert(pk, p.to_path_buf());
            a = p.parent();
        }
    }
    let mut cands: Vec<PathBuf> = cands.into_values().collect();
    cands.sort_by_key(|p| std::cmp::Reverse(p.components().count()));
    for c in cands {
        let Ok(rd) = std::fs::read_dir(&c) else { continue };
        let mut any = false;
        let mut only = true;
        for e in rd.flatten() {
            any = true;
            let is_dir = e.file_type().map(|t| t.is_dir()).unwrap_or(false);
            if !is_dir || !hidden.contains(&pkey(&e.path())) {
                only = false;
                break;
            }
        }
        if any && only {
            hidden.insert(pkey(&c));
        }
    }
    let mut v: Vec<String> = hidden.into_iter().collect();
    v.sort();
    (v, root_is_project)
}

fn is_sln(name: &str) -> bool {
    let l = name.to_ascii_lowercase();
    l.ends_with(".sln") || l.ends_with(".slnx")
}

fn find_slns(dir: &Path, depth: usize, out: &mut Vec<(usize, String)>) {
    let Ok(rd) = std::fs::read_dir(dir) else { return };
    for e in rd.flatten() {
        let name = e.file_name().to_string_lossy().into_owned();
        let Ok(ft) = e.file_type() else { continue };
        if ft.is_dir() {
            let l = name.to_ascii_lowercase();
            let skip = noise_dir(&name) || matches!(l.as_str(), "bin" | "obj" | "packages" | "target" | "dist" | "out");
            if depth < 3 && !skip {
                find_slns(&e.path(), depth + 1, out);
            }
        } else if is_sln(&name) {
            out.push((depth, s(&e.path())));
        }
    }
}

/// Le soluzioni della repo: prima quelle più in alto, poi in ordine alfabetico.
#[tauri::command(async)]
pub fn sln_find(root: String) -> Vec<String> {
    let mut out = Vec::new();
    find_slns(Path::new(&root), 0, &mut out);
    out.sort_by(|a, b| a.0.cmp(&b.0).then_with(|| a.1.to_lowercase().cmp(&b.1.to_lowercase())));
    out.into_iter().take(40).map(|(_, p)| p).collect()
}

/// Struttura della soluzione `path`; con `root` (la repo aperta) anche le cartelle da non ripetere
/// in «Other files».
#[tauri::command(async)]
pub fn sln_load(path: String, root: Option<String>) -> Result<SlnModel, String> {
    let p = PathBuf::from(&path);
    let text = read_text(&p)?;
    let nodes = if path.to_ascii_lowercase().ends_with(".slnx") {
        parse_slnx(&p, &text)?
    } else {
        parse_sln(&p, &text)
    };
    let project_dirs: Vec<PathBuf> = nodes
        .iter()
        .filter(|n| n.kind == "project" && n.exists)
        .filter_map(|n| n.path.as_ref().and_then(|x| Path::new(x).parent().map(Path::to_path_buf)))
        .collect();
    let (hidden_dirs, root_is_project) = match root {
        Some(r) => hidden_dirs(Path::new(&r), &project_dirs),
        None => (Vec::new(), false),
    };
    Ok(SlnModel {
        name: p.file_stem().map(|x| x.to_string_lossy().into_owned()).unwrap_or_default(),
        path,
        nodes,
        hidden_dirs,
        root_is_project,
    })
}

// ---- progetti: proprietà e condizioni -----------------------------------------------------------------

struct Doc {
    path: PathBuf,
    root: Rc<El>,
}

enum Group {
    /// gli item predefiniti dei progetti SDK (prima di quelli del progetto)
    Defaults,
    /// un ItemGroup: documento e indici dei figli dalla radice
    Items { doc: usize, at: Vec<usize> },
}

#[derive(Clone, Debug)]
struct Item {
    ty: String,
    path: PathBuf,
    key: String,
    rdir: String,
    link: Option<String>,
    link_base: Option<String>,
    dep: Option<String>,
    visible: bool,
}

#[derive(Default, Clone)]
struct Meta {
    link: Option<String>,
    link_base: Option<String>,
    dep: Option<String>,
    visible: Option<bool>,
    version: Option<String>,
}

#[derive(Serialize, Debug, Default, Clone)]
#[serde(rename_all = "camelCase")]
pub struct DepRef {
    pub name: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub detail: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub path: Option<String>,
}

#[derive(Serialize, Debug, Default)]
#[serde(rename_all = "camelCase")]
pub struct Deps {
    pub frameworks: Vec<DepRef>,
    pub packages: Vec<DepRef>,
    pub projects: Vec<DepRef>,
    pub assemblies: Vec<DepRef>,
}

/// Item senza file: riferimenti e impostazioni (alcuni finiscono nelle dipendenze).
const NON_FILE: &[&str] = &[
    "reference",
    "projectreference",
    "packagereference",
    "packageversion",
    "frameworkreference",
    "comreference",
    "comfilereference",
    "nativereference",
    "analyzer",
    "bootstrapperpackage",
    "wcfmetadata",
    "wcfmetadatastorage",
    "service",
    "projectconfiguration",
    "projectcapability",
    "internalsvisibleto",
    "using",
    "supportedplatform",
    "assemblyattribute",
    "dotnetclitoolreference",
    "runtimehostconfigurationoption",
    "packagedownload",
    "globalpackagereference",
    "targetplatform",
    "compilervisibleproperty",
    "compilervisibleitemmetadata",
    "sdksupportedtargetplatformversion",
    "uptodatecheckinput",
    "uptodatecheckoutput",
    "uptodatecheckbuilt",
    "propertypageschema",
    "availableitemname",
    "buildmacro",
    "nugetauditsuppress",
    "trimmerrootassembly",
    "projectcapabilities",
];

/// Tipi di item che il Solution Explorer mostra (le azioni di compilazione che conosce); gli altri
/// (es. un `<AngularSource>` per un target) solo se dichiarati con `AvailableItemName` o, nel C++,
/// presenti nel `.vcxproj.filters`.
const FILE_TYPES: &[&str] = &[
    "compile",
    "none",
    "content",
    "embeddedresource",
    "page",
    "applicationdefinition",
    "resource",
    "additionalfiles",
    "folder",
    "clcompile",
    "clinclude",
    "text",
    "image",
    "resourcecompile",
    "natvis",
    "custombuild",
    "masm",
    "midl",
    "manifest",
    "xml",
    "copyfiletofolders",
    "fxcompile",
    "font",
    "splashscreen",
    "protobuf",
    "typescriptcompile",
    "entitydeploy",
    "xamlappdef",
    "designdata",
    "designdatawithdesigntimecreatabletypes",
    "codeanalysisdictionary",
    "shadow",
    "appxmanifest",
    "priresource",
    "androidresource",
    "androidasset",
    "bundleresource",
    "mauiimage",
    "mauifont",
    "mauiasset",
    "mauisplashscreen",
    "mauiicon",
    "mauixaml",
    "interfacedefinition",
    "imageasset",
    "cudacompile",
];

/// Attributi di un item che non sono metadati.
const ITEM_ATTRS: &[&str] = &[
    "include",
    "exclude",
    "remove",
    "update",
    "condition",
    "keepmetadata",
    "removemetadata",
    "keepduplicates",
    "matchonmetadata",
    "matchonmetadataoptions",
];

/// Import da non seguire: i file di MSBuild, dell'SDK e di Visual Studio.
const SKIP_IMPORT: &[&str] = &[
    "$(msbuildextensionspath",
    "$(vctargetspath",
    "$(msbuildtoolspath",
    "$(msbuildbinpath",
    "$(msbuildsdkspath",
    "$(msbuildframeworktoolspath",
    "$(nugetpackageroot",
    "$(msbuildprojectextensionspath",
];

struct Ev {
    props: HashMap<String, String>,
    globals: HashSet<String>,
    proj: PathBuf,
    dir: PathBuf,
    dir_key: String,
    docs: Vec<Doc>,
    loaded: HashSet<String>,
    groups: Vec<Group>,
    items: Vec<Item>,
    folders: Vec<PathBuf>,
    deps: Deps,
    versions: HashMap<String, String>,
    scan: Option<Scan>,
    outside: HashMap<String, Scan>,
    sdk: bool,
    lang_ext: String,
    /// tipi di item mostrati oltre a FILE_TYPES (AvailableItemName, tipi del .filters)
    available: HashSet<String>,
    /// C++: file → filtro e filtri dichiarati nel .vcxproj.filters
    filters: (HashMap<String, String>, Vec<String>),
}

impl Ev {
    fn new(proj: &Path, sln: Option<&Path>, tf: Option<&str>) -> Ev {
        let dir = proj.parent().unwrap_or(Path::new(".")).to_path_buf();
        let mut ev = Ev {
            props: HashMap::new(),
            globals: HashSet::new(),
            proj: proj.to_path_buf(),
            dir_key: pkey(&dir),
            dir,
            docs: Vec::new(),
            loaded: HashSet::new(),
            groups: Vec::new(),
            items: Vec::new(),
            folders: Vec::new(),
            deps: Deps::default(),
            versions: HashMap::new(),
            scan: None,
            outside: HashMap::new(),
            sdk: false,
            lang_ext: String::new(),
            available: HashSet::new(),
            filters: (HashMap::new(), Vec::new()),
        };
        for (k, v) in std::env::vars() {
            ev.props.insert(k.to_lowercase(), v);
        }
        let sep = std::path::MAIN_SEPARATOR.to_string();
        let dir_s = s(&ev.dir);
        let file = proj.file_name().map(|x| x.to_string_lossy().into_owned()).unwrap_or_default();
        let stem = proj.file_stem().map(|x| x.to_string_lossy().into_owned()).unwrap_or_default();
        let ext = proj.extension().map(|x| format!(".{}", x.to_string_lossy())).unwrap_or_default();
        for (k, v) in [
            ("MSBuildProjectDirectory", dir_s.clone()),
            ("MSBuildProjectFullPath", s(proj)),
            ("MSBuildProjectFile", file.clone()),
            ("MSBuildProjectName", stem.clone()),
            ("MSBuildProjectExtension", ext.clone()),
            ("ProjectDir", format!("{dir_s}{sep}")),
            ("ProjectPath", s(proj)),
            ("ProjectName", stem),
            ("ProjectFileName", file),
            ("ProjectExt", ext),
            ("MSBuildRuntimeType", "Full".into()),
            ("OS", if cfg!(windows) { "Windows_NT" } else { "Unix" }.into()),
            ("DefaultItemExcludes", String::new()),
        ] {
            ev.props.insert(k.to_lowercase(), v);
        }
        let mut global = |k: &str, v: String| {
            ev.props.insert(k.to_lowercase(), v);
            ev.globals.insert(k.to_lowercase());
        };
        global("Configuration", "Debug".into());
        global("BuildingInsideVisualStudio", "true".into());
        if let Some(sln) = sln {
            let sd = sln.parent().map(s).unwrap_or_default();
            global("SolutionDir", format!("{sd}{sep}"));
            global("SolutionPath", s(sln));
            global("SolutionName", sln.file_stem().map(|x| x.to_string_lossy().into_owned()).unwrap_or_default());
            global("SolutionFileName", sln.file_name().map(|x| x.to_string_lossy().into_owned()).unwrap_or_default());
            global("SolutionExt", sln.extension().map(|x| format!(".{}", x.to_string_lossy())).unwrap_or_default());
        }
        if let Some(tf) = tf {
            global("TargetFramework", tf.to_string());
        }
        ev
    }

    fn get(&self, name: &str) -> String {
        self.props.get(&name.to_lowercase()).cloned().unwrap_or_default()
    }

    fn set(&mut self, name: &str, value: String) {
        let k = name.to_lowercase();
        if !self.globals.contains(&k) {
            self.props.insert(k, value);
        }
    }

    fn truthy(&self, name: &str) -> bool {
        self.get(name).trim().eq_ignore_ascii_case("true")
    }

    fn not_false(&self, name: &str) -> bool {
        !self.get(name).trim().eq_ignore_ascii_case("false")
    }

    // ---- espansione delle proprietà ----

    /// `$(Nome)` e un sottoinsieme delle funzioni di proprietà. Il booleano è falso se qualcosa
    /// è rimasto irrisolto.
    fn expand(&self, text: &str, this: &Path) -> (String, bool) {
        let mut out = String::new();
        let mut ok = true;
        let mut i = 0;
        while i < text.len() {
            if text[i..].starts_with("$(") {
                if let Some(end) = close_paren(text, i + 1) {
                    match self.prop_expr(&text[i + 2..end], this) {
                        Some(v) => out.push_str(&v),
                        None => ok = false,
                    }
                    i = end + 1;
                    continue;
                }
                ok = false;
                out.push_str(&text[i..]);
                break;
            }
            let ch = text[i..].chars().next().unwrap();
            out.push(ch);
            i += ch.len_utf8();
        }
        (out, ok)
    }

    fn this_prop(&self, name: &str, this: &Path) -> Option<String> {
        let sep = std::path::MAIN_SEPARATOR;
        let l = name.to_ascii_lowercase();
        Some(match l.as_str() {
            "msbuildthisfiledirectory" => format!("{}{sep}", this.parent().map(s).unwrap_or_default()),
            "msbuildthisfiledirectorynoroot" => {
                let d = this.parent().map(s).unwrap_or_default();
                let d = d.split_once(sep).map(|(_, r)| r.to_string()).unwrap_or(d);
                format!("{d}{sep}")
            }
            "msbuildthisfile" => this.file_name()?.to_string_lossy().into_owned(),
            "msbuildthisfilename" => this.file_stem()?.to_string_lossy().into_owned(),
            "msbuildthisfileextension" => format!(".{}", this.extension()?.to_string_lossy()),
            "msbuildthisfilefullpath" => s(this),
            _ => return None,
        })
    }

    fn prop_expr(&self, inner: &str, this: &Path) -> Option<String> {
        let inner = inner.trim();
        let ident_end = inner
            .char_indices()
            .find(|(_, c)| !(c.is_ascii_alphanumeric() || *c == '_' || *c == '-'))
            .map(|(i, _)| i)
            .unwrap_or(inner.len());
        if ident_end == inner.len() {
            return Some(self.this_prop(inner, this).unwrap_or_else(|| self.get(inner)));
        }
        if let Some(rest) = inner.strip_prefix('[') {
            // funzione statica: [Classe]::Metodo(argomenti)
            let (class, after) = rest.split_once("]::")?;
            let (method, args) = call_parts(after)?;
            let args: Vec<String> = args.iter().map(|a| self.arg(a, this)).collect::<Option<_>>()?;
            return self.static_fn(&class.to_ascii_lowercase(), &method.to_ascii_lowercase(), &args);
        }
        // metodo su una proprietà: Nome.Metodo(argomenti) o Nome.Length
        let name = &inner[..ident_end];
        let after = inner[ident_end..].strip_prefix('.')?;
        let base = self.this_prop(name, this).unwrap_or_else(|| self.get(name));
        if after.eq_ignore_ascii_case("length") {
            return Some(base.chars().count().to_string());
        }
        let (method, args) = call_parts(after)?;
        let args: Vec<String> = args.iter().map(|a| self.arg(a, this)).collect::<Option<_>>()?;
        string_fn(&base, &method.to_ascii_lowercase(), &args)
    }

    /// Argomento di una funzione: stringa tra apici (espansa) o espressione nuda.
    fn arg(&self, a: &str, this: &Path) -> Option<String> {
        let a = a.trim();
        let quoted = ['\'', '"', '`'].iter().find(|q| a.len() >= 2 && a.starts_with(**q) && a.ends_with(**q));
        let body = if quoted.is_some() { &a[1..a.len() - 1] } else { a };
        let (v, ok) = self.expand(body, this);
        ok.then_some(v)
    }

    fn static_fn(&self, class: &str, method: &str, a: &[String]) -> Option<String> {
        let sep = std::path::MAIN_SEPARATOR;
        let first = || a.first().cloned().unwrap_or_default();
        let combine = |parts: &[String]| {
            let mut p = PathBuf::new();
            for x in parts {
                p.push(x.replace('\\', "/"));
            }
            p
        };
        let ensure_slash = |x: String| if x.ends_with('\\') || x.ends_with('/') { x } else { format!("{x}{sep}") };
        Some(match (class, method) {
            ("msbuild", "normalizedirectory") => ensure_slash(s(&normalize(&self.dir.join(combine(a))))),
            ("msbuild", "normalizepath") => s(&normalize(&self.dir.join(combine(a)))),
            ("msbuild", "ensuretrailingslash") => ensure_slash(first()),
            ("msbuild", "valueordefault") => {
                if first().is_empty() {
                    a.get(1).cloned().unwrap_or_default()
                } else {
                    first()
                }
            }
            ("msbuild", "getdirectorynameoffileabove") => {
                let start = join_norm(&self.dir, &first());
                find_up(&start, a.get(1)?).and_then(|p| p.parent().map(s)).unwrap_or_default()
            }
            ("msbuild", "getpathoffileabove") => {
                let start = a.get(1).map(|x| join_norm(&self.dir, x)).unwrap_or_else(|| self.dir.clone());
                find_up(&start, &first()).map(|p| s(&p)).unwrap_or_default()
            }
            ("msbuild", "isosplatform") => {
                let os = first().to_ascii_lowercase();
                let yes = (cfg!(windows) && os == "windows") || (cfg!(target_os = "macos") && os == "osx") || (cfg!(target_os = "linux") && os == "linux");
                if yes { "True" } else { "False" }.into()
            }
            ("system.io.path", "combine") => s(&combine(a)),
            ("system.io.path", "getdirectoryname") => Path::new(&first()).parent().map(s).unwrap_or_default(),
            ("system.io.path", "getfilename") => Path::new(&first()).file_name().map(|x| x.to_string_lossy().into_owned()).unwrap_or_default(),
            ("system.io.path", "getfilenamewithoutextension") => {
                Path::new(&first()).file_stem().map(|x| x.to_string_lossy().into_owned()).unwrap_or_default()
            }
            ("system.io.path", "getfullpath") => s(&join_norm(&self.dir, &first())),
            ("system.string", "isnullorempty") => if first().is_empty() { "True" } else { "False" }.into(),
            ("system.string", "isnullorwhitespace") => if first().trim().is_empty() { "True" } else { "False" }.into(),
            ("system.string", "copy") => first(),
            _ => return None,
        })
    }

    // ---- condizioni ----

    /// Condizione MSBuild; quel che non sa valutare è vero.
    fn cond(&self, c: Option<&str>, this: &Path) -> bool {
        let Some(c) = c else { return true };
        if c.trim().is_empty() {
            return true;
        }
        let toks = self.tokens(c, this);
        let mut p = CondParser { t: &toks, i: 0, ev: self };
        let v = p.or_expr();
        if p.i < toks.len() {
            return true;
        }
        v.unwrap_or(true)
    }

    fn tokens(&self, c: &str, this: &Path) -> Vec<Tok> {
        let mut out = Vec::new();
        let b: Vec<char> = c.chars().collect();
        let mut i = 0;
        while i < b.len() {
            let ch = b[i];
            if ch.is_whitespace() {
                i += 1;
            } else if ch == '\'' || ch == '"' {
                let start = i + 1;
                let mut j = start;
                while j < b.len() && b[j] != ch {
                    j += 1;
                }
                let raw: String = b[start..j.min(b.len())].iter().collect();
                let (v, ok) = self.expand(&raw, this);
                out.push(if ok { Tok::Str(v) } else { Tok::Unknown });
                i = j + 1;
            } else if ch == '$' && b.get(i + 1) == Some(&'(') {
                let rest: String = b[i..].iter().collect();
                match close_paren(&rest, 1) {
                    Some(end) => {
                        let raw = &rest[..=end];
                        let (v, ok) = self.expand(raw, this);
                        out.push(if ok { Tok::Str(v) } else { Tok::Unknown });
                        i += raw.chars().count();
                    }
                    None => {
                        out.push(Tok::Unknown);
                        break;
                    }
                }
            } else if "=!<>".contains(ch) {
                let two: String = b[i..(i + 2).min(b.len())].iter().collect();
                let (op, n) = match two.as_str() {
                    "==" => ("==", 2),
                    "!=" => ("!=", 2),
                    "<=" => ("<=", 2),
                    ">=" => (">=", 2),
                    _ => match ch {
                        '<' => ("<", 1),
                        '>' => (">", 1),
                        '!' => ("!", 1),
                        _ => ("?", 1),
                    },
                };
                out.push(if op == "?" { Tok::Unknown } else { Tok::Op(op) });
                i += n;
            } else if ch == '(' {
                out.push(Tok::Open);
                i += 1;
            } else if ch == ')' {
                out.push(Tok::Close);
                i += 1;
            } else if ch.is_alphanumeric() || ch == '_' || ch == '.' || ch == '-' {
                let start = i;
                while i < b.len() && (b[i].is_alphanumeric() || b[i] == '_' || b[i] == '.' || b[i] == '-') {
                    i += 1;
                }
                let word: String = b[start..i].iter().collect();
                let lw = word.to_ascii_lowercase();
                if lw == "and" {
                    out.push(Tok::And);
                } else if lw == "or" {
                    out.push(Tok::Or);
                } else if b.get(i) == Some(&'(') {
                    // funzione: Exists('...'), HasTrailingSlash('...')
                    let rest: String = b[i..].iter().collect();
                    match close_paren(&rest, 0) {
                        Some(end) => {
                            let arg = &rest[1..end];
                            let v = self.arg(arg, this);
                            out.push(match (lw.as_str(), v) {
                                ("exists", Some(p)) => {
                                    let p = p.trim();
                                    Tok::Bool(!p.is_empty() && join_norm(&self.dir, p).exists())
                                }
                                ("hastrailingslash", Some(p)) => Tok::Bool(p.ends_with('/') || p.ends_with('\\')),
                                _ => Tok::Unknown,
                            });
                            i += rest[..=end].chars().count();
                        }
                        None => {
                            out.push(Tok::Unknown);
                            break;
                        }
                    }
                } else {
                    out.push(Tok::Str(word));
                }
            } else {
                out.push(Tok::Unknown);
                i += 1;
            }
        }
        out
    }

    // ---- documenti e import ----

    fn load_doc(&mut self, path: &Path) -> Option<usize> {
        let k = pkey(path);
        if !self.loaded.insert(k) {
            return None;
        }
        let text = read_text(path).ok()?;
        let root = parse_xml(&text).ok()?;
        self.docs.push(Doc { path: path.to_path_buf(), root: Rc::new(root) });
        Some(self.docs.len() - 1)
    }

    /// Prima passata (proprietà), in ordine di documento, seguendo gli Import locali; gli ItemGroup
    /// si annotano per la seconda.
    fn props_pass(&mut self, doc: usize, at: Vec<usize>, depth: usize) {
        let root = Rc::clone(&self.docs[doc].root);
        let this = self.docs[doc].path.clone();
        let el = el_at(&root, &at);
        for (i, c) in el.children.iter().enumerate() {
            let mut p = at.clone();
            p.push(i);
            if c.is("PropertyGroup") {
                if !self.cond(c.attr("Condition"), &this) {
                    continue;
                }
                for prop in &c.children {
                    if self.cond(prop.attr("Condition"), &this) {
                        let (v, _) = self.expand(prop.text.trim(), &this);
                        self.set(&prop.name, v);
                    }
                }
            } else if c.is("ItemGroup") {
                for a in c.children.iter().filter(|x| x.is("AvailableItemName")) {
                    if let Some(n) = a.attr("Include") {
                        self.available.extend(specs(n).map(str::to_ascii_lowercase));
                    }
                }
                self.groups.push(Group::Items { doc, at: p });
            } else if c.is("Import") {
                self.import(c, &this, depth);
            } else if c.is("ImportGroup") {
                if self.cond(c.attr("Condition"), &this) {
                    for imp in c.children.iter().filter(|x| x.is("Import")) {
                        self.import(imp, &this, depth);
                    }
                }
            } else if c.is("Choose") {
                for (j, w) in c.children.iter().enumerate() {
                    let take = (w.is("When") && self.cond(w.attr("Condition"), &this)) || w.is("Otherwise");
                    if take {
                        let mut wp = p.clone();
                        wp.push(j);
                        self.props_pass(doc, wp, depth);
                        break;
                    }
                }
            } else if c.is("Sdk") {
                self.sdk = true;
            }
        }
    }

    fn import(&mut self, c: &El, this: &Path, depth: usize) {
        if depth > 8 || !self.cond(c.attr("Condition"), this) {
            return;
        }
        if c.attr("Sdk").is_some() {
            self.sdk = true;
            return;
        }
        let Some(raw) = c.attr("Project") else { return };
        let low = raw.to_ascii_lowercase();
        if SKIP_IMPORT.iter().any(|k| low.contains(k)) {
            return;
        }
        let (p, ok) = self.expand(raw, this);
        if !ok || has_wild(&p) || p.trim().is_empty() {
            return;
        }
        let target = join_norm(this.parent().unwrap_or(Path::new(".")), &p);
        if !target.is_file() {
            return;
        }
        if let Some(idx) = self.load_doc(&target) {
            if let Some(pi) = project_index(&self.docs[idx].root) {
                self.props_pass(idx, vec![pi], depth + 1);
            }
        }
    }

    // ---- seconda passata: gli item ----

    fn project_scan(&mut self) -> &Scan {
        if self.scan.is_none() {
            let excl: Vec<Matcher> = specs(&self.default_excludes()).map(|x| Matcher::new(&self.dir, x)).collect();
            let skip_dirs: HashSet<String> = excl.iter().filter_map(Matcher::whole_dir).collect();
            let skip = move |key: &str, name: &str| noise_dir(name) || skip_dirs.contains(key);
            self.scan = Some(scan_dir(&self.dir, &skip));
        }
        self.scan.as_ref().unwrap()
    }

    /// DefaultItemExcludes come lo compone l'SDK, con le aggiunte del progetto.
    fn default_excludes(&self) -> String {
        let out = self.get("BaseOutputPath");
        let obj = self.get("BaseIntermediateOutputPath");
        let out = if out.trim().is_empty() { "bin".to_string() } else { out };
        let obj = if obj.trim().is_empty() { "obj".to_string() } else { obj };
        let mut v = vec![
            format!("{}/**", out.trim_end_matches(['/', '\\'])),
            format!("{}/**", obj.trim_end_matches(['/', '\\'])),
            "**/*.user".into(),
            "**/*.*proj".into(),
            "**/*.sln".into(),
            "**/*.slnx".into(),
            "**/*.vssscc".into(),
        ];
        v.extend(specs(&self.get("DefaultItemExcludes")).map(String::from));
        v.join(";")
    }

    /// File di un Include con caratteri jolly, con la loro RecursiveDir.
    fn glob(&mut self, spec: &str) -> Vec<(PathBuf, String)> {
        let abs = join_norm(&self.dir, spec);
        let comps: Vec<String> = abs.components().map(|c| c.as_os_str().to_string_lossy().into_owned()).collect();
        let Some(k) = comps.iter().position(|c| has_wild(c)) else { return Vec::new() };
        let base: PathBuf = comps[..k].iter().collect();
        let rest: Vec<String> = comps[k..].iter().map(|x| lc(x)).collect();
        let bk = pkey(&base);
        let inside = bk == self.dir_key || under(&bk, &self.dir_key);
        let files: &[(String, PathBuf)] = if inside {
            &self.project_scan().files
        } else {
            if !self.outside.contains_key(&bk) {
                let skip = |_: &str, name: &str| {
                    noise_dir(name) || name.eq_ignore_ascii_case("bin") || name.eq_ignore_ascii_case("obj")
                };
                self.outside.insert(bk.clone(), scan_dir(&base, &skip));
            }
            &self.outside[&bk].files
        };
        let mut out = Vec::new();
        for (key, path) in files {
            if !under(key, &bk) {
                continue;
            }
            let segs = key_segs(&key[bk.len() + 1..]);
            if glob_match(&rest, &segs) {
                let rdir = if segs.len() > 1 { format!("{}\\", segs[..segs.len() - 1].join("\\")) } else { String::new() };
                // RecursiveDir col maiuscolo/minuscolo del disco
                let rdir = original_case(path, &rdir);
                out.push((path.clone(), rdir));
            }
        }
        out
    }

    fn meta_of(&self, c: &El, this: &Path) -> Meta {
        let mut m = Meta::default();
        let mut put = |name: &str, value: String| match name.to_ascii_lowercase().as_str() {
            "link" => m.link = Some(value),
            "linkbase" => m.link_base = Some(value),
            "dependentupon" => m.dep = Some(value),
            "visible" => m.visible = Some(!value.trim().eq_ignore_ascii_case("false")),
            "version" | "versionoverride" => m.version = Some(value),
            _ => {}
        };
        for (k, v) in &c.attrs {
            if !ITEM_ATTRS.contains(&k.to_ascii_lowercase().as_str()) {
                put(k, self.expand(v, this).0);
            }
        }
        for ch in &c.children {
            if self.cond(ch.attr("Condition"), this) {
                put(&ch.name, self.expand(ch.text.trim(), this).0);
            }
        }
        m
    }

    fn item_el(&mut self, c: &El, this: &Path) {
        let ty = c.name.to_ascii_lowercase();
        if matches!(ty.as_str(), "packagereference" | "projectreference" | "reference" | "comreference" | "frameworkreference" | "packageversion") {
            return self.dep_el(c, &ty, this);
        }
        if NON_FILE.contains(&ty.as_str()) || !(FILE_TYPES.contains(&ty.as_str()) || self.available.contains(&ty)) {
            return;
        }
        if let Some(inc) = c.attr("Include") {
            let (list, _) = self.expand(inc, this);
            let excl: Vec<Matcher> = c
                .attr("Exclude")
                .map(|x| self.expand(x, this).0)
                .map(|x| specs(&x).map(|e| Matcher::new(&self.dir, e)).collect())
                .unwrap_or_default();
            let meta = self.meta_of(c, this);
            for spec in specs(&list).map(String::from).collect::<Vec<_>>() {
                if spec.contains("@(") || spec.contains("%(") || spec.contains("://") {
                    continue;
                }
                if ty == "folder" {
                    self.folders.push(join_norm(&self.dir, &spec));
                    continue;
                }
                let found = if has_wild(&spec) { self.glob(&spec) } else { vec![(join_norm(&self.dir, &spec), String::new())] };
                for (path, rdir) in found {
                    let key = pkey(&path);
                    if excl.iter().any(|m| m.matches(&key)) {
                        continue;
                    }
                    self.items.push(Item {
                        ty: ty.clone(),
                        key,
                        path,
                        rdir,
                        link: meta.link.clone(),
                        link_base: meta.link_base.clone(),
                        dep: meta.dep.clone(),
                        visible: meta.visible.unwrap_or(true),
                    });
                }
            }
        } else if let Some(rem) = c.attr("Remove") {
            let (list, _) = self.expand(rem, this);
            let ms: Vec<Matcher> = specs(&list).map(|x| Matcher::new(&self.dir, x)).collect();
            self.items.retain(|it| !(it.ty == ty && ms.iter().any(|m| m.matches(&it.key))));
        } else if let Some(upd) = c.attr("Update") {
            let (list, _) = self.expand(upd, this);
            let ms: Vec<Matcher> = specs(&list).map(|x| Matcher::new(&self.dir, x)).collect();
            let meta = self.meta_of(c, this);
            for it in self.items.iter_mut().filter(|it| it.ty == ty && ms.iter().any(|m| m.matches(&it.key))) {
                if meta.link.is_some() {
                    it.link = meta.link.clone();
                }
                if meta.link_base.is_some() {
                    it.link_base = meta.link_base.clone();
                }
                if meta.dep.is_some() {
                    it.dep = meta.dep.clone();
                }
                if let Some(v) = meta.visible {
                    it.visible = v;
                }
            }
        }
    }

    fn dep_el(&mut self, c: &El, ty: &str, this: &Path) {
        let meta = self.meta_of(c, this);
        let names = |attr: &str| -> Vec<String> {
            c.attr(attr).map(|x| specs(&self.expand(x, this).0).map(String::from).collect()).unwrap_or_default()
        };
        let inc = names("Include");
        let rem = names("Remove");
        let upd = names("Update");
        if ty == "packageversion" {
            for n in inc.iter().chain(upd.iter()) {
                if let Some(v) = &meta.version {
                    self.versions.insert(n.to_lowercase(), v.clone());
                }
            }
            return;
        }
        let dir = self.dir.clone();
        let list = match ty {
            "packagereference" => &mut self.deps.packages,
            "projectreference" => &mut self.deps.projects,
            "frameworkreference" => &mut self.deps.frameworks,
            _ => &mut self.deps.assemblies,
        };
        let name_of = |spec: &str| -> DepRef {
            match ty {
                "projectreference" => {
                    let p = join_norm(&dir, spec);
                    DepRef {
                        name: p.file_stem().map(|x| x.to_string_lossy().into_owned()).unwrap_or_else(|| spec.to_string()),
                        detail: None,
                        path: Some(s(&p)),
                    }
                }
                "reference" | "comreference" => DepRef {
                    name: spec.split(',').next().unwrap_or(spec).trim().to_string(),
                    ..Default::default()
                },
                _ => DepRef { name: spec.to_string(), detail: meta.version.clone(), path: None },
            }
        };
        for spec in &inc {
            if spec.contains("@(") || spec.contains("%(") {
                continue;
            }
            let d = name_of(spec);
            if !list.iter().any(|x| x.name.eq_ignore_ascii_case(&d.name)) {
                list.push(d);
            }
        }
        for spec in &rem {
            let n = name_of(spec).name;
            list.retain(|x| !x.name.eq_ignore_ascii_case(&n));
        }
        if let Some(v) = &meta.version {
            for spec in &upd {
                let n = name_of(spec).name;
                for x in list.iter_mut().filter(|x| x.name.eq_ignore_ascii_case(&n)) {
                    x.detail = Some(v.clone());
                }
            }
        }
    }

    /// Gli item predefiniti dei progetti SDK: Compile, EmbeddedResource, Page/ApplicationDefinition
    /// (WPF) e None dai glob sulla cartella del progetto, meno DefaultItemExcludes.
    fn sdk_defaults(&mut self) {
        if !self.not_false("EnableDefaultItems") {
            return;
        }
        let compile = self.not_false("EnableDefaultCompileItems") && self.lang_ext != ".fs";
        let resx = self.not_false("EnableDefaultEmbeddedResourceItems");
        let none = self.not_false("EnableDefaultNoneItems");
        let wpf = self.truthy("UseWPF") && self.not_false("EnableDefaultPageItems");
        let excl: Vec<Matcher> = specs(&self.default_excludes()).map(|x| Matcher::new(&self.dir, x)).collect();
        let ext = self.lang_ext.clone();
        let dir_key = self.dir_key.clone();
        let files: Vec<(String, PathBuf)> = self.project_scan().files.clone();
        for (key, path) in files {
            if excl.iter().any(|m| m.matches(&key)) {
                continue;
            }
            let name = lc(&path.file_name().map(|x| x.to_string_lossy().into_owned()).unwrap_or_default());
            let ty = if !ext.is_empty() && name.ends_with(&ext) {
                if compile {
                    "compile"
                } else {
                    continue;
                }
            } else if name.ends_with(".resx") {
                if resx {
                    "embeddedresource"
                } else {
                    continue;
                }
            } else if wpf && name.ends_with(".xaml") {
                if name == "app.xaml" && key[..key.len() - name.len()].trim_end_matches('/') == dir_key {
                    "applicationdefinition"
                } else {
                    "page"
                }
            } else if none {
                "none"
            } else {
                continue;
            };
            let rel = &key[dir_key.len() + 1..];
            let segs = key_segs(rel);
            let rdir = if segs.len() > 1 { format!("{}\\", segs[..segs.len() - 1].join("\\")) } else { String::new() };
            self.items.push(Item {
                ty: ty.into(),
                key,
                rdir: original_case(&path, &rdir),
                path,
                link: None,
                link_base: None,
                dep: None,
                visible: true,
            });
        }
    }

    fn items_pass(&mut self) {
        let groups = std::mem::take(&mut self.groups);
        for g in &groups {
            match g {
                Group::Defaults => {
                    if self.sdk {
                        self.sdk_defaults();
                    }
                }
                Group::Items { doc, at } => {
                    let root = Rc::clone(&self.docs[*doc].root);
                    let this = self.docs[*doc].path.clone();
                    let el = el_at(&root, at);
                    if !self.cond(el.attr("Condition"), &this) {
                        continue;
                    }
                    for c in &el.children {
                        if self.cond(c.attr("Condition"), &this) {
                            self.item_el(c, &this);
                        }
                    }
                }
            }
        }
        self.groups = groups;
    }
}

#[derive(Debug, Clone, PartialEq)]
enum Tok {
    Str(String),
    Bool(bool),
    Op(&'static str),
    And,
    Or,
    Open,
    Close,
    Unknown,
}

struct CondParser<'a> {
    t: &'a [Tok],
    i: usize,
    ev: &'a Ev,
}

impl CondParser<'_> {
    fn peek(&self) -> Option<&Tok> {
        self.t.get(self.i)
    }
    fn or_expr(&mut self) -> Option<bool> {
        let mut v = self.and_expr();
        while self.peek() == Some(&Tok::Or) {
            self.i += 1;
            let r = self.and_expr();
            v = match (v, r) {
                (Some(true), _) | (_, Some(true)) => Some(true),
                (Some(false), Some(false)) => Some(false),
                _ => None,
            };
        }
        v
    }
    fn and_expr(&mut self) -> Option<bool> {
        let mut v = self.unary();
        while self.peek() == Some(&Tok::And) {
            self.i += 1;
            let r = self.unary();
            v = match (v, r) {
                (Some(false), _) | (_, Some(false)) => Some(false),
                (Some(true), Some(true)) => Some(true),
                _ => None,
            };
        }
        v
    }
    fn unary(&mut self) -> Option<bool> {
        if self.peek() == Some(&Tok::Op("!")) {
            self.i += 1;
            return self.unary().map(|b| !b);
        }
        self.primary()
    }
    fn primary(&mut self) -> Option<bool> {
        let _ = self.ev;
        match self.peek().cloned() {
            Some(Tok::Open) => {
                self.i += 1;
                let v = self.or_expr();
                if self.peek() == Some(&Tok::Close) {
                    self.i += 1;
                }
                v
            }
            Some(Tok::Bool(b)) => {
                self.i += 1;
                Some(b)
            }
            Some(Tok::Str(a)) => {
                self.i += 1;
                if let Some(Tok::Op(op)) = self.peek().cloned() {
                    if op != "!" {
                        self.i += 1;
                        let b = match self.peek().cloned() {
                            Some(Tok::Str(b)) => {
                                self.i += 1;
                                b
                            }
                            Some(Tok::Bool(b)) => {
                                self.i += 1;
                                b.to_string()
                            }
                            _ => {
                                self.i += 1;
                                return None;
                            }
                        };
                        return compare(&a, op, &b);
                    }
                }
                match a.to_ascii_lowercase().as_str() {
                    "true" | "on" | "yes" => Some(true),
                    "false" | "off" | "no" => Some(false),
                    _ => None,
                }
            }
            Some(Tok::Unknown) => {
                self.i += 1;
                // un confronto con un lato ignoto è ignoto
                if let Some(Tok::Op(op)) = self.peek() {
                    if *op != "!" {
                        self.i += 2;
                    }
                }
                None
            }
            _ => {
                self.i += 1;
                None
            }
        }
    }
}

fn compare(a: &str, op: &str, b: &str) -> Option<bool> {
    match op {
        "==" => Some(a.eq_ignore_ascii_case(b)),
        "!=" => Some(!a.eq_ignore_ascii_case(b)),
        _ => {
            let (x, y) = (version_of(a)?, version_of(b)?);
            Some(match op {
                "<" => x < y,
                ">" => x > y,
                "<=" => x <= y,
                ">=" => x >= y,
                _ => return None,
            })
        }
    }
}

/// Numero o versione (`4.7.2`, `v4.8`) per i confronti d'ordine.
fn version_of(x: &str) -> Option<Vec<u64>> {
    let x = x.trim().trim_start_matches(['v', 'V']);
    if x.is_empty() {
        return None;
    }
    x.split('.').map(|p| p.parse::<u64>().ok()).collect()
}

/// Indice della parentesi che chiude quella aperta in `open` (tiene conto degli apici).
fn close_paren(text: &str, open: usize) -> Option<usize> {
    let b = text.as_bytes();
    let mut depth = 0;
    let mut quote: Option<u8> = None;
    let mut i = open;
    while i < b.len() {
        let c = b[i];
        match quote {
            Some(q) if c == q => quote = None,
            Some(_) => {}
            None => match c {
                b'\'' | b'"' | b'`' => quote = Some(c),
                b'(' => depth += 1,
                b')' => {
                    depth -= 1;
                    if depth == 0 {
                        return Some(i);
                    }
                }
                _ => {}
            },
        }
        i += 1;
    }
    None
}

/// `Metodo(a, b)` → ("Metodo", ["a", "b"]), con le virgole di primo livello.
fn call_parts(x: &str) -> Option<(String, Vec<String>)> {
    let open = x.find('(')?;
    let close = close_paren(x, open)?;
    if !x[close + 1..].trim().is_empty() {
        return None;
    }
    let name = x[..open].trim().to_string();
    let inner = &x[open + 1..close];
    let mut args = Vec::new();
    let (mut depth, mut quote, mut start) = (0, None::<char>, 0);
    for (i, c) in inner.char_indices() {
        match quote {
            Some(q) if c == q => quote = None,
            Some(_) => {}
            None => match c {
                '\'' | '"' | '`' => quote = Some(c),
                '(' => depth += 1,
                ')' => depth -= 1,
                ',' if depth == 0 => {
                    args.push(inner[start..i].to_string());
                    start = i + 1;
                }
                _ => {}
            },
        }
    }
    if !inner.trim().is_empty() {
        args.push(inner[start..].to_string());
    }
    Some((name, args))
}

fn string_fn(base: &str, method: &str, a: &[String]) -> Option<String> {
    let first = a.first().map(String::as_str).unwrap_or("");
    let chars = |x: &str| x.chars().collect::<Vec<char>>();
    let bool_s = |b: bool| if b { "True" } else { "False" }.to_string();
    Some(match method {
        "trim" if a.is_empty() => base.trim().to_string(),
        "trim" => base.trim_matches(|c| chars(first).contains(&c)).to_string(),
        "trimend" if a.is_empty() => base.trim_end().to_string(),
        "trimend" => base.trim_end_matches(|c| chars(first).contains(&c)).to_string(),
        "trimstart" if a.is_empty() => base.trim_start().to_string(),
        "trimstart" => base.trim_start_matches(|c| chars(first).contains(&c)).to_string(),
        "replace" => base.replace(first, a.get(1).map(String::as_str).unwrap_or("")),
        "tolower" | "tolowerinvariant" => base.to_lowercase(),
        "toupper" | "toupperinvariant" => base.to_uppercase(),
        "contains" => bool_s(base.contains(first)),
        "startswith" => bool_s(base.starts_with(first)),
        "endswith" => bool_s(base.ends_with(first)),
        "substring" => {
            let start: usize = first.trim().parse().ok()?;
            let cs: Vec<char> = base.chars().collect();
            let len = match a.get(1) {
                Some(l) => l.trim().parse().ok()?,
                None => cs.len().saturating_sub(start),
            };
            cs.iter().skip(start).take(len).collect()
        }
        _ => return None,
    })
}

fn el_at<'a>(root: &'a El, at: &[usize]) -> &'a El {
    let mut el = root;
    for &i in at {
        el = &el.children[i];
    }
    el
}

fn project_index(root: &El) -> Option<usize> {
    root.children.iter().position(|e| e.is("Project"))
}

/// La RecursiveDir trovata in minuscolo (chiave) con le maiuscole vere, prese dal percorso.
fn original_case(path: &Path, rdir: &str) -> String {
    if rdir.is_empty() {
        return String::new();
    }
    let n = key_segs(&rdir.replace('\\', "/")).len();
    let comps: Vec<String> = path
        .parent()
        .map(|p| p.components().map(|c| c.as_os_str().to_string_lossy().into_owned()).collect())
        .unwrap_or_default();
    if comps.len() < n {
        return rdir.to_string();
    }
    format!("{}\\", comps[comps.len() - n..].join("\\"))
}

/// Sostituisce i metadati noti (`%(RecursiveDir)`, `%(Filename)`, `%(Extension)`) in un Link.
fn expand_meta(text: &str, it: &Item) -> String {
    let stem = it.path.file_stem().map(|x| x.to_string_lossy().into_owned()).unwrap_or_default();
    let ext = it.path.extension().map(|x| format!(".{}", x.to_string_lossy())).unwrap_or_default();
    let mut out = String::new();
    let mut rest = text;
    while let Some(i) = rest.find("%(") {
        out.push_str(&rest[..i]);
        let Some(end) = rest[i..].find(')') else {
            out.push_str(&rest[i..]);
            return out;
        };
        let name = rest[i + 2..i + end].to_ascii_lowercase();
        out.push_str(match name.as_str() {
            "recursivedir" => &it.rdir,
            "filename" => &stem,
            "extension" => &ext,
            _ => "",
        });
        rest = &rest[i + end + 1..];
    }
    out.push_str(rest);
    out
}

/// Percorso nella vista: `/` come separatore, senza `./` e `/` iniziali né `..`.
fn view_path(x: &str) -> String {
    x.replace('\\', "/").split('/').filter(|p| !p.is_empty() && *p != "." && *p != "..").collect::<Vec<_>>().join("/")
}

// ---- progetti: il risultato ------------------------------------------------------------------------

#[derive(Serialize, Debug, Clone, Default)]
#[serde(rename_all = "camelCase")]
pub struct ProjItem {
    /// percorso nella vista, relativo al progetto, con `/`
    pub v: String,
    /// file o cartella su disco (assoluto); assente per le cartelle virtuali
    #[serde(skip_serializing_if = "Option::is_none")]
    pub p: Option<String>,
    #[serde(skip_serializing_if = "is_false")]
    pub dir: bool,
    /// fuori dalla cartella del progetto (o con un Link)
    #[serde(skip_serializing_if = "is_false")]
    pub link: bool,
    #[serde(skip_serializing_if = "is_false")]
    pub missing: bool,
    /// Show All Files: su disco ma non nel progetto
    #[serde(skip_serializing_if = "is_false")]
    pub excluded: bool,
    /// cartella esclusa (bin, obj…) da leggere quando la si apre
    #[serde(skip_serializing_if = "is_false")]
    pub lazy: bool,
    /// DependentUpon: il file sotto cui va annidato (nome)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub dep: Option<String>,
}

fn is_false(b: &bool) -> bool {
    !*b
}

#[derive(Serialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct ProjModel {
    pub path: String,
    pub dir: String,
    /// "sdk", "legacy" (item dichiarati) o "cpp"
    pub style: String,
    /// "cs", "vb", "fs", "cpp" o "other"
    pub lang: String,
    pub output_type: String,
    pub tfms: Vec<String>,
    pub items: Vec<ProjItem>,
    pub deps: Deps,
    pub truncated: bool,
}

fn evaluate(proj: &Path, sln: Option<&Path>, tf: Option<&str>) -> Result<Ev, String> {
    let mut ev = Ev::new(proj, sln, tf);
    let ext = proj.extension().map(|x| x.to_string_lossy().to_ascii_lowercase()).unwrap_or_default();
    ev.lang_ext = match ext.as_str() {
        "csproj" => ".cs",
        "vbproj" => ".vb",
        "fsproj" => ".fs",
        _ => "",
    }
    .into();
    // Directory.Build.props, poi (gestione centrale dei pacchetti) Directory.Packages.props e quello che
    // ha scritto il restore di NuGet (i contentFiles dei pacchetti, che Visual Studio mostra collegati)
    for name in ["Directory.Build.props", "Directory.Packages.props"] {
        if let Some(p) = find_up(&ev.dir, name) {
            ev.props_file(&p);
        }
    }
    ev.props_file(&ev.nuget_file("props"));
    let main = ev.load_doc(proj).ok_or_else(|| format!("Can't read {}", proj.display()))?;
    let pi = project_index(&ev.docs[main].root).ok_or("Not an MSBuild project")?;
    if ev.docs[main].root.children[pi].attr("Sdk").is_some() {
        ev.sdk = true;
    }
    ev.groups.push(Group::Defaults);
    ev.props_pass(main, vec![pi], 1);
    // le impostazioni personali (`<progetto>.user`, fuori da git) e i target del restore
    ev.props_file(&PathBuf::from(format!("{}.user", proj.display())));
    ev.props_file(&ev.nuget_file("targets"));
    if let Some(p) = find_up(&ev.dir, "Directory.Build.targets") {
        ev.props_file(&p);
    }
    if ext == "vcxproj" {
        ev.sdk = false;
        let (map, declared, types) = read_filters(proj);
        ev.filters = (map, declared);
        ev.available.extend(types);
    }
    Ok(ev)
}

impl Ev {
    /// Un file di proprietà/item importato per intero (se esiste e non è già stato letto).
    fn props_file(&mut self, p: &Path) {
        if !p.is_file() {
            return;
        }
        if let Some(idx) = self.load_doc(p) {
            if let Some(pi) = project_index(&self.docs[idx].root) {
                self.props_pass(idx, vec![pi], 1);
            }
        }
    }

    /// `obj/<progetto>.nuget.g.props|targets` (o dove dice MSBuildProjectExtensionsPath).
    fn nuget_file(&self, kind: &str) -> PathBuf {
        let mut base = self.get("MSBuildProjectExtensionsPath");
        if base.trim().is_empty() {
            base = self.get("BaseIntermediateOutputPath");
        }
        if base.trim().is_empty() {
            base = "obj".into();
        }
        let file = self.proj.file_name().map(|x| x.to_string_lossy().into_owned()).unwrap_or_default();
        join_norm(&self.dir, &base).join(format!("{file}.nuget.g.{kind}"))
    }
}

/// Contenuto del progetto `path` per la vista Solution (con `show_all`, anche quello che il progetto
/// esclude). `sln` è la soluzione da cui lo si apre (per `$(SolutionDir)`).
#[tauri::command(async)]
pub fn proj_load(path: String, show_all: bool, sln: Option<String>) -> Result<ProjModel, String> {
    let proj = PathBuf::from(&path);
    let sln_p = sln.as_ref().map(PathBuf::from);
    let mut ev = evaluate(&proj, sln_p.as_deref(), None)?;
    // più framework e nessuno scelto: si valuta per il primo, come fa Visual Studio
    let tfms: Vec<String> = specs(&ev.get("TargetFrameworks")).map(String::from).collect();
    if ev.get("TargetFramework").trim().is_empty() && !tfms.is_empty() {
        ev = evaluate(&proj, sln_p.as_deref(), Some(&tfms[0]))?;
    }
    ev.items_pass();
    Ok(build_model(ev, show_all, tfms))
}

fn build_model(mut ev: Ev, show_all: bool, tfms_multi: Vec<String>) -> ProjModel {
    let ext = ev.proj.extension().map(|x| x.to_string_lossy().to_ascii_lowercase()).unwrap_or_default();
    let cpp = ext == "vcxproj";
    let style = if cpp {
        "cpp"
    } else if ev.sdk {
        "sdk"
    } else {
        "legacy"
    };
    let lang = match ext.as_str() {
        "csproj" => "cs",
        "vbproj" => "vb",
        "fsproj" => "fs",
        "vcxproj" => "cpp",
        _ => "other",
    };
    let dir_key = ev.dir_key.clone();
    let filters = if cpp && !show_all { std::mem::take(&mut ev.filters) } else { (HashMap::new(), Vec::new()) };

    let mut out: Vec<ProjItem> = Vec::new();
    let mut seen: HashSet<String> = HashSet::new();
    let mut included: HashSet<String> = HashSet::new();
    let items = std::mem::take(&mut ev.items);
    for it in items.iter().filter(|it| it.visible) {
        let inside = under(&it.key, &dir_key);
        let rel_inside = || view_path(&it.key[dir_key.len() + 1..]);
        let name = it.path.file_name().map(|x| x.to_string_lossy().into_owned()).unwrap_or_default();
        let v = if cpp && !show_all {
            match filters.0.get(&it.key) {
                Some(f) if !f.is_empty() => format!("{}/{}", view_path(f), name),
                _ => name.clone(),
            }
        } else if let Some(link) = it.link.as_deref().filter(|l| !l.trim().is_empty()) {
            view_path(&expand_meta(link, it))
        } else if inside {
            let rel = rel_inside();
            // il caso del disco, non quello della chiave
            let comps: Vec<String> = it.path.components().map(|c| c.as_os_str().to_string_lossy().into_owned()).collect();
            let n = rel.split('/').count();
            if comps.len() >= n {
                comps[comps.len() - n..].join("/")
            } else {
                rel
            }
        } else {
            let base = it.link_base.as_deref().map(view_path).unwrap_or_default();
            let tail = view_path(&format!("{}{}", it.rdir, name));
            if base.is_empty() {
                tail
            } else {
                format!("{base}/{tail}")
            }
        };
        if v.is_empty() || !seen.insert(v.to_lowercase()) {
            continue;
        }
        included.insert(it.key.clone());
        let link = !inside || it.link.as_deref().is_some_and(|l| view_path(&expand_meta(l, it)).to_lowercase() != rel_inside().to_lowercase());
        out.push(ProjItem {
            v,
            p: Some(s(&it.path)),
            link: link && !cpp,
            missing: !it.path.exists(),
            dep: it.dep.as_deref().map(|d| d.replace('\\', "/").rsplit('/').next().unwrap_or(d).to_string()),
            ..Default::default()
        });
    }
    // cartelle dichiarate (vuote) e filtri del C++
    for f in std::mem::take(&mut ev.folders) {
        let k = pkey(&f);
        if under(&k, &dir_key) {
            let v = view_path(&k[dir_key.len() + 1..]);
            let v = original_case_rel(&f, &v);
            if !v.is_empty() && seen.insert(v.to_lowercase()) {
                out.push(ProjItem { v, p: Some(s(&f)), dir: true, ..Default::default() });
            }
        }
    }
    for f in &filters.1 {
        let v = view_path(f);
        if !v.is_empty() && seen.insert(v.to_lowercase()) {
            out.push(ProjItem { v, dir: true, ..Default::default() });
        }
    }
    // Show All Files: il resto della cartella, in grigio; bin, obj e le cartelle nascoste da aprire a richiesta
    let mut truncated = false;
    if show_all {
        let cpp_noise = |name: &str| {
            let l = name.to_ascii_lowercase();
            matches!(l.as_str(), "x64" | "x86" | "win32" | "arm64" | "debug" | "release" | "ipch" | "bin" | "obj")
        };
        let scan = if cpp {
            let skip = |_: &str, name: &str| noise_dir(name) || cpp_noise(name);
            scan_dir(&ev.dir, &skip)
        } else {
            std::mem::take(ev.project_scan_mut())
        };
        truncated = scan.truncated;
        for (key, path) in &scan.files {
            if included.contains(key) || !under(key, &dir_key) {
                continue;
            }
            let name = lc(&path.file_name().map(|x| x.to_string_lossy().into_owned()).unwrap_or_default());
            if name.ends_with("proj") || name.ends_with(".filters") || name.ends_with(".user") {
                continue;
            }
            let v = original_case_rel(path, &view_path(&key[dir_key.len() + 1..]));
            if seen.insert(v.to_lowercase()) {
                out.push(ProjItem { v, p: Some(s(path)), excluded: true, ..Default::default() });
            }
        }
        for d in &scan.skipped {
            let k = pkey(d);
            if !under(&k, &dir_key) {
                continue;
            }
            let v = original_case_rel(d, &view_path(&k[dir_key.len() + 1..]));
            if seen.insert(v.to_lowercase()) {
                out.push(ProjItem { v, p: Some(s(d)), dir: true, excluded: true, lazy: true, ..Default::default() });
            }
        }
    }
    // cartelle reali che contengono gli item (per crea/rinomina e le decorazioni git)
    let mut dirs: Vec<ProjItem> = Vec::new();
    for it in &out {
        let parts: Vec<&str> = it.v.split('/').collect();
        for i in 1..parts.len() {
            let v = parts[..i].join("/");
            if seen.insert(v.to_lowercase()) {
                let real = ev.dir.join(&v);
                let p = (!cpp || show_all) && real.is_dir();
                dirs.push(ProjItem {
                    p: p.then(|| s(&real)),
                    v,
                    dir: true,
                    excluded: it.excluded,
                    ..Default::default()
                });
            }
        }
    }
    // una cartella con dentro anche file del progetto non è grigia
    for d in dirs.iter_mut().filter(|d| d.excluded) {
        let prefix = format!("{}/", d.v.to_lowercase());
        if out.iter().any(|x| !x.excluded && x.v.to_lowercase().starts_with(&prefix)) {
            d.excluded = false;
        }
    }
    out.extend(dirs);

    // dipendenze
    let mut deps = std::mem::take(&mut ev.deps);
    if ev.truthy("ManagePackageVersionsCentrally") {
        for p in deps.packages.iter_mut().filter(|p| p.detail.is_none()) {
            p.detail = ev.versions.get(&p.name.to_lowercase()).cloned();
        }
    }
    let tf = ev.get("TargetFramework");
    let tfms: Vec<String> = if !tfms_multi.is_empty() {
        tfms_multi
    } else if !tf.trim().is_empty() {
        vec![tf.trim().to_string()]
    } else {
        Vec::new()
    };
    if style == "sdk" {
        let mut implicit: Vec<&str> = Vec::new();
        for t in &tfms {
            let t = t.to_ascii_lowercase();
            if t.starts_with("netstandard") {
                implicit.push("NETStandard.Library");
            } else if t.starts_with("netcoreapp") || (t.starts_with("net") && t[3..].contains('.')) {
                // net5.0 e successivi hanno il punto; net48, net472… sono il .NET Framework
                implicit.push("Microsoft.NETCore.App");
            }
        }
        if ev.truthy("UseWPF") {
            implicit.push("Microsoft.WindowsDesktop.App.WPF");
        }
        if ev.truthy("UseWindowsForms") {
            implicit.push("Microsoft.WindowsDesktop.App.WindowsForms");
        }
        let main_root = Rc::clone(ev.docs.iter().find(|d| pkey(&d.path) == pkey(&ev.proj)).map(|d| &d.root).unwrap());
        let sdk_attr = project_index(&main_root).and_then(|i| main_root.children[i].attr("Sdk").map(str::to_string)).unwrap_or_default();
        if sdk_attr.to_ascii_lowercase().contains("microsoft.net.sdk.web") {
            implicit.push("Microsoft.AspNetCore.App");
        }
        let mut fw: Vec<DepRef> = Vec::new();
        for n in implicit.into_iter().map(String::from).chain(deps.frameworks.iter().map(|d| d.name.clone())) {
            if !fw.iter().any(|x| x.name.eq_ignore_ascii_case(&n)) {
                fw.push(DepRef { name: n, ..Default::default() });
            }
        }
        deps.frameworks = fw;
    }
    let output_type = {
        let o = ev.get("OutputType");
        if o.trim().is_empty() {
            if cpp {
                ev.get("ConfigurationType")
            } else {
                "Library".into()
            }
        } else {
            o.trim().to_string()
        }
    };
    if out.len() > MAX_FILES {
        out.truncate(MAX_FILES);
        truncated = true;
    }
    ProjModel {
        path: s(&ev.proj),
        dir: s(&ev.dir),
        style: style.into(),
        lang: lang.into(),
        output_type,
        tfms,
        items: out,
        deps,
        truncated,
    }
}

impl Ev {
    fn project_scan_mut(&mut self) -> &mut Scan {
        self.project_scan();
        self.scan.as_mut().unwrap()
    }
}

/// Il percorso relativo `rel` (minuscolo, dalla chiave) con le maiuscole vere di `path`.
fn original_case_rel(path: &Path, rel: &str) -> String {
    let n = rel.split('/').filter(|x| !x.is_empty()).count();
    let comps: Vec<String> = path.components().map(|c| c.as_os_str().to_string_lossy().into_owned()).collect();
    if n == 0 || comps.len() < n {
        return rel.to_string();
    }
    comps[comps.len() - n..].join("/")
}

/// `.vcxproj.filters`: per ogni file il filtro (cartella virtuale), i filtri dichiarati e i tipi di
/// item che compaiono (quelli che Visual Studio mostra nel progetto).
fn read_filters(proj: &Path) -> (HashMap<String, String>, Vec<String>, HashSet<String>) {
    let mut map = HashMap::new();
    let mut declared = Vec::new();
    let mut types = HashSet::new();
    let path = PathBuf::from(format!("{}.filters", proj.display()));
    let Ok(text) = read_text(&path) else { return (map, declared, types) };
    let Ok(doc) = parse_xml(&text) else { return (map, declared, types) };
    let dir = proj.parent().unwrap_or(Path::new("."));
    let Some(root) = doc.children.iter().find(|e| e.is("Project")) else { return (map, declared, types) };
    for g in root.children.iter().filter(|e| e.is("ItemGroup")) {
        for it in &g.children {
            let Some(inc) = it.attr("Include") else { continue };
            if it.is("Filter") {
                declared.push(inc.to_string());
                continue;
            }
            types.insert(it.name.to_ascii_lowercase());
            if let Some(f) = it.children.iter().find(|c| c.is("Filter")) {
                map.insert(pkey(&join_norm(dir, inc)), f.text.trim().to_string());
            }
        }
    }
    (map, declared, types)
}

// ---- MSBuild di Visual Studio -----------------------------------------------------------------------

/// MSBuild.exe dell'ultima installazione di Visual Studio (via vswhere), se c'è. Compila anche i
/// progetti C++, che `dotnet build` non sa compilare.
#[tauri::command(async)]
pub fn msbuild_path() -> Option<String> {
    static CACHE: OnceLock<Option<String>> = OnceLock::new();
    CACHE.get_or_init(find_msbuild).clone()
}

#[cfg(windows)]
fn find_msbuild() -> Option<String> {
    use std::os::windows::process::CommandExt;
    let pf = std::env::var("ProgramFiles(x86)").unwrap_or_else(|_| r"C:\Program Files (x86)".into());
    let vswhere = Path::new(&pf).join(r"Microsoft Visual Studio\Installer\vswhere.exe");
    if !vswhere.is_file() {
        return None;
    }
    for pat in [r"MSBuild\**\Bin\amd64\MSBuild.exe", r"MSBuild\**\Bin\MSBuild.exe"] {
        let out = std::process::Command::new(&vswhere)
            .args(["-latest", "-prerelease", "-products", "*", "-requires", "Microsoft.Component.MSBuild", "-find", pat])
            .creation_flags(0x0800_0000) // CREATE_NO_WINDOW: nessuna console che lampeggia
            .output()
            .ok()?;
        let text = String::from_utf8_lossy(&out.stdout);
        if let Some(line) = text.lines().map(str::trim).find(|l| !l.is_empty() && Path::new(l).is_file()) {
            return Some(line.to_string());
        }
    }
    None
}

#[cfg(not(windows))]
fn find_msbuild() -> Option<String> {
    None
}

// ---- test ------------------------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use std::sync::atomic::{AtomicU32, Ordering};

    static COUNTER: AtomicU32 = AtomicU32::new(0);

    fn temp_root(tag: &str) -> PathBuf {
        let n = COUNTER.fetch_add(1, Ordering::SeqCst);
        let dir = std::env::temp_dir().join(format!("orbit_sln_{}_{}_{}", std::process::id(), tag, n));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        dir
    }

    fn put(root: &Path, rel: &str, text: &str) -> PathBuf {
        let p = root.join(rel);
        fs::create_dir_all(p.parent().unwrap()).unwrap();
        fs::write(&p, text).unwrap();
        p
    }

    fn views(m: &ProjModel) -> Vec<String> {
        let mut v: Vec<String> = m.items.iter().filter(|i| !i.dir && !i.excluded).map(|i| i.v.clone()).collect();
        v.sort();
        v
    }

    fn item<'a>(m: &'a ProjModel, v: &str) -> &'a ProjItem {
        m.items.iter().find(|i| i.v == v).unwrap_or_else(|| panic!("manca {v}: {:?}", views(m)))
    }

    const SLN: &str = r#"
Microsoft Visual Studio Solution File, Format Version 12.00
Project("{2150E333-8FDC-42A3-9474-1A3956D46DE8}") = "Apps", "Apps", "{11111111-0000-0000-0000-000000000001}"
EndProject
Project("{2150E333-8FDC-42A3-9474-1A3956D46DE8}") = "Solution Items", "Solution Items", "{11111111-0000-0000-0000-000000000002}"
	ProjectSection(SolutionItems) = preProject
		Directory.Build.props = Directory.Build.props
	EndProjectSection
EndProject
Project("{9A19103F-16F7-4668-BE54-9A1E7A4F7556}") = "Demo.App", "src\Demo.App\Demo.App.csproj", "{22222222-0000-0000-0000-000000000001}"
EndProject
Project("{9A19103F-16F7-4668-BE54-9A1E7A4F7556}") = "Demo.Core", "src\Demo.Core\Demo.Core.csproj", "{22222222-0000-0000-0000-000000000002}"
EndProject
Project("{8BC9CEB8-8B4A-11D0-8D11-00A0C91BC942}") = "Native", "Native\Native.vcxproj", "{22222222-0000-0000-0000-000000000003}"
EndProject
Project("{9A19103F-16F7-4668-BE54-9A1E7A4F7556}") = "Gone", "Gone\Gone.csproj", "{22222222-0000-0000-0000-000000000004}"
EndProject
Global
	GlobalSection(NestedProjects) = preSolution
		{22222222-0000-0000-0000-000000000001} = {11111111-0000-0000-0000-000000000001}
		{22222222-0000-0000-0000-000000000004} = {99999999-0000-0000-0000-000000000009}
	EndGlobalSection
EndGlobal
"#;

    #[test]
    fn sln_cartelle_progetti_e_file_della_soluzione() {
        let root = temp_root("sln");
        let sln = put(&root, "Demo.sln", SLN);
        put(&root, "src/Demo.App/Demo.App.csproj", "<Project Sdk=\"Microsoft.NET.Sdk\" />");
        put(&root, "src/Demo.Core/Demo.Core.csproj", "<Project Sdk=\"Microsoft.NET.Sdk\" />");
        put(&root, "Native/Native.vcxproj", "<Project />");
        put(&root, "tools/run.ps1", "");
        let m = sln_load(s(&sln), Some(s(&root))).unwrap();
        assert_eq!(m.name, "Demo");
        let app = m.nodes.iter().find(|n| n.name == "Demo.App").unwrap();
        assert_eq!(app.parent.as_deref(), Some("11111111-0000-0000-0000-000000000001"));
        assert!(app.exists);
        let items = m.nodes.iter().find(|n| n.name == "Solution Items").unwrap();
        assert_eq!(items.kind, "folder");
        assert!(items.files[0].ends_with("Directory.Build.props"));
        // genitore inesistente → radice; progetto mancante segnalato
        let gone = m.nodes.iter().find(|n| n.name == "Gone").unwrap();
        assert_eq!(gone.parent, None);
        assert!(!gone.exists);
        // «Other files»: via le cartelle dei progetti e src/ (contiene solo progetti); tools/ resta
        let k = |rel: &str| pkey(&root.join(rel));
        assert!(m.hidden_dirs.contains(&k("src/Demo.App")));
        assert!(m.hidden_dirs.contains(&k("src")));
        assert!(m.hidden_dirs.contains(&k("Native")));
        assert!(!m.hidden_dirs.contains(&k("tools")));
        assert!(!m.root_is_project);
        fs::remove_dir_all(&root).ok();
    }

    #[test]
    fn slnx_cartelle_dal_nome() {
        let root = temp_root("slnx");
        let sln = put(
            &root,
            "Demo.slnx",
            r#"<Solution>
  <Folder Name="/src/" />
  <Folder Name="/src/apps/">
    <Project Path="src/Demo.App/Demo.App.csproj" />
  </Folder>
  <Folder Name="/Solution Items/">
    <File Path="README.md" />
  </Folder>
  <Project Path="Demo.Core/Demo.Core.csproj" DisplayName="Core" />
</Solution>"#,
        );
        let m = sln_load(s(&sln), None).unwrap();
        let apps = m.nodes.iter().find(|n| n.name == "apps").unwrap();
        assert_eq!(apps.parent.as_deref(), Some("folder:/src/"));
        let app = m.nodes.iter().find(|n| n.name == "Demo.App").unwrap();
        assert_eq!(app.parent.as_deref(), Some(apps.id.as_str()));
        assert!(m.nodes.iter().any(|n| n.name == "Core" && n.parent.is_none()));
        let si = m.nodes.iter().find(|n| n.name == "Solution Items").unwrap();
        assert!(si.files[0].ends_with("README.md"));
        fs::remove_dir_all(&root).ok();
    }

    #[test]
    fn sln_find_cerca_in_profondita_ma_salta_bin_e_nascoste() {
        let root = temp_root("find");
        put(&root, "A.sln", "");
        put(&root, "sub/B.slnx", "");
        put(&root, "bin/C.sln", "");
        put(&root, ".git/D.sln", "");
        put(&root, "a/b/c/d/E.sln", "");
        let found: Vec<String> = sln_find(s(&root)).iter().map(|p| Path::new(p).file_name().unwrap().to_string_lossy().into_owned()).collect();
        assert_eq!(found, vec!["A.sln", "B.slnx"]);
        fs::remove_dir_all(&root).ok();
    }

    #[test]
    fn progetto_sdk_cartella_meno_esclusioni_piu_collegati() {
        let root = temp_root("sdk");
        put(&root, "Directory.Build.props", "<Project><PropertyGroup><SharedDir>$(MSBuildThisFileDirectory)shared</SharedDir></PropertyGroup></Project>");
        put(&root, "shared/Common.cs", "");
        put(&root, "shared/util/Text.cs", "");
        put(&root, "native/lib.dll", "");
        let proj = put(
            &root,
            "app/Demo.App.csproj",
            r#"<Project Sdk="Microsoft.NET.Sdk">
  <PropertyGroup>
    <OutputType>WinExe</OutputType>
    <TargetFramework>net8.0-windows</TargetFramework>
    <UseWPF>true</UseWPF>
    <NativeDir>$(ProjectDir)..\native</NativeDir>
    <DefaultItemExcludes>$(DefaultItemExcludes);ClientApp\**</DefaultItemExcludes>
  </PropertyGroup>
  <ItemGroup>
    <Compile Remove="Old\**" />
    <None Remove="appsettings.json" />
    <Content Include="appsettings.json" />
    <Compile Include="$(SharedDir)\**\*.cs" LinkBase="Shared" />
    <None Include="$(NativeDir)\lib.dll" Link="lib.dll" Condition="Exists('$(NativeDir)\lib.dll')" />
    <None Include="$(NativeDir)\missing.dll" Condition="Exists('$(NativeDir)\missing.dll')" />
    <Compile Update="Properties\Resources.Designer.cs" DependentUpon="Resources.resx" />
    <None Update="hidden.txt" Visible="false" />
    <Folder Include="Empty\" />
    <AngularSource Include="ClientApp\angular.json" />
    <AvailableItemName Include="Manual" />
    <Manual Include="manual.md" />
  </ItemGroup>
  <ItemGroup>
    <PackageReference Include="Serilog" Version="4.0.0" />
    <PackageReference Include="Polly"><Version>8.4.1</Version></PackageReference>
    <ProjectReference Include="..\core\Demo.Core.csproj" />
  </ItemGroup>
</Project>"#,
        );
        put(&root, "app/App.xaml", "");
        put(&root, "app/App.xaml.cs", "");
        put(&root, "app/Views/Main.xaml", "");
        put(&root, "app/Properties/Resources.resx", "");
        put(&root, "app/Properties/Resources.Designer.cs", "");
        put(&root, "app/Old/Legacy.cs", "");
        put(&root, "app/Old/notes.md", "");
        put(&root, "app/appsettings.json", "");
        put(&root, "app/hidden.txt", "");
        put(&root, "app/bin/Debug/Demo.App.dll", "");
        put(&root, "app/obj/project.assets.json", "");
        put(&root, "app/ClientApp/angular.json", "");
        put(&root, "app/manual.md", "");
        put(&root, "pkgs/tool/1.0.0/contentFiles/any/tool.config", "");
        put(
            &root,
            "app/obj/Demo.App.csproj.nuget.g.props",
            &format!(
                r#"<Project><PropertyGroup><NuGetPackageRoot>{}\</NuGetPackageRoot></PropertyGroup>
<ItemGroup><None Include="$(NuGetPackageRoot)tool\1.0.0\contentFiles\any\tool.config"><Link>tool.config</Link></None></ItemGroup></Project>"#,
                s(&root.join("pkgs"))
            ),
        );
        put(&root, "app/.vs/state.bin", "");
        let m = proj_load(s(&proj), false, None).unwrap();
        assert_eq!(m.style, "sdk");
        assert_eq!(m.output_type, "WinExe");
        assert_eq!(m.tfms, vec!["net8.0-windows"]);
        assert_eq!(
            views(&m),
            vec![
                "App.xaml",
                "App.xaml.cs",
                "Old/notes.md",
                "Properties/Resources.Designer.cs",
                "Properties/Resources.resx",
                "Shared/Common.cs",
                "Shared/util/Text.cs",
                "Views/Main.xaml",
                "appsettings.json",
                "lib.dll",
                "manual.md",
                "tool.config",
            ]
        );
        assert!(item(&m, "Shared/Common.cs").link);
        assert!(item(&m, "lib.dll").link);
        assert!(!item(&m, "App.xaml").link);
        assert_eq!(item(&m, "Properties/Resources.Designer.cs").dep.as_deref(), Some("Resources.resx"));
        let empty = item(&m, "Empty");
        assert!(empty.dir && empty.p.is_some());
        // la cartella virtuale dei collegati non ha un percorso su disco, quella vera sì
        assert!(item(&m, "Shared").p.is_none());
        assert!(item(&m, "Views").p.is_some());
        // dipendenze
        let fw: Vec<&str> = m.deps.frameworks.iter().map(|d| d.name.as_str()).collect();
        assert_eq!(fw, vec!["Microsoft.NETCore.App", "Microsoft.WindowsDesktop.App.WPF"]);
        assert_eq!(m.deps.packages[0].detail.as_deref(), Some("4.0.0"));
        assert_eq!(m.deps.packages[1].detail.as_deref(), Some("8.4.1"));
        assert_eq!(m.deps.projects[0].name, "Demo.Core");
        // Show All Files: bin/obj/.vs da aprire a richiesta, file esclusi in grigio
        let all = proj_load(s(&proj), true, None).unwrap();
        assert!(all.items.iter().any(|i| i.v == "bin" && i.lazy && i.excluded));
        assert!(all.items.iter().any(|i| i.v == ".vs" && i.lazy));
        assert!(all.items.iter().any(|i| i.v == "Old/Legacy.cs" && i.excluded));
        assert!(all.items.iter().any(|i| i.v == "hidden.txt" && i.excluded));
        assert!(!all.items.iter().any(|i| i.v == "Demo.App.csproj"));
        fs::remove_dir_all(&root).ok();
    }

    #[test]
    fn progetto_vecchio_stile_solo_item_dichiarati() {
        let root = temp_root("legacy");
        let proj = put(
            &root,
            "Old.App/Old.App.csproj",
            r#"<?xml version="1.0" encoding="utf-8"?>
<Project ToolsVersion="15.0" xmlns="http://schemas.microsoft.com/developer/msbuild/2003">
  <Import Project="$(MSBuildExtensionsPath)\$(MSBuildToolsVersion)\Microsoft.Common.props" />
  <PropertyGroup>
    <Configuration Condition=" '$(Configuration)' == '' ">Release</Configuration>
    <OutputType>Exe</OutputType>
  </PropertyGroup>
  <PropertyGroup Condition=" '$(Configuration)|$(Platform)' == 'Debug|AnyCPU' ">
    <DebugOnly>yes</DebugOnly>
  </PropertyGroup>
  <ItemGroup>
    <Reference Include="System.Xml, Version=4.0.0.0" />
    <Compile Include="Program.cs" />
    <Compile Include="Forms\*.cs" />
    <None Include="App.config" />
    <Compile Include="Debug.cs" Condition=" '$(Configuration)' == 'Debug' " />
    <Compile Include="Release.cs" Condition=" '$(Configuration)' == 'Release' " />
  </ItemGroup>
  <Import Project="$(MSBuildToolsPath)\Microsoft.CSharp.targets" />
</Project>"#,
        );
        put(&root, "Old.App/Program.cs", "");
        put(&root, "Old.App/Forms/Main.cs", "");
        put(&root, "Old.App/Forms/Main.Designer.cs", "");
        put(&root, "Old.App/App.config", "");
        put(&root, "Old.App/NotInProject.cs", "");
        put(&root, "Old.App/Debug.cs", "");
        let m = proj_load(s(&proj), false, None).unwrap();
        assert_eq!(m.style, "legacy");
        // Configuration è Debug come in Visual Studio (globale, non la sovrascrive il progetto)
        assert_eq!(views(&m), vec!["App.config", "Debug.cs", "Forms/Main.Designer.cs", "Forms/Main.cs", "Program.cs"]);
        assert_eq!(m.deps.assemblies[0].name, "System.Xml");
        fs::remove_dir_all(&root).ok();
    }

    #[test]
    fn progetto_cpp_con_filtri() {
        let root = temp_root("cpp");
        let proj = put(
            &root,
            "Native/Native.vcxproj",
            r#"<Project DefaultTargets="Build" xmlns="http://schemas.microsoft.com/developer/msbuild/2003">
  <Import Project="$(VCTargetsPath)\Microsoft.Cpp.Default.props" />
  <ItemGroup>
    <ClCompile Include="src\main.cpp" />
    <ClCompile Include="..\shared\util.cpp" />
    <ClInclude Include="include\main.h" />
    <None Include="readme.txt" />
  </ItemGroup>
</Project>"#,
        );
        put(
            &root,
            "Native/Native.vcxproj.filters",
            r#"<Project ToolsVersion="4.0" xmlns="http://schemas.microsoft.com/developer/msbuild/2003">
  <ItemGroup>
    <Filter Include="Source Files"><UniqueIdentifier>{1}</UniqueIdentifier></Filter>
    <Filter Include="Header Files"><UniqueIdentifier>{2}</UniqueIdentifier></Filter>
    <Filter Include="Resource Files"><UniqueIdentifier>{3}</UniqueIdentifier></Filter>
  </ItemGroup>
  <ItemGroup>
    <ClCompile Include="src\main.cpp"><Filter>Source Files</Filter></ClCompile>
    <ClCompile Include="..\shared\util.cpp"><Filter>Source Files</Filter></ClCompile>
    <ClInclude Include="include\main.h"><Filter>Header Files</Filter></ClInclude>
  </ItemGroup>
</Project>"#,
        );
        put(&root, "Native/src/main.cpp", "");
        put(&root, "Native/include/main.h", "");
        put(&root, "Native/readme.txt", "");
        put(&root, "shared/util.cpp", "");
        put(&root, "Native/x64/Debug/main.obj", "");
        let m = proj_load(s(&proj), false, None).unwrap();
        assert_eq!(m.style, "cpp");
        assert_eq!(views(&m), vec!["Header Files/main.h", "Source Files/main.cpp", "Source Files/util.cpp", "readme.txt"]);
        let rf = item(&m, "Resource Files");
        assert!(rf.dir && rf.p.is_none(), "filtro vuoto dichiarato, virtuale");
        // Show All Files: la struttura su disco, x64 da aprire a richiesta
        let all = proj_load(s(&proj), true, None).unwrap();
        assert!(all.items.iter().any(|i| i.v == "src/main.cpp" && !i.excluded));
        assert!(all.items.iter().any(|i| i.v == "x64" && i.lazy));
        fs::remove_dir_all(&root).ok();
    }

    #[test]
    fn piu_framework_si_valuta_il_primo() {
        let root = temp_root("tfms");
        let proj = put(
            &root,
            "Lib/Lib.csproj",
            r#"<Project Sdk="Microsoft.NET.Sdk">
  <PropertyGroup><TargetFrameworks>net8.0;net48</TargetFrameworks></PropertyGroup>
  <ItemGroup Condition="'$(TargetFramework)' == 'net48'"><Compile Remove="Modern.cs" /></ItemGroup>
  <ItemGroup Condition="'$(TargetFramework)' == 'net8.0'"><Compile Remove="Classic.cs" /></ItemGroup>
</Project>"#,
        );
        put(&root, "Lib/Modern.cs", "");
        put(&root, "Lib/Classic.cs", "");
        let m = proj_load(s(&proj), false, None).unwrap();
        assert_eq!(m.tfms, vec!["net8.0", "net48"]);
        assert_eq!(views(&m), vec!["Modern.cs"]);
        fs::remove_dir_all(&root).ok();
    }

    #[test]
    fn gestione_centrale_dei_pacchetti_e_import_locali() {
        let root = temp_root("cpm");
        put(
            &root,
            "Directory.Packages.props",
            r#"<Project><PropertyGroup><ManagePackageVersionsCentrally>true</ManagePackageVersionsCentrally></PropertyGroup>
<ItemGroup><PackageVersion Include="Dapper" Version="2.1.35" /></ItemGroup></Project>"#,
        );
        put(&root, "build/common.props", r#"<Project><ItemGroup><None Include="$(MSBuildThisFileDirectory)logo.png" Link="Assets\logo.png" /></ItemGroup></Project>"#);
        put(&root, "build/logo.png", "");
        let proj = put(
            &root,
            "Data/Data.csproj",
            r#"<Project Sdk="Microsoft.NET.Sdk">
  <Import Project="..\build\common.props" />
  <ItemGroup><PackageReference Include="Dapper" /></ItemGroup>
</Project>"#,
        );
        let m = proj_load(s(&proj), false, None).unwrap();
        assert_eq!(m.deps.packages[0].detail.as_deref(), Some("2.1.35"));
        let logo = item(&m, "Assets/logo.png");
        assert!(logo.link && logo.p.as_deref().unwrap().ends_with("logo.png"));
        fs::remove_dir_all(&root).ok();
    }

    #[test]
    fn condizioni() {
        let root = temp_root("cond");
        let proj = put(&root, "P/P.csproj", "<Project />");
        let mut ev = Ev::new(&proj, None, None);
        ev.set("Platform", "x64".into());
        ev.set("Flag", "true".into());
        let c = |ev: &Ev, x: &str| ev.cond(Some(x), &proj);
        assert!(c(&ev, "'$(Configuration)' == 'Debug'"));
        assert!(c(&ev, "'$(Configuration)|$(Platform)' == 'debug|X64'"));
        assert!(!c(&ev, "'$(Configuration)' != 'Debug'"));
        assert!(c(&ev, "'$(Platform)' == '' OR '$(Platform)' == 'x64'"));
        assert!(!c(&ev, "'$(Flag)' == 'true' and !('$(Platform)' == 'x64')"));
        assert!(c(&ev, "$(Flag)"));
        assert!(c(&ev, "Exists('$(MSBuildProjectFullPath)')"));
        assert!(!c(&ev, "Exists('nope\\missing.txt')"));
        assert!(c(&ev, "'$(TargetFrameworkVersion)' == '' and '4.8' >= '4.7.2'"));
        // ciò che non sa valutare è vero
        assert!(c(&ev, "$([System.Text.RegularExpressions.Regex]::IsMatch('a', 'b'))"));
        assert!(c(&ev, "'$(Flag.Contains(`ru`))' == 'True'"));
        assert!(c(&ev, "$([MSBuild]::IsOSPlatform('Windows')) or true"));
        fs::remove_dir_all(&root).ok();
    }

    #[test]
    fn funzioni_di_proprieta() {
        let root = temp_root("fn");
        put(&root, "marker.txt", "");
        let proj = put(&root, "a/b/P.csproj", "<Project />");
        let ev = Ev::new(&proj, None, None);
        let x = |t: &str| ev.expand(t, &proj).0;
        assert_eq!(x("$([MSBuild]::GetDirectoryNameOfFileAbove($(MSBuildThisFileDirectory), marker.txt))"), s(&root));
        assert_eq!(x("$(MSBuildProjectName.Replace('P', 'Q'))"), "Q");
        assert_eq!(x("$(MSBuildProjectName.ToLower())"), "p");
        assert!(x("$([System.IO.Path]::Combine('x', 'y.txt'))").ends_with("y.txt"));
        let (_, ok) = ev.expand("$([System.Guid]::NewGuid())", &proj);
        assert!(!ok, "funzione non supportata: irrisolta");
        fs::remove_dir_all(&root).ok();
    }

    #[test]
    fn glob_e_segmenti() {
        let p = |x: &str| key_segs(x).into_iter().map(String::from).collect::<Vec<_>>();
        assert!(glob_match(&p("**/*.cs"), &key_segs("a/b/c.cs")));
        assert!(glob_match(&p("**/*.cs"), &key_segs("c.cs")));
        assert!(!glob_match(&p("*.cs"), &key_segs("a/c.cs")));
        assert!(glob_match(&p("src/**/x?.txt"), &key_segs("src/x1.txt")));
        assert!(glob_match(&p("**/.*/**"), &key_segs("a/.vs/b/c")));
        assert!(!glob_match(&p("**/.*/**"), &key_segs("a/.gitignore")));
        assert!(seg_match("*.*proj", "demo.csproj"));
        assert!(seg_match("[v8]*", "[v8]x"), "le parentesi quadre sono caratteri normali");
    }

    #[test]
    fn utf16_e_bom() {
        assert_eq!(decode_text(&[0xEF, 0xBB, 0xBF, b'a']), "a");
        assert_eq!(decode_text(&[0xFF, 0xFE, b'h', 0, b'i', 0]), "hi");
    }
}
