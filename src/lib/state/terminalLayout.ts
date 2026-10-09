// Chat affiancate (M54/M55): logica PURA dei riquadri del pannello terminale. Niente runes né DOM,
// così è testabile con vitest (terminalLayout.test.ts); lo stato reattivo vive in terminals.svelte.ts.
//
// Modello (M55): il layout è una lista di COLONNE, ognuna una lista di riquadri impilati (righe).
//   [["a"], ["b", "c"]]  =  a | b
//                            a | c
// Un rilascio a destra/sinistra di un riquadro crea una colonna, uno sopra/sotto una riga: così la
// direzione del trascinamento È la disposizione (in M54 decideva solo l'ordine, e nel pannello
// stretto due riquadri finivano impilati anche trascinando a destra).

/** Massimo di riquadri affiancati: oltre, ogni chat diventa troppo stretta per la TUI di Claude. */
export const MAX_PANES = 4;

export type Layout = string[][];
export type Side = "left" | "right" | "top" | "bottom";
/** Disposizioni "pronte" del menu: automatica (si adatta allo spazio), tutti affiancati, tutti impilati. */
export type Arrangement = "auto" | "columns" | "rows";

export const flatten = (layout: Layout): string[] => layout.flat();
const clean = (layout: Layout): Layout => layout.filter((c) => c.length > 0);

/** Posizione (colonna, riga) di un riquadro, o null. */
export function locate(layout: Layout, id: string): { c: number; r: number } | null {
  for (let c = 0; c < layout.length; c++) {
    const r = layout[c].indexOf(id);
    if (r !== -1) return { c, r };
  }
  return null;
}

/**
 * Inserisce (o SPOSTA, se già presente) `id` accanto ad `anchor` dal lato `side`: left/right = nuova
 * colonna prima/dopo quella dell'ancora, top/bottom = riga prima/dopo l'ancora nella sua colonna.
 * Ancora assente → in coda come nuova colonna. Oltre il massimo (e `id` nuovo) il layout non cambia.
 */
export function insertPane(layout: Layout, id: string, anchor: string | null, side: Side): Layout {
  const present = flatten(layout).includes(id);
  if (!present && flatten(layout).length >= MAX_PANES) return layout;
  if (anchor === id) return layout;
  const base = clean(layout.map((c) => c.filter((p) => p !== id)));
  const at = anchor ? locate(base, anchor) : null;
  if (!at) return [...base, [id]];
  const next = base.map((c) => [...c]);
  if (side === "left" || side === "right") {
    next.splice(side === "left" ? at.c : at.c + 1, 0, [id]);
  } else {
    next[at.c].splice(side === "top" ? at.r : at.r + 1, 0, id);
  }
  return next;
}

/** Dove cade il rilascio di una scheda trascinata su un riquadro. */
export type Zone = "center" | Side;

/**
 * Zona di rilascio dalle coordinate relative al riquadro (0..1): il bordo più vicino se entro `edge`
 * (split da quel lato), altrimenti il centro (scambio). M57: `edge` passa da 1/4 a 1/3 — il segno di
 * rilascio di un bordo copre METÀ riquadro, e rilasciando "verso destra" al 65-70% ci si aspetta lo
 * split, non lo scambio.
 */
export function dropZone(fx: number, fy: number, edge = 1 / 3): Zone {
  const near: [Side, number][] = [
    ["left", fx],
    ["right", 1 - fx],
    ["top", fy],
    ["bottom", 1 - fy],
  ];
  near.sort((a, b) => a[1] - b[1]);
  return near[0][1] < edge ? near[0][0] : "center";
}

/**
 * "Split di sé": trascinando la chat GIÀ visibile (nessuno split in corso) sul bordo del suo stesso
 * riquadro, dall'altra parte va la scheda usata più di recente fra `candidates` (le altre schede della
 * repo), o la prima disponibile. Prima il rilascio mostrava il segno ma non faceva nulla. null = nessuna.
 */
