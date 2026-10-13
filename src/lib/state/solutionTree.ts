// Vista Solution dell'Explorer (M70): dai dati del backend (solution.rs) all'albero da mostrare, come il
// Solution Explorer di Visual Studio. Cartelle di soluzione, progetti, il nodo Dependencies, le cartelle e
// i file del progetto con quelli annidati (App.xaml.cs sotto App.xaml…), e i comandi di build e avvio.
// Logica pura, testata in solutionTree.test.ts.
import { basename, dirname, pathKey } from "../util";

// ---- dati del backend -------------------------------------------------------------------------------

export interface SlnNodeDto {
  id: string;
  name: string;
  kind: "folder" | "project";
  path: string | null;
  parent: string | null;
  exists: boolean;
  files: string[];
}

export interface SlnModelDto {
  path: string;
  name: string;
  nodes: SlnNodeDto[];
  /** chiavi (pathKey) delle cartelle che «Other files» non ripete */
  hiddenDirs: string[];
  rootIsProject: boolean;
}

export interface ProjItemDto {
  v: string;
  p?: string;
  dir?: boolean;
  link?: boolean;
  missing?: boolean;
  excluded?: boolean;
  lazy?: boolean;
  dep?: string;
}

export interface DepRef {
  name: string;
  detail?: string;
  path?: string;
}

export interface ProjModelDto {
  path: string;
  dir: string;
  style: "sdk" | "legacy" | "cpp";
  lang: string;
  outputType: string;
  tfms: string[];
  items: ProjItemDto[];
  deps: { frameworks: DepRef[]; packages: DepRef[]; projects: DepRef[]; assemblies: DepRef[] };
  truncated: boolean;
}

// ---- albero della vista -------------------------------------------------------------------------------

export type SKind = "solution" | "folder" | "project" | "dir" | "file" | "deps" | "group" | "dep" | "other";
export type DepGroup = "frameworks" | "packages" | "projects" | "assemblies";

export interface SNode {
  id: string;
  kind: SKind;
  name: string;
  /** file o cartella su disco; per un progetto il suo file (.csproj…), per la soluzione il .sln */
  path: string | null;
  /** cartella reale (progetto, cartelle su disco): ci si creano file e se ne leggono le decorazioni git */
  dir: string | null;
  children: SNode[];
  /** testo tenue dopo il nome (versione di un pacchetto, «3 projects»…) */
  detail?: string;
  link?: boolean;
  missing?: boolean;
  /** Show All Files: su disco ma non nel progetto */
  excluded?: boolean;
  /** cartella esclusa da leggere quando la si apre; `loaded` dopo la lettura */
  lazy?: boolean;
  loaded?: boolean;
  /** progetto: cs, vb, fs, cpp, other */
  lang?: string;
  /** dipendenza da un progetto: il suo file */
  target?: string;
  group?: DepGroup;
  /** DependentUpon: il file sotto cui annidarlo */
  dep?: string;
}

const byName = (a: SNode, b: SNode) => {
  const x = a.name.toLowerCase();
  const y = b.name.toLowerCase();
  return x < y ? -1 : x > y ? 1 : 0;
};

const RANK: Partial<Record<SKind, number>> = { folder: 0, project: 1, file: 2 };

/** Ordine del primo livello della soluzione e delle cartelle di soluzione: cartelle, progetti, file. */
function sortSolution(list: SNode[]): SNode[] {
  return list.sort((a, b) => (RANK[a.kind] ?? 3) - (RANK[b.kind] ?? 3) || byName(a, b));
}

/** Linguaggio del progetto dall'estensione del file. */
export function projectLang(path: string): string {
  const ext = path.slice(path.lastIndexOf(".") + 1).toLowerCase();
  return ext === "csproj" ? "cs" : ext === "vbproj" ? "vb" : ext === "fsproj" ? "fs" : ext === "vcxproj" ? "cpp" : "other";
}

/** Albero della soluzione: il nodo radice con cartelle di soluzione e progetti (ancora vuoti). */
export function buildSolution(m: SlnModelDto): SNode {
  const kids = new Map<string | null, SlnNodeDto[]>();
  for (const n of m.nodes) {
    const k = n.parent ?? null;
    if (!kids.has(k)) kids.set(k, []);
    kids.get(k)!.push(n);
  }
  const make = (n: SlnNodeDto, seen: Set<string>): SNode => {
    if (n.kind === "project") {
      const path = n.path ?? "";
      return {
        id: `p:${pathKey(path)}`,
        kind: "project",
        name: n.name,
        path,
        dir: dirname(path),
        children: [],
        lang: projectLang(path),
        missing: !n.exists || undefined,
      };
    }
    const children = (kids.get(n.id) ?? []).filter((c) => !seen.has(c.id)).map((c) => make(c, new Set(seen).add(c.id)));
    for (const f of n.files) {
      children.push({ id: `si:${n.id}|${pathKey(f)}`, kind: "file", name: basename(f), path: f, dir: null, children: [] });
    }
    return { id: `f:${n.id}`, kind: "folder", name: n.name, path: null, dir: null, children: sortSolution(children) };
  };
  const projects = m.nodes.filter((n) => n.kind === "project").length;
  return {
    id: "sln",
    kind: "solution",
    name: m.name,
    path: m.path,
    dir: dirname(m.path),
    children: sortSolution((kids.get(null) ?? []).map((n) => make(n, new Set([n.id])))),
    detail: projects === 1 ? "1 project" : `${projects} projects`,
  };
}

