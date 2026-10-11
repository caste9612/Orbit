import { describe, expect, it } from "vitest";
import {
  DEFAULT_EDITOR_CARET,
  DEFAULT_TERM_CARET,
  EDITOR_PRESETS,
  TERM_PRESETS,
  sanitizeEditorCaret,
  sanitizeTermCaret,
  styleOf,
} from "./caretStyles";

describe("stili del cursore", () => {
  it("ogni stile pronto si riconosce dai suoi valori", () => {
    for (const [name, fx] of Object.entries(EDITOR_PRESETS)) expect(styleOf(fx, EDITOR_PRESETS)).toBe(name);
    for (const [name, fx] of Object.entries(TERM_PRESETS)) expect(styleOf(fx, TERM_PRESETS)).toBe(name);
  });

  it("valori ritoccati a mano danno \"custom\"", () => {
    expect(styleOf({ ...EDITOR_PRESETS.smooth, glow: "breathe" }, EDITOR_PRESETS)).toBe("custom");
    expect(styleOf({ ...EDITOR_PRESETS.comet, trailLen: "long" }, EDITOR_PRESETS)).toBe("custom");
    // senza scia la lunghezza non conta
    expect(styleOf({ ...EDITOR_PRESETS.smooth, trailLen: "short" }, EDITOR_PRESETS)).toBe("smooth");
  });

  it("nel terminale gli stili non lampeggiano; il default è Morbido con la barra nella chat", () => {
    for (const fx of Object.values(TERM_PRESETS)) expect(fx.blink).toBe("none");
    expect(DEFAULT_TERM_CARET).toMatchObject({ style: "smooth", shell: "block", chat: "bar", glide: "always", blink: "none" });
    expect(DEFAULT_EDITOR_CARET).toMatchObject({ style: "smooth", shape: "line", blink: "smooth" });
  });

  it("le impostazioni salvate si validano campo per campo", () => {
    expect(sanitizeEditorCaret(null)).toEqual(DEFAULT_EDITOR_CARET);
    expect(sanitizeEditorCaret({ shape: "triangle", glide: "jumps", trail: "comet", trailLen: "short", blink: 3 })).toEqual({
      ...DEFAULT_EDITOR_CARET,
      shape: "line",
      glide: "jumps",
      trail: "comet",
      trailLen: "short",
      style: "custom",
    });
    expect(sanitizeTermCaret({ shell: "hollow", chat: "under", ...TERM_PRESETS.elastic, style: "whatever" })).toEqual({
      ...TERM_PRESETS.elastic,
      shell: "hollow",
      chat: "under",
      style: "elastic",
    });
  });
});
