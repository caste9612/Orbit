// Cursore dell'editor (M63): forma, scivolata, lampeggio, scia e alone secondo lo stile scelto nelle
// Impostazioni (caretStyles.ts). Il lampeggio di CodeMirror — a scatti, su tutto lo strato dei cursori —
// si spegne: lo gestiamo noi sul cursore, così può sfumare o allungarsi, si ferma mentre scrivi (riparte
// dopo mezzo secondo) e smette dopo 15 s di inattività, per non tenere un'animazione accesa all'infinito.
import { EditorView, ViewPlugin, type ViewUpdate } from "@codemirror/view";
import { Facet, type Extension } from "@codemirror/state";
import { BLINK_DELAY_MS, BLINK_STOP_MS, DEFAULT_EDITOR_CARET, type EditorCaret } from "../caretStyles";
import { TrailCanvas, type CaretRect } from "../caretTrail";

const caretConf = Facet.define<EditorCaret, EditorCaret>({
  combine: (values) => values[values.length - 1] ?? DEFAULT_EDITOR_CARET,
});

const LINE_W: Record<string, number> = { thin: 1, line: 2, thick: 3 };

class CaretView {
  private timers: ReturnType<typeof setTimeout>[] = [];
  private trail: TrailCanvas | null = null;
  private last: CaretRect | null = null;
  private lastAt = 0;
  private snapFrame = 0;

  constructor(private view: EditorView) {
    this.apply();
    this.restartBlink();
  }

  private get conf(): EditorCaret {
    return this.view.state.facet(caretConf);
  }

  /** Attributi letti dal CSS (forma, alone, stile del lampeggio) e larghezza di un carattere. */
  private apply() {
    const c = this.conf;
    const d = this.view.dom.dataset;
    d.caretShape = c.shape;
    d.caretGlow = c.glow;
    d.caretBlink = c.blink;
    this.setCharWidth();
    if (c.trail === "none") {
      this.trail?.dispose();
      this.trail = null;
    }
  }

  private setCharWidth() {
    this.view.dom.style.setProperty("--caret-cw", this.view.defaultCharacterWidth + "px");
  }

  update(u: ViewUpdate) {
    const confChanged = u.startState.facet(caretConf) !== u.state.facet(caretConf);
    if (confChanged) this.apply();
    else if (u.geometryChanged) this.setCharWidth();
    if (u.selectionSet || u.docChanged || u.focusChanged || confChanged) {
      // "solo nei salti": mentre scrivi il cursore segue i tasti senza scivolare
      if (u.docChanged && this.conf.glide === "jumps") this.snapOnce();
      this.restartBlink();
      if (u.selectionSet || u.docChanged) this.measure();
    }
  }

  private snapOnce() {
    const dom = this.view.dom;
    dom.dataset.caretSnap = "";
    cancelAnimationFrame(this.snapFrame);
    // due fotogrammi: lo strato dei cursori si riposiziona nella misura successiva a questo update
    this.snapFrame = requestAnimationFrame(() => (this.snapFrame = requestAnimationFrame(() => delete dom.dataset.caretSnap)));
  }

  /** Fermo mentre si muove; lampeggia (o respira) da mezzo secondo dopo l'ultimo movimento fino a 15 s. */
  private restartBlink() {
    this.timers.forEach(clearTimeout);
    this.timers = [];
    const d = this.view.dom.dataset;
    delete d.caretOn;
    const c = this.conf;
    if (c.blink === "none" && c.glow !== "breathe") return;
    this.timers.push(setTimeout(() => (d.caretOn = ""), BLINK_DELAY_MS));
    this.timers.push(setTimeout(() => delete d.caretOn, BLINK_STOP_MS));
  }

  /** Posizione del cursore principale dopo l'aggiornamento: se è un salto, la scia. */
  private measure() {
    if (this.conf.trail === "none") {
      this.last = null;
      return;
    }
    this.view.requestMeasure({
      key: this,
      read: (v) => {
        if (!v.hasFocus) return null;
        const head = v.state.selection.main.head;
        const c = v.coordsAtPos(head, 1) ?? v.coordsAtPos(head, -1);
        if (!c) return null;
        const box = v.dom.getBoundingClientRect();
        return { x: c.left - box.left, y: c.top - box.top, h: c.bottom - c.top, cw: v.defaultCharacterWidth };
      },
      write: (m) => {
        if (!m) {
          this.last = null;
          return;
        }
        const c = this.conf;
        const lw = LINE_W[c.shape];
        const r: CaretRect = lw
          ? { x: m.x, y: m.y, w: lw, h: m.h }
          : c.shape === "under"
            ? { x: m.x, y: m.y + m.h - 2, w: m.cw, h: 2 }
            : { x: m.x, y: m.y, w: m.cw, h: m.h };
        const now = performance.now();
        const prev = this.last;
        if (prev) {
          const dist = Math.hypot(r.x - prev.x, r.y - prev.y);
          const rapid = now - this.lastAt < 70 && dist > m.cw * 1.5; // tasti tenuti premuti, incolla ripetuti…
          if (!rapid && dist >= m.cw * 2) (this.trail ??= new TrailCanvas(this.view.dom)).add(prev, r, c.trail, c.trailLen);
        }
        this.last = r;
        this.lastAt = now;
      },
    });
  }

