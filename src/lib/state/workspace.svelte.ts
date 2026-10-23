// Stato del workspace: cartella aperta, documenti aperti (pool) e gruppi editor affiancati
// (split view, stile VS Code). Ogni gruppo ha le sue tab e il suo file attivo; lo stesso
// documento può vivere in più gruppi (contenuto/dirty condivisi dal pool `openFiles`).
import { invoke } from "@tauri-apps/api/core";
import { basename, assetKind, normSlash, canonPath, samePath, isUnder, pathKey } from "../util";
import { notify } from "./toast.svelte";
import { settings } from "./settings.svelte";
import { nextActive } from "./editorTabs";
import { flatten, insertPane, reconcile, shapeOf, validSizes, type Layout, type PaneSizes, type Side } from "./paneLayout";

// Hook cronologia di navigazione (indietro/avanti): codeIndex registra qui una funzione che salva
// la posizione CORRENTE prima che cambi il file/tab attivo. `dest` = path di destinazione (per non
// registrare i "non-movimenti", es. riattivare il file già attivo). Niente import di codeIndex →
// nessun ciclo. Chiamato in modo SINCRONO (prima di ogni await) dai punti di navigazione sotto.
let beforeNav: ((dest: string) => void) | null = null;
export function setBeforeNavigate(fn: (dest: string) => void) {
  beforeNav = fn;
}

/** Anteprima iniziale per un documento: solo per i markdown, secondo l'impostazione `mdMode`. */
function initialPreview(name: string): boolean {
  if (!/\.(md|markdown)$/i.test(name)) return false; // l'anteprima ha senso solo sui markdown
  if (settings.mdMode === "preview") return true;
  if (settings.mdMode === "source") return false;
  return /^readme\.(md|markdown)$/i.test(name); // "readme": anteprima per i soli README
}

export interface OpenFile {
  path: string; // chiave univoca del documento (per i diff è un id sintetico)
  name: string;
  content: string;
  dirty: boolean;
  readonly: boolean;
  kind: "file" | "diff" | "image" | "pdf" | "activity" | "gitgraph"; // image/pdf: viewer; activity/gitgraph: board area editor
  rev: number; // incrementa al reload esterno → l'editor rimpiazza il doc
  externallyChanged: boolean; // modificato su disco con edit non salvati (conflitto)
  gotoLine: number | null; // riga a cui saltare (da ricerca)
  diskRev: number; // incrementa quando il DISCO cambia (save o reload esterno) → l'anteprima HTML ricarica l'iframe
}

/** Un gruppo editor = un riquadro dell'editor diviso con le sue tab e il file attivo. Dove sta il riquadro
 *  (colonne di righe) lo dice `workspace.groupLayout` (M72). */
export interface EditorGroup {
  id: string;
  tabs: string[]; // path dei documenti, in ordine di visualizzazione
  activePath: string | null;
  previews: string[]; // tab mostrate in ANTEPRIMA (md/html) in QUESTO gruppo: per-gruppo, non
  // per-documento, così lo stesso file può stare sorgente in un riquadro e anteprima in un altro
}

// Posizione nei file (M66): cursore e prima riga in vista, per scheda (gruppo + file), così cambiando
// scheda o riaprendo Orbit si torna dove eri (prima l'editor ripartiva dall'inizio a ogni cambio di scheda).
// Fuori dallo stato reattivo: cursore e scroll cambiano di continuo e non devono far ripartire effetti; la
// sessione li legge quando si salva. `top` è la posizione del primo carattere della riga in cima.
export interface ViewPos {
  anchor: number;
  head: number;
  top: number;
}
const viewByTab = new Map<string, ViewPos>();
const viewByPath = new Map<string, ViewPos>(); // ultima del file in qualunque gruppo: per un file riaperto o spostato
const tabKey = (groupId: string, path: string) => `${groupId}\n${path}`;

export function rememberView(groupId: string, path: string, v: ViewPos) {
  viewByTab.set(tabKey(groupId, path), v);
  viewByPath.delete(path); // in fondo = la più recente
  viewByPath.set(path, v);
  if (viewByPath.size > 300) viewByPath.delete(viewByPath.keys().next().value!);
}
export function recallView(groupId: string, path: string): ViewPos | null {
  return viewByTab.get(tabKey(groupId, path)) ?? viewByPath.get(path) ?? null;
}
/** Solo la posizione di QUESTA scheda (per la sessione). */
export function tabView(groupId: string, path: string): ViewPos | null {
  return viewByTab.get(tabKey(groupId, path)) ?? null;
}

