// Template dei documenti HTML (M77): quelli che viaggiano con Orbit (src/lib/htmldoc/templates, generici) e quelli di
// questo PC (~/.orbit/templates, per esempio quelli aziendali, che nel repo pubblico non possono stare).
// Qui solo lo stato della finestra e la lettura: la logica dei campi è in htmldoc/htmlDoc.ts, caricato con la finestra.
import { invoke } from "@tauri-apps/api/core";
import { workspace } from "./workspace.svelte";

export interface DocTemplate {
  id: string; // percorso del file (PC) o nome del file (Orbit)
  source: "pc" | "orbit";
  content: string;
}

export const newDocUI = $state({ open: false, dir: "" });

/** Apre la finestra «New document from template»: il documento va nella cartella `dir` (quella cliccata), o nella
 *  radice del progetto; la finestra la fa cambiare. */
export function openNewDoc(dir?: string) {
  newDocUI.dir = dir || workspace.rootPath || "";
  newDocUI.open = true;
}
export function closeNewDoc() {
  newDocUI.open = false;
}

// i template di Orbit: ognuno un chunk a parte, letto solo quando serve
const bundled = import.meta.glob("../htmldoc/templates/*.html", { query: "?raw", import: "default" });

/** Tutti i template: prima quelli di questo PC, poi quelli di Orbit. `dir` è la cartella di questo PC. */
export async function loadDocTemplates(): Promise<{ dir: string; items: DocTemplate[] }> {
  const items: DocTemplate[] = [];
  let dir = "";
  try {
    const [d, list] = await invoke<[string, [string, string][]]>("list_doc_templates");
    dir = d;
    for (const [path, content] of list) items.push({ id: path, source: "pc", content });
  } catch (e) {
    console.error("list_doc_templates", e);
  }
  for (const [path, load] of Object.entries(bundled)) {
    items.push({ id: path.split("/").pop() ?? path, source: "orbit", content: (await load()) as string });
  }
  return { dir, items };
}
