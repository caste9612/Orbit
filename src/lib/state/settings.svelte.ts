// User settings (app-global): editor/terminal font, font size, accent color, smooth
// caret. Persisted in localStorage and applied as CSS variables on the document root.
export const MONO_FONTS = [
  { label: "JetBrains Mono", stack: '"JetBrains Mono Variable", "JetBrains Mono", ui-monospace, monospace' },
  { label: "Cascadia Code", stack: '"Cascadia Code", "Cascadia Mono", ui-monospace, monospace' },
  { label: "Cascadia Mono (Visual Studio)", stack: '"Cascadia Mono", "Cascadia Code", ui-monospace, monospace' },
  { label: "Fira Code", stack: '"Fira Code", ui-monospace, monospace' },
  { label: "Consolas", stack: "Consolas, ui-monospace, monospace" },
  { label: "Source Code Pro", stack: '"Source Code Pro", ui-monospace, monospace' },
  { label: "Menlo / Monaco", stack: "Menlo, Monaco, ui-monospace, monospace" },
];

export function monoStack(label: string): string {
  return (MONO_FONTS.find((f) => f.label === label) ?? MONO_FONTS[0]).stack;
}

export const ACCENTS = {
  blue: { accent: "#3b9dff", rgb: "59, 157, 255", accent2: "#6b5bff" },
  purple: { accent: "#a472ff", rgb: "164, 114, 255", accent2: "#7a5cff" },
  green: { accent: "#3fb950", rgb: "63, 185, 80", accent2: "#2ea043" },
  teal: { accent: "#22c7b3", rgb: "34, 199, 179", accent2: "#0fa595" },
};
export type AccentName = keyof typeof ACCENTS;

// Temi completi: stesso meccanismo degli ACCENTS (CSS vars su documentElement + persistenza in
// localStorage), esteso a TUTTE le superfici/linee/inchiostri + bg + l'accento di default e le
// variabili dell'editor (--cm-*). Gli stati danger/success/warning restano dai token base.
// `vars` mappa nome-variabile (senza "--") → valore. Default = "dark" (Orbit Dark, firma).
export interface Theme {
  label: string;
  light?: boolean; // tema chiaro → l'editor usa la HighlightStyle chiara + classe .theme-light
  vars: Record<string, string>;
}

export const THEMES: Record<string, Theme> = {
  dark: {
    label: "Orbit Dark",
    vars: {
      "color-surface-0": "#1d2027", "color-surface-1": "#14161b", "color-surface-2": "#181b21",
      "color-surface-3": "#25282f", "color-surface-4": "#33363c",
      "color-line": "#262a32", "color-line-strong": "#333845",
      "color-ink": "#d7dbe2", "color-ink-muted": "#9aa1ad", "color-ink-subtle": "#636b78",
      "color-bg": "#0e1014", "color-accent": "#4c8dff", "color-accent-2": "#7c5cff", "accent-rgb": "76, 141, 255",
      "cm-selection": "#2a4163", "cm-selection-match": "#21344f", "cm-active-line": "rgba(255,255,255,0.03)",
      "cm-bracket-bg": "rgba(110,168,254,0.18)", "cm-bracket-outline": "rgba(110,168,254,0.4)",
    },
  },
  eclipse: {
    label: "Eclipse",
    vars: {
      "color-surface-0": "#141619", "color-surface-1": "#0a0b0d", "color-surface-2": "#0f1113",
      "color-surface-3": "#1c1e21", "color-surface-4": "#2a2c2f",
      "color-line": "#1c2026", "color-line-strong": "#2a2f37",
      "color-ink": "#cfd3da", "color-ink-muted": "#8a909b", "color-ink-subtle": "#5b626d",
      "color-bg": "#050607", "color-accent": "#2dd4bf", "color-accent-2": "#3b9dff", "accent-rgb": "45, 212, 191",
      "cm-selection": "#1d3a44", "cm-selection-match": "#16303a", "cm-active-line": "rgba(255,255,255,0.03)",
      "cm-bracket-bg": "rgba(45,212,191,0.18)", "cm-bracket-outline": "rgba(45,212,191,0.4)",
    },
  },
  slate: {
    label: "Slate",
    vars: {
      "color-surface-0": "#2a2c2f", "color-surface-1": "#202123", "color-surface-2": "#242528",
      "color-surface-3": "#303134", "color-surface-4": "#3d3e41",
      "color-line": "#34363a", "color-line-strong": "#44464b",
      "color-ink": "#d6d7da", "color-ink-muted": "#9a9da3", "color-ink-subtle": "#7d8088",
      "color-bg": "#1b1c1e", "color-accent": "#5b9bd5", "color-accent-2": "#7c8cff", "accent-rgb": "91, 155, 213",
      "cm-selection": "#2f4257", "cm-selection-match": "#26384a", "cm-active-line": "rgba(255,255,255,0.03)",
      "cm-bracket-bg": "rgba(91,155,213,0.2)", "cm-bracket-outline": "rgba(91,155,213,0.42)",
    },
  },
  light: {
    label: "Orbit Light",
    light: true,
    vars: {
      "color-surface-0": "#eceef1", "color-surface-1": "#ffffff", "color-surface-2": "#f6f7f9",
      "color-surface-3": "#e7e8eb", "color-surface-4": "#d8d9dc",
      "color-line": "#e2e5ea", "color-line-strong": "#cfd4dc",
      "color-ink": "#20242c", "color-ink-muted": "#586070", "color-ink-subtle": "#8a909c",
      "color-bg": "#f3f4f6", "color-accent": "#2f7ff0", "color-accent-2": "#6b5bff", "accent-rgb": "47, 127, 240",
      "cm-selection": "#d7e6fb", "cm-selection-match": "#c4dbf7", "cm-active-line": "rgba(0,0,0,0.045)",
      "cm-bracket-bg": "rgba(47,127,240,0.16)", "cm-bracket-outline": "rgba(47,127,240,0.45)",
    },
  },
};
export type ThemeName = keyof typeof THEMES;

