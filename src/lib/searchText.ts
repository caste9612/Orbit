// Ricerca nelle Impostazioni (M64): ogni parola della query deve comparire, in qualsiasi ordine, nel
// testo di una voce (nome, descrizione, parole chiave, categoria). I pezzi trovati si evidenziano;
// il `codice` fra backtick resta codice anche quando contiene una parola cercata.

/** Parole della query in minuscolo (nessuna = non si sta cercando). */
export function queryTerms(query: string): string[] {
  return query.trim().toLowerCase().split(/\s+/).filter(Boolean);
}

/** True se ogni parola compare nel testo, senza distinguere maiuscole e minuscole. */
export function matchesAll(text: string, terms: string[]): boolean {
  const t = text.toLowerCase();
  return terms.every((w) => t.includes(w));
}

export interface Segment {
  text: string;
  code: boolean; // fra backtick nel testo originale
  hit: boolean; // contiene (tutto) un pezzo cercato
}

/** Spezza un testo con `codice` in pezzi consecutivi, segnando quelli trovati dalla ricerca. */
export function segments(text: string, terms: string[]): Segment[] {
  const out: Segment[] = [];
  text.split("`").forEach((part, i) => {
    if (!part) return;
    const code = i % 2 === 1;
    const lower = part.toLowerCase();
    // con caratteri che cambiano lunghezza in minuscolo gli indici non tornerebbero: niente evidenza
    const ranges: [number, number][] = [];
    if (lower.length === part.length) {
      for (const w of terms) {
        for (let at = lower.indexOf(w); at !== -1; at = lower.indexOf(w, at + w.length)) ranges.push([at, at + w.length]);
      }
    }
    ranges.sort((a, b) => a[0] - b[0]);
    // pezzi che si toccano o si sovrappongono diventano uno solo
    const merged: [number, number][] = [];
    for (const [a, b] of ranges) {
      const last = merged[merged.length - 1];
      if (last && a <= last[1]) last[1] = Math.max(last[1], b);
      else merged.push([a, b]);
    }
    let pos = 0;
    for (const [a, b] of merged) {
      if (a > pos) out.push({ text: part.slice(pos, a), code, hit: false });
      out.push({ text: part.slice(a, b), code, hit: true });
      pos = b;
    }
    if (pos < part.length) out.push({ text: part.slice(pos), code, hit: false });
  });
  return out;
}
