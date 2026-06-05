// Scratchpad: un file di lavoro persistente in `.orbit/scratch.md` dove appuntare prompt o
// note. Si apre con un click; essendo un vero file su disco resta finché non lo si svuota.
// Personale (git-ignored), come `.orbit/shelf.json`. Si salva con Ctrl+S come ogni file.
import { ensureOrbitFile } from "./dotorbit";
import { openFile } from "./workspace.svelte";

/** Apre lo scratchpad del progetto (creandolo vuoto se assente) nell'editor. */
export async function openScratch() {
  const p = await ensureOrbitFile("scratch.md", "");
  if (p) void openFile(p);
}
