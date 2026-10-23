// Logica PURA dello scaffale: decisioni di nascondi/raggruppa a partire dai dati, senza runes né
// stato reattivo. Estratta da shelf.svelte.ts così è testabile con vitest senza compilare i runes
// (e separa la logica dalla persistenza). I dati arrivano come argomenti: la reattività resta a
// chi legge lo stato al call site.
//
// Le voci dello scaffale (M73):
//   - per PERCORSO: una cartella o un file preciso della repo (relativo alla radice, separatori "/");
//   - REGOLE per nome, per le cartelle (`folders`) o per i file (`files`): un nome esatto o un pattern con
//     `*` e `?`, senza distinzione fra maiuscole e minuscole. Le regole stanno nella repo (.orbit/shelf.json)
//     o valgono per tutte le repo (globali, su questo PC).
// Ogni voce ha una o più categorie.

/** Voci → categorie: percorso relativo, nome o pattern. */
export type RuleMap = Record<string, string[]>;
export type RuleKind = "folders" | "files";

/** Le regole di un ambito (la repo, o tutte le repo). */
export interface RuleSet {
  folders: RuleMap;
  files: RuleMap;
}

/** Il nome contiene `*` o `?`, quindi è un pattern e non un nome esatto. */
export const isPattern = (s: string) => /[*?]/.test(s);

/** Pattern con `*` (qualunque sequenza, anche vuota) e `?` (un carattere) → espressione regolare. */
function globRegex(pattern: string): RegExp {
  const body = pattern.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*").replace(/\?/g, ".");
  return new RegExp(`^${body}$`, "i");
}

/** Funzione che dice se un nome corrisponde a uno dei nomi o pattern dati (case-insensitive). */
export function nameMatcher(patterns: string[]): (name: string) => boolean {
  const exact = new Set<string>();
  const globs: RegExp[] = [];
  for (const p of patterns) {
    if (isPattern(p)) globs.push(globRegex(p));
    else exact.add(p.toLowerCase());
  }
  if (!exact.size && !globs.length) return () => false;
  return (name) => exact.has(name.toLowerCase()) || globs.some((g) => g.test(name));
}

/** Il nome corrisponde al pattern (o al nome) dato? */
export const matchesName = (pattern: string, name: string) => nameMatcher([pattern])(name);

export interface CompiledShelf {
  /** La voce `rel` (cartella se `isDir`, altrimenti file) è nello scaffale o dentro una cartella che lo è. */
  hidden(rel: string, isDir: boolean): boolean;
}

/**
 * Le regole compilate una volta sola: una voce è nascosta se è nello scaffale per percorso, se sta dentro
 * una cartella che lo è, se una delle cartelle che la contengono corrisponde a una regola per cartelle, o se
 * il suo nome corrisponde a una regola del suo tipo. Le regole per cartelle non toccano i file con lo stesso
 * nome (M72: una regola «logs» nascondeva anche un file chiamato `logs`), e viceversa.
 */
export function compileShelf(paths: RuleMap, scopes: RuleSet[]): CompiledShelf {
  const keys = Object.keys(paths);
  const exact = new Set(keys);
  const prefixes = keys.map((k) => k + "/");
  const folder = nameMatcher(scopes.flatMap((s) => Object.keys(s.folders)));
  const file = nameMatcher(scopes.flatMap((s) => Object.keys(s.files)));
  return {
    hidden(rel, isDir) {
      if (exact.has(rel)) return true;
      for (const p of prefixes) if (rel.startsWith(p)) return true;
      const segs = rel.split("/");
      const last = segs.pop() ?? "";
      for (const seg of segs) if (folder(seg)) return true;
      return isDir ? folder(last) : file(last);
    },
  };
}

/** Le sole voci che hanno almeno una delle categorie date (es. quelle escluse dalla ricerca). */
export function withCategories(map: RuleMap, cats: Set<string>): RuleMap {
  const out: RuleMap = {};
  for (const [k, v] of Object.entries(map)) if (v.some((c) => cats.has(c))) out[k] = v;
  return out;
}