/** Massimo di gruppi dell'editor diviso (M72): oltre, ogni riquadro diventa troppo piccolo per lavorarci. */
export const MAX_GROUPS = 6;

let groupCounter = 0;
function newGroupId(): string {
  groupCounter += 1;
  return `grp-${groupCounter}`;
}

export const workspace = $state({
  rootPath: null as string | null,
  rootName: null as string | null,
  branch: null as string | null,
  openFiles: [] as OpenFile[], // pool dei documenti aperti
  groups: [] as EditorGroup[], // gruppi editor affiancati (0..N)
  activeGroupId: "" as string,
  // Editor diviso in righe e colonne (M72), con il modello dei riquadri del terminale (paneLayout.ts): id
  // dei gruppi per colonna, e le dimensioni trascinate (null = uguali). Chi la legge la allinea ai gruppi
  // con `groupLayout()`; prima della M72 i gruppi erano solo colonne uguali, in ordine.
  groupLayout: [] as Layout,
  groupSizes: null as PaneSizes | null,
  ready: false, // true a sessione caricata (es. terminale di default attende questo)
  // cambio cartella in corso (persist.switchFolder): rootPath è null per qualche decina di ms, ma la
  // UI NON deve mostrare gli stati "nessuna cartella" (lampeggio del bottone "Open folder…")
  switching: false,
  // Modalità leggera (M57): finestra aperta su un FILE sparso ("Apri con", doppio clic). La cartella del
  // file fa da contesto e NON da progetto: niente .orbit/.claude scritti, niente indice dei simboli né
  // Claude né osservazione ricorsiva, niente sessione né lista repo né "riapri tutte". "Open … as
  // project" (persist.promoteLight) la trasforma in un progetto normale.
  light: false,
  lightProject: null as string | null, // repo git che contiene il file: la cartella proposta dal bottone
});

/** Posizione del cursore nell'editor attivo (per la status bar). */
export const editorStatus = $state({ line: 1, col: 1 });

// ---- lookup ---------------------------------------------------------------

export function fileByPath(path: string): OpenFile | undefined {
  // prima il confronto esatto (le schede usano il percorso del documento), poi lo stesso file scritto
  // con altri separatori o maiuscole (M59)
  return workspace.openFiles.find((f) => f.path === path) ?? workspace.openFiles.find((f) => samePath(f.path, path));
}

/** Percorso con cui un file entra nel workspace: quello del documento già aperto, se c'è, altrimenti la
 *  forma canonica. Così lo stesso file non diventa mai due documenti (salvarne uno calpestava l'altro). */
function docPath(path: string): string {
  return fileByPath(path)?.path ?? canonPath(path);
}

export function activeGroup(): EditorGroup | undefined {
  return workspace.groups.find((g) => g.id === workspace.activeGroupId) ?? workspace.groups[0];
}

/** Documento attivo del gruppo attivo (reattivo se usato dentro $derived). */
export function activeFile(): OpenFile | undefined {
  const p = activeGroup()?.activePath;
  return p ? fileByPath(p) : undefined;
}

/** Path del documento globalmente attivo (per le decorazioni dell'albero). */
export function activePath(): string | null {
  return activeGroup()?.activePath ?? null;
}

function groupById(id: string): EditorGroup | undefined {
  return workspace.groups.find((g) => g.id === id);
}

/** Disposizione dei gruppi, allineata ai gruppi che esistono (i nuovi senza posto vanno in coda). */
export function groupLayout(): Layout {
  return reconcile(workspace.groupLayout, workspace.groups.map((g) => g.id));
}

/** Nuova disposizione dei gruppi; se cambia forma, le dimensioni trascinate non valgono più. */
function setGroupLayout(next: Layout) {
  if (workspace.groupSizes && workspace.groupSizes.shape !== shapeOf(next)) workspace.groupSizes = null;
  workspace.groupLayout = next;
}

/** Dimensioni dei gruppi dopo un trascinamento dei separatori. */
export function setGroupSizes(sizes: PaneSizes) {
  workspace.groupSizes = sizes;
}

function ensureActiveGroup(): EditorGroup {
  let g = activeGroup();
  if (!g) {
    g = { id: newGroupId(), tabs: [], activePath: null, previews: [] };
    workspace.groups.push(g);
    workspace.activeGroupId = g.id;
    setGroupLayout(groupLayout());
  }
  return g;
}

