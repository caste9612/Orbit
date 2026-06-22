// Overlay semantico: colora gli identificatori che corrispondono a un TIPO o a una FUNZIONE/METODO
// noti del progetto (dall'indice in codeIndex.svelte.ts) — tipi in teal, funzioni in oro, come VS.
// Serve perché l'highlight di CodeMirror è solo lessicale (per C# è un parser legacy che non
// conosce i tuoi tipi/metodi). Euristico, per nome: niente analisi di scope → rari falsi positivi.
import { ViewPlugin, Decoration, EditorView, type DecorationSet, type ViewUpdate } from "@codemirror/view";
import { RangeSetBuilder } from "@codemirror/state";
import { syntaxTree, language } from "@codemirror/language";
import { semSets, semIndex } from "../state/codeIndex.svelte";

const typeMark = Decoration.mark({ class: "cm-sem-type" });
const funcMark = Decoration.mark({ class: "cm-sem-func" });
const WORD = /[A-Za-z_]\w*/g;

function build(view: EditorView): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>();
  // niente linguaggio (es. testo semplice) → niente overlay: non coloriamo parole a caso in prosa
  if (!view.state.facet(language)) return builder.finish();
  const { typeSet, funcSet } = semSets();
  if (typeSet.size === 0 && funcSet.size === 0) return builder.finish();
  const tree = syntaxTree(view.state);
  for (const { from, to } of view.visibleRanges) {
    const text = view.state.sliceDoc(from, to);
    WORD.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = WORD.exec(text))) {
      const word = m[0];
      const isType = typeSet.has(word);
      const isFunc = !isType && funcSet.has(word);
      if (!isType && !isFunc) continue;
      const start = from + m.index;
      // salta stringhe e commenti: lì un nome uguale a un tipo non va colorato
      const node = tree.resolveInner(start, 1).name.toLowerCase();
      if (node.includes("string") || node.includes("comment")) continue;
      builder.add(start, start + word.length, isType ? typeMark : funcMark);
    }
  }
  return builder.finish();
}

export const semanticHighlight = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;
    version: number;
    constructor(view: EditorView) {
      this.decorations = build(view);
      this.version = semIndex.version;
    }
    update(u: ViewUpdate) {
      // ridisegna su modifica/scroll, e quando l'indice del progetto cambia (nudge dall'editor)
      if (u.docChanged || u.viewportChanged || semIndex.version !== this.version) {
        this.version = semIndex.version;
        this.decorations = build(u.view);
      }
    }
  },
  { decorations: (v) => v.decorations },
);
