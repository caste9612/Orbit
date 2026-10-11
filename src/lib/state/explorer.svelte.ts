// Albero file: lazy per directory; la UI virtualizza il rendering.
import { invoke } from "@tauri-apps/api/core";
import { open, confirm } from "@tauri-apps/plugin-dialog";
import { basename, dirname, isUnder, joinPath, relTo, samePath } from "../util";
import { workspace, renameOpenPaths, closeUnder } from "./workspace.svelte";
import { refreshStatus } from "./git.svelte";
import { loadRunConfig } from "./run.svelte";
import { loadClaudeConfig } from "./claude.svelte";
import { loadShelf } from "./shelf.svelte";
import { notify } from "./toast.svelte";
import { writeClipboard } from "../clipboard";
import { layout } from "./layout.svelte";
import { resetSearch } from "./search.svelte";
import { loadDocs } from "./docs.svelte";
import { invalidateFiles } from "./projectFiles";

export interface FsEntry {
  name: string;
  path: string;
  isDir: boolean;
}

export interface TreeNode {
  entry: FsEntry;
  depth: number;
  expanded: boolean;
  loaded: boolean;
  children: TreeNode[];
}

export const tree = $state({ roots: [] as TreeNode[] });

// Cache in-RAM (per finestra) delle cartelle espanse di ciascun repo: passando da un repo all'altro e
// tornando indietro si ritrova l'albero espanso com'era, invece che collassato. Vedi snapshotExpanded/openRoot.
const expandedCache = new Map<string, Set<string>>();

/** Memorizza le cartelle espanse del repo `root` (da chiamare PRIMA di smontarlo, es. al cambio repo). */
export function snapshotExpanded(root: string) {
  if (!root) return;
  const set = new Set<string>();
  collectExpanded(tree.roots, set);
  expandedCache.set(root, set);
}

function makeNode(entry: FsEntry, depth: number): TreeNode {
  return { entry, depth, expanded: false, loaded: false, children: [] };
}

/** Apre una cartella come radice del workspace e ne carica il primo livello. Con `light` (modalità
 *  leggera, M57: la cartella di un file aperto da solo) osserva solo quella cartella — non l'albero
 *  sotto, che può essere Download o un disco intero — e non legge lo stato git. */
export async function openRoot(path: string, opts: { light?: boolean } = {}) {
  // legge PRIMA: se la cartella è illeggibile lanciamo senza aver cambiato la radice (niente
  // stato a metà — importante per switchFolder, che altrimenti resterebbe su una radice rotta).
  const entries = await invoke<FsEntry[]>("read_dir", { path });
  workspace.rootPath = path;
  workspace.rootName = basename(path);
  // ripristina l'espansione salvata di questo repo (switch a schede); altrimenti radici collassate.
  const saved = expandedCache.get(path);
  tree.roots = saved && saved.size ? await buildLevel(path, 0, saved) : entries.map((e) => makeNode(e, 0));
  await invoke("watch_start", { root: path, recursive: !opts.light }).catch(() => {});
  if (!opts.light) void refreshStatus(); // popola le decorazioni git dell'albero senza aprire il pannello
  void loadRunConfig(); // popola il menu Esegui da .orbit/run.json
  void loadClaudeConfig(); // popola il menu Claude da .orbit/claude.json
  void loadShelf(); // carica le cartelle messe nello scaffale (.orbit/shelf.json)
  // viste/dati per-repo: aggiornati a OGNI apertura/cambio cartella (prima restavano del repo precedente)
  resetSearch();
  invalidateFiles(); // cache file per-root condivisa da Quick Open e Docs
  if (layout.sidebarView === "docs") void loadDocs();
}

/** Mostra il folder-picker nativo e cambia cartella (preservando/ripristinando le sessioni).
 *  Import dinamico di persist per evitare il ciclo statico (persist importa già da qui). */