/** Rimuove dal pool i documenti non più referenziati da alcun gruppo. */
function pruneDocs() {
  const referenced = new Set(workspace.groups.flatMap((g) => g.tabs));
  workspace.openFiles = workspace.openFiles.filter((f) => referenced.has(f.path));
}

/** Toglie una tab dall'elenco anteprime di un gruppo (se presente). */
function dropPreview(g: EditorGroup, path: string) {
  const i = g.previews.indexOf(path);
  if (i !== -1) g.previews.splice(i, 1);
}

/** Se un gruppo è rimasto senza tab: rimuovilo (tranne l'ultimo) e sistema il gruppo attivo. */
function dropEmptyGroup(g: EditorGroup) {
  if (g.tabs.length > 0) return;
  if (workspace.groups.length <= 1) {
    g.activePath = null; // tieni un gruppo vuoto → schermata di benvenuto
    return;
  }
  // il gruppo attivo passa al vicino nella disposizione (prima: nell'elenco, che con le righe non è l'ordine a video)
  const order = flatten(groupLayout());
  const at = order.indexOf(g.id);
  const idx = workspace.groups.findIndex((x) => x.id === g.id);
  workspace.groups.splice(idx, 1);
  setGroupLayout(groupLayout());
  if (workspace.activeGroupId === g.id) {
    const near = order[at + 1] ?? order[at - 1];
    workspace.activeGroupId = (near && groupById(near)?.id) ?? workspace.groups[0]?.id ?? "";
  }
}

// ---- apertura -------------------------------------------------------------

/** Carica un documento nel pool se assente. */
async function loadDoc(path: string) {
  if (fileByPath(path)) return;
  const name = basename(path);
  // immagine/PDF: niente lettura come testo, li mostra un viewer (vedi AssetView)
  const asset = assetKind(name);
  if (asset) {
    workspace.openFiles.push({
      path,
      name,
      content: "",
      dirty: false,
      readonly: true,
      kind: asset,
      rev: 0,
      externallyChanged: false,
      gotoLine: null,
      diskRev: 0,
    });
    return;
  }
  let content: string;
  let readonly = false;
  try {
    content = await invoke<string>("read_file", { path });
  } catch (e) {
    content = `// Cannot open file (binary or non-UTF-8).\n// ${e}`;
    readonly = true;
  }
  workspace.openFiles.push({
    path,
    name,
    content,
    dirty: false,
    readonly,
    kind: "file",
    rev: 0,
    externallyChanged: false,
    gotoLine: null,
    diskRev: 0,
  });
}

/** Apre un file in un gruppo (default: quello attivo) e lo rende attivo. */
export async function openFile(path: string, groupId?: string) {
  path = docPath(path);
  beforeNav?.(path); // cronologia: registra la posizione che stiamo lasciando (sincrono, pre-await)
  await loadDoc(path);
  const g = (groupId ? groupById(groupId) : undefined) ?? ensureActiveGroup();
  if (!g.tabs.includes(path)) {
    g.tabs.push(path);
    // anteprima iniziale (mdMode) decisa quando la tab ENTRA nel gruppo, non sul documento
    if (initialPreview(basename(path))) g.previews.push(path);
  }
  g.activePath = path;
  workspace.activeGroupId = g.id;
}

/** Apre un file e salta a una riga (usato dalla ricerca). */
export async function openFileAt(path: string, line: number) {
  await openFile(path);
  const f = fileByPath(path);
  if (f && f.kind === "file") f.gotoLine = line; // gotoLine ha senso solo nell'editor di testo
}

/** Apre (o aggiorna) una tab di sola lettura con un diff, nel gruppo attivo. */
export function openDiff(id: string, name: string, patch: string) {
  const existing = fileByPath(id);
  if (existing) {
    existing.content = patch;
  } else {
    workspace.openFiles.push({
      path: id,
      name,
      content: patch,
      dirty: false,
      readonly: true,
      kind: "diff",
      rev: 0,
      externallyChanged: false,
      gotoLine: null,
      diskRev: 0,
    });
  }
  const g = ensureActiveGroup();
  if (!g.tabs.includes(id)) g.tabs.push(id);
  g.activePath = id;
  workspace.activeGroupId = g.id;
}

