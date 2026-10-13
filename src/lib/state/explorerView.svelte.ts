// Vista dell'Explorer (M70): le cartelle come su disco, oppure una soluzione di Visual Studio (.sln/.slnx)
// della repo, come il Solution Explorer. Qui sta solo quel che serve all'avvio e alla testata della barra
// laterale (le soluzioni trovate e la scelta, ricordata per repo); albero, caricamento e comandi della vista
// Solution stanno in solution.svelte.ts, caricato con la vista.
import { invoke } from "@tauri-apps/api/core";
import { workspace } from "./workspace.svelte";
import { pathKey, relTo } from "../util";

const STORE = "orbit.explorerView";

interface Saved {
  /** soluzione mostrata, relativa alla radice della repo */
  sln?: string;
  showAll?: boolean;
}

function load(): Record<string, Saved> {
  try {
    const v = JSON.parse(localStorage.getItem(STORE) ?? "{}");
    return v && typeof v === "object" && !Array.isArray(v) ? v : {};
  } catch {
    return {};
  }
}

export const explorerView = $state({
  /** repo a cui si riferiscono `solutions` e la scelta */
  root: null as string | null,
  /** soluzioni della repo (percorsi assoluti), prima quelle più in alto */
  solutions: [] as string[],
  /** soluzione mostrata; null = le cartelle */
  current: null as string | null,
  /** Show All Files: anche quello che i progetti escludono (bin, obj…), in grigio */
  showAll: false,
  /** «Collapse all» dalla testata nella vista Solution (la vista ascolta il contatore) */
  collapseSeq: 0,
});

const relKey = (p: string, root: string) => pathKey(relTo(p, root));

let seq = 0;
/** Cerca le soluzioni della repo aperta e ripristina la vista scelta l'ultima volta (la prima volta: le
 *  cartelle). Si richiama quando cambia la repo o compare/sparisce un .sln. */
export async function detectSolutions(root: string | null = workspace.rootPath) {
  const my = ++seq;
  if (!root || workspace.light) {
    Object.assign(explorerView, { root, solutions: [], current: null, showAll: false });
    return;
  }
  const found = await invoke<string[]>("sln_find", { root }).catch(() => [] as string[]);
  if (my !== seq || workspace.rootPath !== root) return;
  const saved = load()[pathKey(root)] ?? {};
  // la soluzione scelta resta se c'è ancora (anche dopo un rilevamento ripetuto nella stessa repo)
  const keep = explorerView.root === root ? explorerView.current : null;
  const want = keep ?? (saved.sln ? (found.find((p) => relKey(p, root) === saved.sln) ?? null) : null);
  explorerView.root = root;
  explorerView.solutions = found;
  explorerView.current = want && found.some((p) => pathKey(p) === pathKey(want)) ? want : null;
  explorerView.showAll = !!saved.showAll;
}

function save() {
  const root = explorerView.root;
  if (!root) return;
  const all = load();
  const entry: Saved = {};
  if (explorerView.current) entry.sln = relKey(explorerView.current, root);
  if (explorerView.showAll) entry.showAll = true;
  if (entry.sln || entry.showAll) all[pathKey(root)] = entry;
  else delete all[pathKey(root)];
  try {
    localStorage.setItem(STORE, JSON.stringify(all));
  } catch {
    /* storage non disponibile: la scelta vale fino alla chiusura */
  }
}

/** Mostra la soluzione `path` (null = le cartelle) e lo ricorda per la repo. */
export function setExplorerView(path: string | null) {
  explorerView.current = path;
  save();
}

export function setShowAll(on: boolean) {
  explorerView.showAll = on;
  save();
}
