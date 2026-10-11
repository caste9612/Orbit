import { describe, expect, it } from "vitest";
import { matchesAll, queryTerms, segments } from "./searchText";

const join = (s: ReturnType<typeof segments>) => s.map((x) => x.text).join("");
const hits = (s: ReturnType<typeof segments>) => s.filter((x) => x.hit).map((x) => x.text);

describe("ricerca nelle Impostazioni", () => {
  it("divide la query in parole minuscole", () => {
    expect(queryTerms("  Font   SIZE ")).toEqual(["font", "size"]);
    expect(queryTerms("   ")).toEqual([]);
  });

  it("vuole tutte le parole, in qualsiasi ordine", () => {
    expect(matchesAll("Terminal font size", ["size", "term"])).toBe(true);
    expect(matchesAll("Terminal font size", ["size", "editor"])).toBe(false);
    expect(matchesAll("qualunque", [])).toBe(true);
  });

  it("evidenzia i pezzi trovati senza perdere testo", () => {
    const s = segments("Font size — or Ctrl+scroll", ["size", "ctrl"]);
    expect(join(s)).toBe("Font size — or Ctrl+scroll");
    expect(hits(s)).toEqual(["size", "Ctrl"]);
  });

  it("unisce i pezzi che si sovrappongono", () => {
    const s = segments("scrollback", ["scroll", "rollb"]);
    expect(join(s)).toBe("scrollback");
    expect(hits(s)).toEqual(["scrollb"]);
    expect(hits(segments("font size", ["font", " size"]))).toEqual(["font size"]);
  });

  it("tiene il codice fra backtick, anche quando è trovato", () => {
    const s = segments("start `claude` instead", ["claude"]);
    expect(join(s)).toBe("start claude instead");
    expect(s).toContainEqual({ text: "claude", code: true, hit: true });
    expect(s.filter((x) => x.code).map((x) => x.text)).toEqual(["claude"]);
  });

  it("senza ricerca restituisce il testo com'è", () => {
    expect(segments("Theme", [])).toEqual([{ text: "Theme", code: false, hit: false }]);
  });
});
