// Logica PURA dello scaffale: decisioni di nascondi/raggruppa a partire dai dati, senza runes né
// stato reattivo. Estratta da shelf.svelte.ts così è testabile con vitest senza compilare i runes
// (e separa la logica dalla persistenza). I dati arrivano come argomenti: la reattività resta a
// chi legge `shelf.map`/`shelf.byName` al call site.

export interface ShelfCategory {
  category: string;
  folders: string[]; // relPath messi nello scaffale per percorso
  names: string[]; // nomi con regola-per-nome
}

/** Una voce dell'albero (rel, separatori "/") è nascosta date le regole per-percorso (`map`) e per-nome
 *  (`byName`): se è nello scaffale, se è dentro una cartella che lo è, oppure se una delle sue CARTELLE
 *  coincide con un nome a regola (match case-insensitive, Windows). `isDir: false` = un file: il suo nome
 *  non conta per le regole per nome, che valgono per le cartelle (M72: una regola «logs» nascondeva
 *  anche un file chiamato `logs`). */
export function isHiddenIn(
  rel: string,
  map: Record<string, string[]>,
  byName: Record<string, string[]>,
  isDir = true,
): boolean {
  if (rel in map) return true;
  for (const key of Object.keys(map)) {
    if (rel.startsWith(key + "/")) return true;
  }
  const names = Object.keys(byName);
  if (names.length) {
    const ruled = new Set(names.map((n) => n.toLowerCase()));
    const segs = rel.split("/");
    if (!isDir) segs.pop();
    for (const seg of segs) {
      if (ruled.has(seg.toLowerCase())) return true;
    }
  }
  return false;
}

/** Voci dello scaffale, per il contatore della testata: cartelle e regole per nome (M72: prima contava
 *  solo le cartelle, e con le sole regole di «Shelve noise folders» mostrava 0). */
export function shelfCountIn(map: Record<string, string[]>, byName: Record<string, string[]>): number {
  return Object.keys(map).length + Object.keys(byName).length;
}

/** Il nome di una cartella è coperto da una regola-per-nome? (case-insensitive) */
export function isNameRuledIn(name: string, byName: Record<string, string[]>): boolean {
  const n = name.toLowerCase();
  return Object.keys(byName).some((k) => k.toLowerCase() === n);
}

/** Categorie con le rispettive cartelle (per percorso) e regole-per-nome, ordinate. */
export function groupByCategory(
  map: Record<string, string[]>,
  byName: Record<string, string[]>,
): ShelfCategory[] {
  const folders = new Map<string, string[]>();
  const names = new Map<string, string[]>();
  for (const [rel, cats] of Object.entries(map)) {
    for (const c of cats) (folders.get(c) ?? folders.set(c, []).get(c)!).push(rel);
  }
  for (const [name, cats] of Object.entries(byName)) {
    for (const c of cats) (names.get(c) ?? names.set(c, []).get(c)!).push(name);
  }
  const cats = new Set([...folders.keys(), ...names.keys()]);
  return [...cats]
    .sort((a, b) => a.localeCompare(b))
    .map((category) => ({
      category,
      folders: (folders.get(category) ?? []).sort(),
      names: (names.get(category) ?? []).sort((a, b) => a.localeCompare(b)),
    }));
}
