// Indice dei simboli del progetto ("rubrica") per la navigazione del codice:
//  - Vai alla definizione (F12 / Ctrl+click)  - Simboli del progetto (Ctrl+T)  - cronologia (Alt+←/→).
// I simboli arrivano dal comando Rust `scan_symbols` (euristico, niente LSP); la rubrica è cache-ata
// in `.orbit/index/symbols.json` (git-ignored): si carica all'istante e si ri-scansiona in background.
import { untrack } from "svelte";
import { invoke } from "@tauri-apps/api/core";
import { workspace, openFileAt, editorStatus, activeFile, setBeforeNavigate } from "./workspace.svelte";
import { orbitPath } from "./dotorbit";
import { joinPath } from "../util";
import { notify } from "./toast.svelte";
import { getActiveEditor } from "../editor/activeEditor";

export interface ProjectSymbol {
  name: string;
  kind: string;
  file: string; // relativo alla radice (separatori "/")
  line: number;
  container: string;
  bases: string[];
  isAbstract?: boolean; // tipo astratto (badge distinto nella barra dei correlati)
}

export const codeIndex = $state({
  symbols: [] as ProjectSymbol[],
  scanning: false,
  loaded: false,
});

// Palette "Simboli del progetto" (Ctrl+T). `pickLabel` != "" → modalità "scegli definizione".
export const wsPalette = $state({
  open: false,
  query: "",
  results: [] as ProjectSymbol[],
  total: 0, // quanti simboli combaciano in tutto (results è troncato a CAP) → mostra "+N ancora"
  index: 0,
  pickLabel: "",
  source: null as ProjectSymbol[] | null, // lista fissa (definizioni omonime / implementatori); null = tutti
});

const CAP = 500;
let scanToken = 0;
let scanPending = false; // una ri-scansione richiesta mentre un'altra è in corso (la eseguiamo dopo)

// ---- overlay semantico (colora identificatori = tipi/metodi noti, come VS) ------------------
// L'highlight di CodeMirror è solo lessicale (per C# è un parser legacy → tipi/metodi tuoi non
// colorati). Usiamo l'indice del progetto per colorare gli identificatori che corrispondono a un
// tipo (teal) o a una funzione/metodo (oro) noti. I Set sono ricostruiti a ogni cambio indice;
// `semIndex.version` segnala all'editor di ridisegnare le decorazioni.
const SEM_TYPE_KINDS = new Set(["class", "interface", "struct", "enum", "record", "trait", "type"]);
const SEM_FUNC_KINDS = new Set(["method", "function", "fn"]);
let typeSet = new Set<string>();
let funcSet = new Set<string>();
export const semIndex = $state({ version: 0 });
export function semSets(): { typeSet: Set<string>; funcSet: Set<string> } {
  return { typeSet, funcSet };
}
function rebuildSemSets() {
  const types = new Set<string>();
  const funcs = new Set<string>();
  // untrack: rebuildSemSets può essere chiamato da initIndex DENTRO un $effect; senza untrack la
  // lettura di codeIndex.symbols diventerebbe dipendenza dell'effetto che la scrive → loop.
  untrack(() => {
    for (const s of codeIndex.symbols) {
      if (s.name.length < 2) continue; // niente identificatori di 1 carattere (rumore)
      if (SEM_TYPE_KINDS.has(s.kind)) types.add(s.name);
      else if (SEM_FUNC_KINDS.has(s.kind)) funcs.add(s.name);
    }
  });
  typeSet = types;
  funcSet = funcs;
  semIndex.version++;
}

// ---- scan + cache ----------------------------------------------------------

/** Carica la cache (istantaneo) e poi ri-scansiona in background. Chiamato al cambio cartella. */
export async function initIndex() {
  if (!workspace.rootPath) {
    codeIndex.symbols = [];
    codeIndex.loaded = false;
    rebuildSemSets();
    return;
  }
  await loadCache();
  void rescan();
}

async function loadCache() {
  const p = orbitPath("index/symbols.json");
  if (!p) return;
  try {
    const arr = JSON.parse(await invoke<string>("read_file", { path: p }));
    if (Array.isArray(arr)) {
      codeIndex.symbols = arr;
      codeIndex.loaded = true;
      rebuildSemSets();
    }
  } catch {
    /* nessuna cache: si popola al primo scan */
  }
}

