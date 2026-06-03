// "Scaffale": cartelle messe da parte (marcate con una o più categorie) per togliere
// rumore dall'albero senza perderle. Persistito in `.orbit/shelf.json` (per-progetto,
// committabile, leggibile/modificabile anche da Claude). Mappa relPath -> [categorie].
import { invoke } from "@tauri-apps/api/core";
import { workspace } from "./workspace.svelte";
import { joinPath, relTo } from "../util";

export const shelf = $state({
  map: {} as Record<string, string[]>, // relPath (separatori "/") -> categorie
  loaded: false,
});

function shelfPath(): string | null {
  return workspace.rootPath ? joinPath(joinPath(workspace.rootPath, ".orbit"), "shelf.json") : null;
}

/** Percorso relativo alla radice, normalizzato con "/" (chiave dello scaffale). */
export function relOf(abs: string): string {
  return relTo(abs, workspace.rootPath);
}

/** Una cartella è nascosta dall'albero se è nello scaffale o è dentro una che lo è. */
export function isHidden(rel: string): boolean {
  if (rel in shelf.map) return true;
  for (const key of Object.keys(shelf.map)) {
    if (rel.startsWith(key + "/")) return true;
  }
  return false;
}

export async function loadShelf() {
  const p = shelfPath();
  if (!p) {
    shelf.map = {};
    shelf.loaded = false;
    return;
  }
  try {
    const raw = await invoke<string>("read_file", { path: p });
    const data = JSON.parse(raw);
    const src = data?.shelved && typeof data.shelved === "object" ? data.shelved : {};
    const clean: Record<string, string[]> = {};
    for (const [k, v] of Object.entries(src)) {
      if (Array.isArray(v)) {
        const cats = v.filter((x) => typeof x === "string");
        if (cats.length) clean[k] = cats;
      }
    }
    shelf.map = clean;
    shelf.loaded = true;
  } catch {
    shelf.map = {};
    shelf.loaded = false;
  }
}

async function save() {
  const root = workspace.rootPath;
  const p = shelfPath();
  if (!root || !p) return;
  try {
    await invoke("create_dir", { path: joinPath(root, ".orbit") }).catch(() => {});
    await invoke("write_file", {
      path: p,
      content: JSON.stringify({ shelved: shelf.map }, null, 2) + "\n",
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

export function allCategories(): string[] {
  const s = new Set<string>();
  for (const cats of Object.values(shelf.map)) for (const c of cats) s.add(c);
  return [...s].sort((a, b) => a.localeCompare(b));
}

/** Categorie con le rispettive cartelle (per la vista a fondo Esplora). */
export function byCategory(): { category: string; folders: string[] }[] {
  const m = new Map<string, string[]>();
  for (const [rel, cats] of Object.entries(shelf.map)) {
    for (const c of cats) {
      if (!m.has(c)) m.set(c, []);
      m.get(c)!.push(rel);
    }
  }
  return [...m.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([category, folders]) => ({ category, folders: folders.sort() }));
}
