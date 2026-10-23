// Trascinare una cartella o un file dall'albero sullo scaffale (M73): su una categoria ci finisce, sulla
// testata SHELF si apre il picker per sceglierla. Solo verso lo scaffale: per toglierla resta il menu.
// A puntatore, come le schede: con dragDropEnabled l'HTML5 drag & drop non funziona. Le zone di rilascio
// sono gli elementi con `data-shelf-drop` (il nome della categoria, o "*" per la testata).
import { shelvePath } from "./shelf.svelte";

export interface ShelfDragItem {
  abs: string;
  name: string;
  isDir: boolean;
}

export const shelfDrag = $state({
  item: null as ShelfDragItem | null, // in trascinamento, oltre la soglia
  x: 0,
  y: 0,
  over: null as string | null, // zona sotto il puntatore
  pick: null as (ShelfDragItem & { x: number; y: number }) | null, // rilasciata sulla testata: lo scaffale apre il picker
});

let press: (ShelfDragItem & { x: number; y: number }) | null = null;
let dragged = false; // l'ultimo pointerup chiudeva un trascinamento: il click che segue non apre la voce

/** Da chiamare sul pointerdown di una riga dell'albero. */
export function shelfDragDown(e: PointerEvent, item: ShelfDragItem) {
  if (e.button !== 0) return;
  press = { ...item, x: e.clientX, y: e.clientY };
  dragged = false;
  window.addEventListener("pointermove", onMove);
  window.addEventListener("pointerup", onUp);
}

/** Il click su una riga va ignorato perché chiude un trascinamento? (lo consuma) */
export function shelfDragClick(): boolean {
  const was = dragged;
  dragged = false;
  return was;
}

function onMove(e: PointerEvent) {
  if (!press) return;
  if (e.buttons === 0) return onUp(e); // rilascio fuori dalla finestra
  if (!shelfDrag.item) {
    if (Math.hypot(e.clientX - press.x, e.clientY - press.y) < 6) return; // ancora un click
    shelfDrag.item = { abs: press.abs, name: press.name, isDir: press.isDir };
  }
  shelfDrag.x = e.clientX;
  shelfDrag.y = e.clientY;
  const el = document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null;
  shelfDrag.over = (el?.closest("[data-shelf-drop]") as HTMLElement | null)?.dataset.shelfDrop ?? null;
}

function onUp(e: PointerEvent) {
  window.removeEventListener("pointermove", onMove);
  window.removeEventListener("pointerup", onUp);
  const item = shelfDrag.item;
  const over = shelfDrag.over;
  shelfDrag.item = null;
  shelfDrag.over = null;
  press = null;
  if (!item) return;
  dragged = true;
  setTimeout(() => (dragged = false), 0); // il click arriva subito dopo il pointerup, o non arriva
  if (over === "*") shelfDrag.pick = { ...item, x: e.clientX, y: e.clientY };
  else if (over) shelvePath(item.abs, over);
}
