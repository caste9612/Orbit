// Riquadri affiancati: logica PURA della disposizione, delle dimensioni e della geometria. Niente runes
// né DOM, così è testabile con vitest (paneLayout.test.ts). Nata per le chat del pannello terminale
// (M54/M55, stato in terminals.svelte.ts) e usata dalla M72 anche dai gruppi dell'editor diviso (stato in
// workspace.svelte.ts); fino alla M72 si chiamava terminalLayout.ts.
//
// Modello (M55): il layout è una lista di COLONNE, ognuna una lista di riquadri impilati (righe).
//   [["a"], ["b", "c"]]  =  a | b
//                            a | c
// Un rilascio a destra/sinistra di un riquadro crea una colonna, uno sopra/sotto una riga: così la
// direzione del trascinamento È la disposizione (in M54 decideva solo l'ordine, e nel pannello
// stretto due riquadri finivano impilati anche trascinando a destra).

/** Massimo di chat affiancate: oltre, ogni chat diventa troppo stretta per la TUI di Claude. Era 4
 *  fino alla M72: a pannello massimizzato su uno schermo largo, sei chat in 3×2 restano sopra 480×260. */
export const MAX_PANES = 6;

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
 * Ancora assente → in coda come nuova colonna. Oltre il massimo `max` (e `id` nuovo) il layout non cambia.
 */
