// Stato del workspace: cartella aperta, file aperti/attivo, ramo git.
import { invoke } from "@tauri-apps/api/core";
import { basename } from "../util";

export interface OpenFile {
  path: string; // chiave univoca della tab (per i diff è un id sintetico)
  name: string;
  content: string;
  dirty: boolean;
  readonly: boolean;
  kind: "file" | "diff";
  rev: number; // incrementa al reload esterno → l'editor rimpiazza il doc
  externallyChanged: boolean; // modificato su disco con edit non salvati (conflitto)
  gotoLine: number | null; // riga a cui saltare (da ricerca)
}

export const workspace = $state({
  rootPath: null as string | null,
  rootName: null as string | null,
  branch: null as string | null,
  openFiles: [] as OpenFile[],
  activePath: null as string | null,
});

/** File attualmente attivo (reattivo se usato dentro $derived). */
export function activeFile(): OpenFile | undefined {
  return workspace.openFiles.find((f) => f.path === workspace.activePath);
}

/** Apre un file in una tab (o vi passa se già aperto) e lo rende attivo. */
export async function openFile(path: string) {
  const existing = workspace.openFiles.find((f) => f.path === path);
  if (existing) {
    workspace.activePath = path;
    return;
  }
  let content: string;
  let readonly = false;
  try {
    content = await invoke<string>("read_file", { path });
  } catch (e) {
    content = `// Impossibile aprire il file (binario o non UTF-8).\n// ${e}`;
    readonly = true;
  }
  workspace.openFiles.push({
    path,
    name: basename(path),
    content,
    dirty: false,
    readonly,
    kind: "file",
    rev: 0,
    externallyChanged: false,
    gotoLine: null,
  });
  workspace.activePath = path;
}

/** Apre un file e salta a una riga (usato dalla ricerca). */
export async function openFileAt(path: string, line: number) {
  await openFile(path);
  const f = workspace.openFiles.find((x) => x.path === path);
  if (f) f.gotoLine = line;
}

/** Apre (o aggiorna) una tab di sola lettura con un diff. */
export function openDiff(id: string, name: string, patch: string) {
  const existing = workspace.openFiles.find((f) => f.path === id);
  if (existing) {
    existing.content = patch;
    workspace.activePath = id;
    return;
  }
  workspace.openFiles.push({
    path: id,
    name,
    content: patch,
    dirty: false,
    readonly: true,
    kind: "diff",
    rev: 0,
    externallyChanged: false,
    gotoLine: null,
  });
  workspace.activePath = id;
}

export function closeFile(path: string) {
  const i = workspace.openFiles.findIndex((f) => f.path === path);
  if (i === -1) return;
  workspace.openFiles.splice(i, 1);
  if (workspace.activePath === path) {
    workspace.activePath =
      workspace.openFiles[i]?.path ?? workspace.openFiles[i - 1]?.path ?? null;
  }
}

export function setActive(path: string) {
  workspace.activePath = path;
}

/** Aggiorna il contenuto in memoria di un file e lo marca come modificato. */
export function updateContent(path: string, content: string) {
  const f = workspace.openFiles.find((x) => x.path === path);
  if (f && !f.readonly && f.content !== content) {
    f.content = content;
    f.dirty = true;
  }
}

/** Salva su disco il file attivo (se modificato e non in sola lettura). */
export async function saveActive() {
  const f = activeFile();
  if (!f || f.readonly || !f.dirty || f.kind !== "file") return;
  try {
    await invoke("write_file", { path: f.path, content: f.content });
    f.dirty = false;
    f.externallyChanged = false;
  } catch (e) {
    console.error("save", e);
  }
}

/** Ricarica dal disco le tab aperte cambiate esternamente (es. da Claude). */
export async function reloadOpenFiles() {
  for (const f of workspace.openFiles) {
    if (f.kind !== "file" || f.readonly) continue;
    let disk: string;
    try {
      disk = await invoke<string>("read_file", { path: f.path });
    } catch {
      continue; // file forse eliminato: lascio la tab
    }
    if (disk === f.content) continue;
    if (f.dirty) {
      f.externallyChanged = true; // conflitto: non sovrascrivo gli edit non salvati
    } else {
      f.content = disk;
      f.externallyChanged = false;
      f.rev++; // segnala all'editor di rimpiazzare il doc
    }
  }
}
