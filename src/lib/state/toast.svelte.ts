// Notifiche "toast" non invasive (salvataggi, errori). Auto-dismiss dopo qualche secondo.
// Variante "attention" (sticky + cliccabile): per la notifica "Claude in attesa", che resta finché
// non agisci e ti porta al terminale giusto (vedi terminals.notifyTerminalBell / goToTerminal).
export interface Toast {
  id: number;
  message: string;
  kind: "info" | "success" | "error" | "attention";
  sticky?: boolean; // niente auto-dismiss: resta finché click / ✕ / rimozione esterna
  onClick?: () => void; // azione al click sul corpo (es. vai al terminale che aspetta)
  key?: string; // coalescing/dedup: due notifiche con la stessa key non si duplicano
}

export const toasts = $state({ list: [] as Toast[] });

let counter = 0;

export function notify(message: string, kind: Toast["kind"] = "info", ms = 2600) {
  counter += 1;
  const id = counter;
  toasts.list.push({ id, message, kind });
  setTimeout(() => dismiss(id), ms);
}

/** Notifica PERSISTENTE e cliccabile (no auto-dismiss). `key` evita i doppioni: se ne esiste già una
 *  con la stessa key non ne aggiunge un'altra. La si rimuove con dismissByKey (o click / ✕). */
export function notifyAttention(opts: { key: string; message: string; onClick?: () => void }) {
  if (toasts.list.some((t) => t.key === opts.key)) return; // coalescing
  counter += 1;
  toasts.list.push({
    id: counter,
    message: opts.message,
    kind: "attention",
    sticky: true,
    onClick: opts.onClick,
    key: opts.key,
  });
}

export function dismiss(id: number) {
  const i = toasts.list.findIndex((t) => t.id === id);
  if (i >= 0) toasts.list.splice(i, 1);
}

/** Rimuove la notifica con quella `key` (es. quando apri il terminale che era in attesa). */
export function dismissByKey(key: string) {
  const i = toasts.list.findIndex((t) => t.key === key);
  if (i >= 0) toasts.list.splice(i, 1);
}
