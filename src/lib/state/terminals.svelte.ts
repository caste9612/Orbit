// Sessioni del pannello terminale: lista di tab + tab attiva. Ogni sessione ha un
// id univoco usato dal PTY (backend). Le tab restano tutte montate (visibilità CSS)
// così scrollback e shell si conservano quando si cambia tab.
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow, UserAttentionType } from "@tauri-apps/api/window";
import { layout, animate } from "./layout.svelte";
import { settings } from "./settings.svelte";
import { notify, notifyAttention, dismissByKey } from "./toast.svelte";
import { workspace } from "./workspace.svelte";
import { basename } from "../util";
import {
  arrange,
  arrangeAuto,
  flatten,
  insertPane,
  placeBeside,
  removePane,
  replacePane,
  splitPartner,
  MAX_PANES,
  type Arrangement,
  type Layout,
  type Side,
} from "./terminalLayout";

export interface TermSession {
  id: string;
  title: string; // nome di nascita completo ("Claude · Aggiorna documentazione", "PowerShell 7"…): tooltip e icona di tipo
  shortName: string; // nome di default MINIMO e numerato ("Claude 2", "pwsh 1"); le run config tengono il loro nome
  customTitle: string | null; // nome dato dall'utente (rinomina): vince su tutto
  autoTitle: string | null; // riassunto della chat che Claude Code scrive nel titolo del terminale (OSC 0/2): sottotitolo
  color: string; // tinta della scheda (palette TAB_COLORS, assegnata a rotazione; modificabile)
  shell: string | null; // null = shell default di piattaforma
  cwd: string | null; // cartella di lavoro (null = radice del workspace)
  root: string | null; // repo (workspace.rootPath) di appartenenza → il pannello filtra per repo attiva
  initCommand: string | null; // comando lanciato all'avvio (run config)
  started: boolean; // initCommand già inviato (evita ri-esecuzione al remount)
  attach: boolean; // true = si collega a un PTY esistente (terminale reincollato dalla finestra flottante)
  needsAttention: boolean; // la bell ha suonato (Claude ha finito / aspetta input) mentre non lo guardavi
}

let counter = 0;

// Tinte delle schede: la STESSA palette dei colori di sessione della vista Attività (SESSION_COLORS in
// activity.svelte.ts — duplicata qui per non creare il ciclo terminals → activity → claude → terminals),
// assegnate a rotazione alla creazione e cambiabili dal menu della scheda.
export const TAB_COLORS: { color: string; name: string }[] = [
  { color: "#4c8dff", name: "Blue" },
  { color: "#b07aff", name: "Violet" },
  { color: "#2fbf9b", name: "Teal" },
  { color: "#e0a45e", name: "Amber" },
  { color: "#e06c9f", name: "Pink" },
  { color: "#5bc88a", name: "Green" },
  { color: "#38bdf8", name: "Sky" },
  { color: "#c8b45b", name: "Olive" },
  { color: "#f97066", name: "Coral" },
  { color: "#8b93f8", name: "Indigo" },
];

/** Nome mostrato sulla scheda: quello dato dall'utente, altrimenti il nome breve numerato. */
export function displayTitle(t: TermSession): string {
  return t.customTitle ?? t.shortName;
}

/** Icona di tipo della scheda: ✨ per le chat di Claude, terminale per le shell (la tinta è `t.color`).
 *  Condivisa da pannello e striscia compressa. */
export function tabIcon(t: Pick<TermSession, "shell" | "title">): string {
  return `${t.shell ?? ""} ${t.title}`.toLowerCase().includes("claude") ? "sparkles" : "terminal";
}

// Contatori per tipo ("Claude", "pwsh", "cmd"…): il nome breve è `<tipo> <n>`, stabile anche se si
// chiudono schede precedenti (niente rinumerazioni a sorpresa).
const kindCounters: Record<string, number> = {};
const SHELL_SHORT: Record<string, string> = {
  powershell: "pwsh",
  "powershell 7": "pwsh7",
  "prompt dei comandi": "cmd",
  "git bash": "bash",
  wsl: "wsl",
};
/** Tipo breve della scheda, o null se il nome dato va tenuto così com'è (run config, script). */
function shortKind(opts: NewTerminal): string | null {
  const t = (opts.title ?? "").trim();
  if (/^claude/i.test(t)) return "Claude";
  if (!t) return navigator.platform.startsWith("Win") ? "pwsh" : "shell"; // shell di default della piattaforma
  if (opts.shell) return SHELL_SHORT[t.toLowerCase()] ?? t.toLowerCase().split(/\s+/)[0]; // scheda dal selettore shell
  return null;
}
function nextShortName(opts: NewTerminal): string {
  const kind = shortKind(opts);
  if (!kind) return opts.title!;
  kindCounters[kind] = (kindCounters[kind] ?? 0) + 1;
  return `${kind} ${kindCounters[kind]}`;
}

