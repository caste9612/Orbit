// Stili del cursore (M63), scelti con l'utente nel laboratorio del cursore: uno stile pronto per l'editor e
// uno per il terminale, più "Personalizza…" per forma, scivolata, lampeggio, scia e alone. Fissi per tutti:
// colore d'accento, lampeggio che smette dopo 15 s, scivolata di 100 ms, blocco vuoto nel terminale senza
// fuoco. Logica pura (niente rune): la usano le impostazioni, l'editor, il terminale e i test.

export type EditorShape = "thin" | "line" | "thick" | "block" | "hollow" | "under";
export type TermShape = "block" | "hollow" | "bar" | "under";
export type Glide = "off" | "jumps" | "always";
export type Blink = "none" | "hard" | "smooth" | "phase" | "expand";
export type Trail = "none" | "comet" | "smear" | "blaze";
export type TrailLen = "short" | "medium" | "long";
export type Glow = "off" | "on" | "breathe";
export type CaretStyle = "smooth" | "classic" | "comet" | "elastic" | "blaze" | "custom";
type Preset = Exclude<CaretStyle, "custom">;

/** Il comportamento del cursore (tutto ciò che uno stile pronto decide). */
export interface CaretFx {
  glide: Glide;
  blink: Blink;
  trail: Trail;
  trailLen: TrailLen;
  glow: Glow;
}
export interface EditorCaret extends CaretFx {
  style: CaretStyle;
  shape: EditorShape;
}
export interface TermCaret extends CaretFx {
  style: CaretStyle;
  shell: TermShape; // shell e programmi
  chat: TermShape; // chat di Claude: di default una barra, per capire a colpo d'occhio a chi scrivi
}

export const EDITOR_PRESETS: Record<Preset, CaretFx> = {
  smooth: { glide: "always", blink: "smooth", trail: "none", trailLen: "medium", glow: "off" },
  classic: { glide: "off", blink: "hard", trail: "none", trailLen: "medium", glow: "off" },
  comet: { glide: "always", blink: "smooth", trail: "comet", trailLen: "medium", glow: "off" },
  elastic: { glide: "always", blink: "smooth", trail: "smear", trailLen: "medium", glow: "off" },
  blaze: { glide: "always", blink: "smooth", trail: "blaze", trailLen: "long", glow: "on" },
};
// Nel terminale gli stili non lampeggiano (come oggi): mentre Claude ridisegna lo schermo il lampeggio
// ripartirebbe di continuo e sembrerebbe impazzito. Chi lo vuole lo accende in Personalizza.
export const TERM_PRESETS: Record<Preset, CaretFx> = Object.fromEntries(
  Object.entries(EDITOR_PRESETS).map(([k, fx]) => [k, { ...fx, blink: "none" }]),
) as Record<Preset, CaretFx>;

export const STYLE_NAMES: [CaretStyle, string][] = [
  ["smooth", "Smooth"],
  ["classic", "Classic"],
  ["comet", "Comet"],
  ["elastic", "Elastic"],
  ["blaze", "Blaze"],
];

export const DEFAULT_EDITOR_CARET: EditorCaret = { style: "smooth", shape: "line", ...EDITOR_PRESETS.smooth };
export const DEFAULT_TERM_CARET: TermCaret = { style: "smooth", shell: "block", chat: "bar", ...TERM_PRESETS.smooth };

/** Valori ammessi per ogni opzione (per validare ciò che si legge dal localStorage). */
export const CHOICES = {
  editorShape: ["thin", "line", "thick", "block", "hollow", "under"] as EditorShape[],
  termShape: ["block", "hollow", "bar", "under"] as TermShape[],
  glide: ["off", "jumps", "always"] as Glide[],
  blink: ["none", "hard", "smooth", "phase", "expand"] as Blink[],
  trail: ["none", "comet", "smear", "blaze"] as Trail[],
  trailLen: ["short", "medium", "long"] as TrailLen[],
  glow: ["off", "on", "breathe"] as Glow[],
};

/** Lo stile pronto che corrisponde a questi valori, oppure "custom". */
export function styleOf(fx: CaretFx, presets: Record<Preset, CaretFx>): CaretStyle {
  for (const [name, p] of Object.entries(presets) as [Preset, CaretFx][]) {
    if (p.glide === fx.glide && p.blink === fx.blink && p.trail === fx.trail && p.glow === fx.glow && (p.trail === "none" || p.trailLen === fx.trailLen)) {
      return name;
    }
  }
  return "custom";
}

const pick = <T>(v: unknown, ok: readonly T[], fallback: T): T => (ok.includes(v as T) ? (v as T) : fallback);

function sanitizeFx(raw: Record<string, unknown>, d: CaretFx): CaretFx {
  return {
    glide: pick(raw.glide, CHOICES.glide, d.glide),
    blink: pick(raw.blink, CHOICES.blink, d.blink),
    trail: pick(raw.trail, CHOICES.trail, d.trail),
    trailLen: pick(raw.trailLen, CHOICES.trailLen, d.trailLen),
    glow: pick(raw.glow, CHOICES.glow, d.glow),
  };
}

/** Cursore dell'editor letto dalle impostazioni salvate (valori sconosciuti → default). */
export function sanitizeEditorCaret(raw: unknown): EditorCaret {
  if (!raw || typeof raw !== "object") return { ...DEFAULT_EDITOR_CARET };
  const r = raw as Record<string, unknown>;
  const fx = sanitizeFx(r, DEFAULT_EDITOR_CARET);
  return { ...fx, shape: pick(r.shape, CHOICES.editorShape, DEFAULT_EDITOR_CARET.shape), style: styleOf(fx, EDITOR_PRESETS) };
}

/** Cursore del terminale letto dalle impostazioni salvate (valori sconosciuti → default). */
export function sanitizeTermCaret(raw: unknown): TermCaret {
  if (!raw || typeof raw !== "object") return { ...DEFAULT_TERM_CARET };
  const r = raw as Record<string, unknown>;
  const fx = sanitizeFx(r, DEFAULT_TERM_CARET);
  return {
    ...fx,
    shell: pick(r.shell, CHOICES.termShape, DEFAULT_TERM_CARET.shell),
    chat: pick(r.chat, CHOICES.termShape, DEFAULT_TERM_CARET.chat),
    style: styleOf(fx, TERM_PRESETS),
  };
}

/** Durata fissa della scivolata e attesa prima del lampeggio, condivise da editor e terminale. */
export const GLIDE_MS = 100;
export const GLIDE_EASE = "cubic-bezier(.2,.9,.25,1)";
export const BLINK_DELAY_MS = 530;
export const BLINK_STOP_MS = 15000; // poi il cursore resta fisso: nessuna animazione infinita
