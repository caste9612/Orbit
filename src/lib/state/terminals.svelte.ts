// Sessioni del pannello terminale: lista di tab + tab attiva. Ogni sessione ha un
// id univoco usato dal PTY (backend). Le tab restano tutte montate (visibilità CSS)
// così scrollback e shell si conservano quando si cambia tab.
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow, UserAttentionType } from "@tauri-apps/api/window";
import { layout } from "./layout.svelte";
import { settings } from "./settings.svelte";
import { notify, notifyAttention, dismissByKey } from "./toast.svelte";
import { workspace } from "./workspace.svelte";
import { basename } from "../util";
import { addPane, movePane, removePane, replacePane, MAX_PANES } from "./terminalLayout";

export interface TermSession {
  id: string;
  title: string;
  shell: string | null; // null = shell default di piattaforma
  cwd: string | null; // cartella di lavoro (null = radice del workspace)
  root: string | null; // repo (workspace.rootPath) di appartenenza → il pannello filtra per repo attiva
  initCommand: string | null; // comando lanciato all'avvio (run config)
  started: boolean; // initCommand già inviato (evita ri-esecuzione al remount)
  attach: boolean; // true = si collega a un PTY esistente (terminale reincollato dalla finestra flottante)
  needsAttention: boolean; // la bell ha suonato (Claude ha finito / aspetta input) mentre non lo guardavi
}

let counter = 0;

export const terminals = $state({
  list: [] as TermSession[],
  activeId: null as string | null,
  focusedId: null as string | null, // terminale col focus REALE (textarea xterm), non solo finestra
  // Chat affiancate (M54): per repo (chiave = rootKey) i terminali visibili INSIEME, in ordine.
  // Meno di 2 = scheda singola (si vede solo l'attivo). Il riquadro attivo è sempre `activeId`.
  panes: {} as Record<string, string[]>,
  zoomId: null as string | null, // riquadro ingrandito temporaneamente (gli altri restano vivi)
});

// Scheda attiva RICORDATA per repo (chiave = root path): cambiando repo si ripristina quella giusta.
const activeByRoot: Record<string, string> = {};
const sameRoot = (a: string | null, b: string | null) => a === b;

/** Chiave per repo dei riquadri (una cartella non aperta = ""). */
export const rootKey = (root: string | null) => root ?? "";

/** Riquadri affiancati della repo `root` ([] = nessuno split). */
export function panesOf(root: string | null): string[] {
  return terminals.panes[rootKey(root)] ?? [];
}

function setPanes(root: string | null, next: string[]) {
  terminals.panes[rootKey(root)] = next;
}

/** Il terminale `id` è visibile adesso nel pannello? (scheda attiva, o uno dei riquadri affiancati) */
export function isShown(id: string): boolean {
  const t = terminals.list.find((s) => s.id === id);
  if (!t || !sameRoot(t.root, workspace.rootPath)) return false;
  if (terminals.zoomId) return terminals.zoomId === id;
  const panes = panesOf(t.root);
  return panes.length >= 2 ? panes.includes(id) : terminals.activeId === id;
}

export interface NewTerminal {
  shell?: string | null;
  title?: string;
  cwd?: string | null;
  initCommand?: string | null;
  /** true = si apre in un nuovo riquadro accanto a quello attivo (chat affiancate). */
  side?: boolean;
}

/** Crea una nuova tab terminale e la rende attiva. Ritorna l'id. Con `side` la affianca a quella
 *  attiva; altrimenti, se c'è uno split, prende il posto del riquadro attivo (come una scheda). */
export function addTerminal(opts: NewTerminal = {}): string {
  counter += 1;
  const id = `term-${counter}`;
  const root = workspace.rootPath;
  terminals.list.push({
    id,
    title: opts.title ?? `Terminal ${counter}`,
    shell: opts.shell ?? null,
    cwd: opts.cwd ?? null,
    root,
    initCommand: opts.initCommand ?? null,
    started: false,
    attach: false,
    needsAttention: false,
  });
  if (opts.side) splitWith(id);
  else activate(id);
  return id;
}

/** Rende `id` la scheda attiva della sua repo; con uno split in corso, se non è già visibile prende
 *  il posto del riquadro attivo (la scheda sostituita resta aperta tra le tab). */