export async function openFolderDialog() {
  let sel: unknown;
  try {
    sel = await open({ directory: true, multiple: false });
  } catch (e) {
    notify(`Folder picker failed: ${e}`, "error");
    return;
  }
  if (typeof sel !== "string") return; // annullato
  try {
    const { switchFolder } = await import("./persist.svelte");
    await switchFolder(sel);
  } catch (e) {
    notify(`Open folder failed: ${e}`, "error"); // non lasciare il fallimento muto
    console.error("openFolderDialog", e);
  }
}

export async function toggle(n: TreeNode) {
  if (!n.entry.isDir) return;
  n.expanded = !n.expanded;
  if (n.expanded && !n.loaded) await loadChildren(n);
}

/** Chiude tutte le cartelle dell'albero (Collapse all); i figli restano caricati per riaprire in fretta. */
export function collapseAll() {
  const walk = (nodes: TreeNode[]) => {
    for (const n of nodes) {
      if (!n.entry.isDir) continue;
      n.expanded = false;
      if (n.children.length) walk(n.children);
    }
  };
  walk(tree.roots);
}

async function loadChildren(n: TreeNode) {
  try {
    const entries = await invoke<FsEntry[]>("read_dir", { path: n.entry.path });
    n.children = entries.map((e) => makeNode(e, n.depth + 1));
  } catch {
    n.children = [];
  }
  n.loaded = true;
}

/** Appiattisce i nodi visibili (rispettando l'espansione) per la lista virtuale. */
export function flatten(nodes: TreeNode[], out: TreeNode[] = []): TreeNode[] {
  for (const n of nodes) {
    out.push(n);
    if (n.entry.isDir && n.expanded && n.children.length) flatten(n.children, out);
  }
  return out;
}

// Aggiornamenti dal file watcher in coda: un giro alla volta, i percorsi arrivati nel frattempo si
// accorpano nel giro successivo (null = rileggere tutto).
let treeBusy = false;
let treeNext: Set<string> | null | undefined;

/** Aggiorna l'albero dopo un `fs-changed` rileggendo SOLO le cartelle che contengono i percorsi cambiati,
 *  se sono caricate (M62). Prima si rileggeva ogni cartella espansa, una dopo l'altra, a ogni salvataggio;
 *  i nodi che restano conservano espansione e figli. `changed` null → si ricostruisce tutto. */
export async function refreshTreeFor(changed: string[] | null) {
  if (treeBusy) {
    treeNext = changed && treeNext !== null ? new Set([...(treeNext ?? []), ...changed]) : null;
    return;
  }
  treeBusy = true;
  try {
    let batch: string[] | null = changed;
    while (true) {
      if (batch) await refreshParents(batch);
      else await refreshTree();
      if (treeNext === undefined) break;
      batch = treeNext ? [...treeNext] : null;
      treeNext = undefined;
    }
  } finally {
    treeBusy = false;
  }
}

async function refreshParents(changed: string[]) {
  const root = workspace.rootPath;
  if (!root) return;
  const dirs: string[] = [];
  for (const p of changed) {
    const d = dirname(p);
    if (!dirs.some((x) => samePath(x, d))) dirs.push(d);
  }
  for (const d of dirs) {
    if (samePath(d, root)) {
      tree.roots = await mergeLevel(root, 0, tree.roots);
      continue;
    }
    const n = findDir(tree.roots, d);
    if (n && n.loaded) n.children = await mergeLevel(n.entry.path, n.depth + 1, n.children);
  }
}

/** Rilegge una cartella tenendo i nodi che ci sono ancora (con espansione e figli); i nuovi entrano chiusi. */
async function mergeLevel(path: string, depth: number, old: TreeNode[]): Promise<TreeNode[]> {
  let entries: FsEntry[];
  try {
    entries = await invoke<FsEntry[]>("read_dir", { path });
  } catch {
    return old;
  }
  const byPath = new Map(old.map((n) => [n.entry.path, n]));
  return entries.map((e) => {
    const n = byPath.get(e.path);
    if (n && n.entry.isDir === e.isDir) return n;
    return makeNode(e, depth);
  });
}

