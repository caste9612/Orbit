// "Scaffale": cartelle e file messi da parte per categoria, per togliere rumore dall'albero senza perderli.
// Le voci (vedi shelfRules.ts): percorsi della repo e regole per nome, per cartelle o per file, con `*` e `?`.
//   - della repo: `.orbit/shelf.json` (per-progetto, git-ignored, leggibile/modificabile anche da Claude);
//   - globali (M73): valgono in ogni repo, stanno su questo PC (localStorage, come le impostazioni);
//   - i metadati delle categorie (colore, fuori dalla ricerca) sono globali: «Config» è la stessa ovunque.
import { invoke } from "@tauri-apps/api/core";
import { workspace } from "./workspace.svelte";
import { notify } from "./toast.svelte";
import { joinPath, relTo } from "../util";
import {
  categoriesIn,
  cleanRuleMap,
  compileShelf,
  deleteCategoryIn,
  exactRuleFor,
  groupByCategory,
  matchesName,
  renameCategoryIn,
  shelfCountIn,
  withCategories,
  type CompiledShelf,
  type RuleKind,
  type RuleMap,
  type RuleSet,
  type ShelfCategory,
} from "./shelfRules";

export interface CategoryMeta {
  color?: string; // pallino sulla categoria e sulle sue voci
  hideFromSearch?: boolean; // le sue voci escono anche da ricerca e Quick Open
}

const GLOBAL_STORE = "orbit.shelf";
const UI_STORE = "orbit.shelfUi";

/** Voci della repo aperta (.orbit/shelf.json). */
export const shelf = $state({
  paths: {} as RuleMap, // relPath (separatori "/") di cartelle o file -> categorie
  folders: {} as RuleMap, // nome o pattern -> categorie: TUTTE le cartelle che corrispondono (anche annidate o ricreate, es. bin/obj C#)
  files: {} as RuleMap, // nome o pattern -> categorie: tutti i file che corrispondono (M73)
  loaded: false,
});

interface GlobalShelf extends RuleSet {
  categories: Record<string, CategoryMeta>;
}

function loadGlobal(): GlobalShelf {
  try {
    const v = JSON.parse(localStorage.getItem(GLOBAL_STORE) ?? "{}");
    const cats: Record<string, CategoryMeta> = {};
    if (v?.categories && typeof v.categories === "object") {
      for (const [k, m] of Object.entries(v.categories as Record<string, CategoryMeta>)) {
        if (!m || typeof m !== "object") continue;
        cats[k] = { ...(typeof m.color === "string" ? { color: m.color } : {}), ...(m.hideFromSearch ? { hideFromSearch: true } : {}) };
      }
    }
    return { folders: cleanRuleMap(v?.folders), files: cleanRuleMap(v?.files), categories: cats };
  } catch {
    return { folders: {}, files: {}, categories: {} };
  }
}

/** Regole valide in ogni repo e metadati delle categorie (su questo PC). */
export const shelfGlobal = $state(loadGlobal());

/** Cosa è aperto nella sezione Shelf, l'altezza scelta col separatore e l'occhio: a livello di modulo, così
 *  sopravvive al rimontaggio della vista (M72), e su questo PC, così sopravvive al riavvio (M73). */
function loadUi() {
  const ui = {
    collapsed: false,
    cats: {} as Record<string, boolean>, // categorie aperte
    rules: {} as Record<string, boolean>, // regole aperte sull'elenco di ciò che prendono (matchKey)
    height: null as number | null,
    peek: false,
  };
  try {
    const v = JSON.parse(localStorage.getItem(UI_STORE) ?? "{}");
    if (typeof v.collapsed === "boolean") ui.collapsed = v.collapsed;
    if (v.cats && typeof v.cats === "object") for (const [k, b] of Object.entries(v.cats)) if (b === true) ui.cats[k] = true;
    if (v.rules && typeof v.rules === "object") for (const [k, b] of Object.entries(v.rules)) if (b === true) ui.rules[k] = true;
    if (typeof v.height === "number" && v.height > 0) ui.height = v.height;
    if (typeof v.peek === "boolean") ui.peek = v.peek;
  } catch {
    /* storage non disponibile: i default */
  }
  return ui;
}
export const shelfUi = $state(loadUi());