/** Rinomina (stringa vuota = torna al nome automatico). */
export function renameTerminal(id: string, name: string) {
  const t = terminals.list.find((s) => s.id === id);
  if (t) t.customTitle = name.trim() || null;
}

export function setTerminalColor(id: string, color: string) {
  const t = terminals.list.find((s) => s.id === id);
  if (t) t.color = color;
}

/** Titolo arrivato dal terminale (sequenza OSC 0/2). Serve SOLO per le chat: Claude Code vi scrive
 *  un riassunto della conversazione, mostrato come sottotitolo (le shell vi mettono percorsi e
 *  comandi: rumore, ignorato). Ripulito dai simboli iniziali (es. "✳ "), scartato se generico. */
export function setAutoTitle(id: string, raw: string) {
  const t = terminals.list.find((s) => s.id === id);
  if (!t || !/^claude/i.test(t.title)) return;
  const clean = raw.replace(/^[^\p{L}\p{N}]+/u, "").trim().slice(0, 80);
  t.autoTitle = clean && !/^claude( code)?$/i.test(clean) ? clean : null;
}

export const terminals = $state({
  list: [] as TermSession[],
  activeId: null as string | null,
  focusedId: null as string | null, // terminale col focus REALE (textarea xterm), non solo finestra
  // Chat affiancate (M54/M55): per repo (chiave = rootKey) la DISPOSIZIONE dei terminali visibili
  // insieme — colonne di righe, vedi terminalLayout.ts. Meno di 2 riquadri = scheda singola (si vede
  // solo l'attivo). Il riquadro attivo è sempre `activeId`. In modalità `auto` (default) la
  // disposizione si ricalcola dallo spazio disponibile (il layout salvato conta solo per l'ordine);
  // un trascinamento con direzione o una scelta dal menu la rendono manuale.
  layouts: {} as Record<string, Layout>,
  autoLayout: {} as Record<string, boolean>,
  // dimensioni dei riquadri per repo (frazioni di colonne e, per colonna, di righe), valide finché la
  // FORMA del layout (numero di righe per colonna) resta quella: cambiata la forma si riparte equi
  sizes: {} as Record<string, PaneSizes>,
  zoomId: null as string | null, // riquadro ingrandito temporaneamente (gli altri restano vivi)
  surfW: 0, // dimensioni della superficie del pannello (le aggiorna TerminalPanel): servono alle
  surfH: 0, // scelte "automatiche" fatte qui (placeBeside, arrange)
});

// Scheda attiva RICORDATA per repo (chiave = root path): cambiando repo si ripristina quella giusta.
const activeByRoot: Record<string, string> = {};
// Schede usate più di recente per repo (la prima è l'attiva): servono allo "split di sé" (M57), cioè
// alla scheda da mettere dall'altra parte quando trascini la chat visibile sul bordo del suo riquadro.
const recentByRoot: Record<string, string[]> = {};
function touchRecent(root: string | null, id: string) {
  const r = (recentByRoot[rootKey(root)] ??= []);
  const i = r.indexOf(id);
  if (i !== -1) r.splice(i, 1);
  r.unshift(id);
  if (r.length > 16) r.length = 16;
}
const sameRoot = (a: string | null, b: string | null) => a === b;

/** Chiave per repo dei riquadri (una cartella non aperta = ""). */
export const rootKey = (root: string | null) => root ?? "";

/** Disposizione salvata della repo `root` ([] = nessuno split). */
export function layoutOf(root: string | null): Layout {
  return terminals.layouts[rootKey(root)] ?? [];
}

/** Riquadri affiancati della repo `root`, in ordine ([] = nessuno split). */
export function panesOf(root: string | null): string[] {
  return flatten(layoutOf(root));
}