function activate(id: string) {
  const t = terminals.list.find((s) => s.id === id);
  const root = t?.root ?? workspace.rootPath;
  const panes = panesOf(root);
  if (panes.length >= 2 && !panes.includes(id) && terminals.activeId && panes.includes(terminals.activeId)) {
    setPanes(root, replacePane(panes, terminals.activeId, id));
  }
  if (terminals.zoomId && terminals.zoomId !== id) terminals.zoomId = null;
  terminals.activeId = id;
  if (root) activeByRoot[root] = id;
}

/** Affianca `id` al riquadro attivo (o ad `anchor`, prima o dopo). Oltre il massimo lo mostra nel
 *  riquadro attivo e avvisa. */
export function splitWith(id: string, anchor: string | null = null, before = false) {
  const t = terminals.list.find((s) => s.id === id);
  if (!t) return;
  const panes = panesOf(t.root);
  if (anchor && anchor !== id && panes.includes(id)) {
    // già visibile: drag sul bordo di un altro riquadro = spostalo lì
    setPanes(t.root, movePane(panes, id, anchor, before));
    terminals.zoomId = null;
    activate(id);
    return;
  }
  if (panes.length >= MAX_PANES && !panes.includes(id)) {
    notify(`Up to ${MAX_PANES} side-by-side panes`, "info", 2200);
    activate(id);
    return;
  }
  const next = addPane(panes, terminals.activeId, id, anchor ?? terminals.activeId, before);
  setPanes(t.root, next.length >= 2 ? next : []);
  terminals.zoomId = null;
  activate(id);
}

/** Mette `id` nel riquadro `target` (drag di una scheda al centro di un riquadro). */
export function showInPane(id: string, target: string) {
  const t = terminals.list.find((s) => s.id === target);
  if (!t) return;
  const panes = panesOf(t.root);
  if (panes.length >= 2) setPanes(t.root, replacePane(panes, target, id));
  terminals.zoomId = null;
  activate(id);
}

/** Toglie un riquadro dallo split: il terminale NON viene chiuso, resta tra le tab. */
export function closePane(id: string) {
  const t = terminals.list.find((s) => s.id === id);
  if (!t) return;
  const panes = panesOf(t.root);
  const i = panes.indexOf(id);
  if (i === -1) return;
  const next = removePane(panes, id);
  setPanes(t.root, next);
  if (terminals.zoomId === id) terminals.zoomId = null;
  if (terminals.activeId === id) {
    const neighbor = next[Math.min(i, next.length - 1)] ?? panes.find((p) => p !== id) ?? null;
    if (neighbor) activate(neighbor);
  }
}

/** Ingrandisce un riquadro (gli altri restano vivi, nascosti) o torna alla vista affiancata. */
export function toggleZoom(id: string) {
  terminals.zoomId = terminals.zoomId === id ? null : id;
  terminals.activeId = id;
}

/** Toglie `id` dagli split di qualunque repo (terminale chiuso o estratto in finestra flottante). */
function dropFromPanes(id: string) {
  for (const k of Object.keys(terminals.panes)) {
    if (terminals.panes[k].includes(id)) terminals.panes[k] = removePane(terminals.panes[k], id);
  }
  if (terminals.zoomId === id) terminals.zoomId = null;
}

/** Rimuove la tab all'indice `i` e sistema la tab attiva. Dopo lo splice l'indice `i` è il
 *  vicino di destra (e `i-1` quello di sinistra). Nasconde il pannello se non resta nulla. */
function removeAt(i: number) {
  const removed = terminals.list[i];
  terminals.list.splice(i, 1);
  if (removed) {
    dismissByKey(bellKey(removed.id)); // se era in attesa, togli la sua notifica sticky orfana
    dropFromPanes(removed.id);
  }
  if (removed && terminals.activeId === removed.id) {
    // attiva una scheda DELLA STESSA repo (le tab di altre repo non c'entrano)
    syncActiveTerminalToRoot(removed.root);
  }
  if (terminals.list.length === 0) layout.terminalVisible = false;
  if (!anyNeedsAttention()) cancelTaskbarAttention(); // niente più in attesa → spegni la taskbar
}

