import { describe, expect, it } from "vitest";
import {
  arrange,
  arrangeAuto,
  dropZone,
  flatten,
  insertPane,
  locate,
  MAX_PANES,
  paneGeometry,
  placeBeside,
  reconcile,
  removePane,
  replacePane,
  resizePanes,
  sizesFor,
  splitPartner,
  validSizes,
} from "./paneLayout";

describe("dropZone (rilascio di una scheda su un riquadro)", () => {
  it("il bordo più vicino entro un terzo, altrimenti il centro", () => {
    expect(dropZone(0.9, 0.5)).toBe("right");
    expect(dropZone(0.7, 0.5)).toBe("right"); // M57: prima (soglia 1/4) qui era uno scambio
    expect(dropZone(0.1, 0.5)).toBe("left");
    expect(dropZone(0.5, 0.2)).toBe("top");
    expect(dropZone(0.5, 0.85)).toBe("bottom");
    expect(dropZone(0.5, 0.5)).toBe("center");
    expect(dropZone(0.62, 0.45)).toBe("center");
  });

  it("vince il bordo più vicino, anche negli angoli", () => {
    expect(dropZone(0.95, 0.8)).toBe("right");
    expect(dropZone(0.8, 0.95)).toBe("bottom");
  });
});

describe("splitPartner (trascini la chat già visibile sul suo riquadro)", () => {
  it("dall'altra parte va la scheda usata più di recente", () => {
    expect(splitPartner("a", ["a", "c", "b"], ["b", "c"])).toBe("c");
  });

  it("senza cronologia, la prima altra scheda della repo", () => {
    expect(splitPartner("a", [], ["b", "c"])).toBe("b");
    expect(splitPartner("a", ["x"], ["b"])).toBe("b"); // x non è più aperta
  });

  it("nessun'altra scheda → nessuno split", () => {
    expect(splitPartner("a", ["a"], [])).toBeNull();
  });
});

describe("insertPane (drag con direzione)", () => {
  it("a destra crea una colonna, in basso una riga", () => {
    expect(insertPane([["a"]], "b", "a", "right")).toEqual([["a"], ["b"]]);
    expect(insertPane([["a"]], "b", "a", "left")).toEqual([["b"], ["a"]]);
    expect(insertPane([["a"]], "b", "a", "bottom")).toEqual([["a", "b"]]);
    expect(insertPane([["a"]], "b", "a", "top")).toEqual([["b", "a"]]);
  });

  it("a destra di un riquadro impilato: nuova colonna accanto alla sua", () => {
    expect(insertPane([["a", "b"]], "c", "b", "right")).toEqual([["a", "b"], ["c"]]);
    expect(insertPane([["a"], ["b", "c"]], "d", "b", "bottom")).toEqual([["a"], ["b", "d", "c"]]);
  });

  it("un riquadro già visibile viene spostato, non duplicato", () => {
    expect(insertPane([["a"], ["b"]], "a", "b", "bottom")).toEqual([["b", "a"]]);
    expect(insertPane([["a"], ["b"], ["c"]], "c", "a", "left")).toEqual([["c"], ["a"], ["b"]]);
  });

  it("ancora assente → in coda; oltre il massimo non cambia nulla", () => {
    expect(insertPane([["a"]], "b", null, "right")).toEqual([["a"], ["b"]]);
    const full = [["a", "b"], ["c", "d"], ["e", "f"]];
    expect(flatten(full)).toHaveLength(MAX_PANES);
    expect(insertPane(full, "g", "a", "right")).toEqual(full);
    expect(insertPane(full, "d", "a", "right")).toEqual([["a", "b"], ["d"], ["c"], ["e", "f"]]); // spostare si può
    // M72: sei riquadri, prima quattro
    expect(insertPane([["a", "b"], ["c", "d"]], "e", "d", "right")).toEqual([["a", "b"], ["c", "d"], ["e"]]);
  });

  it("il massimo si può dare per chiamata (i gruppi dell'editor hanno il loro)", () => {
    expect(insertPane([["a"], ["b"]], "c", "a", "right", 2)).toEqual([["a"], ["b"]]);
    expect(insertPane([["a"], ["b"]], "c", "a", "right", 3)).toEqual([["a"], ["c"], ["b"]]);
  });
});

