// Vista Solution dell'Explorer (M70): stato e azioni. Si carica con la vista (SolutionView), fuori dal chunk
// d'avvio. L'albero (`data.root`) è un oggetto normale, non reattivo: dopo ogni modifica `bump()` fa
// ricalcolare le righe. Sono reattivi solo i nodi aperti (`sol.expanded`, ricordati per soluzione) e lo
// stato dei progetti in caricamento.
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { explorerView } from "./explorerView.svelte";
import { workspace } from "./workspace.svelte";
import { addTerminal } from "./terminals.svelte";
import { layout } from "./layout.svelte";
import { revealInTree, type FsEntry } from "./explorer.svelte";
import {
  buildCommand,
  buildProject,
  buildSolution,
  lazyChildren,
  runCommandFor,
  VERB_LABEL,
  type BuildVerb,
  type ProjModelDto,
  type SlnModelDto,
  type SNode,
} from "./solutionTree";
import { isUnder, pathKey, samePath } from "../util";

export const sol = $state({
  /** soluzione caricata */
  path: null as string | null,
  loading: false,
  error: null as string | null,
  /** id dei nodi aperti */
  expanded: {} as Record<string, boolean>,
  /** progetti: "loading" mentre si leggono, altrimenti il messaggio d'errore */
  busy: {} as Record<string, string>,
  /** cartelle (pathKey) che «Other files» non ripete */
  hidden: new Set<string>(),
  rootIsProject: false,
  /** contatore delle modifiche all'albero (non reattivo) */
  version: 0,
});

/** Albero e progetti letti: fuori dal sistema reattivo (possono essere migliaia di nodi). */
export const data = {
  root: null as SNode | null,
  models: new Map<string, ProjModelDto>(),
};

const bump = () => sol.version++;

// ---- nodi aperti, ricordati per soluzione ----------------------------------------------------------------

const STORE = "orbit.solutionExpanded";
const MAX_IDS = 400;

function loadExpanded(path: string): Record<string, boolean> {
  try {
    const all = JSON.parse(localStorage.getItem(STORE) ?? "{}");
    const ids = all?.[pathKey(path)];
    if (Array.isArray(ids)) return Object.fromEntries(ids.filter((x) => typeof x === "string").map((x) => [x, true]));
  } catch {
    /* */
  }
  return { sln: true };
}

let saveTimer: ReturnType<typeof setTimeout> | undefined;
function saveSoon() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    if (!sol.path) return;
    try {
      const all = JSON.parse(localStorage.getItem(STORE) ?? "{}") ?? {};
      const k = pathKey(sol.path);
      delete all[k];
      all[k] = Object.keys(sol.expanded).slice(0, MAX_IDS);
      // le soluzioni usate meno di recente escono per prime
      const keys = Object.keys(all);
      for (const old of keys.slice(0, Math.max(0, keys.length - 30))) delete all[old];
      localStorage.setItem(STORE, JSON.stringify(all));
    } catch {
      /* storage non disponibile */
    }
  }, 400);
}

// ---- caricamento -------------------------------------------------------------------------------------------

function walk(n: SNode, fn: (n: SNode, up: SNode[]) => boolean | void, up: SNode[] = []): boolean {
  if (fn(n, up) === true) return true;
  for (const c of n.children) if (walk(c, fn, [...up, n])) return true;
  return false;
}

export function findNode(id: string): SNode | null {
  let hit: SNode | null = null;
  if (data.root) walk(data.root, (n) => (n.id === id ? ((hit = n), true) : false));
  return hit;
}

function projects(): SNode[] {
  const out: SNode[] = [];
  if (data.root) walk(data.root, (n) => void (n.kind === "project" && out.push(n)));
  return out;
}

