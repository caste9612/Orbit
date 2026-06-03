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

export const settings = $state({
  fontMono: "JetBrains Mono",
  fontSize: 13,
  accent: "blue" as AccentName,
  smoothCursor: true,
  webgl: false, // GPU rendering del terminale: OFF di default (più leggero ~85 MB)
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
  const r = document.documentElement.style;
  r.setProperty("--font-mono", monoStack(settings.fontMono));
  r.setProperty("--editor-font-size", `${settings.fontSize}px`);
  const a = ACCENTS[settings.accent] ?? ACCENTS.blue;
  r.setProperty("--color-accent", a.accent);
  r.setProperty("--accent-rgb", a.rgb);
  r.setProperty("--color-accent-2", a.accent2);
  r.setProperty("--caret-transition", settings.smoothCursor ? "left 55ms ease-out, top 55ms ease-out" : "none");
}

/** Carica da localStorage e applica. */
export function loadSettings() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const s = JSON.parse(raw);
      if (typeof s.fontMono === "string") settings.fontMono = s.fontMono;
      if (typeof s.fontSize === "number") settings.fontSize = s.fontSize;
      if (typeof s.accent === "string" && s.accent in ACCENTS) settings.accent = s.accent;
      if (typeof s.smoothCursor === "boolean") settings.smoothCursor = s.smoothCursor;
      if (typeof s.webgl === "boolean") settings.webgl = s.webgl;
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
        fontMono: settings.fontMono,
        fontSize: settings.fontSize,
        accent: settings.accent,
        smoothCursor: settings.smoothCursor,
        webgl: settings.webgl,
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