export function isAutoLayout(root: string | null): boolean {
  return terminals.autoLayout[rootKey(root)] ?? true;
}

/** Disposizione EFFETTIVA mostrata per `root`: in auto si ricalcola dallo spazio `width`×`height`. */
export function effectiveLayout(root: string | null, width: number, height: number): Layout {
  const lay = layoutOf(root);
  return isAutoLayout(root) ? arrangeAuto(flatten(lay), width, height) : lay;
}

/** Salva la disposizione (sotto i 2 riquadri = nessuno split); `manual` cambia anche la modalità.
 *  Se la disposizione cambia davvero, i riquadri scivolano alla nuova geometria (movimento fluido). */
function setLayout(root: string | null, next: Layout, manual?: boolean) {
  const k = rootKey(root);
  const val: Layout = flatten(next).length >= 2 ? next : [];
  if (JSON.stringify(terminals.layouts[k] ?? []) !== JSON.stringify(val)) animate(() => (terminals.layouts[k] = val), "panes");
  else terminals.layouts[k] = val;
  if (manual !== undefined) terminals.autoLayout[k] = !manual;
}

/** TerminalPanel comunica le dimensioni della superficie (per le scelte automatiche). */
export function setSurface(width: number, height: number) {
  terminals.surfW = width;
  terminals.surfH = height;
}

export interface PaneSizes {
  shape: string; // "1,2" = una colonna da 1 riga e una da 2
  cols: number[]; // frazioni di larghezza delle colonne (somma 1)
  rows: number[][]; // per colonna, frazioni di altezza delle righe (somma 1)
}
export const shapeOf = (layout: Layout) => layout.map((c) => c.length).join(",");

/** Dimensioni dei riquadri per `layout`: quelle salvate se la forma coincide, altrimenti equidistribuite. */
export function sizesFor(root: string | null, layout: Layout): PaneSizes {
  const saved = terminals.sizes[rootKey(root)];
  const shape = shapeOf(layout);
  if (saved && saved.shape === shape) return saved;
  return {
    shape,
    cols: layout.map(() => 1 / Math.max(1, layout.length)),
    rows: layout.map((c) => c.map(() => 1 / Math.max(1, c.length))),
  };
}

/** Salva le dimensioni dopo un trascinamento dei separatori; la disposizione diventa manuale, così
 *  non si riassesta da sola (e la forma resta quella a cui le dimensioni si riferiscono). */
export function setSizes(root: string | null, layout: Layout, sizes: PaneSizes) {
  terminals.sizes[rootKey(root)] = sizes;
  if (isAutoLayout(root)) setLayout(root, layout, true);
}

/** Disposizione dal menu: `auto` torna adattiva; `columns`/`rows` fissano affiancati/impilati. */
export function setArrangement(root: string | null, mode: Arrangement) {
  if (mode === "auto") {
    animate(() => (terminals.autoLayout[rootKey(root)] = true), "panes");
    return;
  }
  setLayout(root, arrange(panesOf(root), mode, terminals.surfW, terminals.surfH), true);
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
    shortName: nextShortName(opts),
    customTitle: null,
    autoTitle: null,
    color: TAB_COLORS[(counter - 1) % TAB_COLORS.length].color,
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
  const lay = layoutOf(root);
  const panes = flatten(lay);
  if (panes.length >= 2 && !panes.includes(id) && terminals.activeId && panes.includes(terminals.activeId)) {
    setLayout(root, replacePane(lay, terminals.activeId, id));
  }
  if (terminals.zoomId && terminals.zoomId !== id) terminals.zoomId = null;
  terminals.activeId = id;
  if (root) activeByRoot[root] = id;
  touchRecent(root, id);
}

/** La scheda da affiancare a `id` nello "split di sé" (trascini la chat già visibile sul bordo del suo
 *  riquadro, senza split in corso): la più recente fra le altre della stessa repo. null = nessuna. */
export function selfSplitPartner(id: string): string | null {
  const t = terminals.list.find((s) => s.id === id);
  if (!t) return null;
  const others = terminals.list.filter((s) => sameRoot(s.root, t.root) && s.id !== id).map((s) => s.id);
  return splitPartner(id, recentByRoot[rootKey(t.root)] ?? [], others);
}