function saveUi() {
  try {
    localStorage.setItem(UI_STORE, JSON.stringify(shelfUi));
  } catch {
    /* storage non disponibile: vale fino alla chiusura */
  }
}
export function setShelfCollapsed(on: boolean) {
  shelfUi.collapsed = on;
  saveUi();
}
export function toggleShelfCategory(cat: string) {
  if (shelfUi.cats[cat]) delete shelfUi.cats[cat];
  else shelfUi.cats[cat] = true;
  saveUi();
}
export function toggleShelfRule(key: string) {
  if (shelfUi.rules[key]) delete shelfUi.rules[key];
  else shelfUi.rules[key] = true;
  saveUi();
}
/** Altezza della sezione scelta col separatore (null = automatica, al massimo il 45%). */
export function setShelfHeight(px: number | null) {
  shelfUi.height = px;
  saveUi();
}
/** L'occhio: le voci dello scaffale si vedono anche nell'albero, al loro posto e in grigio (M73). */
export function setShelfPeek(on: boolean) {
  shelfUi.peek = on;
  saveUi();
}

// le scelte fatte in un'altra finestra arrivano anche qui
window.addEventListener("storage", (e) => {
  if (e.key === GLOBAL_STORE) {
    Object.assign(shelfGlobal, loadGlobal());
    bump();
  } else if (e.key === UI_STORE) Object.assign(shelfUi, loadUi());
});

// ---- regole compilate --------------------------------------------------------------------------
// Un contatore che cresce a ogni modifica: chi legge isHidden ne dipende (e si ricalcola), e le regole si
// compilano una volta per versione invece che a ogni riga dell'albero.
const rev = $state({ n: 0 });
function bump() {
  rev.n++;
  scheduleShelfScan();
}
let cache: { n: number; all: CompiledShelf; search: CompiledShelf } | null = null;
function compiled() {
  const n = rev.n;
  if (cache?.n !== n) {
    const hiddenCats = new Set(Object.entries(shelfGlobal.categories).filter(([, m]) => m.hideFromSearch).map(([c]) => c));
    const only = (m: RuleMap) => withCategories(m, hiddenCats);
    cache = {
      n,
      all: compileShelf(shelf.paths, [shelf, shelfGlobal]),
      search: compileShelf(only(shelf.paths), [
        { folders: only(shelf.folders), files: only(shelf.files) },
        { folders: only(shelfGlobal.folders), files: only(shelfGlobal.files) },
      ]),
    };
  }
  return cache;
}

/** Percorso relativo alla radice, normalizzato con "/" (chiave dello scaffale). */
export function relOf(abs: string): string {
  return relTo(abs, workspace.rootPath);
}

/** La voce `rel` (cartella se `isDir`, altrimenti file) è nello scaffale, per percorso o per una regola. */
export function isHidden(rel: string, isDir = true): boolean {
  return compiled().all.hidden(rel, isDir);
}

/** La voce sta in una categoria esclusa da ricerca e Quick Open (M73)? */
export function hiddenFromSearch(rel: string, isDir = false): boolean {
  return compiled().search.hidden(rel, isDir);
}

/** Colore della categoria con cui la voce `rel` è nello scaffale, per percorso o per una regola sul suo
 *  nome (per il pallino delle voci viste al loro posto con l'occhio); null se non ne ha. */
export function colorOf(rel: string, isDir: boolean): string | null {
  void rev.n;
  const name = rel.slice(rel.lastIndexOf("/") + 1);
  const cats = [
    ...(shelf.paths[rel] ?? []),
    ...[shelf, shelfGlobal].flatMap((s) =>
      Object.entries(s[isDir ? "folders" : "files"])
        .filter(([p]) => matchesName(p, name))
        .flatMap(([, cs]) => cs),
    ),
  ];
  for (const c of cats) if (shelfGlobal.categories[c]?.color) return shelfGlobal.categories[c].color!;
  return null;
}

/** La regola esatta (non un pattern) per questo nome, se c'è: della repo o globale. Per il picker. */
export function exactRule(kind: RuleKind, name: string): { pattern: string; global: boolean } | null {
  void rev.n;
  const repo = exactRuleFor(name, shelf[kind]);
  if (repo) return { pattern: repo, global: false };
  const glob = exactRuleFor(name, shelfGlobal[kind]);
  return glob ? { pattern: glob, global: true } : null;
}

/** Categorie di una voce. */
export function categoriesOf(entry: { kind: "paths" | RuleKind; key: string; global?: boolean }): string[] {
  void rev.n;
  const scope = entry.kind === "paths" ? shelf.paths : (entry.global ? shelfGlobal : shelf)[entry.kind];
  return scope[entry.key] ?? [];
}