// Preset di scorciatoie: Orbit (default), Visual Studio, IntelliJ. Il registro dei comandi e il
// dispatch vivono in keybindings.svelte.ts; qui si persiste solo quale preset è attivo.
export type KeymapName = "orbit" | "vs" | "intellij";

/** True se il tema attivo è chiaro (l'editor sceglie la HighlightStyle di conseguenza). */
export function isLightTheme(): boolean {
  return !!THEMES[settings.theme]?.light;
}
/** Colore accento "del tema" (per lo swatch Auto in Impostazioni). */
export function themeAccent(): string {
  return THEMES[settings.theme]?.vars["color-accent"] ?? "#4c8dff";
}

export const settings = $state({
  theme: "dark" as ThemeName,
  keymap: "orbit" as KeymapName, // preset scorciatoie (Orbit / Visual Studio / IntelliJ)
  revealActive: false, // "segui il file attivo": espande l'albero e seleziona il file corrente
  fontMono: "JetBrains Mono",
  fontSize: 13,
  accent: "auto" as AccentName | "auto", // "auto" = accento del tema; altrimenti un preset sovrascrive
  smoothCursor: true,
  webgl: false, // GPU rendering del terminale: OFF di default (più leggero ~85 MB)
  claudeTerminal: true, // il terminale di default avvia Claude (companion di Claude Code)
  bellNotify: true, // avvisa quando un terminale suona la bell (Claude ha finito / aspetta) e non lo guardi
});

export const MIN_FONT = 10;
export const MAX_FONT = 24;

/** Ctrl+rotella / Impostazioni: varia la dimensione del font (editor + terminale). */
export function nudgeFontSize(delta: number) {
  settings.fontSize = Math.max(MIN_FONT, Math.min(MAX_FONT, settings.fontSize + delta));
}

export const settingsUI = $state({ open: false });
export function openSettings() {
  settingsUI.open = true;
}
export function closeSettings() {
  settingsUI.open = false;
}

const KEY = "orbit.settings";

/** Applica le impostazioni come variabili CSS sul documento (editor/terminale leggono questi). */
function applySettings() {
  const root = document.documentElement;
  const r = root.style;
  r.setProperty("--font-mono", monoStack(settings.fontMono));
  r.setProperty("--editor-font-size", `${settings.fontSize}px`);
  // tema completo: superfici / linee / inchiostri / bg + accento di default + variabili editor
  const th = THEMES[settings.theme] ?? THEMES.dark;
  for (const [k, v] of Object.entries(th.vars)) r.setProperty(`--${k}`, v);
  root.classList.toggle("theme-light", !!th.light);
  // accento: "auto" usa quello del tema (già applicato sopra); un preset lo sovrascrive
  const acc = settings.accent;
  if (acc !== "auto") {
    const a = ACCENTS[acc] ?? ACCENTS.blue;
    r.setProperty("--color-accent", a.accent);
    r.setProperty("--accent-rgb", a.rgb);
    r.setProperty("--color-accent-2", a.accent2);
  }
  r.setProperty("--caret-transition", settings.smoothCursor ? "left 55ms ease-out, top 55ms ease-out" : "none");
}

/** Carica da localStorage e applica. */
export function loadSettings() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const s = JSON.parse(raw);
      if (typeof s.theme === "string" && s.theme in THEMES) settings.theme = s.theme;
      if (s.keymap === "orbit" || s.keymap === "vs" || s.keymap === "intellij") settings.keymap = s.keymap;
      if (typeof s.revealActive === "boolean") settings.revealActive = s.revealActive;
      if (typeof s.fontMono === "string") settings.fontMono = s.fontMono;
      if (typeof s.fontSize === "number") settings.fontSize = s.fontSize;
      if (typeof s.accent === "string" && (s.accent === "auto" || s.accent in ACCENTS)) settings.accent = s.accent;
      if (typeof s.smoothCursor === "boolean") settings.smoothCursor = s.smoothCursor;
      if (typeof s.webgl === "boolean") settings.webgl = s.webgl;
      if (typeof s.claudeTerminal === "boolean") settings.claudeTerminal = s.claudeTerminal;
      if (typeof s.bellNotify === "boolean") settings.bellNotify = s.bellNotify;
    }
  } catch {
    /* localStorage non disponibile o JSON invalido */
  }
  applySettings();
}

/** Applica + persiste a ogni cambio. */
export function startSettingsAutosave() {
  $effect.root(() => {
    $effect(() => {
      const data = JSON.stringify({
        theme: settings.theme,
        keymap: settings.keymap,
        revealActive: settings.revealActive,
        fontMono: settings.fontMono,
        fontSize: settings.fontSize,
        accent: settings.accent,
        smoothCursor: settings.smoothCursor,
        webgl: settings.webgl,
        claudeTerminal: settings.claudeTerminal,
        bellNotify: settings.bellNotify,
      });
      applySettings();
      try {
        localStorage.setItem(KEY, data);
      } catch {
        /* no-op */
      }
    });
  });
}
