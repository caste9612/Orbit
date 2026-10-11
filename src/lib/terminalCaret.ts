// Cursore del terminale disegnato da Orbit (M63). xterm sa solo lampeggiare: niente scivolata né scia.
// Il suo cursore resta (una barra trasparente: lo nasconde Terminal.svelte) e questo lo sostituisce, sopra
// la griglia (`.xterm-screen`), seguendo la posizione di xterm dopo ogni disegno: un fotogramma vede solo
// la posizione finale, quindi i salti intermedi dei ridisegni di Claude non si vedono. Movimenti rapidi
// (output veloce: due spostamenti a meno di 70 ms e più di una cella) saltano senza scivolata né scia.
import type { IDisposable, Terminal } from "@xterm/xterm";
import { BLINK_DELAY_MS, BLINK_STOP_MS, GLIDE_EASE, GLIDE_MS, type TermCaret, type TermShape } from "./caretStyles";
import { TrailCanvas, type CaretRect } from "./caretTrail";
import "./terminalCaret.css"; // forme, alone e lampeggio: con il modulo, per ogni terminale che lo usa

const has25 = (params: (number | number[])[]) => params.some((p) => p === 25 || (Array.isArray(p) && p.includes(25)));

export class TerminalCaret {
  private layer: HTMLDivElement;
  private pos: HTMLDivElement;
  private shape: HTMLDivElement;
  private trail: TrailCanvas | null = null;
  private subs: IDisposable[] = [];
  private timers: ReturnType<typeof setTimeout>[] = [];
  private ro: ResizeObserver;
  private hiddenByProgram = false; // DECTCEM (?25l) visto dal parser, se lo stato interno di xterm non è leggibile
  private focused = false;
  private cw = 0;
  private ch = 0;
  private drawn = ""; // ultima posizione/forma disegnata: se non cambia non si fa nulla
  private last: CaretRect | null = null;
  private lastCol = -1;
  private lastRow = -1;
  private lastAt = 0;
  private lastInput = 0;
  private onFocus = () => this.setFocus(true);
  private onBlur = () => this.setFocus(false);

  constructor(
    private term: Terminal,
    private getConf: () => TermCaret,
    private isChat: () => boolean,
  ) {
    const screen = term.element?.querySelector(".xterm-screen") as HTMLElement;
    this.layer = document.createElement("div");
    this.layer.className = "tcaret-layer";
    this.pos = document.createElement("div");
    this.pos.className = "tcaret";
    this.shape = document.createElement("div");
    this.shape.className = "tcaret-shape";
    this.pos.append(this.shape);
    this.layer.append(this.pos);
    screen.append(this.layer);
    this.ro = new ResizeObserver(() => this.remeasure());
    this.ro.observe(screen);
    this.remeasure();
    this.focused = document.activeElement === term.textarea;
    term.textarea?.addEventListener("focus", this.onFocus);
    term.textarea?.addEventListener("blur", this.onBlur);
    this.subs.push(
      term.parser.registerCsiHandler({ prefix: "?", final: "h" }, (p) => {
        if (has25(p)) this.hiddenByProgram = false;
        return false; // lo gestisce anche xterm
      }),
      term.parser.registerCsiHandler({ prefix: "?", final: "l" }, (p) => {
        if (has25(p)) this.hiddenByProgram = true;
        return false;
      }),
      term.onRender(() => this.update()),
      term.onCursorMove(() => this.update()),
      term.onScroll(() => this.update()),
      term.onResize(() => this.remeasure()),
      term.onData(() => (this.lastInput = performance.now())),
    );
    this.refresh();
  }

  /** Cambio di impostazioni (stile, forma, chat/shell): ridisegna da capo. */
  refresh() {
    const c = this.getConf();
    this.pos.dataset.glow = c.glow;
    this.shape.dataset.blink = c.blink;
    if (c.trail === "none") {
      this.trail?.dispose();
      this.trail = null;
    }
    this.drawn = "";
    this.last = null;
    this.update();
  }

