// Transizione dei pannelli della shell che entrano/escono di lato (M57): barra laterale, pannello
// terminale, le strisce compresse e i divisori. Come `slide` di Svelte sull'asse x, con due differenze
// che rendono il movimento continuo dall'inizio alla fine:
//  - i bordi laterali vanno a 0 per tutta la durata (lo spazio che occupano passa nella larghezza):
//    Chromium arrotonda i bordi sotto 1 px a 1 px pieno, quindi con `slide` restavano 2 px fino
//    all'ultimo frame e sparivano di colpo (l'editor saltava di 2 px, più il divisore);
//  - `flex-grow: 0` e `flex-basis: auto`: un pannello che "riempie" (terminale con l'editor
//    collassato) o con una base fissa (le strisce) ignorerebbe la larghezza animata.
// La durata la decide il chiamante (motionMs(), 0 all'avvio), come per gli altri movimenti.
import { cubicOut } from "svelte/easing";

export function panelSlide(node: Element, { duration = 0 }: { duration?: number } = {}) {
  const style = getComputedStyle(node);
  const width = parseFloat(style.width); // border-box: bordi inclusi
  const pl = parseFloat(style.paddingLeft);
  const pr = parseFloat(style.paddingRight);
  const ml = parseFloat(style.marginLeft);
  const mr = parseFloat(style.marginRight);
  const opacity = +style.opacity;
  return {
    duration,
    easing: cubicOut,
    css: (t: number) =>
      "overflow: hidden; min-width: 0; flex-grow: 0; flex-basis: auto;" +
      "border-left-width: 0; border-right-width: 0;" +
      `width: ${t * width}px;` +
      `padding-left: ${t * pl}px; padding-right: ${t * pr}px;` +
      `margin-left: ${t * ml}px; margin-right: ${t * mr}px;` +
      `opacity: ${Math.min(t * 20, 1) * opacity};`,
  };
}
