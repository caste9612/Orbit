// Colore delle repo (M69): sull'icona delle schede intere della barra in alto e sul fondo delle chip delle
// repo compresse. Automatico dalla tavolozza delle schede terminale (la stessa delle chat in Attività),
// scelto da un hash del percorso: la stessa repo ha lo stesso colore in ogni finestra e a ogni avvio. Si
// cambia dal menu della scheda; le scelte stanno in localStorage, perché sono una preferenza dell'app che
// vale per tutte le finestre (che si allineano con l'evento `storage`).
import { TAB_COLORS } from "./terminals.svelte";
import { colorIndex } from "./repoStrip";
import { pathKey } from "../util";

const STORE = "orbit.repoColors";

function load(): Record<string, string> {
  try {
    const v = JSON.parse(localStorage.getItem(STORE) ?? "{}");
    return v && typeof v === "object" && !Array.isArray(v) ? v : {};
  } catch {
    return {};
  }
}

export const repoColors = $state({ custom: load() });

// un colore scelto in un'altra finestra arriva anche qui
window.addEventListener("storage", (e) => {
  if (e.key === STORE) repoColors.custom = load();
});

/** Colore automatico della repo (stabile). */
export function autoRepoColor(path: string): string {
  return TAB_COLORS[colorIndex(pathKey(path), TAB_COLORS.length)].color;
}

/** Il colore è stato scelto a mano? */
export function hasCustomColor(path: string): boolean {
  const c = repoColors.custom[pathKey(path)];
  return typeof c === "string" && c !== "";
}

/** Colore della repo: quello scelto, altrimenti l'automatico. */
export function repoColor(path: string): string {
  return hasCustomColor(path) ? repoColors.custom[pathKey(path)] : autoRepoColor(path);
}

/** Sceglie il colore della repo (null = torna all'automatico). */
export function setRepoColor(path: string, color: string | null) {
  const next = { ...repoColors.custom };
  if (color) next[pathKey(path)] = color;
  else delete next[pathKey(path)];
  repoColors.custom = next;
  try {
    localStorage.setItem(STORE, JSON.stringify(next));
  } catch {
    /* storage non disponibile: il colore vale fino alla chiusura */
  }
}