function findDir(nodes: TreeNode[], path: string): TreeNode | undefined {
  for (const n of nodes) {
    if (!n.entry.isDir) continue;
    if (samePath(n.entry.path, path)) return n;
    if (n.children.length && isUnder(path, n.entry.path)) {
      const f = findDir(n.children, path);
      if (f) return f;
    }
  }
  return undefined;
}

/** Ricostruisce l'albero preservando le cartelle espanse (usato dal file watcher). */
export async function refreshTree() {
  if (!workspace.rootPath) return;
  const expanded = new Set<string>();
  collectExpanded(tree.roots, expanded);
  tree.roots = await buildLevel(workspace.rootPath, 0, expanded);
}

function collectExpanded(nodes: TreeNode[], set: Set<string>) {
  for (const n of nodes) {
    if (n.entry.isDir && n.expanded) {
      set.add(n.entry.path);
      collectExpanded(n.children, set);
    }
  }
}

async function buildLevel(
  path: string,
  depth: number,
  expanded: Set<string>,
): Promise<TreeNode[]> {
  let entries: FsEntry[];
  try {
    entries = await invoke<FsEntry[]>("read_dir", { path });
  } catch {
    return [];
  }
  const nodes: TreeNode[] = [];
  for (const e of entries) {
    const node = makeNode(e, depth);
    if (e.isDir && expanded.has(e.path)) {
      node.expanded = true;
      node.loaded = true;
      node.children = await buildLevel(e.path, depth + 1, expanded);
    }
    nodes.push(node);
  }
  return nodes;
}

function findNode(nodes: TreeNode[], path: string): TreeNode | undefined {
  for (const n of nodes) {
    if (n.entry.path === path) return n;
    if (n.children.length) {
      const f = findNode(n.children, path);
      if (f) return f;
    }
  }
  return undefined;
}

// ---- "Segui il file attivo" (reveal) ----------------------------------------
// Segnale transitorio per la UI dell'albero: a ogni incremento di `seq` l'Explorer porta `target`
// in vista. Il toggle PERSISTITO vive in settings.revealActive; qui sta solo la logica d'espansione.
export const reveal = $state({ target: "", seq: 0 });

// Guardia di rientro: una sola "reveal" in volo per volta; le richieste sovrapposte aggiornano
// solo il bersaglio pendente (l'ultima vince). Evita scan/espansioni concorrenti e qualsiasi rientro.
let revealPending: string | null = null;
let revealRunning = false;

/** Espande l'albero fino al file `path` (caricando i figli mancanti lungo il percorso) e chiede lo
 *  scroll in vista. Cammina per NOME di segmento → robusto ai separatori del path. NB: va invocata
 *  fuori dal tracking reattivo (es. `untrack`), perché muove `tree`/`reveal`. */
export async function revealInTree(path: string) {
  revealPending = path;
  if (revealRunning) return; // una run è già attiva: prenderà `revealPending` aggiornato
  revealRunning = true;
  try {
    while (revealPending !== null) {
      const target = revealPending;
      revealPending = null;
      const root = workspace.rootPath;
      if (!root) break;
      const rel = relTo(target, root);
      if (!rel) continue;
      const segs = rel.split("/").filter(Boolean);
      let nodes = tree.roots;
      // espande ogni cartella antenata (tutti i segmenti tranne l'ultimo, che è il file)
      for (let i = 0; i < segs.length - 1; i++) {
        const node = nodes.find((n) => n.entry.isDir && n.entry.name.toLowerCase() === segs[i].toLowerCase());
        if (!node) break; // antenato non in albero (es. cartella nello scaffale): ci fermiamo qui
        node.expanded = true;
        if (!node.loaded) await loadChildren(node);
        nodes = node.children;
      }
      reveal.target = target;
      reveal.seq++;
    }
  } finally {
    revealRunning = false;
  }
}

