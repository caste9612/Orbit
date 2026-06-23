import { describe, it, expect } from "vitest";
import { isHiddenIn, isNameRuledIn, groupByCategory } from "./shelfRules";

describe("isHiddenIn", () => {
  it("nasconde una cartella scaffalata per percorso e i suoi discendenti", () => {
    expect(isHiddenIn("src/bin", { "src/bin": ["X"] }, {})).toBe(true);
    expect(isHiddenIn("src/bin/Debug", { "src/bin": ["X"] }, {})).toBe(true);
  });

  it("non confonde un prefisso parziale con un segmento", () => {
    // "src/bingo" NON è dentro "src/bin"
    expect(isHiddenIn("src/bingo", { "src/bin": ["X"] }, {})).toBe(false);
  });

  it("regola-per-nome: nasconde ogni cartella con quel nome, anche annidata", () => {
    const byName = { bin: ["Generato"] };
    expect(isHiddenIn("bin", {}, byName)).toBe(true);
    expect(isHiddenIn("ProjA/bin", {}, byName)).toBe(true);
    expect(isHiddenIn("src/ProjA/bin/Debug/net8.0", {}, byName)).toBe(true);
  });

  it("regola-per-nome: match case-insensitive (Windows)", () => {
    expect(isHiddenIn("src/BIN", {}, { bin: ["G"] })).toBe(true);
    expect(isHiddenIn("src/obj", {}, { OBJ: ["G"] })).toBe(true);
  });

  it("regola-per-nome: non scatta su un segmento solo simile", () => {
    expect(isHiddenIn("src/binary", {}, { bin: ["G"] })).toBe(false);
  });

  it("non nasconde nulla senza regole", () => {
    expect(isHiddenIn("src/main.ts", {}, {})).toBe(false);
  });
});

describe("isNameRuledIn", () => {
  it("riconosce un nome a regola, case-insensitive", () => {
    expect(isNameRuledIn("bin", { bin: ["G"] })).toBe(true);
    expect(isNameRuledIn("BIN", { bin: ["G"] })).toBe(true);
    expect(isNameRuledIn("bin", {})).toBe(false);
  });
});

describe("groupByCategory", () => {
  it("raggruppa cartelle e regole-per-nome per categoria, ordinate", () => {
    const map = { "a/x": ["Gen"], "a/y": ["Gen"], "b/z": ["Docs"] };
    const byName = { bin: ["Gen"], obj: ["Gen"] };
    const res = groupByCategory(map, byName);
    expect(res.map((c) => c.category)).toEqual(["Docs", "Gen"]); // ordine alfabetico
    const gen = res.find((c) => c.category === "Gen")!;
    expect(gen.folders).toEqual(["a/x", "a/y"]);
    expect(gen.names).toEqual(["bin", "obj"]);
    const docs = res.find((c) => c.category === "Docs")!;
    expect(docs.folders).toEqual(["b/z"]);
    expect(docs.names).toEqual([]);
  });

  it("gestisce una categoria con sole regole-per-nome", () => {
    const res = groupByCategory({}, { node_modules: ["Noise"] });
    expect(res).toHaveLength(1);
    expect(res[0]).toMatchObject({ category: "Noise", folders: [], names: ["node_modules"] });
  });
});
