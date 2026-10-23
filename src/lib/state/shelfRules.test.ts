import { describe, it, expect } from "vitest";
import {
  categoriesIn,
  cleanRuleMap,
  compileShelf,
  deleteCategoryIn,
  exactRuleFor,
  groupByCategory,
  isPattern,
  matchesName,
  nameMatcher,
  renameCategoryIn,
  shelfCountIn,
  withCategories,
  type RuleSet,
} from "./shelfRules";

const none: RuleSet = { folders: {}, files: {} };
const hide = (paths: Record<string, string[]>, ...scopes: RuleSet[]) => compileShelf(paths, scopes.length ? scopes : [none]);

describe("nomi e pattern", () => {
  it("riconosce un pattern da `*` o `?`", () => {
    expect(isPattern("*.Tests")).toBe(true);
    expect(isPattern("obj?")).toBe(true);
    expect(isPattern("bin")).toBe(false);
  });

  it("nome esatto o pattern, senza distinzione di maiuscole", () => {
    const m = nameMatcher(["bin", "*.Tests", ".*", "obj?"]);
    expect(m("BIN")).toBe(true);
    expect(m("binary")).toBe(false);
    expect(m("App.Tests")).toBe(true);
    expect(m("App.tests")).toBe(true);
    expect(m("Tests")).toBe(false);
    expect(m(".git")).toBe(true);
    expect(m("git")).toBe(false);
    expect(m("obj1")).toBe(true);
    expect(m("obj")).toBe(false);
    expect(m("obj12")).toBe(false);
  });

  it("i caratteri speciali delle espressioni regolari valgono come lettere", () => {
    expect(matchesName("a+b(*)", "a+b(x)")).toBe(true);
    expect(matchesName("a+b(*)", "aab(x)")).toBe(false);
    expect(matchesName("[x]", "[x]")).toBe(true);
  });

  it("senza regole non corrisponde nulla", () => {
    expect(nameMatcher([])("bin")).toBe(false);
  });
});

describe("compileShelf.hidden", () => {
  it("nasconde una voce per percorso e quello che contiene", () => {
    const s = hide({ "src/bin": ["X"] });
    expect(s.hidden("src/bin", true)).toBe(true);
    expect(s.hidden("src/bin/Debug", true)).toBe(true);
    expect(s.hidden("src/bin/a.dll", false)).toBe(true);
  });

  it("non confonde un prefisso parziale con un segmento", () => {
    expect(hide({ "src/bin": ["X"] }).hidden("src/bingo", true)).toBe(false);
  });

  it("un file per percorso nasconde solo quel file", () => {
    const s = hide({ "package-lock.json": ["N"] });
    expect(s.hidden("package-lock.json", false)).toBe(true);
    expect(s.hidden("sub/package-lock.json", false)).toBe(false);
  });

  it("regola per cartelle: ogni cartella con quel nome, anche annidata, e il suo contenuto", () => {
    const s = hide({}, { folders: { bin: ["G"] }, files: {} });
    expect(s.hidden("bin", true)).toBe(true);
    expect(s.hidden("ProjA/bin", true)).toBe(true);
    expect(s.hidden("src/ProjA/bin/Debug/net8.0", true)).toBe(true);
    expect(s.hidden("src/ProjA/bin/app.dll", false)).toBe(true);
    expect(s.hidden("src/BIN", true)).toBe(true);
    expect(s.hidden("src/binary", true)).toBe(false);
  });

  it("regola per cartelle: non tocca un file con lo stesso nome (M72)", () => {
    const s = hide({}, { folders: { logs: ["U"] }, files: {} });
    expect(s.hidden("src/logs", false)).toBe(false);
    expect(s.hidden("logs", false)).toBe(false);
    expect(s.hidden("logs/today.txt", false)).toBe(true);
  });

  it("regola per file: i file con quel nome o pattern, non le cartelle", () => {
    const s = hide({}, { folders: {}, files: { "*.DotSettings.user": ["N"], "yarn.lock": ["N"] } });
    expect(s.hidden("App.sln.DotSettings.user", false)).toBe(true);
    expect(s.hidden("sub/yarn.lock", false)).toBe(true);
    expect(s.hidden("yarn.lock", true)).toBe(false); // una cartella con quel nome resta
    expect(s.hidden("README.md", false)).toBe(false);
  });

  it("pattern `.*`: tutte le cartelle col punto, a ogni livello", () => {
    const s = hide({}, { folders: { ".*": ["Config"] }, files: {} });
    expect(s.hidden(".git", true)).toBe(true);
    expect(s.hidden("tools/.vs", true)).toBe(true);
    expect(s.hidden(".github/workflows/release.yml", false)).toBe(true);
    expect(s.hidden(".gitignore", false)).toBe(false); // un file col punto no: è una regola per cartelle
    expect(s.hidden("src", true)).toBe(false);
  });

  it("le regole della repo e quelle globali valgono insieme", () => {
    const s = compileShelf({}, [
      { folders: { bin: ["G"] }, files: {} },
      { folders: { obj: ["G"] }, files: {} },
    ]);
    expect(s.hidden("A/bin", true)).toBe(true);
    expect(s.hidden("A/obj", true)).toBe(true);
    expect(s.hidden("A/src", true)).toBe(false);
  });

  it("senza voci non nasconde nulla", () => {
    expect(hide({}).hidden("src/main.ts", false)).toBe(false);
  });
});

