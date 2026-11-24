// Documenti HTML del profilo «editable-html» (doc-profile 0.2): la mappa del sorgente e le modifiche.
//
// Il SORGENTE è la verità: l'editor visuale non salva mai il DOM della pagina viva. Ogni modifica
// (testo, sezioni, voci, dati, token di stile, layout) diventa la sostituzione di un tratto del testo,
// nelle posizioni date dal parser Lezer HTML: diff minimi, formattazione e commenti di Claude intatti,
// e il resto di Orbit (stato modificato, autosave, ricarica dal disco) funziona com'è.
// Logica pura (niente DOM, niente rune): testata in htmlDoc.test.ts.
import { parser } from "@lezer/html";
import type { TreeCursor } from "@lezer/common";
import { isDocProfile } from "../util";

export const PROFILE_VERSION = "0.2";
export const LAYOUTS = ["stack", "split", "grid-2", "grid-3"] as const;
export const CHART_TYPES = ["bar", "hbar", "line", "area", "pie", "donut"];
const RUNTIME_MARKER = "<!-- doc-runtime -->";
const RUNTIME_START = "<!-- doc-runtime:start";
const RUNTIME_END = "<!-- doc-runtime:end -->";

// ---- albero ------------------------------------------------------------------------------------

export interface HAttr {
  name: string; // minuscolo
  value: string | null; // decodificato; null = attributo senza valore
  from: number; // intero attributo
  to: number;
  vfrom: number; // valore senza virgolette (vfrom === vto se vuoto o assente)
  vto: number;
}

export interface HEl {
  tag: string; // minuscolo; "#root" per la radice
  from: number;
  to: number;
  openTo: number; // fine del tag di apertura (o del tag autochiuso)
  nameTo: number; // fine del nome del tag: qui si inseriscono attributi
  closeFrom: number | null; // inizio del tag di chiusura (null: implicito o elemento vuoto)
  attrs: HAttr[];
  children: HEl[];
  parent: HEl | null;
  text: boolean; // testo diretto non vuoto (o entità)
  rawFrom: number | null; // contenuto di <script>/<style>
  rawTo: number | null;
}

