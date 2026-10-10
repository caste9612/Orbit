// Logica PURA delle schede dell'editor (niente runes né DOM), testata in editorTabs.test.ts.

/**
 * Scheda attiva dopo aver chiuso `drop` da `tabs` (M58, chiusure multiple): resta quella di prima se
 * sopravvive, altrimenti la prima rimasta alla sua destra, poi alla sua sinistra — la stessa regola della
 * chiusura di una scheda sola. null se non resta nulla.
 */
export function nextActive(tabs: string[], active: string | null, drop: Set<string>): string | null {
  if (!active || !drop.has(active)) return active;
  const i = tabs.indexOf(active);
  return tabs.slice(i + 1).find((p) => !drop.has(p)) ?? tabs.slice(0, Math.max(i, 0)).findLast((p) => !drop.has(p)) ?? null;
}
