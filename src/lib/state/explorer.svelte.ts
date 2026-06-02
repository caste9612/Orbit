// Albero file: lazy per directory; la UI virtualizza il rendering.
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { basename } from "../util";
import { workspace } from "./workspace.svelte";

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
  workspace.rootPath = path;
  workspace.rootName = basename(path);
  const entries = await invoke<FsEntry[]>("read_dir", { path });
  tree.roots = entries.map((e) => makeNode(e, 0));
}

/** Mostra il folder-picker nativo e apre la cartella scelta. */
export async function openFolderDialog() {
  const sel = await open({ directory: true, multiple: false });
  if (typeof sel === "string") await openRoot(sel);
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
