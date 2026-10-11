// Quick-open (Ctrl+P): apertura rapida di un file per nome, con ranking fuzzy.
// L'elenco file è fornito dal comando Rust `list_files` e caricato all'apertura.
import { workspace, openFile } from "./workspace.svelte";
import { listFiles, type FileRef } from "./projectFiles";

export type { FileRef };

export const quickopen = $state({
  open: false,
  query: "",
  results: [] as FileRef[], // sottoinsieme filtrato/ordinato
  index: 0,
  loading: false,
});

// Tutti i file del progetto (fino a 20.000), FUORI dallo stato reattivo (M62): nello $state diventavano
// proxy al primo filtro e restavano in memoria anche a palette chiusa. Chiusa la palette si rilasciano:
// l'elenco resta comunque nella cache di projectFiles finché un file non cambia.
let files: FileRef[] = [];

const CAP = 200; // righe mostrate al massimo

export async function openPalette() {
  const root = workspace.rootPath;
  if (!root) return;
  quickopen.open = true;
  quickopen.query = "";
  quickopen.index = 0;
  quickopen.loading = true;
  try {
    files = await listFiles(root);
  } catch (e) {
    console.error("list_files", e);
    files = [];
  }
  quickopen.loading = false;
  filter();
}

export function closePalette() {
  quickopen.open = false;
  files = [];
}

export function setQuery(q: string) {
  quickopen.query = q;
  quickopen.index = 0;
  filter();
}

export function move(delta: number) {
  const n = quickopen.results.length;
  if (!n) return;
  quickopen.index = (quickopen.index + delta + n) % n;
}

export function choose() {
  const f = quickopen.results[quickopen.index];
  closePalette();
  if (f) void openFile(f.path);
}

function baseOf(rel: string): string {
  const i = rel.lastIndexOf("/");
  return i < 0 ? rel : rel.slice(i + 1);
}

/** Punteggio match (più alto = migliore); -1 se non corrisponde.
 *  Priorità: substring nel nome file > substring nel path > sottosequenza. */
function score(rel: string, base: string, q: string): number {
  const bi = base.indexOf(q);
  if (bi >= 0) return 2000 - bi - base.length;
  const ri = rel.indexOf(q);
  if (ri >= 0) return 1000 - ri - rel.length * 0.1;
  let qi = 0;
  let gaps = 0;
  let last = -1;
  for (let i = 0; i < rel.length && qi < q.length; i++) {
    if (rel[i] === q[qi]) {
      if (last >= 0) gaps += i - last - 1;
      last = i;
      qi++;
    }
  }
  return qi === q.length ? 200 - gaps - rel.length * 0.1 : -1;
}

function filter() {
  const q = quickopen.query.trim().toLowerCase();
  if (!q) {
    quickopen.results = files.slice(0, CAP);
    return;
  }
  const scored: { f: FileRef; s: number }[] = [];
  for (const f of files) {
    const rel = f.rel.toLowerCase();
    const s = score(rel, baseOf(rel), q);
    if (s >= 0) scored.push({ f, s });
  }
  scored.sort((a, b) => b.s - a.s || a.f.rel.length - b.f.rel.length);
  quickopen.results = scored.slice(0, CAP).map((x) => x.f);
}