// ---- lettura e scrittura ----------------------------------------------------------------------

function shelfPath(): string | null {
  return workspace.rootPath ? joinPath(joinPath(workspace.rootPath, ".orbit"), "shelf.json") : null;
}

export async function loadShelf() {
  const p = shelfPath();
  let data: { shelved?: unknown; byName?: unknown; files?: unknown } | null = null;
  if (p) {
    try {
      data = JSON.parse(await invoke<string>("read_file", { path: p }));
    } catch {
      data = null;
    }
  }
  shelf.paths = cleanRuleMap(data?.shelved);
  shelf.folders = cleanRuleMap(data?.byName);
  shelf.files = cleanRuleMap(data?.files);
  shelf.loaded = !!data;
  bump();
}

async function save() {
  const root = workspace.rootPath;
  const p = shelfPath();
  if (!root || !p) return;
  try {
    await invoke("create_dir", { path: joinPath(root, ".orbit") }).catch(() => {});
    // `shelved` e `byName` come prima della M73, così le versioni precedenti continuano a leggerle
    const data: Record<string, RuleMap> = { shelved: shelf.paths, byName: shelf.folders };
    if (Object.keys(shelf.files).length) data.files = shelf.files;
    await invoke("write_file", { path: p, content: JSON.stringify(data, null, 2) + "\n" });
  } catch (e) {
    console.error("shelf save", e);
  }
}

function saveGlobal() {
  try {
    localStorage.setItem(GLOBAL_STORE, JSON.stringify(shelfGlobal));
  } catch {
    /* storage non disponibile: le regole globali valgono fino alla chiusura */
  }
}

// ---- Undo (M73) -------------------------------------------------------------------------------
// Ogni azione sullo scaffale mostra un avviso con «Undo», che rimette tutto com'era prima.

interface Snapshot {
  repo: { paths: RuleMap; folders: RuleMap; files: RuleMap };
  global: GlobalShelf;
}
const copy = <T,>(x: T): T => JSON.parse(JSON.stringify(x));
function snapshot(): Snapshot {
  return { repo: copy({ paths: shelf.paths, folders: shelf.folders, files: shelf.files }), global: copy(shelfGlobal) };
}
function restore(s: Snapshot) {
  Object.assign(shelf, s.repo);
  Object.assign(shelfGlobal, s.global);
  bump();
  void save();
  saveGlobal();
}

/** Esegue `change` (che modifica le voci), salva e mostra `message` con «Undo». */
function act(message: string, change: () => void, touches: { repo?: boolean; global?: boolean } = { repo: true }) {
  const before = snapshot();
  change();
  bump();
  if (touches.repo) void save();
  if (touches.global) saveGlobal();
  notify(message, "success", 5000, { key: "shelf", action: { label: "Undo", run: () => restore(before) } });
}

const quote = (s: string) => `“${s}”`;
const ruleLabel = (kind: RuleKind, pattern: string) => `every ${kind === "folders" ? "folder" : "file"} matching ${quote(pattern)}`;

function addCat(map: RuleMap, key: string, cat: string) {
  map[key] = [...new Set([...(map[key] ?? []), cat])];
}
function dropCat(map: RuleMap, key: string, cat: string) {
  const left = (map[key] ?? []).filter((c) => c !== cat);
  if (left.length) map[key] = left;
  else delete map[key];
}

// ---- azioni: voci per percorso ------------------------------------------------------------------

/** Mette una cartella o un file (percorso assoluto) in una categoria. */
export function shelvePath(abs: string, category: string) {
  const rel = relOf(abs);
  const cat = category.trim();
  if (!rel || !cat) return;
  act(`Shelved ${quote(rel)} in ${cat}`, () => addCat(shelf.paths, rel, cat));
}

/** Toglie una voce per percorso da una categoria (e dallo scaffale se era l'ultima). */
export function unshelvePathCategory(rel: string, category: string) {
  const last = (shelf.paths[rel] ?? []).length <= 1;
  act(last ? `Removed ${quote(rel)} from the shelf` : `Removed ${quote(rel)} from ${category}`, () => dropCat(shelf.paths, rel, category));
}

/** Toglie del tutto una voce per percorso (torna nell'albero). */
export function unshelvePath(rel: string) {
  act(`Removed ${quote(rel)} from the shelf`, () => delete shelf.paths[rel]);
}

// ---- azioni: regole per nome --------------------------------------------------------------------