describe("removePane / replacePane / locate", () => {
  it("toglie il riquadro e le colonne vuote; sotto i due → scheda singola", () => {
    expect(removePane([["a"], ["b", "c"]], "a")).toEqual([["b", "c"]]);
    expect(removePane([["a"], ["b"]], "b")).toEqual([]);
  });

  it("sostituisce, o scambia se già visibile", () => {
    expect(replacePane([["a"], ["b"]], "a", "c")).toEqual([["c"], ["b"]]);
    expect(replacePane([["a"], ["b", "c"]], "a", "c")).toEqual([["c"], ["b", "a"]]);
    expect(replacePane([["a"]], "x", "c")).toEqual([["a"]]);
  });

  it("locate trova colonna e riga", () => {
    expect(locate([["a"], ["b", "c"]], "c")).toEqual({ c: 1, r: 1 });
    expect(locate([["a"]], "z")).toBeNull();
  });
});

describe("arrangeAuto / arrange / placeBeside", () => {
  it("due riquadri: affiancati se c'è spazio, altrimenti impilati", () => {
    expect(arrangeAuto(["a", "b"], 1000, 700)).toEqual([["a"], ["b"]]);
    expect(arrangeAuto(["a", "b"], 700, 700)).toEqual([["a", "b"]]);
  });

  it("tre e quattro riquadri: griglia quando conviene", () => {
    expect(arrangeAuto(["a", "b", "c"], 1100, 800)).toEqual([["a"], ["b", "c"]]);
    expect(arrangeAuto(["a", "b", "c", "d"], 1100, 800)).toEqual([["a", "c"], ["b", "d"]]);
    expect(arrangeAuto(["a", "b", "c", "d"], 784, 730)).toEqual([["a", "c"], ["b", "d"]]); // pannello stretto
    expect(arrangeAuto(["a", "b", "c", "d"], 2400, 300)).toEqual([["a"], ["b"], ["c"], ["d"]]);
    expect(arrangeAuto(["a", "b", "c", "d"], 600, 1400)).toEqual([["a", "b", "c", "d"]]);
  });

  it("cinque e sei riquadri: tre colonne su uno schermo largo, due in un pannello stretto", () => {
    const six = ["a", "b", "c", "d", "e", "f"];
    // pannello massimizzato su uno schermo largo: 3×2, a b c sopra e d e f sotto
    expect(arrangeAuto(six, 2400, 900)).toEqual([["a", "d"], ["b", "e"], ["c", "f"]]);
    // metà schermo: due colonne di tre
    expect(arrangeAuto(six, 1100, 1000)).toEqual([["a", "c", "e"], ["b", "d", "f"]]);
    // schermo 4K al 125%, pannello massimizzato: sei colonne da 510 px ci starebbero, ma vince 3×2
    expect(arrangeAuto(six, 3060, 1600)).toEqual([["a", "d"], ["b", "e"], ["c", "f"]]);
    // cinque: l'ultima colonna ha un riquadro solo, alto quanto il pannello
    expect(arrangeAuto(["a", "b", "c", "d", "e"], 2000, 900)).toEqual([["a", "d"], ["b", "e"], ["c"]]);
    expect(arrangeAuto(["a", "b", "c", "d", "e"], 2400, 900)).toEqual([["a", "d"], ["b", "e"], ["c"]]);
    // molto largo e basso: tutti affiancati
    expect(arrangeAuto(six, 3200, 300)).toEqual([["a"], ["b"], ["c"], ["d"], ["e"], ["f"]]);
  });

  it("le disposizioni del menu ignorano lo spazio", () => {
    expect(arrange(["a", "b", "c"], "columns", 500, 500)).toEqual([["a"], ["b"], ["c"]]);
    expect(arrange(["a", "b"], "rows", 3000, 500)).toEqual([["a", "b"]]);
  });

  it("placeBeside: colonna se ci sta, altrimenti riga sotto l'attivo", () => {
    expect(placeBeside([], "b", "a", 1000)).toEqual([["a"], ["b"]]);
    expect(placeBeside([], "b", "a", 700)).toEqual([["a", "b"]]);
    expect(placeBeside([["a"], ["b"]], "c", "a", 1600)).toEqual([["a"], ["c"], ["b"]]);
    expect(placeBeside([["a"], ["b"]], "c", "b", 900)).toEqual([["a"], ["b", "c"]]);
    expect(placeBeside([], "b", null, 1000)).toEqual([["b"]]); // niente da affiancare
  });
});