// ---- contenuto di un progetto --------------------------------------------------------------------------

/** Regole di annidamento di Visual Studio: nome del file → possibili «genitori» nella stessa cartella. */
const NEST: [RegExp, (m: RegExpMatchArray) => string[]][] = [
  [/^(.+)\.(xaml|axaml)\.(cs|vb|fs)$/i, (m) => [`${m[1]}.${m[2]}`]],
  [/^(.+)\.designer\.(cs|vb)$/i, (m) => [`${m[1]}.${m[2]}`, `${m[1]}.resx`, `${m[1]}.settings`]],
  [/^(.+)\.resx$/i, (m) => [`${m[1]}.cs`, `${m[1]}.vb`]],
  [/^(.+)\.(razor|cshtml)\.(cs|css|js|scss)$/i, (m) => [`${m[1]}.${m[2]}`]],
  [/^appsettings\.(.+)\.json$/i, () => ["appsettings.json"]],
];

/** Il file sotto cui Visual Studio annida `name` (tra i nomi `siblings`, in minuscolo), se c'è. */
export function nestParent(name: string, siblings: Set<string>): string | null {
  for (const [re, cands] of NEST) {
    const m = name.match(re);
    if (!m) continue;
    for (const c of cands(m)) if (siblings.has(c.toLowerCase()) && c.toLowerCase() !== name.toLowerCase()) return c;
  }
  return null;
}

/** Cartelle prima dei file; tra le cartelle di un progetto .NET, Properties (e My Project) in cima. */
function sortProject(list: SNode[]): SNode[] {
  const special = (n: SNode) => (n.kind === "dir" && /^(properties|my project)$/i.test(n.name) ? 0 : 1);
  const rank = (n: SNode) => (n.kind === "deps" ? 0 : n.kind === "dir" ? 1 : 2);
  return list.sort((a, b) => rank(a) - rank(b) || special(a) - special(b) || byName(a, b));
}

/** Annida i file di una cartella (DependentUpon, poi le regole) e ordina, ricorsivamente. */
function arrange(list: SNode[]): SNode[] {
  for (const n of list) if (n.kind === "dir") n.children = arrange(n.children);
  const files = list.filter((n) => n.kind === "file");
  const named = new Map(files.map((f) => [f.name.toLowerCase(), f]));
  const names = new Set(named.keys());
  const parentOf = new Map<SNode, SNode>();
  for (const f of files) {
    const want = f.dep ?? nestParent(f.name, names);
    const parent = want ? named.get(want.toLowerCase()) : undefined;
    if (!parent || parent === f) continue;
    // niente cicli: il genitore non deve stare (anche indirettamente) sotto f
    let a: SNode | undefined = parent;
    while (a && a !== f) a = parentOf.get(a);
    if (a === f) continue;
    parentOf.set(f, parent);
  }
  for (const [child, parent] of parentOf) parent.children.push(child);
  for (const f of files) if (f.children.length) f.children.sort(byName);
  return sortProject(list.filter((n) => !parentOf.has(n)));
}

function depsNode(p: ProjModelDto, projId: string): SNode | null {
  const id = `${projId}|#deps`;
  const dep = (g: DepGroup, r: DepRef): SNode => ({
    id: `${id}|${g}|${r.name.toLowerCase()}`,
    kind: "dep",
    name: r.name,
    path: r.path ?? null,
    dir: null,
    children: [],
    detail: r.detail,
    target: g === "projects" ? r.path : undefined,
    group: g,
  });
  const d = p.deps;
  if (p.style === "sdk") {
    const groups: [DepGroup, string, DepRef[]][] = [
      ["frameworks", "Frameworks", d.frameworks],
      ["packages", "Packages", d.packages],
      ["projects", "Projects", d.projects],
      ["assemblies", "Assemblies", d.assemblies],
    ];
    const children = groups
      .filter(([, , list]) => list.length > 0)
      .map(([g, label, list]): SNode => ({
        id: `${id}|${g}`,
        kind: "group",
        name: label,
        path: null,
        dir: null,
        group: g,
        children: list.map((r) => dep(g, r)).sort(byName),
      }));
    return children.length ? { id, kind: "deps", name: "Dependencies", path: null, dir: null, children } : null;
  }
  // progetti vecchio stile e C++: un nodo References con tutto dentro, come in Visual Studio
  const all = [
    ...d.assemblies.map((r) => dep("assemblies", r)),
    ...d.projects.map((r) => dep("projects", r)),
    ...d.packages.map((r) => dep("packages", r)),
    ...d.frameworks.map((r) => dep("frameworks", r)),
  ].sort(byName);
  return all.length ? { id, kind: "deps", name: "References", path: null, dir: null, children: all } : null;
}