/** md/html: alterna sorgente/anteprima per la tab NEL gruppo indicato. */
export function togglePreview(groupId: string, path: string) {
  const g = groupById(groupId);
  if (!g) return;
  const i = g.previews.indexOf(path);
  if (i === -1) g.previews.push(path);
  else g.previews.splice(i, 1);
}

/** Forza anteprima/sorgente nel gruppo ATTIVO (usato dalla vista Docs). */
export function setPreview(path: string, on: boolean) {
  const g = activeGroup();
  if (!g) return;
  const i = g.previews.indexOf(path);
  if (on && i === -1) g.previews.push(path);
  if (!on && i !== -1) g.previews.splice(i, 1);
}

/** Apre l'anteprima del file in un gruppo AFFIANCATO (sorgente qui, anteprima là).
 *  Se un altro gruppo la sta già mostrando, lo attiva soltanto. */
export async function openPreviewToSide(path: string) {
  const from = activeGroup();
  const f = fileByPath(path);
  if (f?.dirty && !f.readonly) await savePath(path); // l'anteprima HTML legge dal disco
  const existing = workspace.groups.find((g) => g !== from && g.previews.includes(path));
  if (existing) {
    existing.activePath = path;
    workspace.activeGroupId = existing.id;
    return;
  }
  await openInNewGroup(path);
  const g = activeGroup();
  if (g && !g.previews.includes(path)) g.previews.push(path);
  if (from) {
    const i = from.previews.indexOf(path);
    if (i !== -1) from.previews.splice(i, 1); // nel gruppo di partenza resta il sorgente
  }
}

/** Apre la board Attività come tab (kind "activity") nell'area editor; singleton per finestra. */
export function openActivityBoard() {
  const id = "activity://board";
  if (!fileByPath(id)) {
    workspace.openFiles.push({
      path: id,
      name: "Activity",
      content: "",
      dirty: false,
      readonly: true,
      kind: "activity",
      rev: 0,
      externallyChanged: false,
      gotoLine: null,
      diskRev: 0,
    });
  }
  const g = ensureActiveGroup();
  if (!g.tabs.includes(id)) g.tabs.push(id);
  g.activePath = id;
  workspace.activeGroupId = g.id;
}

/** Apre il Git Graph come tab (kind "gitgraph") nell'area editor; singleton per finestra. */
export function openGitGraphBoard() {
  const id = "gitgraph://board";
  if (!fileByPath(id)) {
    workspace.openFiles.push({
      path: id,
      name: "Git Graph",
      content: "",
      dirty: false,
      readonly: true,
      kind: "gitgraph",
      rev: 0,
      externallyChanged: false,
      gotoLine: null,
      diskRev: 0,
    });
  }
  const g = ensureActiveGroup();
  if (!g.tabs.includes(id)) g.tabs.push(id);
  g.activePath = id;
  workspace.activeGroupId = g.id;
}

// ---- gestione tab / gruppi ------------------------------------------------

export function setActiveTab(groupId: string, path: string) {
  const g = groupById(groupId);
  if (!g) return;
  beforeNav?.(path); // cronologia: cambio tab → registra il file lasciato
  g.activePath = path;
  workspace.activeGroupId = groupId;
}

export function setActiveGroup(groupId: string) {
  if (groupById(groupId)) workspace.activeGroupId = groupId;
}

/** Chiude una tab in un gruppo (e il documento se non più referenziato altrove). */
export function closeTab(groupId: string, path: string) {
  const g = groupById(groupId);
  if (!g) return;
  const i = g.tabs.indexOf(path);
  if (i === -1) return;
  g.tabs.splice(i, 1);
  dropPreview(g, path);
  if (g.activePath === path) g.activePath = g.tabs[i] ?? g.tabs[i - 1] ?? null;
  dropEmptyGroup(g);
  pruneDocs();
}

/**
 * Chiude più tab di un gruppo in un colpo (Close others / to the right / saved / all): stessa regola di
 * closeTab per la nuova tab attiva (la prima rimasta a destra di quella chiusa, se no a sinistra).
 */
export function closeTabs(groupId: string, paths: string[]) {
  const g = groupById(groupId);
  if (!g) return;
  const drop = new Set(paths);
  g.activePath = nextActive(g.tabs, g.activePath, drop);
  g.tabs = g.tabs.filter((p) => !drop.has(p));
  g.previews = g.previews.filter((p) => !drop.has(p));
  dropEmptyGroup(g);
  pruneDocs();
}