  private remeasure() {
    const screen = this.layer.parentElement;
    if (!screen || !this.term.cols || !this.term.rows) return;
    this.cw = screen.clientWidth / this.term.cols;
    this.ch = screen.clientHeight / this.term.rows;
    this.drawn = "";
    this.last = null; // dopo un ridimensionamento niente scia dalla vecchia geometria
    this.update();
  }

  private setFocus(f: boolean) {
    this.focused = f;
    this.update();
  }

  private programHidden(): boolean {
    // stato interno di xterm se c'è (il più affidabile: vale anche per reset e cambi di schermo), altrimenti il parser
    const v = (this.term as unknown as { _core?: { coreService?: { isCursorHidden?: boolean } } })._core?.coreService?.isCursorHidden;
    return typeof v === "boolean" ? v : this.hiddenByProgram;
  }

  private update() {
    const buf = this.term.buffer.active;
    const row = buf.cursorY + buf.baseY - buf.viewportY;
    const col = Math.min(buf.cursorX, this.term.cols - 1);
    const visible = this.cw > 0 && !this.programHidden() && row >= 0 && row < this.term.rows;
    const c = this.getConf();
    // senza fuoco: blocco vuoto per tutti (fisso), come i terminali più diffusi
    const shape: TermShape = this.focused ? (this.isChat() ? c.chat : c.shell) : "hollow";
    const key = `${visible}|${col}|${row}|${shape}`;
    if (key === this.drawn) return;
    this.drawn = key;
    this.layer.style.visibility = visible ? "visible" : "hidden";
    if (!visible) {
      this.last = null;
      this.stopBlink();
      return;
    }
    const x = col * this.cw;
    const y = row * this.ch;
    const r: CaretRect =
      shape === "bar"
        ? { x, y, w: 2, h: this.ch }
        : shape === "under"
          ? { x, y: y + this.ch - 2, w: this.cw, h: 2 }
          : { x, y, w: this.cw, h: this.ch };
    const now = performance.now();
    const prev = this.last;
    const moved = col !== this.lastCol || row !== this.lastRow;
    const dist = prev ? Math.hypot(r.x - prev.x, r.y - prev.y) : 0;
    const rapid = !!prev && now - this.lastAt < 70 && dist > this.cw * 1.5;
    // "solo nei salti": un passo di una cella subito dopo un tasto è scrittura, non un salto
    const typed = now - this.lastInput < 150 && row === this.lastRow && Math.abs(col - this.lastCol) === 1;
    const glide = !!prev && moved && !rapid && c.glide !== "off" && !(c.glide === "jumps" && typed);
    this.shape.dataset.shape = shape;
    this.pos.style.width = r.w + "px";
    this.pos.style.height = r.h + "px";
    this.pos.style.transition = glide ? `transform ${GLIDE_MS}ms ${GLIDE_EASE}` : "none";
    this.pos.style.transform = `translate(${r.x}px, ${r.y}px)`;
    if (prev && moved && !rapid && c.trail !== "none" && dist >= this.cw * 2) {
      (this.trail ??= new TrailCanvas(this.layer)).add(prev, r, c.trail, c.trailLen);
    }
    this.last = r;
    if (moved) {
      this.lastAt = now;
      this.lastCol = col;
      this.lastRow = row;
    }
    this.restartBlink(c);
  }

  /** Fermo mentre si muove; lampeggia (o respira) da mezzo secondo dopo l'ultimo movimento fino a 15 s. */
  private restartBlink(c: TermCaret) {
    this.stopBlink();
    if (!this.focused || (c.blink === "none" && c.glow !== "breathe")) return;
    this.timers.push(setTimeout(() => (this.pos.dataset.on = ""), BLINK_DELAY_MS));
    this.timers.push(setTimeout(() => delete this.pos.dataset.on, BLINK_STOP_MS));
  }

  private stopBlink() {
    this.timers.forEach(clearTimeout);
    this.timers = [];
    delete this.pos.dataset.on;
  }

  dispose() {
    this.stopBlink();
    this.subs.forEach((d) => d.dispose());
    this.ro.disconnect();
    this.term.textarea?.removeEventListener("focus", this.onFocus);
    this.term.textarea?.removeEventListener("blur", this.onBlur);
    this.trail?.dispose();
    this.layer.remove();
  }
}
