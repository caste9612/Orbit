// Notifiche "toast" non invasive (salvataggi, errori), in basso a destra (Toaster.svelte).
//   - Avvisi normali: spariscono da soli dopo `ms`, ma si fermano finché ci passi sopra col mouse (M74).
//   - Errori (M74): restano finché li chiudi, con «Copy» per copiarne il testo; il messaggio in chiaro sopra,
//     il dettaglio tecnico (`detail`) sotto.
//   - "attention" (sticky + cliccabile): le chat di Claude in attesa (un avviso solo, vedi
//     terminals.syncWaitingToast) e gli aggiornamenti; restano finché agisci.
// Ogni avviso finisce anche nello storico della 🔔 nella barra di stato (`notices`, M74).
import { writeClipboard } from "../clipboard";

export type ToastKind = "info" | "success" | "error" | "attention";
export interface ToastAction {
  label: string;
  run: () => void;
  keep?: boolean; // il click non chiude l'avviso (es. «Copy»)
}
/** Una riga dell'elenco di un avviso: il pallino del suo colore, il nome, un dettaglio tenue. */
export interface ToastItem {
  label: string;
  detail?: string;
  color?: string;
  run: () => void;
}
export interface Toast {
  id: number;
  message: string;
  detail?: string; // dettaglio tecnico, sotto il messaggio in piccolo (M74)
  kind: ToastKind;
  sticky?: boolean; // niente auto-dismiss: resta finché click / ✕ / rimozione esterna
  onClick?: () => void; // azione al click sul corpo (es. vai al terminale che aspetta)
  key?: string; // coalescing/dedup: due notifiche con la stessa key non si duplicano
  icon?: string; // icona al posto di quella del tipo (es. "download" per gli aggiornamenti, M59)
  actions?: ToastAction[]; // pulsanti a destra (es. «Undo» dello scaffale, M73; «Copy» degli errori, M74)
  items?: ToastItem[]; // elenco cliccabile sotto il messaggio (le chat in attesa, M74)
  count?: number; // un numero in una pillola accanto al messaggio (quante chat aspettano)
  ms?: number; // durata, per la barra del tempo che resta; assente negli avvisi fissi
}

export const toasts = $state({ list: [] as Toast[] });

let counter = 0;

// ---- durata, con pausa al passaggio del mouse (M74) -----------------------------------------------
const timers = new Map<number, { left: number; since: number; handle?: ReturnType<typeof setTimeout> }>();

function schedule(id: number, ms: number) {
  timers.set(id, { left: ms, since: Date.now(), handle: setTimeout(() => dismiss(id), ms) });
}
/** Ferma il conto alla rovescia di un avviso (il mouse ci è sopra). */
export function pauseToast(id: number) {
  const t = timers.get(id);
  if (!t?.handle) return;
  clearTimeout(t.handle);
  t.handle = undefined;
  t.left -= Date.now() - t.since;
}
/** Riprende il conto alla rovescia da dove si era fermato (con un minimo, per non sparire di colpo). */
export function resumeToast(id: number) {
  const t = timers.get(id);
  if (!t || t.handle) return;
  t.left = Math.max(800, t.left);
  t.since = Date.now();
  t.handle = setTimeout(() => dismiss(id), t.left);
}

// ---- storico per la 🔔 della barra di stato (M74) -------------------------------------------------
export interface Notice {
  id: number;
  at: number; // Date.now()
  message: string;
  detail?: string;
  kind: ToastKind;
  icon?: string;
  onClick?: () => void; // solo le azioni che restano valide (andare a una chat, aprire un aggiornamento): non «Undo»
  seen?: boolean; // già vista nell'elenco della 🔔 (le nuove hanno un pallino finché non apri l'elenco)
}
const MAX_NOTICES = 50;
/** Le ultime notifiche, dalla più recente; `unread` conta errori e chat in attesa non ancora visti (le
 *  conferme come «Name copied» vanno nell'elenco ma non nel numero, che altrimenti non direbbe nulla). */
