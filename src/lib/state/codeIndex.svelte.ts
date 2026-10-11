// Indice dei simboli del progetto ("rubrica") per la navigazione del codice:
//  - Vai alla definizione (F12 / Ctrl+click)  - Simboli del progetto (Ctrl+T)  - cronologia (Alt+←/→).
// I simboli arrivano dal comando Rust `scan_symbols` (euristico, niente LSP); la rubrica è cache-ata
// in `.orbit/index/symbols.json` (git-ignored): si carica all'istante e si ri-scansiona in background.
import { untrack } from "svelte";
import { invoke } from "@tauri-apps/api/core";
import { workspace, openFileAt, editorStatus, activeFile, setBeforeNavigate } from "./workspace.svelte";
import { orbitPath } from "./dotorbit";
import { joinPath, samePath } from "../util";
import { notify } from "./toast.svelte";
import { getActiveEditor } from "../editor/activeEditor";
import { buildMaps, contextIn, defsIn, lensesIn, type CodeContext as Ctx, type Sym, type SymbolMaps } from "./symbolMaps";

export type ProjectSymbol = Sym; // isAbstract: tipo astratto (badge distinto nella barra dei correlati)
export type { LensItem, LensData } from "./symbolMaps";

// `symbols` e `refs` non sono reattivi in profondità (M62): fino a 50.000 simboli e decine di migliaia di
// conteggi, sostituiti a ogni scansione, diventavano tutti proxy di Svelte (decine di MB di heap e
// centinaia di MB di picco durante le modifiche a raffica). Si leggono e si rimpiazzano, mai modificati.
class CodeIndexState {
  symbols = $state.raw<ProjectSymbol[]>([]);
  // M60 (CodeLens): quante volte compare il nome di ogni simbolo nel progetto (da scan_symbols)
  refs = $state.raw<Record<string, number>>({});
  refsLoaded = $state(false);
  scanning = $state(false);
  loaded = $state(false);
}
export const codeIndex = new CodeIndexState();