/** Il nome è coperto da una regola che lo nomina esattamente (non da un pattern)? Per il picker. */
export function exactRuleFor(name: string, map: RuleMap): string | null {
  const n = name.toLowerCase();
  return Object.keys(map).find((k) => !isPattern(k) && k.toLowerCase() === n) ?? null;
}

/** Quante voci ha lo scaffale: percorsi e regole, della repo e globali. */
export function shelfCountIn(paths: RuleMap, scopes: RuleSet[]): number {
  return Object.keys(paths).length + scopes.reduce((n, s) => n + Object.keys(s.folders).length + Object.keys(s.files).length, 0);
}

export interface ShelfRule {
  pattern: string;
  kind: RuleKind;
  global: boolean;
}
export interface ShelfCategory {
  category: string;
  paths: string[]; // percorsi relativi messi nello scaffale
  rules: ShelfRule[]; // regole per nome (della repo e globali)
}

/** Categorie con i loro percorsi e le loro regole, in ordine alfabetico (le globali dopo le regole della repo). */
export function groupByCategory(paths: RuleMap, repo: RuleSet, global: RuleSet): ShelfCategory[] {
  const by = new Map<string, ShelfCategory>();
  const cat = (c: string) => by.get(c) ?? by.set(c, { category: c, paths: [], rules: [] }).get(c)!;
  for (const [rel, cats] of Object.entries(paths)) for (const c of cats) cat(c).paths.push(rel);
  for (const [scope, isGlobal] of [
    [repo, false],
    [global, true],
  ] as const) {
    for (const kind of ["folders", "files"] as const) {
      for (const [pattern, cats] of Object.entries(scope[kind])) for (const c of cats) cat(c).rules.push({ pattern, kind, global: isGlobal });
    }
  }
  const byName = (a: string, b: string) => a.localeCompare(b, undefined, { sensitivity: "base" });
  return [...by.values()]
    .sort((a, b) => byName(a.category, b.category))
    .map((c) => ({
      ...c,
      paths: c.paths.sort(byName),
      rules: c.rules.sort((a, b) => Number(a.global) - Number(b.global) || byName(a.pattern, b.pattern)),
    }));
}

/** Tutte le categorie usate, in ordine alfabetico. */
export function categoriesIn(maps: RuleMap[]): string[] {
  const s = new Set<string>();
  for (const m of maps) for (const cats of Object.values(m)) for (const c of cats) s.add(c);
  return [...s].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
}

/** La categoria `from` diventa `to` in ogni voce (senza doppioni se la voce le aveva tutte e due). */
export function renameCategoryIn(map: RuleMap, from: string, to: string): RuleMap {
  const out: RuleMap = {};
  for (const [k, v] of Object.entries(map)) out[k] = [...new Set(v.map((c) => (c === from ? to : c)))];
  return out;
}

/** Toglie la categoria da ogni voce; le voci rimaste senza categorie escono dallo scaffale. */
export function deleteCategoryIn(map: RuleMap, cat: string): RuleMap {
  const out: RuleMap = {};
  for (const [k, v] of Object.entries(map)) {
    const left = v.filter((c) => c !== cat);
    if (left.length) out[k] = left;
  }
  return out;
}

/** Normalizza un oggetto {voce: string[]} letto da un file: scarta valori non validi e categorie vuote. */
export function cleanRuleMap(src: unknown): RuleMap {
  const clean: RuleMap = {};
  if (src && typeof src === "object" && !Array.isArray(src)) {
    for (const [k, v] of Object.entries(src as Record<string, unknown>)) {
      if (!k.trim() || !Array.isArray(v)) continue;
      const cats = [...new Set(v.filter((x): x is string => typeof x === "string" && x.trim() !== ""))];
      if (cats.length) clean[k] = cats;
    }
  }
  return clean;
}