/** Figli del nodo di un progetto: Dependencies, poi cartelle e file come li mostra Visual Studio. */
export function buildProject(p: ProjModelDto, projId: string): SNode[] {
  const dirs = new Map<string, SNode>();
  const top: SNode[] = [];
  const listFor = (v: string): SNode[] => {
    if (!v) return top;
    const k = v.toLowerCase();
    let d = dirs.get(k);
    if (!d) {
      const i = v.lastIndexOf("/");
      const parent = listFor(i < 0 ? "" : v.slice(0, i));
      d = { id: `${projId}|${k}`, kind: "dir", name: v.slice(i + 1), path: null, dir: null, children: [] };
      dirs.set(k, d);
      parent.push(d);
    }
    return d.children;
  };
  for (const it of p.items) {
    if (!it.dir) continue;
    listFor(it.v);
    const d = dirs.get(it.v.toLowerCase())!;
    d.path = it.p ?? null;
    d.dir = it.p ?? null;
    if (it.excluded) d.excluded = true;
    if (it.lazy) d.lazy = true;
  }
  for (const it of p.items) {
    if (it.dir) continue;
    const i = it.v.lastIndexOf("/");
    listFor(i < 0 ? "" : it.v.slice(0, i)).push({
      id: `${projId}|${it.v.toLowerCase()}`,
      kind: "file",
      name: it.v.slice(i + 1),
      path: it.p ?? null,
      dir: null,
      children: [],
      link: it.link || undefined,
      missing: it.missing || undefined,
      excluded: it.excluded || undefined,
      dep: it.dep,
    });
  }
  const out = arrange(top);
  const deps = depsNode(p, projId);
  return deps ? [deps, ...out] : out;
}

/** Contenuto di una cartella esclusa (bin, obj…) letta a richiesta: tutto in grigio. */
export function lazyChildren(entries: { name: string; path: string; isDir: boolean }[], parentId: string): SNode[] {
  return entries.map((e) => ({
    id: `${parentId}/${e.name.toLowerCase()}`,
    kind: e.isDir ? "dir" : "file",
    name: e.name,
    path: e.path,
    dir: e.isDir ? e.path : null,
    children: [],
    excluded: true,
    lazy: e.isDir || undefined,
  }));
}

/** Il nodo ha figli da mostrare (o da caricare aprendolo)? */
export function expandable(n: SNode): boolean {
  switch (n.kind) {
    case "solution":
    case "other":
      return true;
    case "project":
      return !n.missing;
    case "dir":
      return !!n.lazy || n.children.length > 0;
    default:
      return n.children.length > 0;
  }
}

// ---- comandi -------------------------------------------------------------------------------------------

export type BuildVerb = "build" | "rebuild" | "clean";
export const VERB_LABEL: Record<BuildVerb, string> = { build: "Build", rebuild: "Rebuild", clean: "Clean" };

/** Comando di build per una soluzione o un progetto: con l'MSBuild di Visual Studio (che compila anche il
 *  C++) se c'è, in PowerShell perché il percorso ha spazi; altrimenti `dotnet`, nella shell predefinita. */
export function buildCommand(verb: BuildVerb, target: string, msbuild: string | null): { command: string; shell: string | null } {
  if (msbuild) {
    const restore = verb === "clean" ? "" : " -restore";
    return {
      shell: "powershell.exe",
      command: `& "${msbuild}" "${target}" -t:${VERB_LABEL[verb]}${restore} -m -nologo -v:minimal -p:Configuration=Debug`,
    };
  }
  const cmd = verb === "clean" ? "clean" : "build";
  const extra = verb === "rebuild" ? " --no-incremental" : "";
  return { shell: null, command: `dotnet ${cmd} "${target}" -c Debug${extra}` };
}

/** Il progetto si avvia con `dotnet run`? Progetti SDK .NET eseguibili. */
export function canRun(p: Pick<ProjModelDto, "style" | "lang" | "outputType">): boolean {
  return p.style === "sdk" && ["cs", "vb", "fs"].includes(p.lang) && /^(exe|winexe)$/i.test(p.outputType.trim());
}

/** `dotnet run` del progetto (con più framework, il primo, come Visual Studio). */
export function runCommandFor(p: Pick<ProjModelDto, "path" | "tfms">): string {
  const f = p.tfms.length > 1 ? ` -f ${p.tfms[0]}` : "";
  return `dotnet run --project "${p.path}" -c Debug${f}`;
}