/** Aggiunge una categoria a una regola per nome (della repo o, con `global`, di ogni repo). */
export function shelveRule(kind: RuleKind, pattern: string, category: string, global = false) {
  const p = pattern.trim();
  const cat = category.trim();
  if (!p || !cat) return;
  act(
    `Shelved ${ruleLabel(kind, p)} in ${cat}${global ? ", in every repository" : ""}`,
    () => addCat((global ? shelfGlobal : shelf)[kind], p, cat),
    global ? { global: true } : { repo: true },
  );
}

export function unshelveRuleCategory(kind: RuleKind, pattern: string, category: string, global = false) {
  act(
    `Removed ${quote(pattern)} from ${category}`,
    () => dropCat((global ? shelfGlobal : shelf)[kind], pattern, category),
    global ? { global: true } : { repo: true },
  );
}

/** Toglie del tutto una regola (le cartelle o i file tornano nell'albero). */
export function unshelveRule(kind: RuleKind, pattern: string, global = false) {
  act(
    `Removed the rule ${quote(pattern)}${global ? " from every repository" : ""}`,
    () => delete (global ? shelfGlobal : shelf)[kind][pattern],
    global ? { global: true } : { repo: true },
  );
}

/** Sposta una regola fra la repo e tutte le repo, con le sue categorie. */
export function setRuleGlobal(kind: RuleKind, pattern: string, global: boolean) {
  const from = (global ? shelf : shelfGlobal)[kind];
  const to = (global ? shelfGlobal : shelf)[kind];
  const cats = from[pattern];
  if (!cats) return;
  act(
    global ? `${quote(pattern)} now applies to every repository` : `${quote(pattern)} now applies to this repository only`,
    () => {
      for (const c of cats) addCat(to, pattern, c);
      delete from[pattern];
    },
    { repo: true, global: true },
  );
}

/** Cartelle «rumore» che *Shelve noise folders* mette nello scaffale, in ogni repo (M73: prima nella repo,
 *  in una categoria «Generato»). */
export const NOISE = ["node_modules", "target", "dist", ".git"];

export function shelveNoise() {
  act(
    "Shelved node_modules, target, dist and .git in Generated, in every repository",
    () => {
      for (const nm of NOISE) addCat(shelfGlobal.folders, nm, "Generated");
    },
    { global: true },
  );
}

/** *Shelve dot-folders* (M73): una regola `.*` per tutte le cartelle col punto, in ogni repo, in Config. */
export function shelveDotFolders() {
  act("Shelved every folder starting with a dot in Config, in every repository", () => addCat(shelfGlobal.folders, ".*", "Config"), {
    global: true,
  });
}

// ---- azioni: categorie (M73) --------------------------------------------------------------------

export function categoryMeta(cat: string): CategoryMeta {
  return shelfGlobal.categories[cat] ?? {};
}

/** Rinomina una categoria ovunque (repo, regole globali, colore). Se il nome c'è già, le due si fondono. */
export function renameCategory(from: string, to: string) {
  const name = to.trim();
  if (!name || name === from) return;
  act(
    `Renamed ${quote(from)} to ${quote(name)}`,
    () => {
      shelf.paths = renameCategoryIn(shelf.paths, from, name);
      shelf.folders = renameCategoryIn(shelf.folders, from, name);
      shelf.files = renameCategoryIn(shelf.files, from, name);
      shelfGlobal.folders = renameCategoryIn(shelfGlobal.folders, from, name);
      shelfGlobal.files = renameCategoryIn(shelfGlobal.files, from, name);
      const meta = shelfGlobal.categories[from];
      if (meta) {
        shelfGlobal.categories[name] = { ...meta, ...shelfGlobal.categories[name] };
        delete shelfGlobal.categories[from];
      }
      if (shelfUi.cats[from]) {
        shelfUi.cats[name] = true;
        delete shelfUi.cats[from];
        saveUi();
      }
    },
    { repo: true, global: true },
  );
}

/** Elimina una categoria: le voci che non ne hanno altre tornano nell'albero (anche le regole globali). */
export function deleteCategory(cat: string) {
  act(
    `Deleted the category ${quote(cat)}`,
    () => {
      shelf.paths = deleteCategoryIn(shelf.paths, cat);
      shelf.folders = deleteCategoryIn(shelf.folders, cat);
      shelf.files = deleteCategoryIn(shelf.files, cat);
      shelfGlobal.folders = deleteCategoryIn(shelfGlobal.folders, cat);
      shelfGlobal.files = deleteCategoryIn(shelfGlobal.files, cat);
      delete shelfGlobal.categories[cat];
    },
    { repo: true, global: true },
  );
}