/** Affianca `id`. Con `anchor`+`side` (trascinamento sul bordo di un riquadro) la direzione È la
 *  disposizione — a destra/sinistra una colonna, sopra/sotto una riga — a partire da ciò che
 *  l'utente VEDE, e la repo passa in modalità manuale. Senza direzione (menu Split, "to the side")
 *  placeBeside sceglie colonna o riga in base allo spazio. Oltre il massimo lo mostra nel riquadro
 *  attivo e avvisa. */
export function splitWith(id: string, anchor: string | null = null, side?: Side) {
  const t = terminals.list.find((s) => s.id === id);
  if (!t) return;
  const lay = layoutOf(t.root);
  const panes = flatten(lay);
  if (panes.length >= MAX_PANES && !panes.includes(id)) {
    notify(`Up to ${MAX_PANES} side-by-side panes`, "info", 2200);
    activate(id);
    return;
  }
  if (anchor === id && side) {
    // "split di sé": la chat visibile trascinata sul bordo del suo riquadro va da quel lato, dall'altro
    // la scheda usata più di recente. Con uno split in corso non ha senso (resterebbe dov'è).
    const partner = panes.length < 2 ? selfSplitPartner(id) : null;
    if (!partner) return;
    setLayout(t.root, insertPane([[partner]], id, partner, side), true);
  } else if (anchor && side) {
    const base: Layout =
      panes.length >= 2
        ? effectiveLayout(t.root, terminals.surfW, terminals.surfH)
        : terminals.activeId && terminals.activeId !== id
          ? [[terminals.activeId]]
          : [];
    setLayout(t.root, insertPane(base, id, anchor, side), true);
  } else {
    setLayout(t.root, placeBeside(lay, id, terminals.activeId, terminals.surfW));
  }
  terminals.zoomId = null;
  activate(id);
}

/** Mette `id` nel riquadro `target` (drag di una scheda al centro di un riquadro). */
export function showInPane(id: string, target: string) {
  const t = terminals.list.find((s) => s.id === target);
  if (!t) return;
  const lay = layoutOf(t.root);
  if (flatten(lay).length >= 2) setLayout(t.root, replacePane(lay, target, id));
  terminals.zoomId = null;
  activate(id);
}

/** Toglie un riquadro dallo split: il terminale NON viene chiuso, resta tra le tab. */
export function closePane(id: string) {
  const t = terminals.list.find((s) => s.id === id);
  if (!t) return;
  const lay = layoutOf(t.root);
  const panes = flatten(lay);
  const i = panes.indexOf(id);
  if (i === -1) return;
  const next = removePane(lay, id);
  setLayout(t.root, next);
  if (terminals.zoomId === id) terminals.zoomId = null;
  if (terminals.activeId === id) {
    const rest = flatten(next);
    const neighbor = rest[Math.min(i, rest.length - 1)] ?? panes.find((p) => p !== id) ?? null;
    if (neighbor) activate(neighbor);
  }
}

/** Ingrandisce un riquadro (gli altri restano vivi, nascosti) o torna alla vista affiancata. */
export function toggleZoom(id: string) {
  animate(() => {
    terminals.zoomId = terminals.zoomId === id ? null : id;
    terminals.activeId = id;
  }, "panes");
}

/** Toglie `id` dagli split di qualunque repo (terminale chiuso o estratto in finestra flottante). */
function dropFromPanes(id: string) {
  for (const k of Object.keys(terminals.layouts)) {
    if (flatten(terminals.layouts[k]).includes(id)) animate(() => (terminals.layouts[k] = removePane(terminals.layouts[k], id)), "panes");
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
export async function redockTerminal(s: { id: string; title: string; shell: string | null; color?: string | null }) {
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
    title: s.title, // la finestra flottante porta il nome MOSTRATO: resta tale anche dopo il rientro
    shortName: s.title,
    customTitle: null,
    autoTitle: null,
    color: s.color || TAB_COLORS[0].color,
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

/** Le schede della repo `from` passano a `to`: finestra leggera promossa a progetto, o schede aperte
 *  quando non c'era nessuna cartella (M57). Prima restavano vive ma nascoste sotto una radice non più
 *  aperta, senza modo di tornarci. */
export function adoptTerminals(from: string | null, to: string | null) {
  if (sameRoot(from, to)) return;
  for (const t of terminals.list) if (sameRoot(t.root, from)) t.root = to;
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
    const where = t.root ? `${basename(t.root)} › ${displayTitle(t)}` : displayTitle(t);
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