// Palette "Simboli del progetto" (Ctrl+T). `pickLabel` != "" → modalità "lista fissa" (definizioni omonime,
// implementazioni, riferimenti), con `pickTitle` come segnaposto del campo.
export const wsPalette = $state({
  open: false,
  query: "",
  results: [] as ProjectSymbol[],
  total: 0, // quanti simboli combaciano in tutto (results è troncato a CAP) → mostra "+N ancora"
  index: 0,
  pickLabel: "",
  pickTitle: "",
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
// Le mappe (per file, per nome, conteggi, implementatori, insiemi semantici: symbolMaps.ts) si
// ricostruiscono a ogni cambio dell'indice; `semIndex.version` segnala a editor, lenti e barra dei
// correlati di rileggerle (le mappe non sono reattive: la versione sì).
let maps: SymbolMaps<ProjectSymbol> = buildMaps([]);
export const semIndex = $state({ version: 0 });
export function semSets(): { typeSet: Set<string>; funcSet: Set<string> } {
  return { typeSet: maps.typeSet, funcSet: maps.funcSet };
}

function rebuildSemSets() {
  // untrack: rebuildSemSets può essere chiamato da initIndex DENTRO un $effect; senza untrack la
  // lettura di codeIndex.symbols diventerebbe dipendenza dell'effetto che la scrive → loop.
  maps = buildMaps(untrack(() => codeIndex.symbols));
  semIndex.version++;
}

/** Il file ha simboli nell'indice? (reattivo ai cambi dell'indice) */
export function fileHasSymbols(relFile: string): boolean {
  void semIndex.version;
  return (maps.byFile.get(relFile)?.length ?? 0) > 0;
}

// ---- scan + cache ----------------------------------------------------------

/** Carica la cache (istantaneo) e poi ri-scansiona in background. Chiamato al cambio cartella. */
export async function initIndex() {
  // modalità leggera (M57): la cartella di un file sparso non si indicizza (né si scrive .orbit/index)
  if (!workspace.rootPath || workspace.light) {
    codeIndex.symbols = [];
    codeIndex.refs = {};
    codeIndex.refsLoaded = false;
    codeIndex.loaded = false;
    rebuildSemSets();
    return;
  }
  await loadCache();
  // quello che c'è ora viene dal disco (magari scritto da un'altra finestra): la prossima scansione deve
  // rimandare tutto, non solo ciò che è cambiato rispetto alla scansione precedente
  known = { root: "", symbols: null, refs: null };
  void rescan();
}

async function loadCache() {
  const p = orbitPath("index/symbols.json");
  if (!p) return;
  // conteggi PRIMA dei simboli: le lenti nascono già col numero, senza un secondo giro di layout
  const r = orbitPath("index/refs.json");
  try {
    const refs = r ? JSON.parse(await invoke<string>("read_file", { path: r })) : null;
    codeIndex.refs = refs && typeof refs === "object" && !Array.isArray(refs) ? refs : {};
    codeIndex.refsLoaded = !!refs;
  } catch {
    codeIndex.refs = {};
    codeIndex.refsLoaded = false; // cache delle versioni precedenti: arriva con la prima scansione
  }
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

// Versioni di simboli e conteggi che il frontend ha già (M62): il backend le confronta e manda solo ciò
// che è cambiato. Valgono per la cartella in cui sono state ricevute; altrove si riparte da zero.
let known = { root: "", symbols: null as string | null, refs: null as string | null };

export async function rescan() {
  const root = workspace.rootPath;
  if (!root || workspace.light) return;
  if (codeIndex.scanning) {
    scanPending = true; // scansione già in corso: ne faremo un'altra appena finisce (es. cambio cartella)
    return;
  }
  const token = ++scanToken;
  codeIndex.scanning = true;
  try {
    if (known.root !== root) known = { root, symbols: null, refs: null };
    const res = await invoke<{
      symbolsVersion: string;
      refsVersion: string;
      symbols: ProjectSymbol[] | null;
      refs: Record<string, number> | null;
    }>("scan_symbols", { root, knownSymbols: known.symbols, knownRefs: known.refs });
    if (token !== scanToken || workspace.rootPath !== root) return; // scan superato / cartella cambiata
    if (res.refs) {
      codeIndex.refs = res.refs;
      codeIndex.refsLoaded = true;
    }
    if (res.symbols) {
      codeIndex.symbols = res.symbols;
      codeIndex.loaded = true;
      rebuildSemSets();
      // se la palette "Simboli progetto" è aperta sulla rubrica live, rinfresca i risultati coi simboli
      // appena scansionati (prima restavano congelati all'apertura) e clampa la selezione: è l'unico
      // punto in cui i risultati cambiano sotto un indice fisso → evita una selezione fuori range.
      if (wsPalette.open && !wsPalette.source) {
        filterWs();
        if (wsPalette.index >= wsPalette.results.length) {
          wsPalette.index = Math.max(0, wsPalette.results.length - 1);
        }
      }
    }
    known = { root, symbols: res.symbolsVersion, refs: res.refsVersion };
    // la cache su disco (.orbit/index) la aggiorna il backend (M62)
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

// ---- CodeLens (M60): "N references · M implementations" sopra le dichiarazioni ----------------
// Riferimenti contati PER NOME in tutto il progetto, commenti e stringhe esclusi (niente LSP): con più
// dichiarazioni dello stesso nome (overload, override, proprietà omonime) il numero le somma tutte e lo
// si segna come approssimato. Implementazioni = tipi che lo dichiarano come base. Logica in symbolMaps.ts.

/** Lenti delle dichiarazioni del file `relFile` (relativo alla radice, separatori "/"). */
export function lensesFor(relFile: string) {
  return lensesIn(maps, codeIndex.refs, codeIndex.refsLoaded, relFile);
}

/** "N references": le occorrenze nella palette (Invio salta; Alt+← torna). Le dichiarazioni non contano. */
export async function openReferences(name: string) {
  const root = workspace.rootPath;
  if (!root) return;
  try {
    const hits = await invoke<{ file: string; line: number; text: string }[]>("ref_list", { root, name });
    const decl = new Set((maps.byName.get(name) ?? []).map((s) => `${s.file}:${s.line}`));
    const items: ProjectSymbol[] = hits
      .filter((h) => !decl.has(`${h.file}:${h.line}`))
      .map((h) => ({ name: h.text, kind: "ref", file: h.file, line: h.line, container: "", bases: [] }));
    if (!items.length) {
      notify(`No references to ${name}`, "info");
      return;
    }
    openPicker(name, items, `References to ${name} (${items.length}) — type to filter…`);
  } catch (e) {
    console.error("ref_list", e);
  }
}

/** "M implementations": i tipi che hanno `name` come base. */
export function openImplementations(name: string) {
  const syms = maps.implementersOf.get(name) ?? [];
  if (syms.length) showImplementers(name, syms);
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
  // sulla rubrica intera i nomi in minuscolo sono già pronti (maps.lower, allineato all'indice)
  const lower = source === codeIndex.symbols && maps.lower.length === source.length ? maps.lower : null;
  const scored: { s: ProjectSymbol; n: number }[] = [];
  for (let i = 0; i < source.length; i++) {
    const n = score(lower ? lower[i] : source[i].name.toLowerCase(), q);
    if (n >= 0) scored.push({ s: source[i], n });
  }
  scored.sort((a, b) => b.n - a.n);
  wsPalette.total = scored.length;
  wsPalette.results = scored.slice(0, CAP).map((x) => x.s);
}

/** Definizioni con nome ESATTO (per Vai alla definizione). */
export function defsFor(name: string): ProjectSymbol[] {
  return defsIn(maps, name);
}

// ---- contesto al cursore (barra dei "correlati", Fase 2) --------------------
export type CodeContext = Ctx<ProjectSymbol>;

/** Simbolo che contiene il cursore (nearest-preceding nel file) + correlati. null se vuoto. Reattivo ai
 *  cambi dell'indice (legge `semIndex.version`). */
export function contextAt(relFile: string, line: number): CodeContext | null {
  void semIndex.version;
  return contextIn(maps, relFile, line);
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
export function openPicker(label: string, syms: ProjectSymbol[], title = `Definitions of "${label}"…`) {
  wsPalette.pickLabel = label;
  wsPalette.pickTitle = title;
  wsPalette.source = syms;
  wsPalette.query = "";
  wsPalette.index = 0;
  filterWs();
  wsPalette.open = true;
}

/** Mostra gli implementatori di un tipo nella palette (dalla barra dei correlati). */
export function showImplementers(typeName: string, syms: ProjectSymbol[]) {
  if (syms.length === 1) void jumpTo(syms[0]);
  else openPicker(typeName, syms, `Implementations of ${typeName} (${syms.length})…`);
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
  if (cur && cur.kind === "file" && samePath(cur.path, target)) pushCurrent();
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
  if (!cur || samePath(cur.path, dest)) return; // niente attivo o stesso file → non è un "indietro" utile
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
