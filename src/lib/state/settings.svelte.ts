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
  // ambra calda (richiesta utente, 2026-10-07): legge bene sia come testo sul fondo scuro sia come
  // fondo con testo scuro; accent2 più aranciato per gradienti e stati secondari
  amber: { accent: "#e8a53a", rgb: "232, 165, 58", accent2: "#d4842a" },
};
export type AccentName = keyof typeof ACCENTS;

// Temi completi: stesso meccanismo degli ACCENTS (CSS vars su documentElement + persistenza in
// localStorage), esteso a TUTTE le superfici/linee/inchiostri + bg + l'accento di default e le
// variabili dell'editor (--cm-*). Gli stati danger/success/warning restano dai token base.
// `vars` mappa nome-variabile (senza "--") → valore. Predefinito dalla v0.9.0: "vs2026" (look Visual
// Studio 2026); "dark" (Orbit Dark) resta il tema storico e il default pre-JS di app.css.
// "Look" di un tema: oltre ai colori, la FORMA dell'interfaccia (esperimento VS 2026, branch ui-vs2026).
// Tutto opzionale: un tema senza `look` ha il look Orbit storico (default di app.css / Icon.svelte).
export interface ThemeLook {
  fontSans?: string; // font dell'interfaccia (sovrascrive --font-sans)
  radii?: { xs: number; sm: number; md: number; lg: number; xl: number; xxl: number }; // scala --r-* in px
  iconStroke?: number; // spessore uniforme delle icone line-art (default: ognuna il suo)
  iconSet?: "fluent"; // set alternativo di glifi in Icon.svelte (geometria più squadrata)
  flatGlyphs?: boolean; // glifi dei file senza tile colorate piene (contorno sottile)
  heights?: { tabs: number; head: number }; // densità: barra schede editor / testate pannelli (px)
}

