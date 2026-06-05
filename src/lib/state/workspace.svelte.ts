// Stato del workspace: cartella aperta, documenti aperti (pool) e gruppi editor affiancati
// (split view, stile VS Code). Ogni gruppo ha le sue tab e il suo file attivo; lo stesso
// documento può vivere in più gruppi (contenuto/dirty condivisi dal pool `openFiles`).
import { invoke } from "@tauri-apps/api/core";
import { basename, assetKind } from "../util";
import { notify } from "./toast.svelte";

export interface OpenFile {
  path: string; // chiave univoca del documento (per i diff è un id sintetico)
  name: string;
  content: string;
  dirty: boolean;
  readonly: boolean;
  kind: "file" | "diff" | "image" | "pdf"; // image/pdf: mostrati da un viewer (asset protocol)
  rev: number; // incrementa al reload esterno → l'editor rimpiazza il doc
  externallyChanged: boolean; // modificato su disco con edit non salvati (conflitto)
  gotoLine: number | null; // riga a cui saltare (da ricerca)
  preview: boolean; // markdown: mostra l'anteprima invece del sorgente
}

/** Un gruppo editor = una colonna affiancata con le sue tab e il file attivo. */
export interface EditorGroup {
  id: string;
  tabs: string[]; // path dei documenti, in ordine di visualizzazione
  activePath: string | null;
}

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
  ready: false, // true a sessione caricata (es. terminale di default attende questo)
});

/** Posizione del cursore nell'editor attivo (per la status bar). */
export const editorStatus = $state({ line: 1, col: 1 });

// ---- lookup ---------------------------------------------------------------

export function fileByPath(path: string): OpenFile | undefined {
  return workspace.openFiles.find((f) => f.path === path);
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

function ensureActiveGroup(): EditorGroup {
  let g = activeGroup();
  if (!g) {
    g = { id: newGroupId(), tabs: [], activePath: null };
    workspace.groups.push(g);
    workspace.activeGroupId = g.id;
  }
  return g;
}

/** Rimuove dal pool i documenti non più referenziati da alcun gruppo. */
function pruneDocs() {
  const referenced = new Set(workspace.groups.flatMap((g) => g.tabs));
  workspace.openFiles = workspace.openFiles.filter((f) => referenced.has(f.path));
}

/** Se un gruppo è rimasto senza tab: rimuovilo (tranne l'ultimo) e sistema il gruppo attivo. */
function dropEmptyGroup(g: EditorGroup) {
  if (g.tabs.length > 0) return;
  if (workspace.groups.length <= 1) {
    g.activePath = null; // tieni un gruppo vuoto → schermata di benvenuto
    return;
  }
  const idx = workspace.groups.findIndex((x) => x.id === g.id);
  workspace.groups.splice(idx, 1);
  if (workspace.activeGroupId === g.id) {
    workspace.activeGroupId = (workspace.groups[idx] ?? workspace.groups[idx - 1])?.id ?? "";
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
      preview: false,
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
    preview: /^readme\.(md|markdown)$/i.test(name),
  });
}

/** Apre un file in un gruppo (default: quello attivo) e lo rende attivo. */
export async function openFile(path: string, groupId?: string) {
  await loadDoc(path);
  const g = (groupId ? groupById(groupId) : undefined) ?? ensureActiveGroup();
  if (!g.tabs.includes(path)) g.tabs.push(path);
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
      preview: false,
    });
  }
  const g = ensureActiveGroup();
  if (!g.tabs.includes(id)) g.tabs.push(id);
  g.activePath = id;
  workspace.activeGroupId = g.id;
}

/** Markdown: alterna tra sorgente e anteprima per il documento indicato. */
export function togglePreview(path: string) {
  const f = fileByPath(path);
  if (f) f.preview = !f.preview;
}

/** Markdown: forza la modalità anteprima/sorgente (usato dalla vista Docs). */
export function setPreview(path: string, on: boolean) {
  const f = fileByPath(path);
  if (f) f.preview = on;
}

// ---- gestione tab / gruppi ------------------------------------------------

export function setActiveTab(groupId: string, path: string) {
  const g = groupById(groupId);
  if (!g) return;
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
  if (g.activePath === path) g.activePath = g.tabs[i] ?? g.tabs[i - 1] ?? null;
  dropEmptyGroup(g);
  pruneDocs();
}

