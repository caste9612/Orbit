// Albero file: lazy per directory; la UI virtualizza il rendering.
import { invoke } from "@tauri-apps/api/core";
import { open, confirm } from "@tauri-apps/plugin-dialog";
import { basename, dirname, joinPath } from "../util";
import { workspace, renameOpenPaths, closeUnder } from "./workspace.svelte";
import { refreshStatus } from "./git.svelte";
import { loadRunConfig } from "./run.svelte";
import { loadClaudeConfig } from "./claude.svelte";
import { loadShelf } from "./shelf.svelte";
import { notify } from "./toast.svelte";

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

function makeNode(entry: FsEntry, depth: number): TreeNode {
  return { entry, depth, expanded: false, loaded: false, children: [] };
}

/** Apre una cartella come radice del workspace e ne carica il primo livello. */
export async function openRoot(path: string) {
  // legge PRIMA: se la cartella è illeggibile lanciamo senza aver cambiato la radice (niente
  // stato a metà — importante per switchFolder, che altrimenti resterebbe su una radice rotta).
  const entries = await invoke<FsEntry[]>("read_dir", { path });
  workspace.rootPath = path;
  workspace.rootName = basename(path);
  tree.roots = entries.map((e) => makeNode(e, 0));
  await invoke("watch_start", { root: path }).catch(() => {});
  void refreshStatus(); // popola le decorazioni git dell'albero senza aprire il pannello
  void loadRunConfig(); // popola il menu Esegui da .orbit/run.json
  void loadClaudeConfig(); // popola il menu Claude da .orbit/claude.json
  void loadShelf(); // carica le cartelle messe nello scaffale (.orbit/shelf.json)
}

/** Mostra il folder-picker nativo e cambia cartella (preservando/ripristinando le sessioni).
 *  Import dinamico di persist per evitare il ciclo statico (persist importa già da qui). */
export async function openFolderDialog() {
  const sel = await open({ directory: true, multiple: false });
  if (typeof sel !== "string") return;
  const { switchFolder } = await import("./persist.svelte");
  await switchFolder(sel);
}

export async function toggle(n: TreeNode) {
  if (!n.entry.isDir) return;
  n.expanded = !n.expanded;
  if (n.expanded && !n.loaded) await loadChildren(n);
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
  try {
    await navigator.clipboard.writeText(path);
  } catch (e) {
    console.error("copy path", e);
  }
}