describe("conteggio, categorie, regole esatte", () => {
  it("conta percorsi e regole di tutti gli ambiti", () => {
    expect(shelfCountIn({}, [none])).toBe(0);
    expect(shelfCountIn({ tools: ["U"] }, [{ folders: { bin: ["G"] }, files: {} }, { folders: { ".*": ["C"] }, files: { "*.user": ["N"] } }])).toBe(4);
  });

  it("trova la regola esatta per un nome, non un pattern che lo copre", () => {
    expect(exactRuleFor("BIN", { bin: ["G"] })).toBe("bin");
    expect(exactRuleFor("bin", { "b*": ["G"] })).toBeNull();
  });

  it("filtra le voci per categoria", () => {
    expect(withCategories({ a: ["X"], b: ["Y"], c: ["Y", "Z"] }, new Set(["Y"]))).toEqual({ b: ["Y"], c: ["Y", "Z"] });
  });

  it("elenca le categorie usate, in ordine", () => {
    expect(categoriesIn([{ a: ["utility"] }, { b: ["Config", "utility"] }])).toEqual(["Config", "utility"]);
  });

  it("rinomina una categoria senza creare doppioni", () => {
    expect(renameCategoryIn({ a: ["Generato"], b: ["Generato", "Generated"] }, "Generato", "Generated")).toEqual({
      a: ["Generated"],
      b: ["Generated"],
    });
  });

  it("elimina una categoria: le voci senza altre categorie escono", () => {
    expect(deleteCategoryIn({ a: ["X"], b: ["X", "Y"] }, "X")).toEqual({ b: ["Y"] });
  });

  it("ripulisce i dati letti da un file", () => {
    expect(cleanRuleMap({ a: ["X", "X", "", 3], b: [], c: "x", " ": ["Y"] })).toEqual({ a: ["X"] });
    expect(cleanRuleMap(null)).toEqual({});
    expect(cleanRuleMap(["x"])).toEqual({});
  });
});

describe("groupByCategory", () => {
  it("raggruppa percorsi e regole per categoria, le globali dopo", () => {
    const res = groupByCategory(
      { "a/y": ["Gen"], "a/x": ["Gen"], "b/z": ["Docs"] },
      { folders: { obj: ["Gen"] }, files: { "*.user": ["Gen"] } },
      { folders: { bin: ["Gen"], ".*": ["Config"] }, files: {} },
    );
    expect(res.map((c) => c.category)).toEqual(["Config", "Docs", "Gen"]);
    const gen = res.find((c) => c.category === "Gen")!;
    expect(gen.paths).toEqual(["a/x", "a/y"]);
    expect(gen.rules).toEqual([
      { pattern: "*.user", kind: "files", global: false },
      { pattern: "obj", kind: "folders", global: false },
      { pattern: "bin", kind: "folders", global: true },
    ]);
  });
});
