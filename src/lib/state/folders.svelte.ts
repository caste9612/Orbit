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

function drop(path: string) {
  const before = folders.list.length;
  folders.list = folders.list.filter((e) => e.path !== path);
  if (folders.list.length !== before) save();
}

/** Toglie una cartella dal selettore. Se è la repo ATTIVA, prima passa a una vicina (come chiudere
 *  una tab); se è l'unica, la toglie e basta (resti nella cartella, la riaggiungi con "+"). */
export async function removeFolder(path: string) {
  if (path === workspace.rootPath) {
    const i = folders.list.findIndex((e) => e.path === path);
    const neighbor = folders.list[i + 1] ?? folders.list[i - 1];
    if (neighbor) {
      await switchFolder(neighbor.path); // include il guard sugli edit non salvati
      if (workspace.rootPath === path) return; // switch annullato → non rimuovere
    }
  }
  drop(path);
}

/** Cicla alla repo successiva/precedente nella lista (Ctrl+Tab / Ctrl+Shift+Tab). */
export function cycleRepo(delta: number) {
  const n = folders.list.length;
  if (n < 2) return;
  const i = folders.list.findIndex((e) => e.path === workspace.rootPath);
  const next = folders.list[((((i < 0 ? 0 : i) + delta) % n) + n) % n];
  if (next) void openFromList(next.path);
}

/** Passa alla repo n-esima della lista, 0-based (Ctrl+1…9). */
export function selectRepoIndex(i: number) {
  const f = folders.list[i];
  if (f) void openFromList(f.path);
}

/** Passa alla repo `path` dal selettore. Il guard sugli edit non salvati è dentro `switchFolder`
 *  (così vale per ogni cambio cartella, anche "Add folder…"). */
export async function openFromList(path: string) {
  if (!path || path === workspace.rootPath) return;
  await switchFolder(path);
}