export async function rescan() {
  const root = workspace.rootPath;
  if (!root) return;
  if (codeIndex.scanning) {
    scanPending = true; // scansione già in corso: ne faremo un'altra appena finisce (es. cambio cartella)
    return;
  }
  const token = ++scanToken;
  codeIndex.scanning = true;
  try {
    const syms = await invoke<ProjectSymbol[]>("scan_symbols", { root });
    if (token !== scanToken || workspace.rootPath !== root) return; // scan superato / cartella cambiata
    codeIndex.symbols = syms;
    codeIndex.loaded = true;
    rebuildSemSets();
    void saveCache(root, syms);
  } catch (e) {
    console.error("scan_symbols", e);
  } finally {
    if (token === scanToken) codeIndex.scanning = false;
    if (scanPending) {
      scanPending = false;
      void rescan(); // riparte sulla cartella CORRENTE (può essere cambiata durante la scansione)
    }
  }
}

async function saveCache(root: string, syms: ProjectSymbol[]) {
  const dir = joinPath(joinPath(root, ".orbit"), "index");
  try {
    await invoke("create_dir", { path: dir });
    await invoke("write_file", { path: joinPath(dir, "symbols.json"), content: JSON.stringify(syms) });
  } catch (e) {
    console.error("cache simboli", e);
  }
}

let rescanTimer: ReturnType<typeof setTimeout> | undefined;
/** Ri-scansione debounced: chiamata su `fs-changed` per non scansionare a ogni singola modifica. */
export function scheduleRescan() {
  if (rescanTimer) clearTimeout(rescanTimer);
  rescanTimer = setTimeout(() => void rescan(), 800);
}

// ---- ricerca / definizioni -------------------------------------------------

/** Match: substring nel nome > sottosequenza; -1 se non corrisponde. */
function score(name: string, q: string): number {
  const i = name.indexOf(q);
  if (i >= 0) return 1000 - i - name.length * 0.1;
  let qi = 0;
  for (let k = 0; k < name.length && qi < q.length; k++) if (name[k] === q[qi]) qi++;
  return qi === q.length ? 200 - name.length * 0.1 : -1;
}

function filterWs() {
  const source = wsPalette.source ?? codeIndex.symbols;
  const q = wsPalette.query.trim().toLowerCase();
  if (!q) {
    wsPalette.total = source.length;
    wsPalette.results = source.slice(0, CAP);
    return;
  }
  const scored: { s: ProjectSymbol; n: number }[] = [];
  for (const s of source) {
    const n = score(s.name.toLowerCase(), q);
    if (n >= 0) scored.push({ s, n });
  }
  scored.sort((a, b) => b.n - a.n);
  wsPalette.total = scored.length;
  wsPalette.results = scored.slice(0, CAP).map((x) => x.s);
}

/** Definizioni con nome ESATTO (per Vai alla definizione). */
export function defsFor(name: string): ProjectSymbol[] {
  const n = name.toLowerCase();
  return codeIndex.symbols.filter((s) => s.name.toLowerCase() === n);
}

// ---- contesto al cursore (barra dei "correlati", Fase 2) --------------------
const TYPE_KINDS = ["class", "interface", "struct", "enum", "record", "trait"];
const isTypeKind = (k: string) => TYPE_KINDS.includes(k);

export interface CodeContext {
  path: { name: string; sym: ProjectSymbol }[]; // [tipo, (metodo)] — il simbolo che contiene il cursore
  bases: { name: string; def: ProjectSymbol | null }[]; // implementa/estende
  implementers: ProjectSymbol[]; // tipi che hanno questo come base
}

/** Simbolo che contiene il cursore (nearest-preceding nel file) + correlati. null se vuoto. */
export function contextAt(relFile: string, line: number): CodeContext | null {
  if (!relFile) return null;
  const inFile = codeIndex.symbols.filter((s) => s.file === relFile);
  if (!inFile.length) return null;
  let enclosing: ProjectSymbol | null = null;
  for (const s of inFile) if (s.line <= line && (!enclosing || s.line > enclosing.line)) enclosing = s;
  if (!enclosing) return null;
  const enc = enclosing;
  const onType = isTypeKind(enc.kind);
  const type = onType ? enc : (inFile.find((s) => s.name === enc.container && isTypeKind(s.kind)) ?? null);
  const path: { name: string; sym: ProjectSymbol }[] = [];
  if (type) path.push({ name: type.name, sym: type });
  if (!onType) path.push({ name: enc.name, sym: enc });
  if (!path.length) return null;
  const bases = (type?.bases ?? []).map((b) => ({ name: b, def: defsFor(b)[0] ?? null }));
  const implementers = type ? codeIndex.symbols.filter((s) => s.bases.includes(type.name)) : [];
  return { path, bases, implementers };
}