export interface Theme {
  label: string;
  light?: boolean; // tema chiaro → l'editor usa la HighlightStyle chiara + classe .theme-light
  vars: Record<string, string>;
  look?: ThemeLook;
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
  // ESPERIMENTO (branch ui-vs2026): look di Visual Studio 2026 Dark. Colori CAMPIONATI pixel per
  // pixel da uno screenshot reale di VS 2026 (18.10) dell'utente: cornice/titolo #1c1c1c, editor
  // #1e1e1e, barra schede #262626 (scheda attiva #282828, senza linea d'accento), tool window #282828,
  // input #212121, bottoni/dropdown #353535 con bordo #373737, separatori interni #2e2e2e/#373737,
  // bordi delle card #454545, status bar #141414, testo #ffffff/#d7d7d7, numeri di riga #8a8a8a,
  // accento VIOLA #9184ee (bordo della tool window attiva e dell'input a fuoco). Angoli delle card
  // appena arrotondati, Segoe UI Variable, icone Fluent a tratto 1.5, glifi dei file a contorno.
  vs2026: {
    label: "Visual Studio 2026 Dark",
    vars: {
      "color-surface-0": "#1c1c1c", "color-surface-1": "#1e1e1e", "color-surface-2": "#282828",
      "color-surface-3": "#353535", "color-surface-4": "#404040",
      "color-line": "#3a3a3a", "color-line-strong": "#454545",
      "color-ink": "#ececec", "color-ink-muted": "#a8a8a8", "color-ink-subtle": "#8a8a8a",
      "color-bg": "#1c1c1c", "color-accent": "#9184ee", "color-accent-2": "#7b6fe0", "accent-rgb": "145, 132, 238",
      "color-accent-soft": "#2f2c52",
      // corpo della sidebar: provato scuro come l'editor (#1e1e1e), l'utente preferisce la tonalità
      // "strumenti" #282828 come la sua testata e come le tool window di VS → `color-panel` resta al
      // default (surface-2)
      "cm-selection": "#264f78", "cm-selection-match": "#343a40", "cm-active-line": "rgba(255,255,255,0.035)",
      "cm-bracket-bg": "rgba(145,132,238,0.2)", "cm-bracket-outline": "rgba(145,132,238,0.5)",
    },
    look: {
      fontSans: '"Segoe UI Variable Text", "Segoe UI", system-ui, -apple-system, sans-serif',
      radii: { xs: 2, sm: 2, md: 3, lg: 4, xl: 4, xxl: 6 },
      iconStroke: 1.5,
      iconSet: "fluent",
      flatGlyphs: true,
      heights: { tabs: 28, head: 28 }, // VS a 125%: schede 25, testate 27 — un filo più larghe per i contenuti di Orbit
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
/** Tutte le variabili usate da almeno un tema (per rimuovere quelle che il tema attivo non definisce). */
const ALL_THEME_VARS = new Set(Object.values(THEMES).flatMap((t) => Object.keys(t.vars)));

// Preset di scorciatoie: Orbit (default), Visual Studio, IntelliJ — più "custom" (mappa
// personalizzata che l'utente costruisce partendo da una base, vedi `customKeys`). Il registro
// dei comandi e il dispatch vivono in keybindings.svelte.ts; qui si persiste solo l'attivo.
export type KeymapBase = "orbit" | "vs" | "intellij";
export type KeymapName = KeymapBase | "custom";

// Apertura predefinita dei file Markdown: anteprima per i soli README (default, comportamento
// storico), oppure sempre anteprima / sempre sorgente. Letto da workspace.loadDoc.
export type MarkdownMode = "readme" | "preview" | "source";

/** True se il tema attivo è chiaro (l'editor sceglie la HighlightStyle di conseguenza). */
export function isLightTheme(): boolean {
  return !!THEMES[settings.theme]?.light;
}
/** Colore accento "del tema" (per lo swatch Auto in Impostazioni). */
export function themeAccent(): string {
  return THEMES[settings.theme]?.vars["color-accent"] ?? "#4c8dff";
}
/** Look del tema attivo ({} = look Orbit storico). Letto da Icon.svelte / FileGlyph.svelte. */
export function themeLook(): ThemeLook {
  return THEMES[settings.theme]?.look ?? {};
}

export const settings = $state({
  theme: "vs2026" as ThemeName, // dalla v0.9.0 il predefinito è il look Visual Studio 2026 (M55)
  keymap: "orbit" as KeymapName, // preset scorciatoie (Orbit / Visual Studio / IntelliJ / Custom)
  customKeys: null as Record<string, string> | null, // mappa CommandId→tasto del preset "custom" (null = non creato)
  revealActive: false, // "segui il file attivo": espande l'albero e seleziona il file corrente
  fontMono: "JetBrains Mono",
  editorFontSize: 13, // dimensione font dell'editor (indipendente dal terminale)
  terminalFontSize: 13, // dimensione font del terminale (indipendente dall'editor)
  accent: "auto" as AccentName | "auto", // "auto" = accento del tema; altrimenti un preset sovrascrive
  smoothCursor: true,
  // movimento fluido dei pannelli (M56): larghezze e riquadri animati nei cambi programmatici del
  // layout. Comanda `--motion-ms`; NON segue prefers-reduced-motion (su Windows con gli effetti di
  // animazione spenti sarebbe sempre 0, e l'utente ha chiesto proprio le transizioni).
  motion: true,
  webgl: false, // GPU rendering del terminale: OFF di default (più leggero ~85 MB)
  claudeTerminal: true, // il terminale di default avvia Claude (companion di Claude Code)
  bellNotify: true, // avvisa quando un terminale suona la bell (Claude ha finito / aspetta) e non lo guardi
  autosave: true, // salva i file modificati su perdita di focus e cambio tab (stile IntelliJ)
  mdMode: "readme" as MarkdownMode, // apertura .md: anteprima solo per i README (default)
  logging: true, // raccolta log diagnostici (ring buffer + file) per indagare i problemi — disattivabile
  checkUpdates: true, // controlla le release su GitHub all'avvio e ogni 6 ore (M59)
});

export const MIN_FONT = 10;
export const MAX_FONT = 24;

/** Ctrl+rotella (sul pannello sotto il mouse) / Impostazioni: varia il font di editor o terminale. */
export function nudgeFontSize(target: "editor" | "terminal", delta: number) {
  const key = target === "terminal" ? "terminalFontSize" : "editorFontSize";
  settings[key] = Math.max(MIN_FONT, Math.min(MAX_FONT, settings[key] + delta));
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
  r.setProperty("--editor-font-size", `${settings.editorFontSize}px`);
  // tema completo: superfici / linee / inchiostri / bg + accento di default + variabili editor.
  // Le variabili che SOLO altri temi definiscono (es. color-panel, color-accent-soft) vanno rimosse,
  // altrimenti cambiando tema resterebbero appiccicate al valore del tema precedente.
  const th = THEMES[settings.theme] ?? THEMES.vs2026;
  for (const k of ALL_THEME_VARS) if (!(k in th.vars)) r.removeProperty(`--${k}`);
  for (const [k, v] of Object.entries(th.vars)) r.setProperty(`--${k}`, v);
  root.classList.toggle("theme-light", !!th.light);
  // look (forma): un tema senza `look` rimuove le proprietà → valgono i default di app.css
  const look = th.look ?? {};
  for (const k of ["xs", "sm", "md", "lg", "xl", "xxl"] as const) {
    if (look.radii) r.setProperty(`--r-${k}`, `${look.radii[k]}px`);
    else r.removeProperty(`--r-${k}`);
  }
  if (look.fontSans) r.setProperty("--font-sans", look.fontSans);
  else r.removeProperty("--font-sans");
  if (look.iconStroke) r.setProperty("--icon-stroke", String(look.iconStroke));
  else r.removeProperty("--icon-stroke");
  if (look.heights) {
    r.setProperty("--h-tabs", `${look.heights.tabs}px`);
    r.setProperty("--h-head", `${look.heights.head}px`);
  } else {
    r.removeProperty("--h-tabs");
    r.removeProperty("--h-head");
  }
  // accento: "auto" usa quello del tema (già applicato sopra); un preset lo sovrascrive
  const acc = settings.accent;
  if (acc !== "auto") {
    const a = ACCENTS[acc] ?? ACCENTS.blue;
    r.setProperty("--color-accent", a.accent);
    r.setProperty("--accent-rgb", a.rgb);
    r.setProperty("--color-accent-2", a.accent2);
  }
  r.setProperty("--caret-transition", settings.smoothCursor ? "left 55ms ease-out, top 55ms ease-out" : "none");
  r.setProperty("--motion-ms", settings.motion ? `${MOTION_BASE_MS}ms` : "0ms"); // vedi layout.svelte.ts motionMs()
}

/** Durata base delle transizioni di layout (ms); `--motion-ms` in app.css ha lo stesso valore. */
export const MOTION_BASE_MS = 220;

/** Carica da localStorage e applica. */
export function loadSettings() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const s = JSON.parse(raw);
      // Migrazione v0.9.0 (M55): il nuovo predefinito è "Visual Studio 2026 Dark". Le impostazioni
      // salvate dalle versioni precedenti hanno sempre `theme` (il vecchio default "dark" veniva
      // persistito anche se mai scelto), quindi senza un marcatore chi aggiorna non vedrebbe mai il
      // nuovo look: al primo avvio con la 0.9 si passa al nuovo tema UNA volta (`uiV09`), poi la
      // scelta dell'utente comanda come sempre.
      if (s.uiV09 === true) {
        if (typeof s.theme === "string" && s.theme in THEMES) settings.theme = s.theme;
      }
      if (s.keymap === "orbit" || s.keymap === "vs" || s.keymap === "intellij" || s.keymap === "custom") settings.keymap = s.keymap;
      if (s.customKeys && typeof s.customKeys === "object") {
        const m: Record<string, string> = {};
        for (const [k, v] of Object.entries(s.customKeys)) if (typeof v === "string") m[k] = v;
        settings.customKeys = Object.keys(m).length ? m : null;
      }
      if (settings.keymap === "custom" && !settings.customKeys) settings.keymap = "orbit"; // custom senza mappa → base
      if (typeof s.revealActive === "boolean") settings.revealActive = s.revealActive;
      if (typeof s.fontMono === "string") settings.fontMono = s.fontMono;
      if (typeof s.fontSize === "number") { settings.editorFontSize = s.fontSize; settings.terminalFontSize = s.fontSize; } // migra dal vecchio valore unico
      if (typeof s.editorFontSize === "number") settings.editorFontSize = s.editorFontSize;
      if (typeof s.terminalFontSize === "number") settings.terminalFontSize = s.terminalFontSize;
      if (typeof s.accent === "string" && (s.accent === "auto" || s.accent in ACCENTS)) settings.accent = s.accent;
      if (typeof s.smoothCursor === "boolean") settings.smoothCursor = s.smoothCursor;
      if (typeof s.motion === "boolean") settings.motion = s.motion;
      if (typeof s.webgl === "boolean") settings.webgl = s.webgl;
      if (typeof s.claudeTerminal === "boolean") settings.claudeTerminal = s.claudeTerminal;
      if (typeof s.bellNotify === "boolean") settings.bellNotify = s.bellNotify;
      if (typeof s.autosave === "boolean") settings.autosave = s.autosave;
      if (s.mdMode === "readme" || s.mdMode === "preview" || s.mdMode === "source") settings.mdMode = s.mdMode;
      if (typeof s.logging === "boolean") settings.logging = s.logging;
      if (typeof s.checkUpdates === "boolean") settings.checkUpdates = s.checkUpdates;
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
        uiV09: true, // marcatore della migrazione al tema predefinito VS 2026 (vedi loadSettings)
        theme: settings.theme,
        keymap: settings.keymap,
        customKeys: settings.customKeys,
        revealActive: settings.revealActive,
        fontMono: settings.fontMono,
        editorFontSize: settings.editorFontSize,
        terminalFontSize: settings.terminalFontSize,
        accent: settings.accent,
        smoothCursor: settings.smoothCursor,
        motion: settings.motion,
        webgl: settings.webgl,
        claudeTerminal: settings.claudeTerminal,
        bellNotify: settings.bellNotify,
        autosave: settings.autosave,
        mdMode: settings.mdMode,
        logging: settings.logging,
        checkUpdates: settings.checkUpdates,
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