describe("sizesFor / paneGeometry / resizePanes", () => {
  it("dimensioni salvate solo se la forma coincide", () => {
    const saved = { shape: "1,2", cols: [0.3, 0.7], rows: [[1], [0.25, 0.75]] };
    expect(sizesFor([["a"], ["b", "c"]], saved)).toBe(saved);
    expect(sizesFor([["a"], ["b"]], saved)).toEqual({ shape: "1,1", cols: [0.5, 0.5], rows: [[1], [1]] });
    expect(sizesFor([["a", "b", "c"]], null)).toEqual({ shape: "3", cols: [1], rows: [[1 / 3, 1 / 3, 1 / 3]] });
  });

  it("posizioni dei riquadri e dei separatori, con lo spazio fra i riquadri", () => {
    const lay = [["a"], ["b", "c"]];
    const g = paneGeometry(lay, sizesFor(lay, null), 1010, 610, 10);
    // larghezza utile 1010 - 3·10 = 980 → 490 a colonna; altezza utile della colonna 2: 610 - 3·10 = 580
    expect(g.rects.a).toEqual({ x: 10, y: 10, w: 490, h: 590 });
    expect(g.rects.b).toEqual({ x: 510, y: 10, w: 490, h: 290 });
    expect(g.rects.c).toEqual({ x: 510, y: 310, w: 490, h: 290 });
    expect(g.vSplits).toEqual([{ c: 0, x: 500, y: 10, h: 590 }]);
    expect(g.hSplits).toEqual([{ c: 1, r: 0, x: 510, y: 300, w: 490 }]);
  });

  it("senza spazio i riquadri si toccano (editor diviso)", () => {
    const lay = [["a"], ["b"]];
    const g = paneGeometry(lay, sizesFor(lay, null), 800, 600, 0);
    expect(g.rects.a).toEqual({ x: 0, y: 0, w: 400, h: 600 });
    expect(g.rects.b).toEqual({ x: 400, y: 0, w: 400, h: 600 });
    expect(g.vSplits[0].x).toBe(400);
  });

  it("trascinare un separatore sposta solo i due riquadri vicini, mai sotto il minimo", () => {
    const lay = [["a"], ["b"], ["c"]];
    const from = sizesFor(lay, null);
    const next = resizePanes(from, lay, "col", 0, 0, 100, 1000, 600, 0);
    expect(next.cols[0]).toBeCloseTo(1 / 3 + 0.1);
    expect(next.cols[1]).toBeCloseTo(1 / 3 - 0.1);
    expect(next.cols[2]).toBeCloseTo(1 / 3);
    expect(from.cols[0]).toBeCloseTo(1 / 3); // le dimensioni di partenza non cambiano
    const clamped = resizePanes(from, lay, "col", 0, 0, 900, 1000, 600, 0);
    expect(clamped.cols[1]).toBeCloseTo(0.14); // 140 px su 1000
    expect(clamped.cols[0] + clamped.cols[1]).toBeCloseTo(2 / 3);
    const rows = resizePanes(sizesFor([["a", "b"]], null), [["a", "b"]], "row", 0, 0, -60, 800, 600, 0);
    expect(rows.rows[0]).toEqual([0.4, 0.6]);
  });
});

describe("reconcile / validSizes", () => {
  it("allinea la disposizione ai riquadri che esistono davvero", () => {
    expect(reconcile([["a"], ["b", "c"]], ["a", "b", "c"])).toEqual([["a"], ["b", "c"]]);
    expect(reconcile([["a"], ["b", "c"]], ["a", "c"])).toEqual([["a"], ["c"]]);
    expect(reconcile([["a"], ["b"]], ["b"])).toEqual([["b"]]);
    expect(reconcile([["a", "a"], ["a"]], ["a"])).toEqual([["a"]]); // niente doppioni
    expect(reconcile([["a"]], ["a", "x", "y"])).toEqual([["a"], ["x"], ["y"]]); // i mancanti in coda
    expect(reconcile([], ["a"])).toEqual([["a"]]);
    expect(reconcile([["a"]], [])).toEqual([]);
  });

  it("accetta dimensioni salvate solo se combaciano con la forma", () => {
    const lay = [["a"], ["b", "c"]];
    const good = { shape: "1,2", cols: [0.4, 0.6], rows: [[1], [0.5, 0.5]] };
    expect(validSizes(good, lay)).toEqual(good);
    expect(validSizes({ ...good, shape: "2,1" }, lay)).toBeNull();
    expect(validSizes({ ...good, cols: [0.4] }, lay)).toBeNull();
    expect(validSizes({ ...good, rows: [[1], [0.5, -1]] }, lay)).toBeNull();
    expect(validSizes({ ...good, cols: [0.4, "x"] }, lay)).toBeNull();
    expect(validSizes(null, lay)).toBeNull();
    expect(validSizes("junk", lay)).toBeNull();
  });
});
