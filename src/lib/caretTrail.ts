// Scie del cursore (M63), condivise da editor e terminale. Quando il cursore salta, i quattro angoli del
// suo rettangolo inseguono la destinazione con velocità diverse — quelli "davanti" nella direzione del moto
// più in fretta — e si disegna l'inviluppo convesso fra il cursore in arrivo e gli angoli in ritardo:
// - cometa: come la scia di Kitty, una coda che si richiude;
// - elastica: come Neovide e smear-cursor, la testa è già arrivata e la coda la insegue;
// - fiammata: come gli shader "blaze" di Ghostty, colori caldi con un bagliore.
// Il canvas nasce al primo uso e il ciclo di disegno gira solo finché c'è una scia viva.
import type { Trail, TrailLen } from "./caretStyles";

export interface CaretRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

type Pt = [number, number];
interface Item {
  t0: number;
  draw(g: CanvasRenderingContext2D, t: number): boolean; // false = finito
}

const LEN: Record<TrailLen, number> = { short: 0.5, medium: 0.8, long: 1 };

function corners(r: CaretRect): Pt[] {
  return [
    [r.x, r.y],
    [r.x + r.w, r.y],
    [r.x + r.w, r.y + r.h],
    [r.x, r.y + r.h],
  ];
}

/** Inviluppo convesso (catena monotona). */
export function hull(points: Pt[]): Pt[] {
  const p = points.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cross = (o: Pt, a: Pt, b: Pt) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lo: Pt[] = [];
  const up: Pt[] = [];
  for (const q of p) {
    while (lo.length >= 2 && cross(lo[lo.length - 2], lo[lo.length - 1], q) <= 0) lo.pop();
    lo.push(q);
  }
  for (const q of p.reverse()) {
    while (up.length >= 2 && cross(up[up.length - 2], up[up.length - 1], q) <= 0) up.pop();
    up.push(q);
  }
  return lo.slice(0, -1).concat(up.slice(0, -1));
}

function accentRgb(): string {
  return getComputedStyle(document.documentElement).getPropertyValue("--accent-rgb").trim() || "145, 132, 238";
}

export class TrailCanvas {
  private canvas: HTMLCanvasElement | null = null;
  private g: CanvasRenderingContext2D | null = null;
  private items: Item[] = [];
  private raf = 0;

  /** `host` deve essere posizionato (relative/absolute): il canvas lo copre tutto, sopra il contenuto. */
  constructor(private host: HTMLElement) {}

  private ensure(): CanvasRenderingContext2D | null {
    if (!this.canvas) {
      const c = document.createElement("canvas");
      c.className = "caret-trail";
      c.style.cssText = "position:absolute;left:0;top:0;pointer-events:none;z-index:5";
      this.host.append(c);
      this.canvas = c;
      this.g = c.getContext("2d");
    }
    const d = window.devicePixelRatio || 1;
    const w = this.host.clientWidth;
    const h = this.host.clientHeight;
    if (this.canvas.width !== Math.round(w * d) || this.canvas.height !== Math.round(h * d)) {
      this.canvas.width = Math.round(w * d);
      this.canvas.height = Math.round(h * d);
      this.canvas.style.width = w + "px";
      this.canvas.style.height = h + "px";
    }
    this.g?.setTransform(d, 0, 0, d, 0, 0);
    return this.g;
  }

  /** Una scia dal rettangolo `a` al rettangolo `b`, in coordinate del `host`. */
  add(a: CaretRect, b: CaretRect, kind: Trail, len: TrailLen) {
    if (kind === "none" || !this.ensure()) return;
    const from = corners(a);
    const to = corners(b);
    const dir: Pt = [b.x - a.x, b.y - a.y];
    // quanto ogni angolo sta "davanti" nella direzione del moto: davanti = veloce, dietro = lento
    const lead = from.map((p) => (p[0] - (a.x + a.w / 2)) * dir[0] + (p[1] - (a.y + a.h / 2)) * dir[1]);
    const maxL = Math.max(...lead);
    const minL = Math.min(...lead);
    const dur = 0.09 + 0.33 * LEN[len];
    const rgb = accentRgb();
    this.items.push({
      t0: performance.now(),
      draw(g, t) {
        if (t > dur) return false;
        const pts = from.map((p, i): Pt => {
          const front = maxL === minL ? 1 : (lead[i] - minL) / (maxL - minL); // 1 = davanti
          let e: number;
          if (kind === "smear") e = front > 0.5 ? 1 : 1 - Math.pow(1 - Math.min(1, t / dur), 3); // la testa è già arrivata
          else e = 1 - Math.exp(-t / (dur * (front > 0.5 ? 0.18 : 0.55))); // cometa / fiammata
          return [p[0] + (to[i][0] - p[0]) * e, p[1] + (to[i][1] - p[1]) * e];
        });
        const h = hull(pts.concat(to));
        const fade = 1 - t / dur;
        const gr = g.createLinearGradient(a.x, a.y, b.x, b.y);
        if (kind === "blaze") {
          gr.addColorStop(0, `rgba(255,70,40,${0.05 * fade})`);
          gr.addColorStop(0.6, `rgba(255,150,60,${0.55 * fade})`);
          gr.addColorStop(1, `rgba(255,230,160,${0.9 * fade})`);
          g.save();
          g.shadowColor = "rgba(255,120,50,.8)";
          g.shadowBlur = 12;
        } else {
          gr.addColorStop(0, `rgba(${rgb},${0.05 * fade})`);
          gr.addColorStop(1, `rgba(${rgb},${0.7 * fade})`);
          g.save();
        }
        g.fillStyle = gr;
        g.beginPath();
        h.forEach((p, i) => (i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1])));
        g.closePath();
        g.fill();
        g.restore();
        return true;
      },
    });
    if (!this.raf) this.raf = requestAnimationFrame((t) => this.frame(t));
  }

  private frame(now: number) {
    this.raf = 0;
    const g = this.g;
    const c = this.canvas;
    if (!g || !c) return;
    g.clearRect(0, 0, c.width, c.height);
    this.items = this.items.filter((it) => it.draw(g, (now - it.t0) / 1000));
    if (this.items.length) this.raf = requestAnimationFrame((t) => this.frame(t));
  }

  dispose() {
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = 0;
    this.items = [];
    this.canvas?.remove();
    this.canvas = null;
    this.g = null;
  }
}