/** Chiude un documento ovunque sia aperto (usato da delete/closeUnder). */
export function closeFile(path: string) {
  path = docPath(path);
  for (const g of [...workspace.groups]) {
    const i = g.tabs.indexOf(path);
    if (i === -1) continue;
    g.tabs.splice(i, 1);
    dropPreview(g, path);
    if (g.activePath === path) g.activePath = g.tabs[i] ?? g.tabs[i - 1] ?? null;
    dropEmptyGroup(g);
  }
  pruneDocs();
}

/** Svuota documenti e gruppi (usato al cambio cartella del workspace). */
export function resetDocs() {
  workspace.openFiles = [];
  workspace.groups = [];
  workspace.activeGroupId = "";
  workspace.groupLayout = [];
  workspace.groupSizes = null;
  viewByTab.clear(); // le posizioni dei gruppi chiusi (la sessione salvata le ha già)
}

/** Riordina una tab dentro lo stesso gruppo. */
export function reorderTab(groupId: string, path: string, toIndex: number) {
  const g = groupById(groupId);
  if (!g) return;
  const fi = g.tabs.indexOf(path);
  if (fi === -1) return;
  g.tabs.splice(fi, 1);
  g.tabs.splice(Math.max(0, Math.min(toIndex, g.tabs.length)), 0, path);
  g.activePath = path;
  workspace.activeGroupId = g.id;
}

/** Sposta una tab da un gruppo all'altro (o riordina se stesso gruppo). */
export function moveTab(fromGroupId: string, path: string, toGroupId: string, toIndex?: number) {
  if (fromGroupId === toGroupId) {
    reorderTab(fromGroupId, path, toIndex ?? Number.MAX_SAFE_INTEGER);
    return;
  }
  const from = groupById(fromGroupId);
  const to = groupById(toGroupId);
  if (!from || !to) return;
  const fi = from.tabs.indexOf(path);
  if (fi === -1) return;
  from.tabs.splice(fi, 1);
  if (from.activePath === path) from.activePath = from.tabs[fi] ?? from.tabs[fi - 1] ?? null;
  // lo stato anteprima segue la tab nel nuovo gruppo
  if (from.previews.includes(path)) {
    dropPreview(from, path);
    if (!to.previews.includes(path)) to.previews.push(path);
  }
  // se è già aperto nel target lo riposiziono (niente duplicati); altrimenti lo inserisco
  const existing = to.tabs.indexOf(path);
  if (existing !== -1) to.tabs.splice(existing, 1);
  const idx = toIndex == null ? to.tabs.length : Math.max(0, Math.min(toIndex, to.tabs.length));
  to.tabs.splice(idx, 0, path);
  to.activePath = path;
  workspace.activeGroupId = to.id;
  dropEmptyGroup(from);
  pruneDocs();
}

/**
 * Rilascio di una scheda sul bordo `side` del gruppo `targetGroupId` (M72; prima c'era solo la colonna in
 * fondo a destra): un gruppo nuovo da quel lato con dentro la scheda. Se la scheda è l'unica del suo gruppo
 * si sposta il gruppo intero; con l'editor già diviso in MAX_GROUPS la scheda va nel gruppo bersaglio.
 */
export function splitWithTab(fromGroupId: string, path: string, targetGroupId: string = fromGroupId, side: Side = "right") {
  const from = groupById(fromGroupId);
  if (!from || !from.tabs.includes(path) || !groupById(targetGroupId)) return; // path stale: niente da dividere
  if (from.tabs.length <= 1) {
    if (targetGroupId === fromGroupId) return; // l'unica scheda del gruppo accanto a sé stessa: niente da dividere
    setGroupLayout(insertPane(groupLayout(), fromGroupId, targetGroupId, side, MAX_GROUPS));
    workspace.activeGroupId = fromGroupId;
    return;
  }
  if (workspace.groups.length >= MAX_GROUPS) {
    moveTab(fromGroupId, path, targetGroupId);
    return;
  }
  const g: EditorGroup = { id: newGroupId(), tabs: [], activePath: null, previews: [] };
  const next = insertPane(groupLayout(), g.id, targetGroupId, side, MAX_GROUPS);
  workspace.groups.push(g);
  setGroupLayout(next);
  moveTab(fromGroupId, path, g.id);
}