const VOID = new Set(["area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "param", "source", "track", "wbr"]);

function decodeEntities(s: string): string {
  return s.replace(/&(amp|lt|gt|quot|apos|#39|#x27|nbsp);/g, (_, e: string) =>
    e === "amp" ? "&" : e === "lt" ? "<" : e === "gt" ? ">" : e === "quot" ? '"' : e === "nbsp" ? " " : "'",
  );
}

/** Albero degli elementi del sorgente, con le posizioni. Tollerante come il parser di CodeMirror. */
export function parseHtml(src: string): HEl {
  const root: HEl = {
    tag: "#root",
    from: 0,
    to: src.length,
    openTo: 0,
    nameTo: 0,
    closeFrom: null,
    attrs: [],
    children: [],
    parent: null,
    text: false,
    rawFrom: null,
    rawTo: null,
  };
  const cur = parser.parse(src).cursor();
  walkChildren(cur, root, src);
  return root;
}

function walkChildren(cur: TreeCursor, parent: HEl, src: string) {
  if (!cur.firstChild()) return;
  do {
    const name = cur.name;
    if (name === "Element") {
      const el = readElement(cur, parent, src);
      parent.children.push(el);
    } else if (name === "Text") {
      if (/\S/.test(src.slice(cur.from, cur.to))) parent.text = true;
    } else if (name === "EntityReference" || name === "CharacterReference") {
      parent.text = true;
    }
  } while (cur.nextSibling());
  cur.parent();
}

function readElement(cur: TreeCursor, parent: HEl, src: string): HEl {
  const el: HEl = {
    tag: "",
    from: cur.from,
    to: cur.to,
    openTo: cur.from,
    nameTo: cur.from,
    closeFrom: null,
    attrs: [],
    children: [],
    parent,
    text: false,
    rawFrom: null,
    rawTo: null,
  };
  if (!cur.firstChild()) return el;
  do {
    const n = cur.name;
    if (n === "OpenTag" || n === "SelfClosingTag") {
      el.openTo = cur.to;
      readTag(cur, el, src);
    } else if (n === "CloseTag") {
      el.closeFrom = cur.from;
    } else if (n === "ScriptText" || n === "StyleText" || n === "TextareaText") {
      el.rawFrom = cur.from;
      el.rawTo = cur.to;
    } else if (n === "Element") {
      el.children.push(readElement(cur, el, src));
    } else if (n === "Text") {
      if (/\S/.test(src.slice(cur.from, cur.to))) el.text = true;
    } else if (n === "EntityReference" || n === "CharacterReference") {
      el.text = true;
    }
  } while (cur.nextSibling());
  cur.parent();
  // <script></script> vuoto: il contenuto è fra i due tag
  if ((el.tag === "script" || el.tag === "style") && el.rawFrom === null && el.closeFrom !== null) {
    el.rawFrom = el.openTo;
    el.rawTo = el.closeFrom;
  }
  return el;
}

function readTag(cur: TreeCursor, el: HEl, src: string) {
  if (!cur.firstChild()) return;
  do {
    if (cur.name === "TagName") {
      el.tag = src.slice(cur.from, cur.to).toLowerCase();
      el.nameTo = cur.to;
    } else if (cur.name === "Attribute") {
      const a: HAttr = { name: "", value: null, from: cur.from, to: cur.to, vfrom: cur.to, vto: cur.to };
      if (cur.firstChild()) {
        do {
          const part: string = cur.name; // letto di nuovo: TypeScript lo crederebbe ancora "Attribute"
          if (part === "AttributeName") a.name = src.slice(cur.from, cur.to).toLowerCase();
          else if (part === "AttributeValue") {
            const raw = src.slice(cur.from, cur.to);
            const q = raw[0] === '"' || raw[0] === "'";
            a.vfrom = cur.from + (q ? 1 : 0);
            a.vto = cur.to - (q && raw.length > 1 && raw[raw.length - 1] === raw[0] ? 1 : 0);
            a.value = decodeEntities(src.slice(a.vfrom, a.vto));
          } else if (part === "UnquotedAttributeValue") {
            a.vfrom = cur.from;
            a.vto = cur.to;
            a.value = decodeEntities(src.slice(cur.from, cur.to));
          }
        } while (cur.nextSibling());
        cur.parent();
      }
      if (a.name) el.attrs.push(a);
    }
  } while (cur.nextSibling());
  cur.parent();
}

export const attr = (el: HEl, name: string): HAttr | undefined => el.attrs.find((a) => a.name === name);
export const hasAttr = (el: HEl, name: string) => el.attrs.some((a) => a.name === name);
export const attrValue = (el: HEl, name: string): string | null => attr(el, name)?.value ?? null;

function* descendants(el: HEl): Generator<HEl> {
  for (const c of el.children) {
    yield c;
    yield* descendants(c);
  }
}
const findFirst = (el: HEl, pred: (e: HEl) => boolean): HEl | null => {
  for (const d of descendants(el)) if (pred(d)) return d;
  return null;
};
/** Fine del contenuto di un elemento (prima del tag di chiusura, o la fine dell'elemento). */
const innerTo = (el: HEl) => el.closeFrom ?? el.to;

/** Testo visibile del sorgente di un elemento: tag tolti, entità decodificate, spazi compattati. */
export function textOf(src: string, el: HEl): string {
  return decodeEntities(src.slice(el.openTo, innerTo(el)).replace(/<[^>]*>/g, ""))
    .replace(/\s+/g, " ")
    .trim();
}

// ---- mappa del documento -------------------------------------------------------------------

export interface DocBlock {
  id: string;
  el: HEl;
  title: string;
  layout: string | null;
}
export interface Editable {
  ref: number;
  el: HEl;
}
export type Cell = string | number | boolean | null;
export interface TableData {
  columns: string[];
  rows: Cell[][];
}
export interface Dataset {
  name: string;
  el: HEl;
  block: string | null;
  data: TableData | null;
  error: string | null;
}
export interface Chart {
  el: HEl;
  type: string;
  source: string | null;
  block: string | null;
}
export interface Token {
  name: string;
  value: string;
  from: number;
  to: number;
  scheme: "light" | "dark";
}
export interface Problem {
  level: "error" | "warning" | "info";
  rule: string;
  message: string;
  at: number;
}
export interface DocMap {
  src: string;
  root: HEl;
  title: string;
  lang: string;
  profile: string | null;
  runtime: string | null; // versione del runtime inserito
  runtimeMarker: boolean; // c'è il segnaposto <!-- doc-runtime -->
  head: HEl | null;
  body: HEl | null;
  main: HEl | null;
  blocks: DocBlock[];
  editables: Editable[];
  items: Item[]; // voci ripetute (righe, voci di elenco, data-item), in ordine di documento
  datasets: Dataset[];
  charts: Chart[];
  tokens: Token[];
  problems: Problem[];
}

export { isDocProfile };

// Elementi «di testo» in linea: un elemento che contiene solo questi (e testo) si modifica come un tutto.
const INLINE = new Set([
  "a", "abbr", "b", "bdi", "bdo", "br", "cite", "code", "data", "del", "dfn", "em", "i", "img", "ins", "kbd",
  "mark", "q", "s", "samp", "small", "span", "strong", "sub", "sup", "time", "u", "var", "wbr",
]);
// Mai modificabili come testo (né il loro contenuto).
const SKIP = new Set([
  "script", "style", "template", "svg", "math", "noscript", "textarea", "iframe", "canvas", "select", "option",
  "object", "video", "audio", "picture", "button", "input", "head", "title",
]);

const hasText = (e: HEl): boolean => e.text || e.children.some(hasText);
const onlyInline = (e: HEl): boolean =>
  e.children.every((c) => INLINE.has(c.tag) && !hasAttr(c, "data-generated") && onlyInline(c));

function collectEditables(el: HEl, out: HEl[]) {
  for (const c of el.children) {
    if (SKIP.has(c.tag) || VOID.has(c.tag) || hasAttr(c, "data-generated") || hasAttr(c, "contenteditable")) continue;
    if (hasText(c) && onlyInline(c)) out.push(c);
    else collectEditables(c, out);
  }
}

const blockOf = (el: HEl | null): HEl | null => {
  for (let e = el; e; e = e.parent) {
    if (e.tag === "section" && hasAttr(e, "data-block") && e.parent?.tag === "main") return e;
  }
  return null;
};

export function analyze(src: string): DocMap {
  const root = parseHtml(src);
  const html = root.children.find((c) => c.tag === "html") ?? root;
  const head = findFirst(html, (e) => e.tag === "head");
  const body = findFirst(html, (e) => e.tag === "body");
  const main = findFirst(body ?? html, (e) => e.tag === "main");
  const all = [...descendants(root)];
  const problems: Problem[] = [];
  const problem = (level: Problem["level"], rule: string, message: string, at: number) =>
    problems.push({ level, rule, message, at });

  const meta = all.find((e) => e.tag === "meta" && attrValue(e, "name") === "doc-profile");
  const profile = meta ? (attrValue(meta, "content") ?? "") : null;
  const titleEl = head && findFirst(head, (e) => e.tag === "title");
  const title = titleEl ? textOf(src, titleEl) : "";
  const lang = (html.tag === "html" && attrValue(html, "lang")) || "";

  // blocchi
  const blocks: DocBlock[] = [];
  if (main) {
    for (const c of main.children) {
      if (c.tag === "section" && hasAttr(c, "data-block")) {
        const id = attrValue(c, "id") ?? "";
        const h = findFirst(c, (e) => /^h[1-6]$/.test(e.tag));
        blocks.push({ id, el: c, title: (h && textOf(src, h)) || id || "(untitled)", layout: attrValue(c, "data-layout") });
      } else if (c.tag !== "script" && c.tag !== "template") {
        problem("warning", "R2", `<${c.tag}> directly inside <main> is not a block: it can't be moved or deleted`, c.from);
      }
    }
  }

  // testi modificabili: tutto il body tranne il generato e il codice
  const ed: HEl[] = [];
  if (body) collectEditables(body, ed);
  const editables = ed.map((el, ref) => ({ ref, el }));
  const items: Item[] = [];
  if (body) collectItems(body, items);

  // dataset e grafici
  const datasets: Dataset[] = [];
  const charts: Chart[] = [];
  for (const e of all) {
    if (e.tag === "script" && hasAttr(e, "data-dataset")) {
      const name = attrValue(e, "data-dataset") ?? "";
      const b = blockOf(e);
      const raw = e.rawFrom !== null ? src.slice(e.rawFrom, e.rawTo!) : "";
      let data: TableData | null = null;
      let error: string | null = null;
      try {
        const v = JSON.parse(raw);
        if (v && Array.isArray(v.columns) && Array.isArray(v.rows) && v.rows.every((r: unknown) => Array.isArray(r))) {
          data = { columns: v.columns.map(String), rows: v.rows };
        } else error = 'not in the {"columns": […], "rows": […]} shape';
      } catch (err) {
        error = "invalid JSON: " + (err instanceof Error ? err.message : String(err));
      }
      datasets.push({ name, el: e, block: b ? attrValue(b, "id") : null, data, error });
      if (error) problem("error", "R5", `Dataset “${name}”: ${error}`, e.from);
      if (!b) problem("warning", "R5", `Dataset “${name}” is outside a block: it won't move with its chart`, e.from);
      if (attrValue(e, "type") !== "application/json")
        problem("warning", "R5", `Dataset “${name}” needs type="application/json", or the browser runs it as a script`, e.from);
    } else if (e.tag === "figure" && hasAttr(e, "data-chart")) {
      const b = blockOf(e);
      charts.push({ el: e, type: attrValue(e, "data-chart") ?? "", source: attrValue(e, "data-source"), block: b ? attrValue(b, "id") : null });
    }
  }

  // token di stile: gli :root dei <style> del documento (non quello del runtime)
  const tokens: Token[] = [];
  for (const e of all) {
    if (e.tag === "style" && !hasAttr(e, "data-doc-runtime") && e.rawFrom !== null) {
      tokens.push(...cssTokens(src.slice(e.rawFrom, e.rawTo!), e.rawFrom));
    }
  }

  // runtime
  const rt = all.find((e) => e.tag === "script" && hasAttr(e, "data-doc-runtime"));
  const runtime = rt ? (attrValue(rt, "data-doc-runtime") ?? "") : null;
  const runtimeMarker = src.includes(RUNTIME_MARKER);

  // ---- controlli del profilo ----
  if (profile !== null && profile !== PROFILE_VERSION)
    problem("info", "R9", `Profile ${profile || "(no version)"}: this editor knows ${PROFILE_VERSION}`, meta!.from);
  if (!main) problem("error", "R2", "No <main>: there are no blocks to edit", body?.from ?? 0);
  else if (!blocks.length) problem("warning", "R2", "No <section data-block> inside <main>", main.from);
  const seen = new Map<string, number>();
  for (const b of blocks) {
    if (!b.id) problem("error", "R2", `Block “${b.title}” has no id`, b.el.from);
    else if (!/^[A-Za-z][\w-]*$/.test(b.id)) problem("warning", "R2", `Block id “${b.id}” should be kebab-case`, b.el.from);
    seen.set(b.id, (seen.get(b.id) ?? 0) + 1);
    if (b.layout !== null && !(LAYOUTS as readonly string[]).includes(b.layout))
      problem("warning", "R7", `Block “${b.id}”: unknown layout “${b.layout}” (${LAYOUTS.join(", ")})`, b.el.from);
    if (b.layout !== null && runtime === null)
      problem("warning", "R7", `Block “${b.id}” has a layout, but the runtime that draws layouts is missing`, b.el.from);
  }
  for (const [id, n] of seen) if (id && n > 1) problem("error", "R2", `Block id “${id}” is used ${n} times`, main?.from ?? 0);
  const dsNames = new Map<string, number>();
  for (const d of datasets) dsNames.set(d.name, (dsNames.get(d.name) ?? 0) + 1);
  for (const [n, k] of dsNames) if (k > 1) problem("error", "R5", `Dataset name “${n}” is used ${k} times`, 0);
  for (const c of charts) {
    if (!CHART_TYPES.includes(c.type)) problem("warning", "R6", `Chart type “${c.type}” is unknown (${CHART_TYPES.join(", ")})`, c.el.from);
    if (!c.source || !datasets.some((d) => d.name === c.source))
      problem("error", "R5", `Chart “${c.source ?? "?"}”: no dataset with that name`, c.el.from);
  }
  for (const e of all) {
    if (hasAttr(e, "data-generated") && (e.children.length || e.text))
      problem("warning", "R6", `<${e.tag} data-generated> must be empty in the source: what's inside is redrawn and lost`, e.from);
    const ext = (n: string) => /^\s*(https?:)?\/\//i.test(attrValue(e, n) ?? "");
    if ((e.tag === "script" && ext("src")) || (["img", "source", "video", "audio", "iframe", "embed"].includes(e.tag) && ext("src")))
      problem("warning", "R1", `<${e.tag}> loads a remote resource: it won't load in the editor`, e.from);
    if (e.tag === "link" && /stylesheet|preload|icon/i.test(attrValue(e, "rel") ?? "") && ext("href"))
      problem("warning", "R1", "Remote stylesheet or font: it won't load in the editor", e.from);
    if (e.tag === "style" && e.rawFrom !== null && /@import|url\(\s*["']?(https?:)?\/\//i.test(src.slice(e.rawFrom, e.rawTo!)))
      problem("warning", "R1", "The CSS loads remote resources (@import or url()): they won't load in the editor", e.from);
  }
  if (profile !== null && !tokens.some((t) => t.scheme === "light"))
    problem("warning", "R7", "No tokens on :root: the Style panel has nothing to edit", head?.from ?? 0);
  else if (profile !== null && !tokens.some((t) => t.scheme === "dark"))
    problem("warning", "R7", "No dark theme: redefine the tokens in a @media screen and (prefers-color-scheme: dark) block", head?.from ?? 0);
  if (runtime === null && runtimeMarker)
    problem("warning", "Runtime", "The runtime isn't inserted yet: charts, table of contents and layouts don't show", src.indexOf(RUNTIME_MARKER));
  else if (runtime === null && (charts.length || all.some((e) => attrValue(e, "data-generated") === "toc")))
    problem("warning", "Runtime", "Charts or a table of contents without the runtime that draws them", 0);
  else if (runtime !== null && runtime !== PROFILE_VERSION)
    problem("info", "Runtime", `Runtime ${runtime}: Orbit has ${PROFILE_VERSION}`, rt!.from);
  const styled = all.filter((e) => hasAttr(e, "style") && !(attrValue(e, "style") ?? "").trim().startsWith("--")).length;
  if (styled) problem("info", "R7", `${styled} inline style attribute${styled > 1 ? "s" : ""}: not editable from the Style panel`, 0);

  return { src, root, title, lang, profile, runtime, runtimeMarker, head, body, main, blocks, editables, items, datasets, charts, tokens, problems };
}

/** Le custom property dei blocchi `:root` di un CSS: in cima (chiaro) o in un @media prefers-color-scheme: dark
 *  (scuro). Gli altri @media (stampa, larghezze) non sono token di tema. L'ultima dichiarazione vince, come nel CSS. */
export function cssTokens(css: string, base: number): Token[] {
  const t = css.replace(/\/\*[\s\S]*?\*\//g, (m) => " ".repeat(m.length));
  const found = new Map<string, Token>();
  const stack: string[] = [];
  let start = 0;
  for (let i = 0; i < t.length; i++) {
    const ch = t[i];
    if (ch === '"' || ch === "'") {
      const j = t.indexOf(ch, i + 1);
      if (j < 0) break;
      i = j;
    } else if (ch === "{") {
      const prelude = t.slice(start, i).trim();
      if (prelude === ":root") {
        const end = t.indexOf("}", i + 1);
        const stop = end < 0 ? t.length : end;
        const dark = stack.length > 0 && stack.every((p) => /prefers-color-scheme\s*:\s*dark/i.test(p));
        if (stack.length === 0 || dark) {
          const body = t.slice(i + 1, stop);
          const re = /(--[\w-]+)(\s*:\s*)([^;]*)/g;
          let m: RegExpExecArray | null;
          while ((m = re.exec(body))) {
            const vfrom = i + 1 + m.index + m[1].length + m[2].length;
            const value = m[3].trimEnd();
            const scheme = dark ? "dark" : "light";
            found.set(scheme + m[1], { name: m[1], value, from: base + vfrom, to: base + vfrom + value.length, scheme });
          }
        }
        i = stop;
        start = stop + 1;
      } else {
        stack.push(prelude);
        start = i + 1;
      }
    } else if (ch === "}") {
      stack.pop();
      start = i + 1;
    } else if (ch === ";") {
      start = i + 1;
    }
  }
  return [...found.values()];
}

// ---- modifiche -----------------------------------------------------------------------------

/** Sostituisce il contenuto di un elemento (fra i tag). */
export function replaceInner(src: string, el: HEl, html: string): string {
  return src.slice(0, el.openTo) + html + src.slice(innerTo(el));
}

/** Il tratto di un elemento con la sua riga: dall'inizio della riga (se prima ci sono solo spazi) fino
 *  all'a capo dopo la fine (se dopo ci sono solo spazi). Spostare o eliminare così non lascia righe vuote. */
export function chunkOf(src: string, el: HEl): { from: number; to: number; indent: string } {
  let a = el.from;
  while (a > 0 && (src[a - 1] === " " || src[a - 1] === "\t")) a--;
  const lineStart = a === 0 || src[a - 1] === "\n";
  const indent = lineStart ? src.slice(a, el.from) : "";
  let b = el.to;
  while (b < src.length && (src[b] === " " || src[b] === "\t")) b++;
  if (src[b] === "\r") b++;
  const lineEnd = src[b] === "\n";
  if (lineStart && lineEnd) return { from: a, to: b + 1, indent };
  return { from: el.from, to: el.to, indent };
}

const eol = (src: string) => (src.includes("\r\n") ? "\r\n" : "\n");

/** Sposta il blocco `from` (indice) alla posizione `to` (indice finale). */
export function moveBlock(map: DocMap, from: number, to: number): string {
  const { src, blocks } = map;
  if (from === to || from < 0 || to < 0 || from >= blocks.length || to >= blocks.length) return src;
  const a = chunkOf(src, blocks[from].el);
  const text = src.slice(a.from, a.to);
  if (from < to) {
    const t = chunkOf(src, blocks[to].el);
    return src.slice(0, a.from) + src.slice(a.to, t.to) + text + src.slice(t.to);
  }
  const t = chunkOf(src, blocks[to].el);
  return src.slice(0, t.from) + text + src.slice(t.from, a.from) + src.slice(a.to);
}

export function deleteBlock(map: DocMap, index: number): string {
  const b = map.blocks[index];
  if (!b) return map.src;
  const c = chunkOf(map.src, b.el);
  return map.src.slice(0, c.from) + map.src.slice(c.to);
}

function uniqueName(base: string, taken: Set<string>): string {
  const stem = base.replace(/-\d+$/, "") || "item";
  for (let n = 2; ; n++) {
    const name = `${stem}-${n}`;
    if (!taken.has(name)) return name;
  }
}

/** Duplica un blocco subito dopo di sé: id e nomi dei dataset nuovi (i grafici della copia puntano ai suoi). */
export function duplicateBlock(map: DocMap, index: number): { src: string; id: string } {
  const { src } = map;
  const b = map.blocks[index];
  if (!b) return { src, id: "" };
  const c = chunkOf(src, b.el);
  const ids = new Set(allIds(map.root));
  const newId = uniqueName(b.id || "section", ids);
  const names = new Set(map.datasets.map((d) => d.name));
  const rename = new Map<string, string>();
  for (const d of map.datasets) {
    if (d.block === b.id && b.id) {
      const n = uniqueName(d.name, names);
      names.add(n);
      rename.set(d.name, n);
    }
  }
  // sostituzioni per posizione, dentro la copia
  const edits: { from: number; to: number; text: string }[] = [];
  const idAttr = attr(b.el, "id");
  if (idAttr && idAttr.vto > idAttr.vfrom) edits.push({ from: idAttr.vfrom, to: idAttr.vto, text: newId });
  else edits.push({ from: b.el.nameTo, to: b.el.nameTo, text: ` id="${newId}"` });
  ids.add(newId);
  const innerIds = new Map<string, string>(); // anche gli id dentro il blocco (es. i marker delle frecce SVG)
  for (const e of [b.el, ...descendants(b.el)]) {
    for (const an of ["data-dataset", "data-source"]) {
      const a = attr(e, an);
      if (a && a.value && rename.has(a.value)) edits.push({ from: a.vfrom, to: a.vto, text: rename.get(a.value)! });
    }
    const id = e === b.el ? undefined : attr(e, "id");
    if (id && id.value && id.vto > id.vfrom) {
      const fresh = innerIds.get(id.value) ?? uniqueName(id.value, ids);
      ids.add(fresh);
      innerIds.set(id.value, fresh);
      edits.push({ from: id.vfrom, to: id.vto, text: fresh });
    }
  }
  edits.sort((x, y) => y.from - x.from);
  let copy = src.slice(c.from, c.to);
  for (const e of edits) copy = copy.slice(0, e.from - c.from) + e.text + copy.slice(e.to - c.from);
  // i riferimenti a quegli id nella copia: href="#…", url(#…)
  for (const [old, fresh] of innerIds) {
    const esc = old.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    copy = copy.replace(new RegExp("#" + esc + "(?=[\"')\\s])", "g"), "#" + fresh);
  }
  if (c.to === b.el.to) copy = eol(src) + copy; // il blocco non era su righe sue
  return { src: src.slice(0, c.to) + copy + src.slice(c.to), id: newId };
}

function allIds(el: HEl): string[] {
  const out: string[] = [];
  for (const d of descendants(el)) {
    const v = attrValue(d, "id");
    if (v) out.push(v);
  }
  return out;
}

/** Un blocco nuovo dopo il blocco `after` (indice; -1 = in cima a <main>, null = in fondo). */
export function addBlock(map: DocMap, after: number | null): { src: string; id: string } {
  const { src, main, blocks } = map;
  if (!main) return { src, id: "" };
  const nl = eol(src);
  const ref = blocks.length ? blocks[after === null ? blocks.length - 1 : Math.max(0, Math.min(after, blocks.length - 1))] : null;
  const indent = ref ? chunkOf(src, ref.el).indent : "  ";
  const step = innerIndent(src, ref?.el ?? null, indent);
  const head = ref ? findFirst(ref.el, (e) => /^h[1-6]$/.test(e.tag))?.tag ?? "h2" : "h2";
  const it = /^it\b/i.test(map.lang);
  const id = uniqueName("new-section", new Set(allIds(map.root)));
  const text =
    `${indent}<section data-block id="${id}">${nl}` +
    `${indent}${step}<${head}>${it ? "Nuova sezione" : "New section"}</${head}>${nl}` +
    `${indent}${step}<p>${it ? "Scrivi qui." : "Write here."}</p>${nl}` +
    `${indent}</section>${nl}`;
  let at: number;
  if (!ref) {
    // <main> vuoto: prima del tag di chiusura, su una riga sua
    const close = innerTo(main);
    let a = close;
    while (a > 0 && (src[a - 1] === " " || src[a - 1] === "\t")) a--;
    at = a;
    const before = src[at - 1] === "\n" ? "" : nl;
    return { src: src.slice(0, at) + before + text + src.slice(at), id };
  }
  if (after === -1) {
    const c = chunkOf(src, blocks[0].el);
    at = c.from;
    if (c.to === blocks[0].el.to) return { src: src.slice(0, at) + text.trimStart() + nl + indent + src.slice(at), id };
  } else {
    const c = chunkOf(src, ref.el);
    at = c.to;
    if (c.to === ref.el.to) return { src: src.slice(0, at) + nl + text.replace(/\r?\n$/, "") + src.slice(at), id };
  }
  return { src: src.slice(0, at) + text + src.slice(at), id };
}

/** Il rientro di un livello dentro `el`, dedotto dal suo primo figlio (default due spazi). */
function innerIndent(src: string, el: HEl | null, indent: string): string {
  const first = el?.children[0];
  if (first) {
    const c = chunkOf(src, first);
    if (c.indent.startsWith(indent) && c.indent.length > indent.length) return c.indent.slice(indent.length);
  }
  return indent.includes("\t") ? "\t" : "  ";
}

/** Imposta (o toglie, con null) il layout di un blocco. */
export function setLayout(map: DocMap, index: number, layout: string | null): string {
  const { src } = map;
  const b = map.blocks[index];
  if (!b) return src;
  const a = attr(b.el, "data-layout");
  if (a) {
    if (layout === null) {
      let from = a.from;
      while (from > 0 && /\s/.test(src[from - 1])) from--;
      return src.slice(0, from) + src.slice(a.to);
    }
    if (a.vto > a.vfrom) return src.slice(0, a.vfrom) + layout + src.slice(a.vto);
    return src.slice(0, a.from) + `data-layout="${layout}"` + src.slice(a.to);
  }
  if (layout === null) return src;
  const last = b.el.attrs[b.el.attrs.length - 1];
  const at = last ? last.to : b.el.nameTo;
  return src.slice(0, at) + ` data-layout="${layout}"` + src.slice(at);
}

export function setToken(src: string, token: Token, value: string): string {
  return src.slice(0, token.from) + value.replace(/[;{}]/g, "") + src.slice(token.to);
}

// ---- voci ripetute: righe di tabella, voci di elenco, data-item ----------------------------------

export type ItemKind = "row" | "list" | "item";
export interface Item {
  el: HEl;
  kind: ItemKind;
}

function itemKind(e: HEl): ItemKind | null {
  if (hasAttr(e, "data-item")) return "item";
  if (e.tag === "li") return "list";
  if (e.tag === "tr" && e.parent?.tag !== "thead") return "row";
  return null;
}

/** La voce che contiene un elemento (la più vicina), dentro il suo blocco. */
export function itemOf(el: HEl): Item | null {
  for (let e: HEl | null = el; e && e.tag !== "main" && e.tag !== "body"; e = e.parent) {
    const k = itemKind(e);
    if (k) return { el: e, kind: k };
  }
  return null;
}

function collectItems(el: HEl, out: Item[]) {
  for (const c of el.children) {
    if (SKIP.has(c.tag) || hasAttr(c, "data-generated")) continue;
    const k = itemKind(c);
    if (k) out.push({ el: c, kind: k });
    collectItems(c, out);
  }
}

const siblings = (it: Item) => (it.el.parent?.children ?? []).filter((c) => itemKind(c) === it.kind);

export function itemPosition(it: Item): { index: number; count: number } {
  const s = siblings(it);
  return { index: s.indexOf(it.el), count: s.length };
}

export function duplicateItem(src: string, it: Item): string {
  const c = chunkOf(src, it.el);
  let copy = src.slice(c.from, c.to);
  const id = attr(it.el, "id");
  if (id && id.value) {
    const fresh = uniqueName(id.value, new Set([id.value]));
    copy = copy.slice(0, id.vfrom - c.from) + fresh + copy.slice(id.vto - c.from);
  }
  if (c.to === it.el.to) copy = (c.from === it.el.from ? "" : eol(src)) + copy;
  return src.slice(0, c.to) + copy + src.slice(c.to);
}

export function deleteItem(src: string, it: Item): string {
  const c = chunkOf(src, it.el);
  return src.slice(0, c.from) + src.slice(c.to);
}

/** Scambia la voce con la precedente (-1) o la successiva (+1) dello stesso tipo. */
export function moveItem(src: string, it: Item, dir: -1 | 1): string {
  const s = siblings(it);
  const i = s.indexOf(it.el);
  const other = s[i + dir];
  if (!other) return src;
  const [first, second] = dir < 0 ? [other, it.el] : [it.el, other];
  const a = chunkOf(src, first);
  const b = chunkOf(src, second);
  // due tratti con la loro riga: si scambiano interi; altrimenti solo gli elementi
  if (a.to - a.from !== first.to - first.from && b.to - b.from !== second.to - second.from) {
    return src.slice(0, a.from) + src.slice(b.from, b.to) + src.slice(a.to, b.from) + src.slice(a.from, a.to) + src.slice(b.to);
  }
  return (
    src.slice(0, first.from) + src.slice(second.from, second.to) + src.slice(first.to, second.from) + src.slice(first.from, first.to) + src.slice(second.to)
  );
}

// ---- dati ------------------------------------------------------------------------------------

const cellJson = (v: Cell) => JSON.stringify(v ?? null).replace(/<\//g, "<\\/");

/** Riscrive un dataset nella forma del profilo (una riga per riga di dati), col rientro del sorgente. */
export function setDataset(src: string, ds: Dataset, data: TableData): string {
  const e = datasetEdit(src, ds, data);
  return e ? src.slice(0, e.from) + e.text + src.slice(e.to) : src;
}

function datasetEdit(src: string, ds: Dataset, data: TableData): { from: number; to: number; text: string } | null {
  const el = ds.el;
  if (el.rawFrom === null || el.rawTo === null) return null;
  const raw = src.slice(el.rawFrom, el.rawTo);
  const lead = raw.match(/^\s*/)![0];
  const trail = raw.match(/\s*$/)![0];
  const nl = eol(src);
  const indent = lead.includes("\n") ? lead.slice(lead.lastIndexOf("\n") + 1) : "";
  const rows = data.rows.map((r) => `${indent}  [${r.map(cellJson).join(", ")}]`);
  const json =
    `{"columns": [${data.columns.map((c) => cellJson(c)).join(", ")}],${nl}` +
    `${indent} "rows": [${rows.length ? nl + rows.join("," + nl) + nl + indent + " " : ""}]}`;
  return { from: el.rawFrom, to: el.rawTo, text: lead + json + trail };
}

/** Rinomina una colonna del dataset e i riferimenti dei grafici che la usano (`data-x`, `data-y`). */
export function renameColumn(map: DocMap, ds: Dataset, index: number, name: string): string {
  const { src } = map;
  if (!ds.data || index < 0 || index >= ds.data.columns.length) return src;
  const old = ds.data.columns[index];
  const data = { columns: ds.data.columns.map((c, i) => (i === index ? name : c)), rows: ds.data.rows };
  const edits: { from: number; to: number; text: string }[] = [];
  const d = datasetEdit(src, ds, data);
  if (d) edits.push(d);
  for (const c of map.charts) {
    if (c.source !== ds.name) continue;
    for (const an of ["data-x", "data-y"]) {
      const a = attr(c.el, an);
      if (!a || a.value === null) continue;
      const parts = a.value.split(",");
      if (!parts.some((p) => p.trim() === old)) continue;
      const text = parts.map((p) => (p.trim() === old ? p.replace(old, name) : p)).join(",").replace(/"/g, "&quot;");
      edits.push({ from: a.vfrom, to: a.vto, text });
    }
  }
  edits.sort((x, y) => y.from - x.from);
  let out = src;
  for (const e of edits) out = out.slice(0, e.from) + e.text + out.slice(e.to);
  return out;
}

/** Valore di una cella scritto nella griglia: numero se lo sembra, altrimenti testo. */
export function parseCell(text: string): Cell {
  const t = text.trim();
  if (t === "") return "";
  if (/^-?(\d+\.?\d*|\.\d+)(e-?\d+)?$/i.test(t)) return Number(t);
  return text;
}

// ---- runtime ------------------------------------------------------------------------------------

/** Inserisce il runtime al posto del segnaposto, o sostituisce quello inserito prima (come inline-runtime.sh). */
export function insertRuntime(src: string, runtime: string): string {
  const rt = runtime.replace(/\s+$/, "");
  const s = src.indexOf(RUNTIME_START);
  if (s >= 0) {
    const e = src.indexOf(RUNTIME_END, s);
    if (e >= 0) return src.slice(0, s) + rt + src.slice(e + RUNTIME_END.length);
  }
  const m = src.indexOf(RUNTIME_MARKER);
  if (m >= 0) return src.slice(0, m) + rt + src.slice(m + RUNTIME_MARKER.length);
  const body = src.search(/<\/body\s*>/i);
  const nl = eol(src);
  if (body >= 0) return src.slice(0, body) + rt + nl + src.slice(body);
  return src + nl + rt + nl;
}

// ---- la copia mostrata nell'editor ---------------------------------------------------------------

/** Content Security Policy della pagina nell'editor: niente rete, niente file, solo il codice del documento. */
export const FRAME_CSP =
  "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data: blob:; " +
  "font-src data:; media-src data: blob:; base-uri 'none'; form-action 'none'";

/** Il documento da mostrare nell'iframe: la CSP come PRIMO elemento (prima di qualunque script del
 *  documento, anche uno messo prima di <head>), `data-orbit-ref` sui testi modificabili, `data-orbit-item`
 *  sulle voci, la configurazione e lo script di Orbit in fondo. `scheme` forza il tema chiaro o scuro del
 *  documento riscrivendo le sue media query `prefers-color-scheme`. Il file non cambia: è solo la copia mostrata. */
export function frameDoc(map: DocMap, shim: string, config: Record<string, unknown>, scheme: "light" | "dark" | "auto" = "auto"): string {
  const { src } = map;
  const ed: { from: number; to: number; text: string }[] = [];
  // col tema forzato anche le barre di scorrimento e i controlli del frame lo seguono (non solo il CSS del documento)
  const csp = `<meta http-equiv="Content-Security-Policy" content="${FRAME_CSP}">` + (scheme !== "auto" ? `<meta name="color-scheme" content="${scheme}">` : "");
  const doctype = src.match(/^\s*<!doctype[^>]*>/i);
  ed.push({ from: doctype ? doctype[0].length : 0, to: doctype ? doctype[0].length : 0, text: csp });
  for (const e of map.editables) ed.push({ from: e.el.nameTo, to: e.el.nameTo, text: ` data-orbit-ref="${e.ref}"` });
  map.items.forEach((it, i) => ed.push({ from: it.el.nameTo, to: it.el.nameTo, text: ` data-orbit-item="${i}"` }));
  if (scheme !== "auto") {
    const on = "min-width: 0px";
    const off = "prefers-color-scheme: no-preference-orbit";
    for (const d of descendants(map.root)) {
      if (d.tag !== "style" || d.rawFrom === null || d.rawTo === null) continue;
      const css = src.slice(d.rawFrom, d.rawTo);
      const out = css.replace(/prefers-color-scheme\s*:\s*(dark|light)/gi, (_m, s: string) => (s.toLowerCase() === scheme ? on : off));
      if (out !== css) ed.push({ from: d.rawFrom, to: d.rawTo, text: out });
    }
  }
  const conf = JSON.stringify(config).replace(/</g, "\\u003c");
  const tail = `<script>window.__orbit=${conf};</script><script>${shim.replace(/<\/script/gi, "<\\/script")}</script>`;
  const at = map.body ? innerTo(map.body) : src.length;
  ed.push({ from: at, to: at, text: tail });
  ed.sort((a, b) => b.from - a.from || b.to - a.to);
  let out = src;
  for (const e of ed) out = out.slice(0, e.from) + e.text + out.slice(e.to);
  return out;
}

/** HTML in arrivo dall'editor visuale per il contenuto di un testo: rifiutato se porta codice o tag di
 *  struttura (l'editor scrive solo testo e tag in linea). */
export function acceptableInline(html: string): boolean {
  if (/<\s*\/?\s*(script|style|iframe|object|embed|link|meta|base|form|template|svg|math|section|main|body|html|head)\b/i.test(html)) return false;
  if (/\son[a-z]+\s*=/i.test(html) || /javascript:/i.test(html)) return false;
  return true;
}

/** Prompt per Claude che chiede di correggere i problemi trovati dal validatore. */
export function fixPrompt(path: string, problems: Problem[]): string {
  const lines = problems.map((p) => `- [${p.rule}] ${p.message}`);
  return (
    `Fix these problems in ${path} following the editable-html skill (profile ${PROFILE_VERSION}). ` +
    `Change only what's needed, keep the ids and don't reformat the rest.\n\n${lines.join("\n")}\n`
  );
}

/** Le azioni dell'ispettore (HtmlDocPanel), eseguite da HtmlDocEditor sul sorgente. */
export interface DocActions {
  reveal(id: string): void;
  moveBlock(from: number, to: number): void;
  duplicateBlock(index: number): void;
  deleteBlock(index: number): void;
  addBlock(after: number | null): void;
  setLayout(index: number, layout: string | null): void;
  moveItem(dir: -1 | 1): void;
  duplicateItem(): void;
  deleteItem(): void;
  setData(ds: Dataset, data: TableData): void;
  renameColumn(ds: Dataset, index: number, name: string): void;
  previewToken(t: Token, value: string): void;
  setToken(t: Token, value: string): void;
  insertRuntime(): void;
  copyFixPrompt(): void;
  print(): void;
  undo(): void;
  redo(): void;
  setScheme(s: "light" | "dark"): void;
  closePanel(): void;
}

// ---- template (M77): documenti del profilo con dei segnaposto {{chiave}} o {{chiave|Etichetta}} ---------------------

export interface TemplateField {
  key: string;
  label: string;
  value: string; // proposta iniziale (data e anno di oggi), il resto vuoto
}

const FIELD_RE = /\{\{\s*([A-Za-z_][\w-]*)\s*(?:\|\s*([^}|]*?)\s*)?\}\}/g;
/** Il `content` del primo `<meta name="…">` con quel nome esatto (non `doc-template-file` per `doc-template`). */
const metaContent = (src: string, name: string): string | null => {
  const m = new RegExp(`<meta\\b[^>]*\\bname\\s*=\\s*["']?${name}["'\\s>]`, "i").exec(src);
  if (!m) return null;
  const tag = src.slice(m.index, src.indexOf(">", m.index) + 1);
  const c = /\bcontent\s*=\s*("([^"]*)"|'([^']*)')/i.exec(tag);
  return c ? decodeEntities(c[2] ?? c[3] ?? "") : null;
};

/** Nome, descrizione e nome di file proposto di un template (`<meta name="doc-template">`, `description`,
 *  `doc-template-file`); il nome ripiega sul `<title>`. */
export function templateMeta(src: string): { name: string; description: string; fileName: string | null } {
  const title = /<title>([\s\S]*?)<\/title>/i.exec(src)?.[1]?.replace(FIELD_RE, "").trim() ?? "";
  return {
    name: metaContent(src, "doc-template") || decodeEntities(title) || "Template",
    description: metaContent(src, "description") ?? "",
    fileName: metaContent(src, "doc-template-file"),
  };
}

/** I campi da chiedere, nell'ordine in cui compaiono (una volta ciascuno). */
export function templateFields(src: string, today = new Date()): TemplateField[] {
  const out = new Map<string, TemplateField>();
  const dd = String(today.getDate()).padStart(2, "0");
  const mm = String(today.getMonth() + 1).padStart(2, "0");
  for (const m of src.matchAll(FIELD_RE)) {
    const key = m[1];
    const prev = out.get(key);
    if (prev) {
      if (m[2] && prev.label === humanize(key)) prev.label = m[2];
      continue;
    }
    const k = key.toLowerCase();
    const value = k === "date" || k === "data" ? `${dd}/${mm}/${today.getFullYear()}` : k === "year" || k === "anno" ? String(today.getFullYear()) : "";
    out.set(key, { key, label: m[2] || humanize(key), value });
  }
  return [...out.values()];
}

const humanize = (key: string) => {
  const s = key.replace(/[_-]+/g, " ").trim();
  return s.charAt(0).toUpperCase() + s.slice(1);
};
const escapeHtml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** Il documento nuovo: i segnaposto sostituiti (testo, escapato) e i meta del template tolti. */
export function fillTemplate(src: string, values: Record<string, string>): string {
  return src
    .replace(/[ \t]*<meta\b[^>]*\bname\s*=\s*["']?doc-template(-file)?["']?[^>]*>[ \t]*\r?\n?/gi, "")
    .replace(FIELD_RE, (_m, key: string) => escapeHtml(values[key] ?? ""));
}

/** Un nome di file dal testo: lettere, cifre, trattini; niente caratteri vietati su Windows. */
export function fileNameFrom(text: string, fallback = "document"): string {
  const base = text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\.html?$/i, "")
    .replace(/[^\w.-]+/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^[-.]+|[-.]+$/g, "")
    .slice(0, 80);
  return (base || fallback) + ".html";
}
