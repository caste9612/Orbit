// Menu contestuale di una cartella o di un file su disco (M73): lo stesso nell'Explorer a cartelle, in
// «Other files» della vista Solution e nello scaffale, che prima ne avevano ciascuno una copia.
import type { MenuItem } from "../components/ContextMenu.svelte";
import { startCreate, startRename, deleteEntry, copyPath, copyRelPath, revealPath, type EditPlace, type TreeNode } from "./explorer.svelte";
import { openInNewGroup } from "./workspace.svelte";
import { addTerminal } from "./terminals.svelte";
import { layout } from "./layout.svelte";
import { runFile } from "./run.svelte";
import { notify } from "./toast.svelte";
import { writeClipboard } from "../clipboard";
import { basename, dirname, runCommand } from "../util";

/** Apre una nuova scheda del terminale nella cartella indicata. */
export function openTerminalAt(dir: string) {
  if (!dir) return;
  layout.terminalVisible = true;
  addTerminal({ title: basename(dir) || "Terminal", cwd: dir });
}

/** Copia solo il nome del file o della cartella. */
export async function copyName(name: string) {
  const ok = await writeClipboard(name);
  notify(ok ? "Name copied" : "Copy failed", ok ? "success" : "error", 1200);
}

export interface FsMenuOptions {
  /** La voce dello scaffale («Add to shelf…», o «Shelf…» su una voce già nello scaffale); null = nessuna. */
  shelf?: MenuItem | null;
  /** Eliminazione (la vista Solution rilegge poi i progetti); default deleteEntry. */
  remove?: (path: string, name: string, isDir: boolean) => void;
  /** Dove compare la casella del nome per «New…» e «Rename…» (l'albero o lo scaffale). */
  where?: EditPlace;
}

/** Le voci del menu di un nodo dell'albero su disco. */
export function fsMenuItems(node: TreeNode, opts: FsMenuOptions = {}): MenuItem[] {
  const { path, name, isDir } = node.entry;
  const dir = isDir ? path : dirname(path);
  const remove = opts.remove ?? ((p, n, d) => void deleteEntry(p, n, d));
  const where = opts.where ?? "tree";
  const items: MenuItem[] = [];
  // file eseguibile (script): "Run" in cima al menu
  if (!isDir && runCommand(name)) items.push({ label: "Run", icon: "play", onClick: () => runFile(path) });
  items.push(
    { label: "New file…", icon: "file-plus", separatorBefore: items.length > 0, onClick: () => void startCreate(dir, "file", where) },
    { label: "New folder…", icon: "folder-plus", onClick: () => void startCreate(dir, "dir", where) },
    { label: "Open in terminal", icon: "terminal", separatorBefore: true, onClick: () => openTerminalAt(dir) },
    { label: "Reveal in Explorer", icon: "external-link", onClick: () => revealPath(path) },
  );
  if (!isDir) items.push({ label: "Open to the side", icon: "panel-left", separatorBefore: true, onClick: () => void openInNewGroup(path) });
  items.push(
    { label: "Rename…", icon: "pencil", separatorBefore: true, onClick: () => startRename(path, name, isDir, where) },
    { label: "Delete", icon: "trash", danger: true, onClick: () => remove(path, name, isDir) },
  );
  if (opts.shelf) items.push({ ...opts.shelf, separatorBefore: true });
  items.push(
    { label: "Copy path", icon: "copy", separatorBefore: !opts.shelf, onClick: () => copyPath(path) },
    { label: "Copy relative path", icon: "copy", onClick: () => copyRelPath(path) },
    { label: "Copy name", icon: "copy", onClick: () => void copyName(name) },
  );
  return items;
}