export const notices = $state({ list: [] as Notice[], unread: 0, unreadErrors: 0 });

/** Aggiunge una voce allo storico della 🔔 (le notifiche ci arrivano da sole; serve a chi ne vuole una senza avviso). */
export function addNotice(n: Omit<Notice, "id" | "at">) {
  counter += 1;
  notices.list.unshift({ ...n, id: counter, at: Date.now() });
  if (notices.list.length > MAX_NOTICES) notices.list.splice(MAX_NOTICES);
  if (n.kind === "error" || n.kind === "attention") notices.unread++;
  if (n.kind === "error") notices.unreadErrors++;
}
export function markNoticesRead() {
  notices.unread = 0;
  notices.unreadErrors = 0;
  for (const n of notices.list) n.seen = true;
}
export function clearNotices() {
  notices.list = [];
  markNoticesRead();
}

/** Copia negli appunti messaggio e dettaglio di un errore. */
async function copyError(message: string, detail?: string) {
  await writeClipboard(detail ? `${message}\n${detail}` : message);
}

/**
 * Un avviso. Gli errori restano finché li chiudi e hanno «Copy» (M74); gli altri spariscono dopo `ms`.
 * `detail`: il dettaglio tecnico (es. l'errore del sistema), sotto il messaggio. `action`: un pulsante (es.
 * «Undo»). `key`: prende il posto dell'avviso con la stessa key ancora a video, invece di accodarsi (M73).
 */
export function notify(
  message: string,
  kind: ToastKind = "info",
  ms = 2600,
  opts: { action?: ToastAction; key?: string; detail?: string } = {},
) {
  if (opts.key) dismissByKey(opts.key);
  counter += 1;
  const id = counter;
  const error = kind === "error";
  const actions = [
    ...(opts.action ? [opts.action] : []),
    ...(error ? [{ label: "Copy", keep: true, run: () => void copyError(message, opts.detail) }] : []),
  ];
  toasts.list.push({
    id,
    message,
    detail: opts.detail,
    kind,
    actions: actions.length ? actions : undefined,
    key: opts.key,
    sticky: error,
    ms: error ? undefined : ms,
  });
  if (!error) schedule(id, ms);
  addNotice({ message, detail: opts.detail, kind });
}

/**
 * Notifica PERSISTENTE e cliccabile (no auto-dismiss). Con la stessa `key` aggiorna quella che c'è (testo,
 * elenco, azione) invece di aggiungerne un'altra: così le chat in attesa sono un avviso solo che cambia
 * (M74). Con `notice: false` non finisce nello storico (chi la chiama ce le mette una per una).
 */
export function notifyAttention(opts: {
  key: string;
  message: string;
  detail?: string;
  onClick?: () => void;
  icon?: string;
  items?: Toast["items"];
  count?: number;
  notice?: boolean;
}) {
  const fields = {
    message: opts.message,
    detail: opts.detail,
    onClick: opts.onClick,
    icon: opts.icon,
    items: opts.items,
    count: opts.count,
  };
  const existing = toasts.list.find((t) => t.key === opts.key);
  if (existing) {
    Object.assign(existing, fields);
    return;
  }
  counter += 1;
  toasts.list.push({ id: counter, kind: "attention", sticky: true, key: opts.key, ...fields });
  if (opts.notice !== false) addNotice({ message: opts.message, kind: "attention", icon: opts.icon, onClick: opts.onClick });
}

export function dismiss(id: number) {
  const t = timers.get(id);
  if (t?.handle) clearTimeout(t.handle);
  timers.delete(id);
  const i = toasts.list.findIndex((x) => x.id === id);
  if (i >= 0) toasts.list.splice(i, 1);
}

/** Rimuove la notifica con quella `key` (es. quando apri il terminale che era in attesa). */
export function dismissByKey(key: string) {
  const t = toasts.list.find((x) => x.key === key);
  if (t) dismiss(t.id);
}