let openSeq = 0;
/** Carica la soluzione `path` (null = nessuna). Ricaricando la stessa, i progetti già letti restano. */
export async function openSolution(path: string | null) {
  const my = ++openSeq;
  if (!path) {
    data.root = null;
    data.models.clear();
    sol.path = null;
    bump();
    return;
  }
  if (!sol.path || !samePath(sol.path, path)) {
    data.models.clear();
    sol.busy = {};
    sol.expanded = loadExpanded(path);
  }
  sol.path = path;
  sol.loading = true;
  try {
    const m = await invoke<SlnModelDto>("sln_load", { path, root: explorerView.root ?? workspace.rootPath });
    if (my !== openSeq) return;
    data.root = buildSolution(m);
    sol.hidden = new Set(m.hiddenDirs);
    sol.rootIsProject = m.rootIsProject;
    sol.error = null;
    for (const p of projects()) {
      const model = data.models.get(p.id);
      if (model) p.children = buildProject(model, p.id);
      else if (sol.expanded[p.id] && !p.missing) void loadProject(p);
    }
  } catch (e) {
    if (my !== openSeq) return;
    data.root = null;
    sol.error = String(e);
  } finally {
    if (my === openSeq) {
      sol.loading = false;
      bump();
    }
  }
}

const inflight = new Map<string, Promise<void>>();
/** Legge il contenuto del progetto (con Show All Files se attivo) e lo appende al suo nodo. */
export function loadProject(node: SNode): Promise<void> {
  const running = inflight.get(node.id);
  if (running) return running;
  const job = (async () => {
    if (!data.models.has(node.id)) {
      sol.busy[node.id] = "loading";
      bump();
    }
    try {
      const m = await invoke<ProjModelDto>("proj_load", { path: node.path, showAll: explorerView.showAll, sln: sol.path });
      data.models.set(node.id, m);
      const cur = findNode(node.id); // dopo una ricarica della soluzione il nodo è un altro oggetto
      if (cur) cur.children = buildProject(m, node.id);
      delete sol.busy[node.id];
    } catch (e) {
      sol.busy[node.id] = String(e);
    } finally {
      inflight.delete(node.id);
      bump();
    }
  })();
  inflight.set(node.id, job);
  return job;
}

/** Rilegge i progetti già aperti (cambio di Show All Files, o i loro file sono cambiati). */
export function reloadProjects(ids?: string[]) {
  for (const p of projects()) {
    if (data.models.has(p.id) && (!ids || ids.includes(p.id))) void loadProject(p);
  }
}

async function loadLazy(n: SNode) {
  if (!n.path) return;
  const entries = await invoke<FsEntry[]>("read_dir", { path: n.path }).catch(() => [] as FsEntry[]);
  n.children = lazyChildren(entries, n.id);
  n.loaded = true;
  bump();
}

/** Apre o chiude un nodo; aprendo un progetto o una cartella esclusa la si legge. */
export function toggleNode(n: SNode) {
  if (sol.expanded[n.id]) delete sol.expanded[n.id];
  else {
    sol.expanded[n.id] = true;
    if (n.kind === "project" && !n.missing && !data.models.has(n.id)) void loadProject(n);
    else if (n.kind === "dir" && n.lazy && !n.loaded) void loadLazy(n);
  }
  saveSoon();
}

export function expandNode(n: SNode) {
  if (!sol.expanded[n.id]) toggleNode(n);
}

/** «Collapse all»: resta aperto solo il nodo della soluzione. */
export function collapseAll() {
  sol.expanded = { sln: true };
  saveSoon();
}

/** Progetto a cui appartiene un nodo (dall'id: `p:<progetto>|…`). */
export function ownerProject(n: SNode): { node: SNode | null; model: ProjModelDto | null } {
  const id = n.kind === "project" ? n.id : n.id.split("|")[0];
  if (!id.startsWith("p:")) return { node: null, model: null };
  return { node: findNode(id), model: data.models.get(id) ?? null };
}

// ---- «Other files» --------------------------------------------------------------------------------------

/** Nascosta in «Other files»? Le cartelle dei progetti; se un progetto è la radice stessa della repo, al
 *  primo livello restano solo le cose che il progetto esclude (cartelle col punto, bin, obj, .sln…). */
export function hiddenInOther(path: string, name: string, depth: number): boolean {
  if (sol.hidden.has(pathKey(path))) return true;
  if (sol.rootIsProject && depth === 1) {
    const l = name.toLowerCase();
    return !(l.startsWith(".") || l === "bin" || l === "obj" || /\.(slnx?|[a-z]*proj|user)$/.test(l));
  }
  return false;
}

// ---- «Segui il file attivo» ---------------------------------------------------------------------------