// ---- palette Ctrl+T --------------------------------------------------------
export function openWsPalette() {
  if (!workspace.rootPath) return;
  wsPalette.pickLabel = "";
  wsPalette.source = null;
  wsPalette.query = "";
  wsPalette.index = 0;
  wsPalette.open = true;
  filterWs();
}
export function closeWsPalette() {
  wsPalette.open = false;
}
export function setWsQuery(q: string) {
  wsPalette.query = q;
  wsPalette.index = 0;
  filterWs();
}
export function moveWs(delta: number) {
  const n = wsPalette.results.length;
  if (n) wsPalette.index = (wsPalette.index + delta + n) % n;
}
export function chooseWs() {
  const s = wsPalette.results[wsPalette.index];
  wsPalette.open = false;
  if (s) void jumpTo(s);
}

// ---- Vai alla definizione --------------------------------------------------
export async function goToDefinition(word: string) {
  if (!word) return;
  const defs = defsFor(word);
  if (defs.length === 0) {
    // a indice ancora in costruzione, "nessuna definizione" sarebbe fuorviante
    notify(
      codeIndex.scanning || !codeIndex.loaded ? "Indexing project symbols…" : `No definition for "${word}"`,
      "info",
    );
    return;
  }
  if (defs.length === 1) {
    await jumpTo(defs[0]);
    return;
  }
  // più definizioni con lo stesso nome → palette in modalità "scegli definizione"
  openPicker(word, defs);
}

/** Apre la palette su una LISTA FISSA di simboli (definizioni omonime, implementatori…). */
export function openPicker(label: string, syms: ProjectSymbol[]) {
  wsPalette.pickLabel = label;
  wsPalette.source = syms;
  wsPalette.query = "";
  wsPalette.index = 0;
  filterWs();
  wsPalette.open = true;
}

/** Mostra gli implementatori di un tipo nella palette (dalla barra dei correlati). */
export function showImplementers(typeName: string, syms: ProjectSymbol[]) {
  if (syms.length === 1) void jumpTo(syms[0]);
  else openPicker(`${typeName} — implementers`, syms);
}

/** Vai alla definizione della parola sotto il cursore dell'editor attivo (scorciatoia F12/Ctrl+B). */
export function goToDefinitionAtCursor() {
  const v = getActiveEditor();
  if (!v) return;
  const pos = v.state.selection.main.head;
  const w = v.state.wordAt(pos);
  if (w) void goToDefinition(v.state.sliceDoc(w.from, w.to));
}

export async function jumpTo(sym: ProjectSymbol) {
  const root = workspace.rootPath;
  if (!root) return;
  const target = joinPath(root, sym.file);
  const cur = activeFile();
  // cross-file: lo registra l'hook in openFile. Stesso file (l'hook lo salta) → registro qui.
  if (cur && cur.kind === "file" && cur.path === target) pushCurrent();
  await openFileAt(target, sym.line);
}

// ---- cronologia di navigazione (Alt+←/→) -----------------------------------
interface Pos {
  path: string;
  line: number;
}
const back: Pos[] = [];
const fwd: Pos[] = [];
let navigating = false; // true mentre navBack/navForward saltano → non ri-registrare quel movimento

// Conteggi REATTIVI delle due pile (gli array sono plain) → la TopBar accende/spegne le frecce.
export const nav = $state({ back: 0, fwd: 0 });
function syncNav() {
  nav.back = back.length;
  nav.fwd = fwd.length;
}

function currentPos(): Pos | null {
  const f = activeFile();
  if (!f || f.kind !== "file") return null;
  return { path: f.path, line: editorStatus.line || 1 };
}

/** Spinge la posizione corrente nella pila "indietro" (e azzera "avanti": è un nuovo ramo). */
function pushCurrent() {
  const p = currentPos();
  if (!p) return;
  back.push(p);
  if (back.length > 100) back.shift();
  fwd.length = 0;
  syncNav();
}

// Hook registrato in workspace: chiamato PRIMA di cambiare file/tab attivo (apertura, cambio tab, split).
function recordOnNavigate(dest: string) {
  if (navigating) return; // il movimento viene da navBack/navForward: non creare nuove voci
  const cur = currentPos();
  if (!cur || cur.path === dest) return; // niente attivo o stesso file → non è un "indietro" utile
  pushCurrent();
}
setBeforeNavigate(recordOnNavigate);

export function navBack() {
  const target = back.pop();
  if (!target) return;
  const cur = currentPos();
  if (cur) fwd.push(cur);
  syncNav();
  navigating = true; // sopprime la registrazione del salto (gira nel prefisso sync di openFileAt)
  void openFileAt(target.path, target.line);
  navigating = false;
}
export function navForward() {
  const target = fwd.pop();
  if (!target) return;
  const cur = currentPos();
  if (cur) back.push(cur);
  syncNav();
  navigating = true;
  void openFileAt(target.path, target.line);
  navigating = false;
}