  destroy() {
    this.timers.forEach(clearTimeout);
    cancelAnimationFrame(this.snapFrame);
    this.trail?.dispose();
    const d = this.view.dom.dataset;
    delete d.caretOn;
    delete d.caretSnap;
  }
}

const caretPlugin = ViewPlugin.fromClass(CaretView);

const caretTheme = EditorView.baseTheme({
  // il lampeggio di CodeMirror (a scatti, sullo strato) si spegne: ci pensa CaretView sul cursore
  "&.cm-focused > .cm-scroller > .cm-cursorLayer": { animation: "none !important" },
  "&[data-caret-snap] .cm-cursor": { transition: "none !important" },
  // forma
  '&[data-caret-shape="thin"] .cm-cursor': { borderLeftWidth: "1px" },
  '&[data-caret-shape="line"] .cm-cursor': { borderLeftWidth: "2px" },
  '&[data-caret-shape="thick"] .cm-cursor': { borderLeftWidth: "3px" },
  '&[data-caret-shape="block"] .cm-cursor': {
    borderLeft: "none",
    width: "var(--caret-cw)",
    background: "rgba(var(--accent-rgb), .55)",
  },
  '&[data-caret-shape="hollow"] .cm-cursor': {
    borderLeft: "none",
    width: "var(--caret-cw)",
    boxShadow: "inset 0 0 0 1.5px var(--color-accent)",
  },
  '&[data-caret-shape="under"] .cm-cursor': {
    borderLeft: "none",
    width: "var(--caret-cw)",
    borderBottom: "2px solid var(--color-accent)",
  },
  // alone (solo sul cursore principale)
  '&[data-caret-glow="on"] .cm-cursor-primary': {
    boxShadow: "0 0 9px 1px rgba(var(--accent-rgb), .7), 0 0 2px rgba(var(--accent-rgb), .9)",
  },
  '&[data-caret-shape="hollow"][data-caret-glow="on"] .cm-cursor-primary': {
    boxShadow: "inset 0 0 0 1.5px var(--color-accent), 0 0 9px 1px rgba(var(--accent-rgb), .7)",
  },
  '&[data-caret-glow="breathe"] .cm-cursor-primary::after': {
    content: '""',
    position: "absolute",
    inset: "-3px",
    borderRadius: "3px",
    boxShadow: "0 0 12px 3px rgba(var(--accent-rgb), .6)",
    opacity: ".45",
  },
  '&[data-caret-glow="breathe"][data-caret-on] .cm-cursor-primary::after': {
    animation: "orbit-caret-breathe 2.4s ease-in-out infinite",
  },
  // lampeggio
  '&[data-caret-on][data-caret-blink="hard"] .cm-cursor': { animation: "orbit-caret-hard 1.06s steps(1) infinite" },
  '&[data-caret-on][data-caret-blink="smooth"] .cm-cursor': { animation: "orbit-caret-smooth 1.1s ease-in-out infinite" },
  '&[data-caret-on][data-caret-blink="phase"] .cm-cursor': { animation: "orbit-caret-phase 1.4s ease-in-out infinite" },
  '&[data-caret-on][data-caret-blink="expand"] .cm-cursor': { animation: "orbit-caret-expand 1.2s ease-in-out infinite" },
  "@keyframes orbit-caret-hard": { "0%": { opacity: "1" }, "50%": { opacity: "0" } },
  "@keyframes orbit-caret-smooth": { "0%, 100%": { opacity: "1" }, "50%": { opacity: ".08" } },
  "@keyframes orbit-caret-phase": { "0%, 35%, 100%": { opacity: "1" }, "65%": { opacity: ".1" } },
  "@keyframes orbit-caret-expand": { "0%, 100%": { transform: "scaleY(1)" }, "50%": { transform: "scaleY(.15)" } },
  "@keyframes orbit-caret-breathe": { "0%, 100%": { opacity: ".25" }, "50%": { opacity: "1" } },
});

/** Estensione del cursore con la configurazione corrente (riconfigurabile con un Compartment). */
export function caretExtension(conf: EditorCaret): Extension {
  return [caretConf.of(conf), caretPlugin, caretTheme];
}
