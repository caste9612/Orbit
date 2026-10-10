// Fuoco a un elemento appena montato (M60). L'attributo `autofocus` di Svelte 5 lo dà solo se in quel
// momento nessun altro elemento ha il fuoco (document.activeElement === body): con il cursore nell'editor o
// nel terminale le palette (Ctrl+P, Ctrl+T, Ctrl+Shift+O), i dialog e i campi di rinomina restavano senza
// fuoco, e quello che si scriveva finiva nel codice. `select`: seleziona il testo (rinomina: si scrive sopra).
export function focusOnMount(node: HTMLElement, opts: { select?: boolean } = {}) {
  node.focus({ preventScroll: true });
  if (opts.select && (node instanceof HTMLInputElement || node instanceof HTMLTextAreaElement)) {
    node.select();
    // il valore legato (bind:value) arriva dopo l'azione e riporta il cursore in fondo: si riseleziona
    // al fotogramma successivo, se il campo ha ancora il fuoco
    requestAnimationFrame(() => {
      if (document.activeElement === node) node.select();
    });
  }
}