export function splitPartner(id: string, recent: string[], candidates: string[]): string | null {
  return recent.find((x) => x !== id && candidates.includes(x)) ?? candidates.find((x) => x !== id) ?? null;
}

/** Toglie `id`; colonne vuote spariscono. Sotto i due riquadri → [] (scheda singola). */
export function removePane(layout: Layout, id: string): Layout {
  const next = clean(layout.map((c) => c.filter((p) => p !== id)));
  return flatten(next).length >= 2 ? next : [];
}

/** Mette `id` al posto di `target`; se `id` è già visibile i due si scambiano (nessun doppione). */
export function replacePane(layout: Layout, target: string, id: string): Layout {
  const t = locate(layout, target);
  if (!t || target === id) return layout;
  const next = layout.map((c) => [...c]);
  const s = locate(next, id);
  if (s) next[s.c][s.r] = target;
  next[t.c][t.r] = id;
  return next;
}

/**
 * Disposizione automatica di `ids` (nell'ordine dato) in `width`×`height` px: fra affiancati,
 * griglia (3: il primo alto a sinistra e due impilati a destra; 4: 2×2) e impilati sceglie quella in
 * cui il riquadro più sacrificato resta più vicino a `minW`×`minH` (la TUI di Claude vuole ~60–70
 * colonne e ~12 righe). A parità vince affiancati → griglia → impilati.
 */
export function arrangeAuto(ids: string[], width: number, height: number, minW = 480, minH = 260): Layout {
  const n = ids.length;
  if (n === 0) return [];
  if (n === 1) return [[ids[0]]];
  const columns: Layout = ids.map((id) => [id]);
  const rows: Layout = [ids.slice()];
  // [layout, larghezza e altezza del riquadro più piccolo]
  const candidates: [Layout, number, number][] = [[columns, width / n, height]];
  if (n === 3) candidates.push([[[ids[0]], [ids[1], ids[2]]], width / 2, height / 2]);
  else if (n >= 4) {
    const r = Math.ceil(n / 2);
    const left = ids.filter((_, i) => i % 2 === 0);
    const right = ids.filter((_, i) => i % 2 === 1);
    candidates.push([[left, right], width / 2, height / r]);
  }
  candidates.push([rows, width, height / n]);
  const score = (w: number, h: number) => Math.min(Math.min(w / minW, 1), Math.min(h / minH, 1));
  let best = candidates[0];
  for (const c of candidates) if (score(c[1], c[2]) > score(best[1], best[2]) + 1e-9) best = c;
  return best[0];
}

/** Disposizione del menu: `columns` = tutti affiancati, `rows` = tutti impilati, `auto` = arrangeAuto. */
export function arrange(ids: string[], mode: Arrangement, width: number, height: number): Layout {
  if (mode === "columns") return ids.map((id) => [id]);
  if (mode === "rows") return ids.length ? [ids.slice()] : [];
  return arrangeAuto(ids, width, height);
}

/**
 * "Affianca" senza una direzione esplicita (menu Split, "Open Claude to the side"): nuova colonna
 * dopo quella del riquadro attivo se c'è spazio per una colonna in più (≥ `minW` ciascuna),
 * altrimenti nuova riga sotto l'attivo. Senza split in corso la base è il solo riquadro attivo.
 */
export function placeBeside(layout: Layout, id: string, active: string | null, width: number, minW = 480): Layout {
  const base: Layout = flatten(layout).length >= 2 ? layout : active && active !== id ? [[active]] : [];
  if (flatten(base).includes(id)) return base;
  if (base.length === 0) return [[id]];
  const anchor = active && locate(base, active) ? active : flatten(base)[flatten(base).length - 1];
  const side: Side = width / (base.length + 1) >= minW ? "right" : "bottom";
  return insertPane(base, id, anchor, side);
}
