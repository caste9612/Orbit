// Piano della striscia delle repo nella top bar (M69). Quando lo spazio non basta, le repo si comprimono
// da DESTRA in chip con le iniziali: quelle a sinistra restano schede intere, così l'ordine (riordinabile
// trascinando, M56) decide quali restano leggibili. Le prime tre restano intere finché ci stanno: prima di
// comprimerne una, le ultime chip finiscono nel menu «+N». La repo attiva resta sempre intera e al suo
// posto: se sta fra le compresse, a cedere il posto è l'ultima intera alla sua sinistra. Ai lati della
// striscia resta sempre uno spazio libero da cui trascinare la finestra. Logica pura (niente DOM né rune),
// testata in repoStrip.test.ts.

export type TabMode = "full" | "chip" | "hidden";

/** Schede intere da tenere, se ci stanno, prima di comprimerne altre: le chip in più vanno nel «+N» (scelta
 *  utente, M69: con molte repo restava intera solo la prima). L'attiva conta fra queste. */
export const KEEP_FULL = 3;

/** Spazio per trascinare la finestra lasciato libero a ciascun lato della striscia (scelta utente, M69). */
export const GRIP = 56;
/** …che in una finestra molto stretta scende fino a questo: lì la striscia ha la precedenza. */
export const MIN_GRIP = 12;
/** Spazio della striscia (una scheda attiva intera, col branch, più il «+N») sotto il quale la presa comincia
 *  a cedere: in una finestra stretta conta di più leggere la repo su cui lavori (collaudo M69: a 1100 px
 *  la presa piena accorciava l'attiva a 103 px, senza il branch). */
export const MIN_STRIP = 200;

/** Presa per lato, data la larghezza dello spazio centrale della barra. */
export function gripFor(space: number): number {
  return Math.max(MIN_GRIP, Math.min(GRIP, Math.floor((space - MIN_STRIP) / 2)));
}

export interface StripInput {
  full: number[]; // larghezza naturale di ogni repo come scheda intera, nell'ordine della lista
  active: number; // indice della repo attiva (-1 = nessuna)
  avail: number; // spazio per la striscia, bottone finale compreso
  chip: number; // larghezza di una chip
  gap: number; // spazio fra due elementi
  add: number; // bottone «+» in fondo, quando nessuna repo è nascosta
  more: number; // chip «+N» in fondo, quando qualcuna è nascosta
}

export interface StripPlan {
  modes: TabMode[];
  hidden: number; // repo nel menu «+N»
  activeWidth: number | null; // larghezza imposta alla scheda attiva quando nemmeno lei ci sta; null = naturale
}

/** Larghezza occupata: gli elementi visibili, uno spazio dopo ciascuno e il bottone finale. */
function widthOf(modes: TabMode[], inp: StripInput, end: number): number {
  let w = end;
  modes.forEach((m, i) => {
    if (m !== "hidden") w += (m === "full" ? inp.full[i] : inp.chip) + inp.gap;
  });
  return w;
}

/** Quali repo restano intere, quali diventano chip e quante finiscono nel menu «+N». */
export function planStrip(inp: StripInput): StripPlan {
  const n = inp.full.length;
  const a = inp.active >= 0 && inp.active < n ? inp.active : -1;
  // 1. tutte intere
  let modes: TabMode[] = inp.full.map(() => "full");
  if (n === 0 || widthOf(modes, inp, inp.add) <= inp.avail) return { modes, hidden: 0, activeWidth: null };
  // 2. le prime k intere e le altre chip, con k che scende da destra; l'attiva resta intera dov'è
  const keep = Math.min(KEEP_FULL, n);
  for (let k = n - 1; k >= 0; k--) {
    const full = (i: number) => i < k || i === a;
    modes = inp.full.map((_, i) => (full(i) ? "full" : "chip"));
    if (widthOf(modes, inp, inp.add) <= inp.avail) return { modes, hidden: 0, activeWidth: null };
    // 3. arrivati a `keep` intere (o meno), prima di comprimerne un'altra le ultime chip vanno nel «+N»
    if (k + (a >= k ? 1 : 0) > keep) continue;
    const chips = [...Array(n).keys()].reverse().filter((i) => !full(i));
    for (let h = 1; h <= chips.length; h++) {
      const hide = new Set(chips.slice(0, h));
      const m: TabMode[] = inp.full.map((_, i) => (hide.has(i) ? "hidden" : full(i) ? "full" : "chip"));
      if (widthOf(m, inp, inp.more) <= inp.avail) return { modes: m, hidden: h, activeWidth: null };
    }
  }
  // 4. resta solo la repo attiva, e nemmeno lei ci sta intera: si accorcia, con l'ellissi
  const hidden = a >= 0 ? n - 1 : n;
  const end = hidden ? inp.more : inp.add;
  const activeWidth = a >= 0 ? Math.max(inp.chip, Math.floor(inp.avail - end - inp.gap)) : null;
  return { modes: inp.full.map((_, i) => (i === a ? "full" : "hidden")), hidden, activeWidth };
}

/** Iniziali della chip: le prime lettere delle prime due parole del nome (separate da - _ . o spazio, o da
 *  una maiuscola interna come in `MyProject`), altrimenti le prime due lettere. */
export function initials(name: string): string {
  const words = name
    .replace(/(\p{Ll})(\p{Lu})/gu, "$1 $2")
    .split(/[-_.\s]+/)
    .filter(Boolean);
  const first = (w: string | undefined) => Array.from(w ?? "")[0] ?? "";
  const s = words.length > 1 ? first(words[0]) + first(words[1]) : Array.from(words[0] ?? name).slice(0, 2).join("");
  return s.toUpperCase();
}

/** Posizione stabile nella tavolozza per una chiave (hash FNV-1a): la stessa repo ha lo stesso colore in
 *  ogni finestra e a ogni avvio. */
export function colorIndex(key: string, n: number): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < key.length; i++) {
    h ^= key.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0) % n;
}
