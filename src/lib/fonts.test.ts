import { describe, expect, it } from "vitest";
import { NERD_FALLBACK, customFamilies, monoFontStack } from "./fonts";

describe("monoFontStack (M75)", () => {
  it("font scelti, poi i Nerd Font, poi il monospazio del sistema", () => {
    const s = monoFontStack(["JetBrains Mono Variable", "JetBrains Mono"]);
    expect(s.startsWith('"JetBrains Mono Variable", "JetBrains Mono", "Symbols Nerd Font Mono"')).toBe(true);
    expect(s.endsWith("ui-monospace, monospace")).toBe(true);
    expect(s.split(", ")).toHaveLength(2 + NERD_FALLBACK.length + 2);
  });
  it("niente doppioni, anche con maiuscole diverse", () => {
    const s = monoFontStack(["MesloLGS Nerd Font Mono", "monospace"]);
    expect(s.match(/MesloLGS Nerd Font Mono/gi)).toHaveLength(1);
    expect(s.match(/(^|, )monospace/g)).toHaveLength(1);
  });
});

describe("customFamilies (M75)", () => {
  it("separa per virgole e toglie le virgolette", () => {
    expect(customFamilies(` "MesloLGS Nerd Font Mono", 'Iosevka' ,, `)).toEqual(["MesloLGS Nerd Font Mono", "Iosevka"]);
  });
  it("niente caratteri che chiuderebbero la dichiarazione CSS", () => {
    expect(customFamilies("Evil; } body { color: red")).toEqual(["Evil  body  color: red"]);
  });
});
