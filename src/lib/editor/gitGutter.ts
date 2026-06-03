// Marcatori di modifica git nel gutter dell'editor (barre per riga aggiunta/modificata/
// eliminata vs HEAD), stile Visual Studio. I marcatori arrivano via StateEffect (calcolati
// fuori, dal diff) e vengono mantenuti in uno StateField. Zero dipendenze esterne.
import { StateField, StateEffect, RangeSet, RangeSetBuilder } from "@codemirror/state";
import { gutter, GutterMarker } from "@codemirror/view";

export type ChangeType = "add" | "mod" | "del";
export interface LineMark {
  line: number; // 1-based, lato file nuovo
  type: ChangeType;
}

export const setGitMarks = StateEffect.define<LineMark[]>();

class ChangeMarker extends GutterMarker {
  constructor(readonly type: ChangeType) {
    super();
  }
  toDOM() {
    const d = document.createElement("div");
    d.className = `cm-gitmark cm-gitmark-${this.type}`;
    return d;
  }
}

const marksField = StateField.define<RangeSet<GutterMarker>>({
  create: () => RangeSet.empty,
  update(value, tr) {
    value = value.map(tr.changes); // mantieni allineati i marcatori mentre si edita
    for (const e of tr.effects) {
      if (e.is(setGitMarks)) {
        const b = new RangeSetBuilder<GutterMarker>();
        const doc = tr.state.doc;
        for (const m of e.value) {
          if (m.line >= 1 && m.line <= doc.lines) {
            const ln = doc.line(m.line);
            b.add(ln.from, ln.from, new ChangeMarker(m.type));
          }
        }
        value = b.finish();
      }
    }
    return value;
  },
});

export function gitGutter() {
  return [
    marksField,
    gutter({
      class: "cm-gitgutter",
      markers: (view) => view.state.field(marksField),
    }),
  ];
}

/** Converte un diff unificato in marcatori per-riga (lato file nuovo). */
export function parseGitMarks(patch: string): LineMark[] {
  const marks: LineMark[] = [];
  let newLine = 0;
  let runAdd: number[] = [];
  let runDel = 0;

  const flush = () => {
    if (runAdd.length) {
      const type: ChangeType = runDel > 0 ? "mod" : "add";
      for (const l of runAdd) marks.push({ line: l, type });
    } else if (runDel > 0) {
      marks.push({ line: Math.max(1, newLine), type: "del" });
    }
    runAdd = [];
    runDel = 0;
  };

  for (const line of patch.split("\n")) {
    if (line.startsWith("@@")) {
      flush();
      const m = line.match(/^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
      if (m) newLine = parseInt(m[1], 10);
      continue;
    }
    if (
      line.startsWith("+++") || line.startsWith("---") || line.startsWith("diff ") ||
      line.startsWith("index ") || line.startsWith("new file") || line.startsWith("deleted file") ||
      line.startsWith("rename ") || line.startsWith("similarity ") || line.startsWith("old mode") ||
      line.startsWith("new mode")
    ) {
      continue;
    }
    if (line.startsWith("+")) {
      runAdd.push(newLine);
      newLine++;
    } else if (line.startsWith("-")) {
      runDel++;
    } else {
      flush();
      if (line.length) newLine++;
    }
  }
  flush();
  return marks;
}