/** Apre un file in un NUOVO gruppo a destra di quello attivo (split) — "Apri di lato" dell'albero. Con
 *  l'editor già diviso in MAX_GROUPS lo apre nel gruppo che segue quello attivo. */
export async function openInNewGroup(path: string) {
  path = docPath(path);
  const order = flatten(groupLayout());
  if (order.length >= MAX_GROUPS) {
    const next = order[(order.indexOf(workspace.activeGroupId) + 1) % order.length];
    notify(`Up to ${MAX_GROUPS} editor groups: opened in the next one`, "info", 2600);
    await openFile(path, next);
    return;
  }
  beforeNav?.(path); // cronologia: registra la posizione lasciata
  await loadDoc(path); // carica prima: niente gruppo vuoto lampeggiante durante l'await
  const g: EditorGroup = {
    id: newGroupId(),
    tabs: [path],
    activePath: path,
    previews: initialPreview(basename(path)) ? [path] : [],
  };
  const anchor = activeGroup()?.id ?? null;
  const next = insertPane(groupLayout(), g.id, anchor, "right", MAX_GROUPS);
  workspace.groups.push(g);
  setGroupLayout(next);
  workspace.activeGroupId = g.id;
}

// ---- rename / delete ------------------------------------------------------

/** Riallinea pool e gruppi dopo un rename su disco (di un file o di una cartella). */
export function renameOpenPaths(oldPath: string, newPath: string) {
  const map = new Map<string, string>();
  const to = canonPath(newPath);
  for (const f of workspace.openFiles) {
    if (f.kind === "diff" || f.kind === "activity") continue; // id sintetici (diff/activity): niente path reale da rimappare
    let next: string | null = null;
    // separatori e maiuscole indifferenti (M59); i separatori non cambiano la lunghezza del prefisso
    if (samePath(f.path, oldPath)) next = to;
    else if (isUnder(f.path, oldPath)) next = to + f.path.slice(oldPath.replace(/[\\/]+$/, "").length);
    if (next) {
      map.set(f.path, next);
      f.path = next;
      f.name = basename(next);
    }
  }
  if (map.size === 0) return;
  for (const g of workspace.groups) {
    g.tabs = g.tabs.map((p) => map.get(p) ?? p);
    g.previews = g.previews.map((p) => map.get(p) ?? p);
    if (g.activePath && map.has(g.activePath)) g.activePath = map.get(g.activePath)!;
  }
}

/** Chiude le tab del file eliminato (o dei file sotto la cartella eliminata). */
export function closeUnder(path: string) {
  for (const f of [...workspace.openFiles]) {
    if (isUnder(f.path, path)) closeFile(f.path);
  }
}

// ---- salvataggio / reload -------------------------------------------------

/** Aggiorna il contenuto in memoria di un documento e lo marca come modificato. */
export function updateContent(path: string, content: string) {
  const f = fileByPath(path);
  if (f && !f.readonly && f.content !== content) {
    f.content = content;
    f.dirty = true;
  }
}

/**
 * Salva su disco un documento (se modificato e non in sola lettura).
 * `auto`: salvataggio automatico (focus perso / cambio tab) → niente toast di conferma e NON
 * sovrascrive un file modificato anche su disco (conflitto): quello resta da risolvere a mano.
 */
export async function savePath(path: string, opts: { auto?: boolean } = {}) {
  const f = fileByPath(path);
  if (!f || f.readonly || !f.dirty || f.kind !== "file") return;
  if (opts.auto && f.externallyChanged) return; // conflitto: l'autosave non calpesta gli edit esterni
  try {
    await invoke("write_file", { path: f.path, content: f.content });
    f.dirty = false;
    f.externallyChanged = false;
    f.diskRev++; // il disco è cambiato → un'eventuale anteprima HTML affiancata ricarica
    if (!opts.auto) notify(`${f.name} saved`, "success", 1500);
  } catch (e) {
    notify(`Save failed: ${e}`, "error");
    console.error("save", e);
  }
}

/** Salva il documento attivo del gruppo attivo. */
export async function saveActive() {
  const f = activeFile();
  if (f) await savePath(f.path);
}

/** Autosave (stile IntelliJ): salva tutti i documenti modificati, senza toast né conflitti. */
export async function autosaveAll() {
  for (const f of workspace.openFiles) {
    if (f.dirty && !f.readonly && f.kind === "file" && !f.externallyChanged) {
      await savePath(f.path, { auto: true });
    }
  }
}

