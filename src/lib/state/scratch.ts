// Scratchpad: un file di lavoro persistente in `.orbit/scratch.txt` dove appuntare prompt o
// note. Si apre con un click; essendo un vero file su disco resta finché non lo si svuota.
// Personale (git-ignored), come `.orbit/shelf.json`. Si salva con Ctrl+S come ogni file.
// Testo semplice: fino alla v0.8.9 era `scratch.md`, ma per appunti e prompt il Markdown non serve
// (toggle anteprima, evidenziazione) → al primo utilizzo il vecchio file viene rinominato.
import { invoke } from "@tauri-apps/api/core";
import { ensureOrbitFile, orbitPath } from "./dotorbit";
import { openFile, renameOpenPaths } from "./workspace.svelte";

const FILE = "scratch.txt";
const LEGACY = "scratch.md";

async function exists(path: string): Promise<boolean> {
  return (await invoke<string | null>("resolve_existing", { paths: [path] }).catch(() => null)) !== null;
}

/** Migrazione una tantum: se c'è solo lo `scratch.md` storico lo rinomina in `.txt` (contenuto
 *  intatto) e riallinea le eventuali tab aperte. Se esistono entrambi non tocca nulla. */
async function migrateLegacy() {
  const txt = orbitPath(FILE);
  const md = orbitPath(LEGACY);
  if (!txt || !md || (await exists(txt)) || !(await exists(md))) return;
  try {
    await invoke("rename_path", { from: md, to: txt });
    renameOpenPaths(md, txt);
  } catch (e) {
    console.error("scratch: migrazione .md → .txt", e);
  }
}

/** Apre lo scratchpad del progetto (creandolo vuoto se assente) nell'editor. */
export async function openScratch() {
  await migrateLegacy();
  const p = await ensureOrbitFile(FILE, "");
  if (p) void openFile(p);
}
