import { describe, expect, it } from "vitest";
import {
  arrange,
  arrangeAuto,
  dropZone,
  flatten,
  insertPane,
  locate,
  MAX_PANES,
  placeBeside,
  removePane,
  replacePane,
  splitPartner,
} from "./terminalLayout";

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
    const full = [["a", "b"], ["c", "d"]];
    expect(flatten(full)).toHaveLength(MAX_PANES);
    expect(insertPane(full, "e", "a", "right")).toEqual(full);
    expect(insertPane(full, "d", "a", "right")).toEqual([["a", "b"], ["d"], ["c"]]); // spostare si può
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
