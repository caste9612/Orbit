// "Vai al simbolo" (Ctrl+Shift+O): elenco fuzzy dei simboli del file attivo, con salto.
// I simboli vengono estratti su richiesta dall'albero sintattico dell'editor a fuoco.
import { getActiveEditor } from "../editor/activeEditor";
import { extractSymbols, type OutlineSymbol } from "../editor/outline";

export const symbols = $state({
  open: false,
  query: "",
  items: [] as OutlineSymbol[], // tutti i simboli del file
  results: [] as OutlineSymbol[], // sottoinsieme filtrato/ordinato
  index: 0,
  empty: false, // nessun simbolo / nessun editor attivo
});

const CAP = 500;

export function openSymbols() {
  const view = getActiveEditor();
  symbols.query = "";
  symbols.index = 0;
  symbols.items = view ? extractSymbols(view.state) : [];
  symbols.empty = symbols.items.length === 0;
  symbols.open = true;
  filter();
}

export function closeSymbols() {
  symbols.open = false;
}

export function setSymQuery(q: string) {
  symbols.query = q;
  symbols.index = 0;
  filter();
}

export function moveSym(delta: number) {
  const n = symbols.results.length;
  if (!n) return;
  symbols.index = (symbols.index + delta + n) % n;
}

export function chooseSym() {
  const s = symbols.results[symbols.index];
  symbols.open = false;
  if (!s) return;
  const view = getActiveEditor();
  if (!view) return;
  view.dispatch({ selection: { anchor: s.from }, scrollIntoView: true });
  view.focus();
}

/** Match: substring nel nome > sottosequenza; -1 se non corrisponde. */
function score(name: string, q: string): number {
  const i = name.indexOf(q);
  if (i >= 0) return 1000 - i - name.length * 0.1;
  let qi = 0;
  for (let k = 0; k < name.length && qi < q.length; k++) if (name[k] === q[qi]) qi++;
  return qi === q.length ? 200 - name.length * 0.1 : -1;
}

function filter() {
  const q = symbols.query.trim().toLowerCase();
  if (!q) {
    symbols.results = symbols.items.slice(0, CAP);
    return;
  }
  const scored: { s: OutlineSymbol; n: number }[] = [];
  for (const s of symbols.items) {
    const n = score(s.name.toLowerCase(), q);
    if (n >= 0) scored.push({ s, n });
  }
  scored.sort((a, b) => b.n - a.n);
  symbols.results = scored.slice(0, CAP).map((x) => x.s);
}