/** Le voci della categoria sono anche fuori dalla repo, cioè regole globali? (per avvisare prima di eliminarla) */
export function categoryIsGlobal(cat: string): boolean {
  void rev.n;
  return [shelfGlobal.folders, shelfGlobal.files].some((m) => Object.values(m).some((cs) => cs.includes(cat)));
}

function setMeta(cat: string, patch: CategoryMeta) {
  const next = { ...shelfGlobal.categories[cat], ...patch };
  if (!next.color) delete next.color;
  if (!next.hideFromSearch) delete next.hideFromSearch;
  if (Object.keys(next).length) shelfGlobal.categories[cat] = next;
  else delete shelfGlobal.categories[cat];
  bump();
  saveGlobal();
}
/** Colore della categoria (null = nessuno). */
export function setCategoryColor(cat: string, color: string | null) {
  setMeta(cat, { color: color ?? undefined });
}
/** Le voci della categoria escono (o rientrano) in ricerca e Quick Open. */
export function setCategoryHiddenFromSearch(cat: string, on: boolean) {
  setMeta(cat, { hideFromSearch: on });
  notify(on ? `${cat} is now hidden from search and Quick Open` : `${cat} is back in search and Quick Open`, "info", 2600);
}

// ---- elenchi per la UI ----------------------------------------------------------------------------

export function allCategories(): string[] {
  void rev.n;
  return categoriesIn([shelf.paths, shelf.folders, shelf.files, shelfGlobal.folders, shelfGlobal.files]);
}

/** Categorie con i loro percorsi e le loro regole (sezione in fondo all'Explorer). */
export function byCategory(): ShelfCategory[] {
  void rev.n;
  return groupByCategory(shelf.paths, shelf, shelfGlobal);
}

/** Voci dello scaffale (percorsi e regole, della repo e globali), per il contatore della testata. */
export function shelfCount(): number {
  void rev.n;
  return shelfCountIn(shelf.paths, [shelf, shelfGlobal]);
}

// ---- cosa prendono le regole (M73) ---------------------------------------------------------------
// «bin — 12 folders»: le voci della repo prese da ogni regola, cercate dal backend (shelf_find) quando le
// regole cambiano e dopo i cambi su disco.

export interface ShelfMatchList {
  rels: string[];
  capped: boolean; // il backend si è fermato al massimo per regola
}
export const shelfMatches = $state({ byRule: {} as Record<string, ShelfMatchList>, root: null as string | null });
export const matchKey = (kind: RuleKind, pattern: string) => `${kind}\n${pattern}`;

let scanTimer: ReturnType<typeof setTimeout> | undefined;
let scanning = false;
let scanAgain = false;

/** Rilegge le voci prese dalle regole, poco dopo l'ultima richiesta (i cambi su disco arrivano a raffiche). */
export function scheduleShelfScan(delay = 400) {
  clearTimeout(scanTimer);
  scanTimer = setTimeout(() => void scanShelf(), delay);
}

async function scanShelf() {
  if (scanning) {
    scanAgain = true;
    return;
  }
  const root = workspace.rootPath;
  const folders = [...new Set([...Object.keys(shelf.folders), ...Object.keys(shelfGlobal.folders)])];
  const files = [...new Set([...Object.keys(shelf.files), ...Object.keys(shelfGlobal.files)])];
  if (!root || workspace.light || (!folders.length && !files.length)) {
    shelfMatches.byRule = {};
    shelfMatches.root = root;
    return;
  }
  scanning = true;
  try {
    const found = await invoke<{ pattern: string; kind: RuleKind; rel: string }[]>("shelf_find", { root, folders, files });
    if (root !== workspace.rootPath) return; // cambio repo nel frattempo: ci pensa la prossima
    const byRule: Record<string, ShelfMatchList> = {};
    for (const m of found) (byRule[matchKey(m.kind, m.pattern)] ??= { rels: [], capped: false }).rels.push(m.rel);
    for (const l of Object.values(byRule)) l.capped = l.rels.length >= 500;
    shelfMatches.byRule = byRule;
    shelfMatches.root = root;
  } catch (e) {
    console.error("shelf_find", e);
  } finally {
    scanning = false;
    if (scanAgain) {
      scanAgain = false;
      scheduleShelfScan();
    }
  }
}
