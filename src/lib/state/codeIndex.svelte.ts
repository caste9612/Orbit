// Indice dei simboli del progetto ("rubrica") per la navigazione del codice:
//  - Vai alla definizione (F12 / Ctrl+click)  - Simboli del progetto (Ctrl+T)  - cronologia (Alt+←/→).
// I simboli arrivano dal comando Rust `scan_symbols` (euristico, niente LSP); la rubrica è cache-ata
// in `.orbit/index/symbols.json` (git-ignored): si carica all'istante e si ri-scansiona in background.
import { invoke } from "@tauri-apps/api/core";
import { workspace, openFileAt, editorStatus, activeFile } from "./workspace.svelte";
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
  index: 0,
  pickLabel: "",
  source: null as ProjectSymbol[] | null, // lista fissa (definizioni omonime / implementatori); null = tutti
});

const CAP = 500;
let scanToken = 0;

// ---- scan + cache ----------------------------------------------------------

/** Carica la cache (istantaneo) e poi ri-scansiona in background. Chiamato al cambio cartella. */
export async function initIndex() {
  if (!workspace.rootPath) {
    codeIndex.symbols = [];
    codeIndex.loaded = false;
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
    }
  } catch {
    /* nessuna cache: si popola al primo scan */
  }
}

export async function rescan() {
  const root = workspace.rootPath;
  if (!root || codeIndex.scanning) return;
  const token = ++scanToken;
  codeIndex.scanning = true;
  try {
    const syms = await invoke<ProjectSymbol[]>("scan_symbols", { root });
    if (token !== scanToken || workspace.rootPath !== root) return; // scan superato / cartella cambiata
    codeIndex.symbols = syms;
    codeIndex.loaded = true;
    void saveCache(root, syms);
  } catch (e) {
    console.error("scan_symbols", e);
  } finally {
    if (token === scanToken) codeIndex.scanning = false;
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
    wsPalette.results = source.slice(0, CAP);
    return;
  }
  const scored: { s: ProjectSymbol; n: number }[] = [];
  for (const s of source) {
    const n = score(s.name.toLowerCase(), q);
    if (n >= 0) scored.push({ s, n });
  }
  scored.sort((a, b) => b.n - a.n);
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
    notify(`Nessuna definizione per "${word}"`, "info");
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
  recordNav(); // salva la posizione corrente prima di saltare
  await openFileAt(joinPath(root, sym.file), sym.line);
}

// ---- cronologia di navigazione (Alt+←/→) -----------------------------------
interface Pos {
  path: string;
  line: number;
}
const back: Pos[] = [];
const fwd: Pos[] = [];

function currentPos(): Pos | null {
  const f = activeFile();
  if (!f || f.kind !== "file") return null;
  return { path: f.path, line: editorStatus.line || 1 };
}
function recordNav() {
  const p = currentPos();
  if (!p) return;
  back.push(p);
  if (back.length > 100) back.shift();
  fwd.length = 0;
}
export function navBack() {
  const target = back.pop();
  if (!target) return;
  const cur = currentPos();
  if (cur) fwd.push(cur);
  void openFileAt(target.path, target.line);
}
export function navForward() {
  const target = fwd.pop();
  if (!target) return;
  const cur = currentPos();
  if (cur) back.push(cur);
  void openFileAt(target.path, target.line);
}
