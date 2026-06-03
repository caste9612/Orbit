// Guide di indentazione fatte in casa (zero dipendenze): una decorazione di linea con
// un background a righe verticali, ritagliato all'indentazione effettiva della riga.
import { Decoration, ViewPlugin, EditorView } from "@codemirror/view";
import type { DecorationSet, ViewUpdate } from "@codemirror/view";
import { RangeSetBuilder } from "@codemirror/state";
import { getIndentUnit } from "@codemirror/language";

function build(view: EditorView): DecorationSet {
  const b = new RangeSetBuilder<Decoration>();
  const unit = getIndentUnit(view.state) || 2;
  const tabSize = view.state.tabSize;
  const charW = view.defaultCharacterWidth || 7;
  const step = unit * charW;

  for (const { from, to } of view.visibleRanges) {
    let pos = from;
    while (pos <= to) {
      const line = view.state.doc.lineAt(pos);
      const text = line.text;
      let cols = 0;
      for (let i = 0; i < text.length; i++) {
        const ch = text[i];
        if (ch === " ") cols++;
        else if (ch === "\t") cols += tabSize - (cols % tabSize);
        else break;
      }
      const levels = Math.floor(cols / unit);
      if (levels >= 1 && text.trim().length > 0) {
        const widthPx = levels * step;
        const style =
          `background-image:repeating-linear-gradient(to right,` +
          `rgba(255,255,255,0.06) 0,rgba(255,255,255,0.06) 1px,transparent 1px,transparent ${step}px);` +
          `background-repeat:no-repeat;background-size:${widthPx}px 100%;`;
        b.add(line.from, line.from, Decoration.line({ attributes: { style } }));
      }
      pos = line.to + 1;
    }
  }
  return b.finish();
}

export const indentGuides = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;
    constructor(view: EditorView) {
      this.decorations = build(view);
    }
    update(u: ViewUpdate) {
      if (u.docChanged || u.viewportChanged || u.geometryChanged) {
        this.decorations = build(u.view);
      }
    }
  },
  { decorations: (v) => v.decorations },
);
