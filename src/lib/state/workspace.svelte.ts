// Stato del workspace: cartella aperta, file aperti/attivo, ramo git.
import { invoke } from "@tauri-apps/api/core";
import { basename } from "../util";

export interface OpenFile {
  path: string;
  name: string;
  content: string;
  dirty: boolean;
  readonly: boolean;
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
    readonly = true; // non sovrascrivere un binario col messaggio d'errore
  }
  workspace.openFiles.push({ path, name: basename(path), content, dirty: false, readonly });
  workspace.activePath = path;
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
  if (!f || f.readonly || !f.dirty) return;
  try {
    await invoke("write_file", { path: f.path, content: f.content });
    f.dirty = false;
  } catch (e) {
    console.error("save", e);
  }
}
