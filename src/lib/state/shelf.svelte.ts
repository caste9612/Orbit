// "Scaffale": cartelle messe da parte (marcate con una o più categorie) per togliere
// rumore dall'albero senza perderle. Persistito in `.orbit/shelf.json` (per-progetto,
// committabile, leggibile/modificabile anche da Claude). Mappa relPath -> [categorie].
import { invoke } from "@tauri-apps/api/core";
import { workspace } from "./workspace.svelte";
import { joinPath, relTo } from "../util";
import { isHiddenIn, isNameRuledIn, groupByCategory, type ShelfCategory } from "./shelfRules";

export const shelf = $state({
  map: {} as Record<string, string[]>, // relPath (separatori "/") -> categorie
  byName: {} as Record<string, string[]>, // nome cartella (es. "bin") -> categorie: REGOLA che nasconde TUTTE le cartelle con quel nome (anche annidate o ricreate dopo, es. bin/obj C#)
  loaded: false,
});

function shelfPath(): string | null {
  return workspace.rootPath ? joinPath(joinPath(workspace.rootPath, ".orbit"), "shelf.json") : null;
}

/** Percorso relativo alla radice, normalizzato con "/" (chiave dello scaffale). */
export function relOf(abs: string): string {
  return relTo(abs, workspace.rootPath);
}

/** Una cartella è nascosta dall'albero se: è nello scaffale (per percorso), è dentro una che lo è,
 *  oppure un segmento del suo path corrisponde a una regola-per-nome. Logica pura in `shelfRules`
 *  (con test); qui si leggono gli stati reattivi `shelf.map`/`shelf.byName`. */
export function isHidden(rel: string): boolean {
  return isHiddenIn(rel, shelf.map, shelf.byName);
}

/** Nome cartella (basename) coperto da una regola-per-nome? (case-insensitive) */
export function isNameRuled(name: string): boolean {
  return isNameRuledIn(name, shelf.byName);
}

export async function loadShelf() {
  const p = shelfPath();
  if (!p) {
    shelf.map = {};
    shelf.byName = {};
    shelf.loaded = false;
    return;
  }
  try {
    const raw = await invoke<string>("read_file", { path: p });
    const data = JSON.parse(raw);
    shelf.map = cleanCats(data?.shelved);
    shelf.byName = cleanCats(data?.byName);
    shelf.loaded = true;
  } catch {
    shelf.map = {};
    shelf.byName = {};
    shelf.loaded = false;
  }
}

/** Normalizza un oggetto {chiave: string[]} scartando valori non validi e categorie vuote. */
function cleanCats(src: unknown): Record<string, string[]> {
  const clean: Record<string, string[]> = {};
  if (src && typeof src === "object") {
    for (const [k, v] of Object.entries(src as Record<string, unknown>)) {
      if (Array.isArray(v)) {
        const cats = v.filter((x): x is string => typeof x === "string");
        if (cats.length) clean[k] = cats;
      }
    }
  }
  return clean;
}

async function save() {
  const root = workspace.rootPath;
  const p = shelfPath();
  if (!root || !p) return;
  try {
    await invoke("create_dir", { path: joinPath(root, ".orbit") }).catch(() => {});
    await invoke("write_file", {
      path: p,
      content: JSON.stringify({ shelved: shelf.map, byName: shelf.byName }, null, 2) + "\n",
    });
  } catch (e) {
    console.error("shelf save", e);
  }
}

/** Aggiunge una cartella (path assoluto) a una categoria. */
export function shelveFolder(abs: string, category: string) {
  const rel = relOf(abs);
  const cat = category.trim();
  if (!rel || !cat) return;
  const cats = new Set(shelf.map[rel] ?? []);
  cats.add(cat);
  shelf.map[rel] = [...cats];
  void save();
}

/** Toglie una cartella da una categoria (e dallo scaffale se era l'ultima). */
export function unshelveCategory(rel: string, category: string) {
  const cats = (shelf.map[rel] ?? []).filter((c) => c !== category);
  if (cats.length) shelf.map[rel] = cats;
  else delete shelf.map[rel];
  void save();
}

/** Rimuove del tutto una cartella dallo scaffale (torna nell'albero). */
export function unshelveFolder(rel: string) {
  delete shelf.map[rel];
  void save();
}

/** Regola-per-nome: aggiunge tutte le cartelle chiamate `name` a una categoria. */
export function shelveByName(name: string, category: string) {
  const n = name.trim();
  const cat = category.trim();
  if (!n || !cat) return;
  const cats = new Set(shelf.byName[n] ?? []);
  cats.add(cat);
  shelf.byName[n] = [...cats];
  void save();
}

/** Toglie una regola-per-nome da una categoria (e la rimuove se era l'ultima). */
export function unshelveByNameCategory(name: string, category: string) {
  const cats = (shelf.byName[name] ?? []).filter((c) => c !== category);
  if (cats.length) shelf.byName[name] = cats;
  else delete shelf.byName[name];
  void save();
}

/** Rimuove del tutto una regola-per-nome (le cartelle tornano nell'albero). */
export function unshelveName(name: string) {
  delete shelf.byName[name];
  void save();
}

export function allCategories(): string[] {
  const s = new Set<string>();
  for (const cats of Object.values(shelf.map)) for (const c of cats) s.add(c);
  for (const cats of Object.values(shelf.byName)) for (const c of cats) s.add(c);
  return [...s].sort((a, b) => a.localeCompare(b));
}

/** Categorie con le rispettive cartelle (per percorso) e regole-per-nome (vista a fondo Esplora). */
export function byCategory(): ShelfCategory[] {
  return groupByCategory(shelf.map, shelf.byName);
}
