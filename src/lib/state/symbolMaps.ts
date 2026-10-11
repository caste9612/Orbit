// Mappe dell'indice dei simboli (M62), costruite UNA volta a ogni cambio dell'indice: CodeLens, la barra dei
// correlati e "Vai alla definizione" prima scorrevano tutti i simboli del progetto a ogni file o riga del
// cursore (con 50.000 simboli: tre passate complete per ogni riga, più una per ogni lente). Logica pura,
// senza rune: la usa codeIndex.svelte.ts e la provano i test.

export interface Sym {
  name: string;
  kind: string;
  file: string; // relativo alla radice (separatori "/")
  line: number;
  container: string;
  bases: string[];
  isAbstract?: boolean;
}

export const SEM_TYPE_KINDS = new Set(["class", "interface", "struct", "enum", "record", "trait", "type"]);
export const SEM_FUNC_KINDS = new Set(["method", "function", "fn"]);
const LENS_KINDS = new Set(["class", "interface", "struct", "enum", "record", "trait", "type", "method", "function", "property"]);
const TYPE_KINDS = ["class", "interface", "struct", "enum", "record", "trait"];
const isTypeKind = (k: string) => TYPE_KINDS.includes(k);
export const isCtor = (s: Sym) => s.kind === "method" && s.name === s.container;

export interface SymbolMaps<S extends Sym = Sym> {
  byFile: Map<string, S[]>; // per file, nell'ordine dell'indice
  byName: Map<string, S[]>; // per nome esatto
  byLower: Map<string, S[]>; // per nome in minuscolo (Vai alla definizione non distingue le maiuscole)
  declCount: Map<string, number>; // dichiarazioni per nome, costruttori esclusi (CodeLens)
  ctorCount: Map<string, number>; // costruttori per nome
  implementersOf: Map<string, S[]>; // tipi che dichiarano il nome come base (una volta per ogni base dichiarata)
  typeSet: Set<string>; // nomi di tipo e di funzione noti (overlay semantico dell'editor)
  funcSet: Set<string>;
  lower: string[]; // nomi in minuscolo, allineati all'array dei simboli (palette Ctrl+T)
}

const push = <K, V>(m: Map<K, V[]>, k: K, v: V) => {
  const a = m.get(k);
  if (a) a.push(v);
  else m.set(k, [v]);
};

export function buildMaps<S extends Sym>(symbols: S[]): SymbolMaps<S> {
  const m: SymbolMaps<S> = {
    byFile: new Map(),
    byName: new Map(),
    byLower: new Map(),
    declCount: new Map(),
    ctorCount: new Map(),
    implementersOf: new Map(),
    typeSet: new Set(),
    funcSet: new Set(),
    lower: new Array(symbols.length),
  };
  symbols.forEach((s, i) => {
    const low = s.name.toLowerCase();
    m.lower[i] = low;
    push(m.byFile, s.file, s);
    push(m.byName, s.name, s);
    push(m.byLower, low, s);
    if (isCtor(s)) m.ctorCount.set(s.name, (m.ctorCount.get(s.name) ?? 0) + 1);
    else m.declCount.set(s.name, (m.declCount.get(s.name) ?? 0) + 1);
    for (const b of s.bases) push(m.implementersOf, b, s);
    if (s.name.length < 2) return; // niente identificatori di 1 carattere (rumore)
    if (SEM_TYPE_KINDS.has(s.kind)) m.typeSet.add(s.name);
    else if (SEM_FUNC_KINDS.has(s.kind)) m.funcSet.add(s.name);
  });
  return m;
}

/** Definizioni con nome ESATTO, senza distinguere le maiuscole (copia: chi la riceve può modificarla). */
export function defsIn<S extends Sym>(m: SymbolMaps<S>, name: string): S[] {
  return (m.byLower.get(name.toLowerCase()) ?? []).slice();
}