/**
 * Ricarica dal disco i documenti aperti cambiati esternamente (es. da Claude).
 * `changed`: path assoluti cambiati (separatori "/", dal watcher). Se passato, ricarico SOLO i file
 * aperti che vi compaiono — gli altri non sono cambiati, rileggerli sarebbe I/O sprecato (hot path
 * quando Claude scrive). `null` = comportamento storico (controlla tutti). Match case-insensitive.
 */
export async function reloadOpenFiles(changed: string[] | null = null) {
  const set = changed ? new Set(changed.map((p) => p.toLowerCase())) : null;
  for (const f of workspace.openFiles) {
    if (f.kind !== "file" || f.readonly) continue;
    if (set && !set.has(normSlash(f.path).toLowerCase())) continue;
    let disk: string;
    try {
      disk = await invoke<string>("read_file", { path: f.path });
    } catch {
      continue; // file forse eliminato: lascio la tab
    }
    if (disk === f.content) continue;
    if (f.dirty) {
      f.externallyChanged = true; // conflitto: non sovrascrivo gli edit non salvati
    } else {
      f.content = disk;
      f.externallyChanged = false;
      f.rev++; // segnala all'editor di rimpiazzare il doc
      f.diskRev++; // e all'anteprima HTML di ricaricare l'iframe
    }
  }
}

// ---- persistenza di sessione ---------------------------------------------

/** Ripristina i gruppi salvati (carica i documenti nel pool, salta i file spariti), con la loro disposizione
 *  (M72: `savedLayout` = indici dei gruppi salvati per colonna; assente nelle sessioni di prima = colonne). */
export async function restoreGroups(
  saved: { tabs: string[]; active: string | null; previews?: string[]; views?: Record<string, number[]> }[],
  activeIndex: number,
  savedLayout?: unknown,
  savedSizes?: unknown,
) {
  // sessioni salvate prima della M59 possono avere lo stesso file in due forme (`src/x` e `src\x`):
  // ognuna si riporta alla prima forma vista, e le schede doppie si fondono
  const first = new Map<string, string>();
  const canon = (p: string) => {
    const k = pathKey(p);
    if (!first.has(k)) first.set(k, canonPath(p));
    return first.get(k)!;
  };
  const uniq = (ps: string[]) => [...new Set(ps.map(canon))];
  const allPaths = uniq(saved.flatMap((g) => g.tabs));
  for (const p of allPaths) await loadDoc(p);
  const loaded = new Set(workspace.openFiles.map((f) => f.path));
  const groups: EditorGroup[] = [];
  const idOf = new Map<number, string>(); // indice nella sessione → gruppo ripristinato
  for (const [i, g] of saved.entries()) {
    const tabs = uniq(g.tabs).filter((p) => loaded.has(p));
    if (tabs.length === 0) continue;
    const savedActive = g.active ? canon(g.active) : null;
    const active = savedActive && tabs.includes(savedActive) ? savedActive : tabs[0];
    // anteprime salvate (filtrate sulle tab valide); sessioni vecchie: ricalcolo da mdMode
    const previews = (g.previews ? uniq(g.previews) : tabs.filter((p) => initialPreview(basename(p)))).filter((p) =>
      tabs.includes(p),
    );
    const id = newGroupId();
    idOf.set(i, id);
    groups.push({ id, tabs, activePath: active, previews });
    // posizione salvata di ogni scheda (M66): [anchor, head, top]
    for (const [p, v] of Object.entries(g.views ?? {})) {
      const path = canon(p);
      if (tabs.includes(path) && Array.isArray(v) && v.length === 3 && v.every((x) => Number.isInteger(x) && x >= 0))
        rememberView(id, path, { anchor: v[0], head: v[1], top: v[2] });
    }
  }
  if (groups.length === 0) return;
  const cols = Array.isArray(savedLayout) ? savedLayout.filter(Array.isArray) : [];
  const lay = reconcile(
    cols.map((c: unknown[]) => c.map((i) => (typeof i === "number" ? idOf.get(i) : undefined)).filter((id): id is string => !!id)),
    groups.map((g) => g.id),
  );
  workspace.groups = groups;
  workspace.groupLayout = lay;
  workspace.groupSizes = validSizes(savedSizes, lay);
  workspace.activeGroupId = (groups[activeIndex] ?? groups[0]).id;
}