/** Chiude un documento ovunque sia aperto (usato da delete/closeUnder). */
export function closeFile(path: string) {
  for (const g of [...workspace.groups]) {
    const i = g.tabs.indexOf(path);
    if (i === -1) continue;
    g.tabs.splice(i, 1);
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

/** Crea un nuovo gruppo (in coda) spostandoci dentro una tab — usato dal drag al bordo. */
export function splitWithTab(fromGroupId: string, path: string) {
  const from = groupById(fromGroupId);
  if (!from || !from.tabs.includes(path)) return; // path stale: niente da dividere
  if (from.tabs.length <= 1) return; // è già l'unica tab del gruppo: dividere non ha senso
  const g: EditorGroup = { id: newGroupId(), tabs: [], activePath: null };
  workspace.groups.push(g);
  moveTab(fromGroupId, path, g.id);
}

/** Apre un file in un NUOVO gruppo affiancato (split) — usato da "Apri di lato" dell'albero. */
export async function openInNewGroup(path: string) {
  await loadDoc(path); // carica prima: niente gruppo vuoto lampeggiante durante l'await
  const g: EditorGroup = { id: newGroupId(), tabs: [path], activePath: path };
  workspace.groups.push(g);
  workspace.activeGroupId = g.id;
}

// ---- rename / delete ------------------------------------------------------

/** Riallinea pool e gruppi dopo un rename su disco (di un file o di una cartella). */
export function renameOpenPaths(oldPath: string, newPath: string) {
  const map = new Map<string, string>();
  for (const f of workspace.openFiles) {
    if (f.kind === "diff") continue; // i diff hanno id sintetici; file/image/pdf hanno path reali da rimappare
    let next: string | null = null;
    if (f.path === oldPath) next = newPath;
    else if (f.path.startsWith(oldPath + "/") || f.path.startsWith(oldPath + "\\")) {
      next = newPath + f.path.slice(oldPath.length);
    }
    if (next) {
      map.set(f.path, next);
      f.path = next;
      f.name = basename(next);
    }
  }
  if (map.size === 0) return;
  for (const g of workspace.groups) {
    g.tabs = g.tabs.map((p) => map.get(p) ?? p);
    if (g.activePath && map.has(g.activePath)) g.activePath = map.get(g.activePath)!;
  }
}

/** Chiude le tab del file eliminato (o dei file sotto la cartella eliminata). */
export function closeUnder(path: string) {
  for (const f of [...workspace.openFiles]) {
    if (f.path === path || f.path.startsWith(path + "/") || f.path.startsWith(path + "\\")) {
      closeFile(f.path);
    }
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

/** Salva su disco un documento (se modificato e non in sola lettura). */
export async function savePath(path: string) {
  const f = fileByPath(path);
  if (!f || f.readonly || !f.dirty || f.kind !== "file") return;
  try {
    await invoke("write_file", { path: f.path, content: f.content });
    f.dirty = false;
    f.externallyChanged = false;
    notify(`${f.name} saved`, "success", 1500);
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

/** Ricarica dal disco i documenti aperti cambiati esternamente (es. da Claude). */
export async function reloadOpenFiles() {
  for (const f of workspace.openFiles) {
    if (f.kind !== "file" || f.readonly) continue;
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
    }
  }
}

// ---- persistenza di sessione ---------------------------------------------

/** Ripristina i gruppi salvati (carica i documenti nel pool, salta i file spariti). */
export async function restoreGroups(
  saved: { tabs: string[]; active: string | null }[],
  activeIndex: number,
) {
  const allPaths = [...new Set(saved.flatMap((g) => g.tabs))];
  for (const p of allPaths) await loadDoc(p);
  const loaded = new Set(workspace.openFiles.map((f) => f.path));
  const groups: EditorGroup[] = [];
  for (const g of saved) {
    const tabs = g.tabs.filter((p) => loaded.has(p));
    if (tabs.length === 0) continue;
    const active = g.active && tabs.includes(g.active) ? g.active : tabs[0];
    groups.push({ id: newGroupId(), tabs, activePath: active });
  }
  if (groups.length === 0) return;
  workspace.groups = groups;
  workspace.activeGroupId = (groups[activeIndex] ?? groups[0]).id;
}