export function insertPane(layout: Layout, id: string, anchor: string | null, side: Side, max = MAX_PANES): Layout {
  const present = flatten(layout).includes(id);
  if (!present && flatten(layout).length >= max) return layout;
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

/** Griglia di `cols` colonne riempita per righe: con 3 colonne e 6 riquadri, a b c sopra e d e f sotto. */
function grid(ids: string[], cols: number): Layout {
  return Array.from({ length: cols }, (_, c) => ids.filter((_, i) => i % cols === c)).filter((col) => col.length > 0);
}

/**
 * Disposizione automatica di `ids` (nell'ordine dato) in `width`×`height` px: fra affiancati,
 * griglia (3: il primo alto a sinistra e due impilati a destra; 4: 2×2; 5–6: tre colonne di due righe,
 * o due colonne di tre) e impilati sceglie quella in cui il riquadro più sacrificato resta più vicino a
 * `minW`×`minH` (la TUI di Claude vuole ~60–70 colonne e ~12 righe). A parità vince affiancati → griglia
 * → impilati; con 5–6 riquadri la griglia a tre colonne viene prima di tutto (M72): su uno schermo 4K sei
 * colonne da 510 px «ci stanno», ma 3×2 dà a ogni chat il doppio della larghezza.
 */
export function arrangeAuto(ids: string[], width: number, height: number, minW = 480, minH = 260): Layout {
  const n = ids.length;
  if (n === 0) return [];
  if (n === 1) return [[ids[0]]];
  const columns: Layout = ids.map((id) => [id]);
  const rows: Layout = [ids.slice()];
  // [layout, larghezza e altezza del riquadro più piccolo]
  const candidates: [Layout, number, number][] = [];
  if (n >= 5) candidates.push([grid(ids, 3), width / 3, height / Math.ceil(n / 3)]);
  candidates.push([columns, width / n, height]);
  if (n === 3) candidates.push([[[ids[0]], [ids[1], ids[2]]], width / 2, height / 2]);
  else if (n >= 4) candidates.push([grid(ids, 2), width / 2, height / Math.ceil(n / 2)]);
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

// ---- dimensioni e geometria (M72: condivise da pannello terminale ed editor diviso) ----

/** Dimensioni dei riquadri, valide per una forma: frazioni delle colonne e, per colonna, delle righe. */
export interface PaneSizes {
  shape: string; // "1,2" = una colonna da 1 riga e una da 2
  cols: number[]; // frazioni di larghezza delle colonne (somma 1)
  rows: number[][]; // per colonna, frazioni di altezza delle righe (somma 1)
}
export const shapeOf = (layout: Layout) => layout.map((c) => c.length).join(",");

/** Le dimensioni salvate se valgono per la forma di `layout`, altrimenti equidistribuite. */
export function sizesFor(layout: Layout, saved: PaneSizes | null | undefined): PaneSizes {
  const shape = shapeOf(layout);
  if (saved && saved.shape === shape) return saved;
  return {
    shape,
    cols: layout.map(() => 1 / Math.max(1, layout.length)),
    rows: layout.map((c) => c.map(() => 1 / Math.max(1, c.length))),
  };
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}
export interface PaneGeometry {
  rects: Record<string, Rect>;
  /** separatori verticali: fra la colonna `c` e la `c + 1`, nel loro intervallo */
  vSplits: { c: number; x: number; y: number; h: number }[];
  /** separatori orizzontali: fra la riga `r` e la `r + 1` della colonna `c` */
  hSplits: { c: number; r: number; x: number; y: number; w: number }[];
}

/**
 * Posizione in px di ogni riquadro in una superficie `width`×`height`, con `gap` px fra i riquadri e dal
 * bordo, e dove stanno i separatori. Posizionamento assoluto e non una griglia CSS: ogni colonna può avere
 * righe di altezze diverse, e i separatori si trascinano.
 */
export function paneGeometry(layout: Layout, sizes: PaneSizes, width: number, height: number, gap: number): PaneGeometry {
  const rects: Record<string, Rect> = {};
  const vSplits: PaneGeometry["vSplits"] = [];
  const hSplits: PaneGeometry["hSplits"] = [];
  const innerW = Math.max(0, width - gap * (layout.length + 1));
  let x = gap;
  layout.forEach((col, c) => {
    const w = (sizes.cols[c] ?? 1 / layout.length) * innerW;
    if (c > 0) vSplits.push({ c: c - 1, x: x - gap, y: gap, h: Math.max(0, height - gap * 2) });
    const fr = sizes.rows[c] ?? [];
    const innerH = Math.max(0, height - gap * (col.length + 1));
    let y = gap;
    col.forEach((id, r) => {
      const h = (fr[r] ?? 1 / col.length) * innerH;
      if (r > 0) hSplits.push({ c, r: r - 1, x, y: y - gap, w });
      rects[id] = { x, y, w, h };
      y += h + gap;
    });
    x += w + gap;
  });
  return { rects, vSplits, hSplits };
}

/**
 * Dimensioni dopo aver trascinato di `delta` px un separatore: fra le colonne `c` e `c + 1` (`col`) o fra
 * le righe `r` e `r + 1` della colonna `c` (`row`). `from` sono le dimensioni a inizio trascinamento, così
 * il conto riparte sempre da lì; nessuno dei due riquadri scende sotto `minPx` (né sotto un decimo).
 */
export function resizePanes(
  from: PaneSizes,
  layout: Layout,
  kind: "col" | "row",
  c: number,
  r: number,
  delta: number,
  width: number,
  height: number,
  gap: number,
  minPx = 140,
): PaneSizes {
  const inner = kind === "col" ? width - gap * (layout.length + 1) : height - gap * ((layout[c]?.length ?? 1) + 1);
  const arr = kind === "col" ? from.cols : (from.rows[c] ?? [1]);
  const i = kind === "col" ? c : r;
  const df = delta / Math.max(1, inner);
  const min = Math.max(0.1, minPx / Math.max(1, inner));
  let a = arr[i] + df;
  let b = arr[i + 1] - df;
  if (a < min) {
    b -= min - a;
    a = min;
  }
  if (b < min) {
    a -= min - b;
    b = min;
  }
  const next: PaneSizes = { shape: from.shape, cols: [...from.cols], rows: from.rows.map((row) => [...row]) };
  if (kind === "col") {
    next.cols[c] = a;
    next.cols[c + 1] = b;
  } else {
    next.rows[c][r] = a;
    next.rows[c][r + 1] = b;
  }
  return next;
}

/**
 * `layout` allineato all'elenco `ids`: via i riquadri che non esistono più, i doppioni e le colonne rimaste
 * vuote; in coda, una colonna ciascuno, quelli che mancano. Tiene coerente la disposizione dei gruppi
 * dell'editor con i gruppi veri (M72), anche quando arriva da una sessione salvata.
 */
export function reconcile(layout: Layout, ids: string[]): Layout {
  const want = new Set(ids);
  const seen = new Set<string>();
  const next: Layout = [];
  for (const col of layout) {
    const keep = col.filter((id) => want.has(id) && !seen.has(id) && !!seen.add(id));
    if (keep.length) next.push(keep);
  }
  for (const id of ids) if (!seen.has(id)) next.push([id]);
  return next;
}

/** Dimensioni lette da un file (sessione): valide solo se hanno la forma di `layout` e frazioni positive. */
export function validSizes(x: unknown, layout: Layout): PaneSizes | null {
  const ok = (a: unknown, n: number): a is number[] =>
    Array.isArray(a) && a.length === n && a.every((v) => typeof v === "number" && Number.isFinite(v) && v > 0);
  const s = x as PaneSizes | null;
  if (!s || typeof s !== "object" || s.shape !== shapeOf(layout)) return null;
  if (!ok(s.cols, layout.length) || !Array.isArray(s.rows) || s.rows.length !== layout.length) return null;
  if (!layout.every((col, c) => ok(s.rows[c], col.length))) return null;
  return { shape: s.shape, cols: [...s.cols], rows: s.rows.map((r) => [...r]) };
}