/** Toglie una tab dalla lista SENZA uccidere il PTY (per estrarla in finestra flottante). */
export function removeTerminalKeepPty(id: string) {
  const i = terminals.list.findIndex((t) => t.id === id);
  if (i !== -1) removeAt(i);
}

/** Reincolla un terminale estratto: si ricollega al PTY esistente (attach), senza rispawn.
 *  Non reincolla una tab morta: verifica prima che il PTY esista ancora nel backend. */
export async function redockTerminal(s: { id: string; title: string; shell: string | null }) {
  if (terminals.list.some((t) => t.id === s.id)) {
    activate(s.id);
    layout.terminalVisible = true;
    return;
  }
  const alive = await invoke<boolean>("pty_alive", { id: s.id }).catch(() => false);
  if (!alive) return; // PTY morto → niente tab zombie
  const root = workspace.rootPath;
  terminals.list.push({
    id: s.id,
    title: s.title,
    shell: s.shell,
    cwd: null,
    root,
    initCommand: null,
    started: true,
    attach: true,
    needsAttention: false,
  });
  activate(s.id); // con uno split torna nel riquadro attivo
  layout.terminalVisible = true;
}

/** Click su una scheda: la attiva (con uno split, se non è visibile va nel riquadro attivo). */
export function setActiveTerminal(id: string) {
  activate(id);
  clearAttention(id); // guardare la scheda azzera la richiesta d'attenzione
}

/** Cambiando repo: attiva la scheda terminale di QUELLA repo (l'ultima usata lì, o la prima, o
 *  nessuna). Le schede delle altre repo restano vive ma nascoste (il pannello filtra per root);
 *  anche gli split restano per repo, e il riquadro attivo deve essere uno di quelli visibili. */
export function syncActiveTerminalToRoot(root: string | null) {
  const visible = terminals.list.filter((t) => sameRoot(t.root, root));
  const remembered = root ? activeByRoot[root] : undefined;
  const panes = panesOf(root);
  terminals.zoomId = null;
  if (panes.length >= 2) {
    terminals.activeId = remembered && panes.includes(remembered) ? remembered : panes[0];
    return;
  }
  terminals.activeId =
    remembered && visible.some((t) => t.id === remembered) ? remembered : (visible[0]?.id ?? null);
}

/** Chiave della notifica sticky di un terminale in attesa (coalescing + rimozione mirata). */
const bellKey = (id: string) => `bell:${id}`;

/** Azzera il pallino "attenzione" di una scheda (quando la guardi davvero), rimuove la notifica
 *  sticky associata e, se non resta nessun terminale in attesa, ferma l'evidenziazione della taskbar. */
export function clearAttention(id: string | null) {
  if (!id) return;
  const t = terminals.list.find((s) => s.id === id);
  if (t) t.needsAttention = false;
  dismissByKey(bellKey(id));
  if (!anyNeedsAttention()) cancelTaskbarAttention();
}

/** Qualche terminale richiede attenzione? (pilota il "●" nel titolo + la taskbar). */
export function anyNeedsAttention(): boolean {
  return terminals.list.some((t) => t.needsAttention);
}

/** Una repo (root path) ha qualche terminale in attesa? → pallino sulla SUA tab nella repo bar, così
 *  capisci QUALE repo ha finito anche se ora ne guardi un'altra (le tab di altre repo sono nascoste). */
export function repoNeedsAttention(root: string | null): boolean {
  return !!root && terminals.list.some((t) => t.root === root && t.needsAttention);
}

/** Terminali attualmente in attesa (Claude finito/aspetta), in ordine di creazione — pilotano il
 *  pill "Waiting (N)" in top bar; il primo è il più vecchio. */
export function waitingTerminals(): TermSession[] {
  return terminals.list.filter((t) => t.needsAttention);
}

/** Porta l'utente al terminale `id`: passa alla sua repo se serve, mostra il pannello, attiva e mette
 *  a fuoco la scheda (azzerando l'attenzione). Usato dalla notifica sticky e dal pill in top bar. */
