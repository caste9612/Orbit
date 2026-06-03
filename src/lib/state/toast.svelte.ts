// Notifiche "toast" non invasive (salvataggi, errori). Auto-dismiss dopo qualche secondo.
export interface Toast {
  id: number;
  message: string;
  kind: "info" | "success" | "error";
}

export const toasts = $state({ list: [] as Toast[] });

let counter = 0;

export function notify(message: string, kind: Toast["kind"] = "info", ms = 2600) {
  counter += 1;
  const id = counter;
  toasts.list.push({ id, message, kind });
  setTimeout(() => dismiss(id), ms);
}

export function dismiss(id: number) {
  const i = toasts.list.findIndex((t) => t.id === id);
  if (i >= 0) toasts.list.splice(i, 1);
}
