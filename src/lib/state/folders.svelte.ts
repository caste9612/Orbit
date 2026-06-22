// Elenco delle cartelle/repo "aperte" nel selettore in top bar + switch rapido. La repo ATTIVA è
// `workspace.rootPath`. La lista è **per-finestra**: vive solo in questo `$state` (NON in localStorage,
// che è condiviso tra tutte le istanze Orbit → causava clobbering/staleness tra finestre). La
// persistenza avviene nella **sessione della cartella attiva** (campo `repos`, vedi persist.serialize):
// l'autosave di sessione la salva, e `loadSession({repos:true})` la risemina all'avvio della finestra.
import { workspace } from "./workspace.svelte";
import { switchFolder } from "./persist.svelte";
import { basename } from "../util";

export interface FolderEntry {
  path: string;
  name: string;
}

export const folders = $state({ list: [] as FolderEntry[] });

/** Rimpiazza la lista (dai `repos` della sessione, all'avvio finestra). Dedup + preserva l'ordine. */
export function setFolders(paths: string[]) {
  const seen = new Set<string>();
  folders.list = paths
    .filter((p) => typeof p === "string" && p && !seen.has(p) && (seen.add(p), true))
    .map((p) => ({ path: p, name: basename(p) || p }));
}

/** Aggiunge una cartella alla lista (dedup per path; le nuove in fondo). Idempotente: la chiama
 *  l'effetto su `rootPath`, così ogni cartella aperta entra da sola nel selettore. La persistenza
 *  la fa l'autosave di sessione (che serializza `folders.list` in `repos`). */
export function addFolder(path: string) {
  if (!path || folders.list.some((e) => e.path === path)) return;
  folders.list.push({ path, name: basename(path) || path });
}

function drop(path: string) {
  folders.list = folders.list.filter((e) => e.path !== path);
}

/** Toglie una cartella dal selettore. Se è la repo ATTIVA, prima passa a una vicina (come chiudere
 *  una tab); se è l'unica, la toglie e basta (resti nella cartella, la riaggiungi con "+"). */
export async function removeFolder(path: string) {
  if (path === workspace.rootPath) {
    const i = folders.list.findIndex((e) => e.path === path);
    const neighbor = folders.list[i + 1] ?? folders.list[i - 1];
    if (neighbor) {
      const st = await switchFolder(neighbor.path); // include il guard sugli edit non salvati
      if (st === "failed") drop(neighbor.path); // anche il vicino è sparito → toglilo
      if (workspace.rootPath === path) return; // ancora qui (annullato o vicino morto) → non rimuovere
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
 *  (così vale per ogni cambio cartella, anche "Add folder…"). Se la cartella è sparita,
 *  `switchFolder` ripristina la precedente e qui togliamo la voce morta dal selettore. */
export async function openFromList(path: string) {
  if (!path || path === workspace.rootPath) return;
  const st = await switchFolder(path);
  if (st === "failed") drop(path);
}
