// Riferimento all'EditorView attualmente a fuoco. Serve a "Vai al simbolo" per leggere
// l'albero sintattico del file attivo su richiesta (non reattivo: letto all'apertura del palette).
import type { EditorView } from "@codemirror/view";

let current: EditorView | null = null;

export function setActiveEditor(v: EditorView) {
  current = v;
}
export function clearActiveEditor(v: EditorView) {
  if (current === v) current = null;
}
export function getActiveEditor(): EditorView | null {
  return current;
}
