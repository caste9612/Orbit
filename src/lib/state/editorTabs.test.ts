import { describe, expect, it } from "vitest";
import { nextActive } from "./editorTabs";

const tabs = ["a", "b", "c", "d", "e"];

describe("nextActive (scheda attiva dopo una chiusura multipla)", () => {
  it("se l'attiva resta aperta non cambia", () => {
    expect(nextActive(tabs, "b", new Set(["d", "e"]))).toBe("b");
    expect(nextActive(tabs, null, new Set(["a"]))).toBe(null);
  });
  it("Close to the right con l'attiva tra le chiuse: la più vicina a sinistra", () => {
    // tasto destro su "b", attiva "d": restano a, b → la più vicina a sinistra di "d" è "b"
    expect(nextActive(tabs, "d", new Set(["c", "d", "e"]))).toBe("b");
  });
  it("prima a destra, poi a sinistra (come la chiusura di una scheda sola)", () => {
    expect(nextActive(tabs, "b", new Set(["b", "c"]))).toBe("d");
    expect(nextActive(tabs, "e", new Set(["e"]))).toBe("d");
  });
  it("Close others: resta solo quella cliccata, che diventa l'attiva", () => {
    expect(nextActive(tabs, "a", new Set(["a", "b", "d", "e"]))).toBe("c");
  });
  it("Close all: nessuna attiva", () => {
    expect(nextActive(tabs, "c", new Set(tabs))).toBe(null);
  });
});