/** Apre l'albero fino al file e ritorna l'id della sua riga (null = non è nella vista). */
export async function revealPath(path: string): Promise<string | null> {
  if (!data.root) return null;
  const find = (): { node: SNode; up: SNode[] } | null => {
    let hit: { node: SNode; up: SNode[] } | null = null;
    walk(data.root!, (n, up) => (n.kind === "file" && n.path && samePath(n.path, path) ? ((hit = { node: n, up }), true) : false));
    return hit;
  };
  let hit = find();
  if (!hit) {
    // il progetto che lo contiene (la cartella più lunga), se non è ancora stato letto
    let best: SNode | null = null;
    for (const p of projects()) {
      if (p.dir && !p.missing && isUnder(path, p.dir) && (!best || p.dir.length > (best.dir ?? "").length)) best = p;
    }
    if (best && !data.models.has(best.id)) {
      await loadProject(best);
      hit = find();
    }
  }
  if (hit) {
    for (const a of hit.up) sol.expanded[a.id] = true;
    saveSoon();
    bump();
    return hit.node.id;
  }
  // fuori dai progetti: in «Other files»
  const root = workspace.rootPath;
  if (root && isUnder(path, root)) {
    sol.expanded.other = true;
    await revealInTree(path);
    return `fs:${path}`;
  }
  return null;
}

// ---- aggiornamenti dal disco -------------------------------------------------------------------------------

let pendingSln = false;
const pendingProjects = new Set<string>();
let fsTimer: ReturnType<typeof setTimeout> | undefined;

function onFsChanged(paths: string[] | null, ignoredOnly: boolean) {
  if (!sol.path || !data.root) return;
  if (!paths) {
    pendingSln = true;
  } else {
    const keys = paths.map(pathKey);
    if (keys.includes(pathKey(sol.path))) pendingSln = true;
    const build = keys.some((k) => /\/directory\.(build|packages)\.(props|targets)$/.test(k));
    for (const [id, m] of data.models) {
      const pk = pathKey(m.path);
      const dk = pathKey(m.dir);
      const own = keys.some((k) => k === pk || k === `${pk}.filters` || k === `${pk}.user`);
      // con Show All Files anche bin e obj si vedono: allora contano anche i cambi nei file ignorati
      const inside = (!ignoredOnly || explorerView.showAll) && keys.some((k) => k.startsWith(`${dk}/`));
      const linked = !inside && m.items.some((i) => i.link && i.p && keys.includes(pathKey(i.p)));
      if (build || own || inside || linked) pendingProjects.add(id);
    }
  }
  clearTimeout(fsTimer);
  fsTimer = setTimeout(() => {
    if (pendingSln) void openSolution(sol.path);
    else if (pendingProjects.size) reloadProjects([...pendingProjects]);
    pendingSln = false;
    pendingProjects.clear();
  }, 300);
}

/** Ascolta il watcher dei file finché la vista è montata. Ritorna la funzione per smettere. */
export function watchSolution(): () => void {
  let off: (() => void) | null = null;
  let stopped = false;
  void listen<{ paths: string[]; ignoredOnly: boolean }>("fs-changed", (e) => {
    const raw = Array.isArray(e.payload?.paths) ? e.payload.paths : null;
    onFsChanged(raw, !!raw && e.payload.ignoredOnly === true);
  }).then((u) => (stopped ? u() : (off = u)));
  return () => {
    stopped = true;
    off?.();
  };
}

// ---- comandi --------------------------------------------------------------------------------------------

let msbuild: Promise<string | null> | null = null;
const msbuildPath = () => (msbuild ??= invoke<string | null>("msbuild_path").catch(() => null));

/** Build, Rebuild o Clean della soluzione o di un progetto, in una scheda del terminale. */
export async function buildTarget(verb: BuildVerb, target: string, name: string, cwd: string) {
  const { command, shell } = buildCommand(verb, target, await msbuildPath());
  layout.terminalVisible = true;
  addTerminal({ title: `${VERB_LABEL[verb]} ${name}`, cwd, initCommand: command, shell });
}

/** `dotnet run` del progetto, in una scheda del terminale. */
export function runProject(model: ProjModelDto, name: string) {
  layout.terminalVisible = true;
  addTerminal({ title: `▶ ${name}`, cwd: model.dir, initCommand: runCommandFor(model) });
}
