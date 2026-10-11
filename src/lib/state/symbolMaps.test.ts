import { describe, expect, it } from "vitest";
import { buildMaps, contextIn, defsIn, lensesIn, SEM_FUNC_KINDS, SEM_TYPE_KINDS, type Sym } from "./symbolMaps";

// Riferimento: le funzioni com'erano prima della M62 (scansione di TUTTI i simboli a ogni chiamata).
const isCtor = (s: Sym) => s.kind === "method" && s.name === s.container;
const LENS_KINDS = new Set(["class", "interface", "struct", "enum", "record", "trait", "type", "method", "function", "property"]);
const TYPE_KINDS = ["class", "interface", "struct", "enum", "record", "trait"];
function oldSets(symbols: Sym[]) {
  const types = new Set<string>();
  const funcs = new Set<string>();
  const decls = new Map<string, number>();
  const impls = new Map<string, Sym[]>();
  for (const s of symbols) {
    if (!isCtor(s)) decls.set(s.name, (decls.get(s.name) ?? 0) + 1);
    for (const b of s.bases) impls.set(b, [...(impls.get(b) ?? []), s]);
    if (s.name.length < 2) continue;
    if (SEM_TYPE_KINDS.has(s.kind)) types.add(s.name);
    else if (SEM_FUNC_KINDS.has(s.kind)) funcs.add(s.name);
  }
  return { types, funcs, decls, impls };
}
function oldLenses(symbols: Sym[], refs: Record<string, number>, refsLoaded: boolean, relFile: string) {
  const { decls: declCount, impls: implementersOf } = oldSets(symbols);
  const countCtors = (name: string) => symbols.filter((s) => isCtor(s) && s.name === name).length;
  const out: { line: number; items: { kind: string; label: string; title: string; name: string }[] }[] = [];
  const seen = new Set<number>();
  for (const s of symbols) {
    if (s.file !== relFile || !LENS_KINDS.has(s.kind) || seen.has(s.line)) continue;
    if (isCtor(s) || /^__\w+__$/.test(s.name)) continue;
    seen.add(s.line);
    const items = [];
    const decls = declCount.get(s.name) ?? 1;
    if (refsLoaded) {
      const n = Math.max(0, (refs[s.name] ?? 0) - decls - countCtors(s.name));
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
    const impl = SEM_TYPE_KINDS.has(s.kind) ? (implementersOf.get(s.name)?.length ?? 0) : 0;
    if (impl) {
      items.push({ kind: "impl", name: s.name, label: `${impl} implementation${impl === 1 ? "" : "s"}`, title: `Types that extend or implement ${s.name} — click for the list` });
    }
    out.push({ line: s.line, items });
  }
  return out;
}
const oldDefs = (symbols: Sym[], name: string) => symbols.filter((s) => s.name.toLowerCase() === name.toLowerCase());
function oldContext(symbols: Sym[], relFile: string, line: number) {
  if (!relFile) return null;
  const inFile = symbols.filter((s) => s.file === relFile);
  if (!inFile.length) return null;
  let enclosing: Sym | null = null;
  for (const s of inFile) if (s.line <= line && (!enclosing || s.line > enclosing.line)) enclosing = s;
  if (!enclosing) return null;
  const enc = enclosing;
  const onType = TYPE_KINDS.includes(enc.kind);
  const type = onType ? enc : (inFile.find((s) => s.name === enc.container && TYPE_KINDS.includes(s.kind)) ?? null);
  const path: { name: string; sym: Sym }[] = [];
  if (type) path.push({ name: type.name, sym: type });
  if (!onType) path.push({ name: enc.name, sym: enc });
  if (!path.length) return null;
  const bases = (type?.bases ?? []).map((b) => ({ name: b, def: oldDefs(symbols, b)[0] ?? null }));
  const implementers = type ? symbols.filter((s) => s.bases.includes(type.name)) : [];
  return { path, bases, implementers };
}

// Indici casuali ma realistici: nomi che si ripetono (overload, omonimi con maiuscole diverse), costruttori,
// basi (anche doppie), più file, `__init__` di Python, simboli sulla stessa riga.
function randomIndex(seed: number, n: number): Sym[] {
  let x = seed;
  const r = (k: number) => {
    x = (x * 1103515245 + 12345) & 0x7fffffff;
    return x % k;
  };
  const names = ["Foo", "foo", "Bar", "Baz", "Load", "load", "Save", "Item", "IItem", "Base", "x", "__init__", "Run", "Repo"];
  const kinds = ["class", "interface", "struct", "enum", "record", "trait", "type", "method", "function", "property", "fn", "const"];
  const files = ["src/a.ts", "src/b.rs", "lib/c.cs", "d.py", "e.go"];
  const out: Sym[] = [];
  for (let i = 0; i < n; i++) {
    const kind = kinds[r(kinds.length)];
    const name = names[r(names.length)];
    const container = r(3) === 0 ? name : r(2) ? names[r(names.length)] : "";
    const bases = r(3) ? [] : Array.from({ length: 1 + r(3) }, () => names[r(names.length)]);
    out.push({ name, kind, file: files[r(files.length)], line: 1 + r(200), container, bases });
  }
  return out;
}

describe("symbolMaps (M62) uguale alla scansione completa di prima", () => {
  it("insiemi semantici, conteggi e implementatori", () => {
    for (let seed = 1; seed < 60; seed++) {
      const syms = randomIndex(seed, 300);
      const m = buildMaps(syms);
      const o = oldSets(syms);
      expect([...m.typeSet].sort()).toEqual([...o.types].sort());
      expect([...m.funcSet].sort()).toEqual([...o.funcs].sort());
      expect(Object.fromEntries(m.declCount)).toEqual(Object.fromEntries(o.decls));
      expect(Object.fromEntries(m.implementersOf)).toEqual(Object.fromEntries(o.impls));
    }
  });

  it("lenti CodeLens per ogni file, con e senza conteggi", () => {
    for (let seed = 1; seed < 60; seed++) {
      const syms = randomIndex(seed, 300);
      const m = buildMaps(syms);
      const refs: Record<string, number> = { Foo: 12, foo: 3, Load: 40, Item: 1, IItem: 9, Base: 0, Run: 7 };
      for (const f of ["src/a.ts", "src/b.rs", "lib/c.cs", "d.py", "e.go", "nope.ts"]) {
        for (const loaded of [true, false]) expect(lensesIn(m, refs, loaded, f)).toEqual(oldLenses(syms, refs, loaded, f));
      }
    }
  });

  it("contesto al cursore e definizioni", () => {
    for (let seed = 1; seed < 40; seed++) {
      const syms = randomIndex(seed, 250);
      const m = buildMaps(syms);
      for (const f of ["src/a.ts", "lib/c.cs", "d.py", "", "nope.ts"]) {
        for (let line = 0; line <= 205; line += 7) expect(contextIn(m, f, line)).toEqual(oldContext(syms, f, line));
      }
      for (const n of ["foo", "FOO", "Item", "iitem", "x", "missing"]) expect(defsIn(m, n)).toEqual(oldDefs(syms, n));
    }
  });

  it("le liste restituite si possono modificare senza toccare l'indice", () => {
    const m = buildMaps(randomIndex(3, 100));
    const d = defsIn(m, "foo");
    d.length = 0;
    expect(defsIn(m, "foo").length).toBeGreaterThan(0);
  });
});
