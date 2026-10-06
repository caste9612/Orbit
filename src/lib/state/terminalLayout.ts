// Chat affiancate (M54): logica PURA dei riquadri del pannello terminale — quali terminali sono
// visibili insieme e come si dispongono. Niente runes né DOM, così è testabile con vitest
// (terminalLayout.test.ts); lo stato reattivo vive in terminals.svelte.ts.

/** Massimo di riquadri affiancati: oltre, ogni chat diventa troppo stretta per la TUI di Claude. */
export const MAX_PANES = 4;

export type SplitMode = "auto" | "columns" | "rows";

export interface Cell {
  col: number; // 1-based, come grid-column
  row: number;
  colSpan: number;
  rowSpan: number;
}

export interface Grid {
  cols: number;
  rows: number;
  cells: Cell[]; // una per riquadro, nello stesso ordine
}

const cell = (col: number, row: number, colSpan = 1, rowSpan = 1): Cell => ({ col, row, colSpan, rowSpan });

/**
 * Disposizione di `n` riquadri in uno spazio `width`×`height` (px).
 * `auto`: tra le disposizioni possibili (affiancati, griglia — con 3 riquadri il primo alto a
 * sinistra e due impilati a destra, con 4 la 2×2 — e impilati) sceglie quella in cui il riquadro più
 * sacrificato resta più vicino a una dimensione utile: `minW` di larghezza (la TUI di Claude vuole
 * ~60–70 colonne) e `minH` di altezza (~12 righe: prompt, risposta, box d'input e status line).
 * A parità vince l'ordine affiancati → griglia → impilati.
 * `columns` / `rows` forzano una sola riga o una sola colonna.
 */
export function gridFor(n: number, width: number, height: number, mode: SplitMode = "auto", minW = 480, minH = 260): Grid {
  if (n <= 1) return { cols: 1, rows: 1, cells: [cell(1, 1)] };
  const columns: Grid = { cols: n, rows: 1, cells: Array.from({ length: n }, (_, i) => cell(i + 1, 1)) };
  const rows: Grid = { cols: 1, rows: n, cells: Array.from({ length: n }, (_, i) => cell(1, i + 1)) };
  if (mode === "columns") return columns;
  if (mode === "rows") return rows;
  // [disposizione, larghezza e altezza del riquadro più piccolo]
  const candidates: [Grid, number, number][] = [[columns, width / n, height]];
  if (n === 3) {
    candidates.push([{ cols: 2, rows: 2, cells: [cell(1, 1, 1, 2), cell(2, 1), cell(2, 2)] }, width / 2, height / 2]);
  } else if (n >= 4) {
    const r = Math.ceil(n / 2);
    candidates.push([
      { cols: 2, rows: r, cells: Array.from({ length: n }, (_, i) => cell((i % 2) + 1, Math.floor(i / 2) + 1)) },
      width / 2,
      height / r,
    ]);
  }
  candidates.push([rows, width, height / n]);
  const score = (w: number, h: number) => Math.min(Math.min(w / minW, 1), Math.min(h / minH, 1));
  let best = candidates[0];
  for (const c of candidates) if (score(c[1], c[2]) > score(best[1], best[2]) + 1e-9) best = c;
  return best[0];
}

/**
 * Aggiunge `id` ai riquadri visibili, accanto ad `anchor` (dopo, o prima con `before`). Se non c'è
 * ancora uno split, la base è il terminale attivo (`active`): due riquadri = lui + il nuovo.
 * Ritorna i riquadri invariati se `id` è già visibile o se si è al massimo.
 */
export function addPane(panes: string[], active: string | null, id: string, anchor: string | null = null, before = false): string[] {
  const base = panes.length >= 2 ? panes : active && active !== id ? [active] : [];
  if (base.includes(id) || base.length >= MAX_PANES) return base.length >= 2 ? base : panes;
  const at = anchor ? base.indexOf(anchor) : -1;
  const i = at === -1 ? base.length : before ? at : at + 1;
  return [...base.slice(0, i), id, ...base.slice(i)];
}

/** Sposta un riquadro già visibile accanto ad `anchor` (prima o dopo): drag sul bordo di un altro. */
export function movePane(panes: string[], id: string, anchor: string, before = false): string[] {
  if (id === anchor || !panes.includes(id) || !panes.includes(anchor)) return panes;
  const rest = panes.filter((p) => p !== id);
  const at = rest.indexOf(anchor);
  const i = before ? at : at + 1;
  return [...rest.slice(0, i), id, ...rest.slice(i)];
}

/** Toglie `id` dai riquadri; sotto i due riquadri si torna alla scheda singola (lista vuota). */
export function removePane(panes: string[], id: string): string[] {
  const next = panes.filter((p) => p !== id);
  return next.length >= 2 ? next : [];
}

/**
 * Mette `id` al posto di `target` (la scheda cliccata va nel riquadro attivo). Se `id` è già visibile
 * i due riquadri si scambiano di posto, così nessun terminale compare due volte.
 */
export function replacePane(panes: string[], target: string, id: string): string[] {
  const t = panes.indexOf(target);
  if (t === -1 || target === id) return panes;
  const next = [...panes];
  const s = next.indexOf(id);
  if (s !== -1) next[s] = target;
  next[t] = id;
  return next;
}
