import { describe, expect, it } from "vitest";
import { addPane, gridFor, MAX_PANES, movePane, removePane, replacePane } from "./terminalLayout";

describe("gridFor", () => {
  it("un solo riquadro occupa tutto", () => {
    expect(gridFor(1, 900, 700)).toEqual({ cols: 1, rows: 1, cells: [{ col: 1, row: 1, colSpan: 1, rowSpan: 1 }] });
  });

  it("due riquadri: affiancati se c'è spazio, altrimenti impilati", () => {
    expect(gridFor(2, 1000, 700)).toMatchObject({ cols: 2, rows: 1 });
    expect(gridFor(2, 700, 700)).toMatchObject({ cols: 1, rows: 2 });
  });

  it("tre riquadri con spazio per due colonne: il primo alto a sinistra", () => {
    const g = gridFor(3, 1100, 800);
    expect(g).toMatchObject({ cols: 2, rows: 2 });
    expect(g.cells[0]).toEqual({ col: 1, row: 1, colSpan: 1, rowSpan: 2 });
    expect(g.cells[1]).toMatchObject({ col: 2, row: 1 });
    expect(g.cells[2]).toMatchObject({ col: 2, row: 2 });
  });

  it("quattro riquadri: griglia 2×2 se c'è spazio in entrambe le direzioni", () => {
    const g = gridFor(4, 1100, 800);
    expect(g).toMatchObject({ cols: 2, rows: 2 });
    expect(g.cells.map((c) => [c.col, c.row])).toEqual([[1, 1], [2, 1], [1, 2], [2, 2]]);
    expect(gridFor(4, 2400, 300)).toMatchObject({ cols: 4, rows: 1 }); // larghissimo e basso
    expect(gridFor(4, 600, 1400)).toMatchObject({ cols: 1, rows: 4 }); // stretto e altissimo
  });

  it("pannello stretto: con 4 chat meglio la 2×2 di quattro strisce basse", () => {
    // caso reale del collaudo: pannello da 784×730 → impilati darebbe riquadri di ~180px (7 righe)
    expect(gridFor(4, 784, 730)).toMatchObject({ cols: 2, rows: 2 });
    expect(gridFor(2, 784, 730)).toMatchObject({ cols: 1, rows: 2 }); // due chat: impilate, larghe
  });

  it("le modalità forzate ignorano lo spazio", () => {
    expect(gridFor(3, 500, 500, "columns")).toMatchObject({ cols: 3, rows: 1 });
    expect(gridFor(2, 3000, 500, "rows")).toMatchObject({ cols: 1, rows: 2 });
  });
});

describe("addPane", () => {
  it("senza split parte dal terminale attivo", () => {
    expect(addPane([], "a", "b")).toEqual(["a", "b"]);
    expect(addPane([], null, "b")).toEqual(["b"]); // niente da affiancare: resta singolo
  });

  it("inserisce accanto all'ancora, prima o dopo", () => {
    expect(addPane(["a", "b"], "a", "c", "a")).toEqual(["a", "c", "b"]);
    expect(addPane(["a", "b"], "a", "c", "a", true)).toEqual(["c", "a", "b"]);
    expect(addPane(["a", "b"], "a", "c")).toEqual(["a", "b", "c"]);
  });

  it("non duplica e non supera il massimo", () => {
    expect(addPane(["a", "b"], "a", "b")).toEqual(["a", "b"]);
    const full = ["a", "b", "c", "d"];
    expect(full).toHaveLength(MAX_PANES);
    expect(addPane(full, "a", "e")).toEqual(full);
  });
});

describe("removePane / replacePane", () => {
  it("sotto i due riquadri si torna alla scheda singola", () => {
    expect(removePane(["a", "b", "c"], "b")).toEqual(["a", "c"]);
    expect(removePane(["a", "b"], "a")).toEqual([]);
  });

  it("sposta un riquadro visibile accanto a un altro", () => {
    expect(movePane(["a", "b", "c"], "c", "a", true)).toEqual(["c", "a", "b"]);
    expect(movePane(["a", "b", "c"], "a", "c")).toEqual(["b", "c", "a"]);
    expect(movePane(["a", "b"], "x", "a")).toEqual(["a", "b"]); // non visibile: niente
  });

  it("sostituisce il riquadro, o scambia se il terminale è già visibile", () => {
    expect(replacePane(["a", "b"], "a", "c")).toEqual(["c", "b"]);
    expect(replacePane(["a", "b", "c"], "a", "c")).toEqual(["c", "b", "a"]);
    expect(replacePane(["a", "b"], "x", "c")).toEqual(["a", "b"]); // bersaglio non visibile: niente
  });
});
