import { describe, expect, it } from "vitest";
import { colorIndex, gripFor, GRIP, initials, MIN_GRIP, planStrip, type StripInput } from "./repoStrip";

// cinque repo: schede intere da 100 px (l'attiva, con il branch, da 140), chip da 30, spazi da 4,
// «+» da 26 e «+N» da 34
const base: StripInput = { full: [140, 100, 100, 100, 100], active: 0, avail: 1000, chip: 30, gap: 4, add: 26, more: 34 };
const plan = (over: Partial<StripInput>) => planStrip({ ...base, ...over });

describe("gripFor (spazio libero per trascinare, per lato)", () => {
  it("56 px quando c'è spazio", () => {
    expect(gripFor(800)).toBe(GRIP);
  });
  it("in una finestra stretta cede, fino al minimo, perché la repo attiva resti intera", () => {
    expect(gripFor(260)).toBe(30); // (260 − 200) / 2
    expect(gripFor(248)).toBe(24); // finestra da 1100 px: 200 px restano alla striscia
    expect(gripFor(90)).toBe(MIN_GRIP);
  });
});

describe("planStrip (schede intere, chip e menu «+N»)", () => {
  it("con spazio tutte intere", () => {
    // 140 + 4·100 + 5 spazi + 26 = 586
    expect(plan({ avail: 586 })).toEqual({ modes: ["full", "full", "full", "full", "full"], hidden: 0, activeWidth: null });
  });
  it("le repo si comprimono da destra, una alla volta", () => {
    expect(plan({ avail: 585 }).modes).toEqual(["full", "full", "full", "full", "chip"]); // 516 ≤ 585
    expect(plan({ avail: 515 }).modes).toEqual(["full", "full", "full", "chip", "chip"]); // 446
  });
  it("le prime tre restano intere finché ci stanno: prima le ultime chip vanno nel «+N»", () => {
    // tre intere e due chip non ci stanno (446): via le chip, da destra
    expect(plan({ avail: 420 })).toEqual({ modes: ["full", "full", "full", "chip", "hidden"], hidden: 1, activeWidth: null }); // 420
    expect(plan({ avail: 400 })).toEqual({ modes: ["full", "full", "full", "hidden", "hidden"], hidden: 2, activeWidth: null }); // 386
    // nemmeno tre intere col «+N»: ne restano due, con le chip che ci stanno (e così via)
    expect(plan({ avail: 330 })).toEqual({ modes: ["full", "full", "chip", "hidden", "hidden"], hidden: 2, activeWidth: null }); // 316
    expect(plan({ avail: 300 })).toEqual({ modes: ["full", "full", "hidden", "hidden", "hidden"], hidden: 3, activeWidth: null }); // 282
  });
  it("con lo spazio, più di tre intere: le chip restano tutte visibili", () => {
    const full = [140, 100, 100, 100, 100, 100, 100]; // sette repo: 5 intere e 2 chip = 140 + 400 + 60 + 28 + 26
    expect(plan({ full, avail: 654 }).modes).toEqual(["full", "full", "full", "full", "full", "chip", "chip"]);
  });
  it("la repo attiva fra le compresse resta intera al suo posto: cede l'ultima intera a sinistra", () => {
    // attiva la quarta, da 140 px
    const full = [100, 100, 100, 140, 100];
    expect(plan({ full, active: 3, avail: 520 }).modes).toEqual(["full", "full", "full", "full", "chip"]);
    expect(plan({ full, active: 3, avail: 480 }).modes).toEqual(["full", "full", "chip", "full", "chip"]);
    expect(plan({ full, active: 3, avail: 380 }).modes).toEqual(["full", "chip", "chip", "full", "chip"]);
  });
  it("l'attiva fra le compresse conta fra le tre intere: cede la terza", () => {
    // attiva la quinta di sette (140 px): le prime due intere, lei intera al suo posto, le altre chip o «+N»
    const full = [100, 100, 100, 100, 140, 100, 100];
    expect(plan({ full, active: 4, avail: 420 })).toEqual({
      modes: ["full", "full", "chip", "hidden", "full", "hidden", "hidden"],
      hidden: 3,
      activeWidth: null,
    }); // 100 + 100 + 30 + 140 + 16 + 34 = 420
  });
  it("senza repo attiva nella lista vale la stessa regola: prima i nomi, poi le chip", () => {
    expect(plan({ active: -1, avail: 200 })).toEqual({ modes: ["full", "hidden", "hidden", "hidden", "hidden"], hidden: 4, activeWidth: null }); // 178
  });
  it("con una sola intera, le ultime chip finiscono nel «+N» (mai l'attiva)", () => {
    // attiva + 4 chip = 306; due chip in meno col «+N»: 140 + 60 + 12 + 34 = 246
    expect(plan({ avail: 250 })).toEqual({ modes: ["full", "chip", "chip", "hidden", "hidden"], hidden: 2, activeWidth: null });
    expect(plan({ active: 4, full: [100, 100, 100, 100, 140], avail: 250 })).toEqual({
      modes: ["chip", "chip", "hidden", "hidden", "full"],
      hidden: 2,
      activeWidth: null,
    });
  });
  it("in una barra minuscola resta solo l'attiva, accorciata", () => {
    expect(plan({ avail: 120 })).toEqual({ modes: ["full", "hidden", "hidden", "hidden", "hidden"], hidden: 4, activeWidth: 82 });
    expect(plan({ full: [140], avail: 100 })).toEqual({ modes: ["full"], hidden: 0, activeWidth: 70 });
  });
  it("lista vuota", () => {
    expect(plan({ full: [], active: -1 })).toEqual({ modes: [], hidden: 0, activeWidth: null });
  });
});

describe("initials (lettere della chip)", () => {
  it("prime lettere delle prime due parole", () => {
    expect(initials("api-gateway")).toBe("AG");
    expect(initials("data_pipeline_v2")).toBe("DP");
    expect(initials("docs.site")).toBe("DS");
    expect(initials("My Project")).toBe("MP");
    expect(initials("MyProject")).toBe("MP");
  });
  it("una parola sola: le prime due lettere", () => {
    expect(initials("orbit")).toBe("OR");
    expect(initials("x")).toBe("X");
    expect(initials(".config")).toBe("CO");
  });
});

describe("colorIndex (colore automatico della repo)", () => {
  it("stabile e dentro la tavolozza", () => {
    const k = "d:/progetti/custom/orbit";
    expect(colorIndex(k, 10)).toBe(colorIndex(k, 10));
    for (const key of ["a", "b", "orbit", "d:/x/y", ""]) {
      const i = colorIndex(key, 10);
      expect(i).toBeGreaterThanOrEqual(0);
      expect(i).toBeLessThan(10);
    }
  });
  it("chiavi diverse si distribuiscono sulla tavolozza", () => {
    const used = new Set(Array.from({ length: 40 }, (_, i) => colorIndex(`d:/repo/${i}`, 10)));
    expect(used.size).toBeGreaterThan(5);
  });
});