// ---- CodeLens (M60): "N references · M implementations" sopra le dichiarazioni ----------------
export interface LensItem {
  kind: "refs" | "impl";
  label: string;
  title: string;
  name: string;
}
export interface LensData {
  line: number;
  items: LensItem[];
}

/** Lenti delle dichiarazioni del file `relFile`. `refs`: righe in cui compare ogni nome (da scan_symbols). */
export function lensesIn<S extends Sym>(m: SymbolMaps<S>, refs: Record<string, number>, refsLoaded: boolean, relFile: string): LensData[] {
  const out: LensData[] = [];
  const seen = new Set<number>();
  for (const s of m.byFile.get(relFile) ?? []) {
    if (!LENS_KINDS.has(s.kind) || seen.has(s.line)) continue;
    // niente lenti sui costruttori (stesso conteggio del tipo) né sui metodi "magici" di Python
    if (isCtor(s) || /^__\w+__$/.test(s.name)) continue;
    seen.add(s.line);
    const items: LensItem[] = [];
    const decls = m.declCount.get(s.name) ?? 1;
    if (refsLoaded) {
      // ogni dichiarazione (costruttori compresi) contiene il nome una volta: non è un riferimento
      const all = (refs[s.name] ?? 0) - decls - (m.ctorCount.get(s.name) ?? 0);
      const n = Math.max(0, all);
      const approx = decls > 1;
      items.push({
        kind: "refs",
        name: s.name,
        label: `${approx ? "≈ " : ""}${n} reference${n === 1 ? "" : "s"}`,
        title: approx
          ? `${decls} symbols in the project are called ${s.name}: the count includes all of them — click for the list`
          : `Lines that use the name across the project, without comments and strings — click for the list`,
      });
    } else {
      items.push({ kind: "refs", name: s.name, label: "… references", title: "Counting references…" });
    }
    const impl = SEM_TYPE_KINDS.has(s.kind) ? (m.implementersOf.get(s.name)?.length ?? 0) : 0;
    if (impl) {
      items.push({
        kind: "impl",
        name: s.name,
        label: `${impl} implementation${impl === 1 ? "" : "s"}`,
        title: `Types that extend or implement ${s.name} — click for the list`,
      });
    }
    out.push({ line: s.line, items });
  }
  return out;
}

// ---- contesto al cursore (barra dei "correlati") -----------------------------------------------
export interface CodeContext<S extends Sym = Sym> {
  path: { name: string; sym: S }[]; // [tipo, (metodo)] — il simbolo che contiene il cursore
  bases: { name: string; def: S | null }[]; // implementa/estende
  implementers: S[]; // tipi che hanno questo come base
}

/** Simbolo che contiene il cursore (il più vicino sopra, nel file) + correlati. null se non c'è. */
export function contextIn<S extends Sym>(m: SymbolMaps<S>, relFile: string, line: number): CodeContext<S> | null {
  if (!relFile) return null;
  const inFile = m.byFile.get(relFile);
  if (!inFile?.length) return null;
  let enclosing: S | null = null;
  for (const s of inFile) if (s.line <= line && (!enclosing || s.line > enclosing.line)) enclosing = s;
  if (!enclosing) return null;
  const enc = enclosing;
  const onType = isTypeKind(enc.kind);
  const type = onType ? enc : (inFile.find((s) => s.name === enc.container && isTypeKind(s.kind)) ?? null);
  const path: { name: string; sym: S }[] = [];
  if (type) path.push({ name: type.name, sym: type });
  if (!onType) path.push({ name: enc.name, sym: enc });
  if (!path.length) return null;
  const bases = (type?.bases ?? []).map((b) => ({ name: b, def: m.byLower.get(b.toLowerCase())?.[0] ?? null }));
  // una volta sola per tipo anche se dichiara la stessa base due volte (le voci doppie sono consecutive)
  const implementers = type ? (m.implementersOf.get(type.name) ?? []).filter((s, i, a) => s !== a[i - 1]) : [];
  return { path, bases, implementers };
}
