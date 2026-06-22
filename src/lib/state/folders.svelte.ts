// Elenco delle cartelle/repo "aperte" nel selettore in top bar + switch rapido. La repo ATTIVA è
// `workspace.rootPath`; qui teniamo solo l'elenco (persistito in localStorage, app-global) e le azioni.
// Cambiare repo riusa `switchFolder` (salva/ripristina la sessione per-cartella) → zero refactor del
// modello single-root, zero comandi Rust nuovi.
import { workspace } from "./workspace.svelte";
import { switchFolder } from "./persist.svelte";
import { basename } from "../util";

export interface FolderEntry {
  path: string;
  name: string;
}

export const folders = $state({ list: [] as FolderEntry[] });

const KEY = "orbit.folders";

/** Carica la lista da localStorage (app-global, condivisa tra finestre). */
export function loadFolders() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return;
    const arr = JSON.parse(raw);
    if (Array.isArray(arr)) {
      folders.list = arr
        .filter((e) => e && typeof e.path === "string")
        .map((e) => ({ path: e.path as string, name: (e.name as string) || basename(e.path) }));
    }
  } catch {
    /* localStorage non disponibile / JSON invalido */
  }
}

function save() {
  try {
    localStorage.setItem(KEY, JSON.stringify(folders.list));
  } catch {
    /* no-op */
  }
}

/** Aggiunge una cartella alla lista (dedup per path; le nuove in fondo). Idempotente: la chiama
 *  l'effetto su `rootPath`, così ogni cartella aperta entra da sola nel selettore. */
export function addFolder(path: string) {
  if (!path || folders.list.some((e) => e.path === path)) return;
  folders.list.push({ path, name: basename(path) || path });
  save();
}

/** Toglie una cartella dal selettore (non chiude nulla: è solo l'elenco). */
export function removeFolder(path: string) {
  const before = folders.list.length;
  folders.list = folders.list.filter((e) => e.path !== path);
  if (folders.list.length !== before) save();
}

/** Passa alla repo `path` dal selettore. Il guard sugli edit non salvati è dentro `switchFolder`
 *  (così vale per ogni cambio cartella, anche "Add folder…"). */
export async function openFromList(path: string) {
  if (!path || path === workspace.rootPath) return;
  await switchFolder(path);
}
