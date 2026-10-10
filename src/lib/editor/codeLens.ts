// CodeLens (M60): sopra ogni dichiarazione una riga sottile — "12 references · 2 implementations" —
// come in Visual Studio. I dati (per nome, dall'indice del progetto) li calcola codeIndex.lensesFor e
// arrivano con l'effetto `setLenses`; qui solo i widget a blocco, che seguono il testo mentre si scrive.
import { StateEffect, StateField, RangeSetBuilder } from "@codemirror/state";
import { Decoration, EditorView, WidgetType, type DecorationSet } from "@codemirror/view";

export interface LensEntry {
  label: string;
  title: string;
  onClick: () => void;
}
export interface Lens {
  line: number; // 1-based, riga della dichiarazione
  items: LensEntry[];
}

export const setLenses = StateEffect.define<Lens[]>();

class LensWidget extends WidgetType {
  constructor(
    readonly items: LensEntry[],
    readonly indent: number, // colonne di rientro della dichiarazione (tab = tabSize)
  ) {
    super();
  }
  eq(o: LensWidget) {
    return (
      o.indent === this.indent &&
      o.items.length === this.items.length &&
      o.items.every((it, i) => it.label === this.items[i].label && it.title === this.items[i].title)
    );
  }
  toDOM(view: EditorView) {
    const el = document.createElement("div");
    el.className = "cm-lens";
    // allineata al primo carattere della dichiarazione: il rientro interno delle righe di CodeMirror (il
    // widget non è una .cm-line) più le colonne di rientro, con la larghezza dei caratteri del codice
    const line = view.contentDOM.querySelector(".cm-line");
    const pad = line ? parseFloat(getComputedStyle(line).paddingLeft) || 0 : 6;
    el.style.paddingLeft = `${Math.round(pad + this.indent * view.defaultCharacterWidth)}px`;
    this.items.forEach((it, i) => {
      if (i) {
        const sep = document.createElement("span");
        sep.className = "cm-lens-sep";
        sep.textContent = "·";
        el.append(sep);
      }
      const a = document.createElement("span");
      a.className = "cm-lens-item";
      a.textContent = it.label;
      a.title = it.title;
      // mousedown bloccato: l'editor non sposta il cursore né prende il fuoco. L'azione parte al click, a
      // sequenza del mouse finita: aperta durante il mousedown, la palette perdeva il fuoco a favore
      // dell'editor (e un Invio sarebbe finito nel codice)
      a.addEventListener("mousedown", (e) => {
        e.preventDefault();
        e.stopPropagation();
      });
      a.addEventListener("click", (e) => {
        if (e.button !== 0) return;
        e.preventDefault();
        e.stopPropagation();
        it.onClick();
      });
      el.append(a);
    });
    return el;
  }
  ignoreEvent() {
    return true;
  }
}

function indentCols(text: string, tabSize: number): number {
  let n = 0;
  for (const ch of text) {
    if (ch === " ") n++;
    else if (ch === "\t") n += tabSize - (n % tabSize);
    else break;
  }
  return n;
}

const lensField = StateField.define<DecorationSet>({
  create: () => Decoration.none,
  update(deco, tr) {
    deco = deco.map(tr.changes); // le lenti seguono le righe mentre si scrive
    for (const e of tr.effects) {
      if (!e.is(setLenses)) continue;
      const b = new RangeSetBuilder<Decoration>();
      for (const l of [...e.value].sort((x, y) => x.line - y.line)) {
        if (l.line < 1 || l.line > tr.state.doc.lines || !l.items.length) continue;
        const line = tr.state.doc.line(l.line);
        const widget = new LensWidget(l.items, indentCols(line.text, tr.state.tabSize));
        b.add(line.from, line.from, Decoration.widget({ widget, block: true, side: -1 }));
      }
      deco = b.finish();
    }
    return deco;
  },
  provide: (f) => EditorView.decorations.from(f),
});

export function codeLens() {
  return lensField;
}