export async function goToTerminal(id: string) {
  const t = terminals.list.find((s) => s.id === id);
  if (!t) return;
  if (t.root && t.root !== workspace.rootPath) {
    // import dinamico: folders→persist→terminals sarebbe un ciclo a tempo di modulo (vedi explorer.ts)
    const { openFromList } = await import("./folders.svelte");
    await openFromList(t.root);
    // switch ANNULLATO (edit non salvati) o FALLITO (cartella sparita): non siamo su quella repo →
    // non attivare un terminale altrui né azzerare la sua notifica (l'utente non è arrivato lì).
    if (workspace.rootPath !== t.root) return;
  }
  layout.terminalVisible = true;
  setActiveTerminal(id); // attiva la scheda + clearAttention(id) (rimuove anche la notifica sticky)
}

/** Focus REALE nel terminale `id` (textarea xterm) — più fine del focus di finestra: così, se stai
 *  editando codice mentre Claude gira, la bell ti avvisa lo stesso (non sei "sul" terminale). */
export function setTerminalFocus(id: string) {
  terminals.focusedId = id;
  // chat affiancate: cliccare dentro un riquadro lo rende quello attivo (scheda evidenziata, e le
  // schede cliccate dopo finiscono qui)
  if (terminals.activeId !== id && isShown(id)) {
    terminals.activeId = id;
    const t = terminals.list.find((s) => s.id === id);
    if (t?.root) activeByRoot[t.root] = id;
  }
  clearAttention(id); // metterlo a fuoco = l'hai visto
}
export function clearTerminalFocus(id: string) {
  if (terminals.focusedId === id) terminals.focusedId = null;
}

let attnPending = false;
function flashTaskbar() {
  attnPending = true;
  // Critical: su Windows il pulsante in taskbar resta evidenziato FINCHÉ non riporti la finestra a
  // fuoco (non un lampo singolo) → se eri altrove, al ritorno lo vedi.
  void getCurrentWindow().requestUserAttention(UserAttentionType.Critical).catch(() => {});
}
/** Ferma l'evidenziazione taskbar (nessun terminale più in attesa). */
export function cancelTaskbarAttention() {
  if (!attnPending) return;
  attnPending = false;
  void getCurrentWindow().requestUserAttention(null).catch(() => {});
}

/** La bell (BEL) del terminale `id` ha suonato: tipicamente Claude ha finito un turno o aspetta
 *  input. Segnala attenzione persistente — pallino su scheda + tab repo + "●" nel titolo, toast se
 *  Orbit è a fuoco, evidenziazione taskbar se è in background — SOLO se non stai già USANDO quel
 *  terminale (focus reale). Anti-spam: non ripete. Disattivabile da Impostazioni. */
export function notifyTerminalBell(id: string) {
  if (!settings.bellNotify) return;
  const t = terminals.list.find((s) => s.id === id);
  if (!t) return;
  const watching =
    document.hasFocus() &&
    layout.terminalVisible &&
    terminals.activeId === id &&
    terminals.focusedId === id;
  if (watching) return;
  // Chat affiancate: se quel riquadro è già sotto i tuoi occhi (visibile, Orbit a fuoco) basta il
  // pallino che pulsa sulla sua testata e sulla scheda — niente toast.
  const inSight = document.hasFocus() && layout.terminalVisible && panesOf(t.root).length >= 2 && isShown(id);
  if (inSight) {
    t.needsAttention = true;
    return;
  }
  if (!t.needsAttention) {
    t.needsAttention = true;
    // notifica PERSISTENTE e cliccabile: resta finché apri quel terminale (clearAttention →
    // dismissByKey) o la chiudi. Creata anche se Orbit è in background → la trovi al ritorno.
    const where = t.root ? `${basename(t.root)} › ${t.title}` : t.title;
    notifyAttention({
      key: bellKey(id),
      message: `Claude in ${where} is waiting for you`,
      onClick: () => void goToTerminal(id),
    });
  }
  if (!document.hasFocus()) flashTaskbar();
}

/** Chiude una tab: uccide il PTY e attiva un vicino; se era l'ultima nasconde il pannello. */
export async function closeTerminal(id: string) {
  await invoke("pty_kill", { id }).catch(() => {});
  const i = terminals.list.findIndex((t) => t.id === id);
  if (i !== -1) removeAt(i);
}

/** Garantisce almeno una tab (chiamata quando il pannello diventa visibile). */
export function ensureTerminal() {
  if (terminals.list.length === 0) addTerminal();
}
