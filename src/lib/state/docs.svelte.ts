// Vista "Docs": costruisce un ALBERO della documentazione del progetto a partire dai
// markdown (README di root + tutto sotto docs/), riusando il comando Rust `list_files`.
// L'albero rispecchia le cartelle, ordina per prefisso numerico (00-…99-), pulisce i
// titoli e spinge in fondo (attenuate) le cartelle "meta" con prefisso "_".
import { workspace, openFile, setPreview } from "./workspace.svelte";
import { listFiles } from "./projectFiles";

export interface DocNode {
  key: string; // id stabile = path di visualizzazione (segmenti, docs/ rimosso)
  title: string; // titolo leggibile
  num: string | null; // prefisso numerico di ordinamento (badge), se presente
  isDir: boolean;
  meta: boolean; // cartella "_" (attenuata, collassata, in fondo)
  rank: number;
  path?: string; // assoluto (solo file)
  rel?: string; // relativo alla radice (solo file)
  children: DocNode[];
}

export const docs = $state({
  roots: [] as DocNode[],
  loading: false,
  count: 0, // numero di pagine (per lo stato vuoto)
});

const MD = /\.(md|markdown)$/i;
const INDEX = /^(readme|index|_index|overview)\.(md|markdown)$/i;
// acronimi comuni da mostrare in maiuscolo nei titoli
const ACR = new Set([
  "api", "ui", "ux", "id", "fsm", "ws", "xcp", "dm", "be", "fe", "html", "css",
  "json", "url", "db", "io", "cli", "sdk", "http", "rest", "ipc", "pty", "faq",
  "ci", "cd", "wsl", "os", "kpi", "sla", "uml",
]);

const numPrefix = (name: string): string | null => /^(\d+)[-_]/.exec(name)?.[1] ?? null;

/** Titolo leggibile: toglie prefisso numerico/underscore, kebab/snake → Title Case. */
function titleOf(name: string, isDir: boolean): string {
  let s = isDir ? name : name.replace(MD, "");
  s = s.replace(/^\d+[-_]/, "").replace(/^_+/, "");
  s = s.replace(/[-_]+/g, " ").trim();
  s = s.replace(/[A-Za-z]+/g, (w) =>
    ACR.has(w.toLowerCase()) ? w.toUpperCase() : w[0].toUpperCase() + w.slice(1),
  );
  return s || name;
}

/** Ordinamento: index per primo, poi prefisso numerico, poi file, poi cartelle, _ in fondo. */
function rankOf(name: string, isDir: boolean, isIndex: boolean): number {
  if (isIndex) return -100;
  const n = numPrefix(name);
  if (n) return parseInt(n, 10);
  if (isDir) return name.startsWith("_") ? 1000 : 500;
  return -1;
}

function sortNodes(nodes: DocNode[]) {
  nodes.sort(
    (a, b) =>
      a.rank - b.rank ||
      Number(a.isDir) - Number(b.isDir) ||
      a.title.localeCompare(b.title),
  );
  for (const n of nodes) if (n.isDir) sortNodes(n.children);
}

export async function loadDocs() {
  const root = workspace.rootPath;
  if (!root) {
    docs.roots = [];
    docs.count = 0;
    return;
  }
  docs.loading = true;
  try {
    const files = await listFiles(root);
    const matched = files.filter(
      (f) => MD.test(f.rel) && (f.rel.startsWith("docs/") || !f.rel.includes("/")),
    );
    // docs/ prima dei file di root: in caso di collisione (es. due README) vince
    // il landing dentro docs/, che è la pagina di documentazione più pertinente.
    matched.sort((a, b) => {
      const ad = a.rel.startsWith("docs/") ? 0 : 1;
      const bd = b.rel.startsWith("docs/") ? 0 : 1;
      return ad - bd || a.rel.localeCompare(b.rel);
    });

    const tree: DocNode[] = [];
    const dirIndex = new Map<string, DocNode>();
    const seen = new Set<string>();
    let count = 0;

    for (const f of matched) {
      let segs = f.rel.split("/");
      if (segs[0] === "docs") segs = segs.slice(1);
      if (segs.length === 0) continue;

      // cammina/crea le cartelle intermedie
      let level = tree;
      let prefix = "";
      for (let i = 0; i < segs.length - 1; i++) {
        prefix = prefix ? `${prefix}/${segs[i]}` : segs[i];
        let dir = dirIndex.get(prefix);
        if (!dir) {
          dir = {
            key: prefix,
            title: titleOf(segs[i], true),
            num: numPrefix(segs[i]),
            isDir: true,
            meta: segs[i].startsWith("_"),
            rank: rankOf(segs[i], true, false),
            children: [],
          };
          dirIndex.set(prefix, dir);
          level.push(dir);
        }
        level = dir.children;
      }

      // foglia (file), con dedup per posizione di visualizzazione
      const fname = segs[segs.length - 1];
      const leafKey = prefix ? `${prefix}/${fname}` : fname;
      if (seen.has(leafKey)) continue;
      seen.add(leafKey);
      const isIndex = INDEX.test(fname);
      level.push({
        key: leafKey,
        title: isIndex ? "Overview" : titleOf(fname, false),
        num: null,
        isDir: false,
        meta: false,
        rank: rankOf(fname, false, isIndex),
        path: f.path,
        rel: f.rel,
        children: [],
      });
      count++;
    }

    sortNodes(tree);
    docs.roots = tree;
    docs.count = count;
  } catch (e) {
    console.error("loadDocs", e);
    docs.roots = [];
    docs.count = 0;
  }
  docs.loading = false;
}

/** Apre una pagina della documentazione, forzandone l'anteprima. */
export async function openDoc(node: DocNode) {
  if (!node.path) return;
  await openFile(node.path);
  setPreview(node.path, true);
}
