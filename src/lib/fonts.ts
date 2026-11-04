// Famiglie monospazio dell'editor e del terminale (M75). Logica pura, testata in fonts.test.ts.
//
// Dopo i font scelti, ogni pila prova i Nerd Font più diffusi: i prompt di fish, starship o oh-my-posh usano
// icone nell'area privata di Unicode che JetBrains Mono (il font incluso in Orbit) non ha, e WebKitGTK non le
// cerca da sé fra i font installati: nel terminale restavano quadratini. Il browser prende dal ripiego solo i
// glifi che mancano al primo font, quindi testo e misure delle celle non cambiano.

/** I Nerd Font più comuni, provati per i glifi che mancano ai font scelti. */
export const NERD_FALLBACK = [
  "Symbols Nerd Font Mono",
  "Symbols Nerd Font",
  "JetBrainsMono Nerd Font Mono",
  "MesloLGS Nerd Font Mono",
  "MesloLGS NF",
  "CaskaydiaCove Nerd Font Mono",
  "FiraCode Nerd Font Mono",
  "Hack Nerd Font Mono",
];

const GENERIC = new Set(["monospace", "ui-monospace", "sans-serif", "serif", "system-ui"]);

/** Un nome di famiglia per CSS: fra virgolette, salvo le famiglie generiche. */
function cssFamily(name: string): string {
  return GENERIC.has(name) ? name : `"${name}"`;
}

/** I nomi scritti dall'utente in "Custom…": separati da virgole, senza virgolette né caratteri che
 *  chiuderebbero la dichiarazione CSS (`;`, graffe, barre inverse). */
export function customFamilies(input: string): string[] {
  return input
    .split(",")
    .map((s) => s.replace(/["';{}\\]/g, "").trim())
    .filter(Boolean);
}

/** La pila completa: i font dati, i Nerd Font di ripiego, poi il monospazio del sistema. Senza doppioni. */
export function monoFontStack(families: string[]): string {
  const seen = new Set<string>();
  const all = [...families, ...NERD_FALLBACK, "ui-monospace", "monospace"].filter((f) => {
    const k = f.toLowerCase();
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  return all.map(cssFamily).join(", ");
}