// ---- Gestione file: editing inline (crea/rinomina) + elimina ----------------
// L'albero si aggiorna via watcher; rinfreschiamo anche subito per reattività.

export const edit = $state({
  active: false,
  mode: "create" as "create" | "rename",
  kind: "file" as "file" | "dir",
  dir: "", // cartella in cui si crea / che contiene l'elemento rinominato
  target: null as string | null, // path dell'elemento in rinomina
  value: "",
  error: null as string | null,
});

/** Avvia la creazione di un file/cartella dentro `dir` (espandendola se serve). */
export async function startCreate(dir: string, kind: "file" | "dir") {
  if (dir !== workspace.rootPath) {
    const node = findNode(tree.roots, dir);
    if (node) {
      node.expanded = true;
      if (!node.loaded) await loadChildren(node);
    }
  }
  edit.active = true;
  edit.mode = "create";
  edit.kind = kind;
  edit.dir = dir;
  edit.target = null;
  edit.value = "";
  edit.error = null;
}

/** Avvia la rinomina di un elemento esistente. */
export function startRename(path: string, name: string, isDir: boolean) {
  edit.active = true;
  edit.mode = "rename";
  edit.kind = isDir ? "dir" : "file";
  edit.dir = dirname(path);
  edit.target = path;
  edit.value = name;
  edit.error = null;
}

export function cancelEdit() {
  edit.active = false;
  edit.error = null;
}

/** Conferma l'editing inline: crea o rinomina su disco, poi aggiorna albero e git. */
export async function commitEdit() {
  const name = edit.value.trim();
  if (!edit.active) return;
  if (!name) {
    cancelEdit();
    return;
  }
  if (/[\\/]/.test(name)) {
    edit.error = "Name cannot contain path separators";
    return;
  }
  try {
    if (edit.mode === "create") {
      const path = joinPath(edit.dir, name);
      await invoke(edit.kind === "dir" ? "create_dir" : "create_file", { path });
    } else if (edit.target) {
      if (name === basename(edit.target)) {
        cancelEdit();
        return;
      }
      const to = joinPath(dirname(edit.target), name);
      await invoke("rename_path", { from: edit.target, to });
      renameOpenPaths(edit.target, to);
    }
    edit.active = false;
    edit.error = null;
    await refreshTree();
    await refreshStatus();
  } catch (e) {
    edit.error = String(e);
  }
}

/** Elimina un file/cartella (con conferma), chiude le tab interessate e aggiorna. */
export async function deleteEntry(path: string, name: string, isDir: boolean) {
  const ok = await confirm(
    `Delete ${isDir ? "folder" : "file"} "${name}"?${isDir ? " Its contents will be removed." : ""}`,
    { title: "Confirm delete", kind: "warning" },
  );
  if (!ok) return;
  try {
    await invoke("delete_path", { path });
    closeUnder(path);
    await refreshTree();
    await refreshStatus();
  } catch (e) {
    notify(`Delete failed: ${e}`, "error");
    console.error("delete", e);
  }
}

/** Copia il percorso assoluto negli appunti (utile per incollarlo in Claude). */
export async function copyPath(path: string) {
  if (!(await writeClipboard(path))) notify("Copy failed", "error");
}

/** Copia il percorso relativo alla radice del progetto (menu dell'albero e delle schede). */
export async function copyRelPath(path: string) {
  const rel = relTo(path, workspace.rootPath) || basename(path);
  const ok = await writeClipboard(rel);
  notify(ok ? "Relative path copied" : "Copy failed", ok ? "success" : "error", 1200);
}

/** Mostra il file/cartella nel file manager dell'OS (comando Rust; su Windows lo seleziona). */
export function revealPath(path: string) {
  void invoke("reveal_path", { path }).catch((e) => console.error("reveal_path", e));
}
