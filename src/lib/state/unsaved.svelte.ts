// Domanda unica per le modifiche non salvate (M59): chiudere schede, la finestra, "chiudi tutte",
// cambiare cartella e aggiornare Orbit passano tutti da qui. Il dialog (Save / Don't save / Cancel, con
// l'elenco dei file) è UnsavedDialog.svelte, montato una volta sola in App.
import { savePath, type OpenFile } from "./workspace.svelte";

export type UnsavedChoice = "save" | "discard" | "cancel";

export const unsavedUI = $state({
  files: [] as OpenFile[], // vuoto = dialog chiuso
  discardLabel: "Don't save", // es. "Discard and update"
});

let pending: ((c: UnsavedChoice) => void) | null = null;

/** Mostra il dialog per `files` e aspetta la scelta. Una domanda alla volta: una nuova annulla la vecchia. */
export function askUnsaved(files: OpenFile[], opts: { discardLabel?: string } = {}): Promise<UnsavedChoice> {
  pending?.("cancel");
  unsavedUI.files = files;
  unsavedUI.discardLabel = opts.discardLabel ?? "Don't save";
  return new Promise((resolve) => (pending = resolve));
}

export function answerUnsaved(choice: UnsavedChoice) {
  const resolve = pending;
  pending = null;
  unsavedUI.files = [];
  resolve?.(choice);
}

/**
 * Chiede per `files` e, se l'utente sceglie di salvare, li salva. true = si può procedere (salvati o
 * scartati); false = annullato, o un salvataggio è fallito (il file resta modificato, con l'errore).
 */
export async function resolveUnsaved(files: OpenFile[], opts: { discardLabel?: string } = {}): Promise<boolean> {
  if (!files.length) return true;
  const choice = await askUnsaved(files, opts);
  if (choice === "cancel") return false;
  if (choice === "save") {
    for (const f of files) await savePath(f.path);
    return files.every((f) => !f.dirty);
  }
  return true;
}
