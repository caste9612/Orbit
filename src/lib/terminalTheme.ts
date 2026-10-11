// Tema di xterm per i terminali di Orbit (e per l'anteprima del cursore nelle Impostazioni, M64).
import { settings, THEMES } from "./state/settings.svelte";

// Tema xterm LEGATO al tema di Orbit: sfondo = colore dell'editor (surface-1), testo = ink, selezione =
// quella dell'editor; il cursore lo disegna TerminalCaret. Prima era fisso #1e1e1e: coincideva col tema VS 2026 e
// stonava con gli altri (e con Orbit Light). I 16 colori ANSI hanno un set scuro e uno chiaro.
const ANSI_DARK = {
  black: "#1e1e1e", red: "#f14c4c", green: "#5bc88a", yellow: "#e3b341", blue: "#569cd6",
  magenta: "#c586c0", cyan: "#4ec9b0", white: "#d4d4d4",
  brightBlack: "#6b7480", brightRed: "#ff7b86", brightGreen: "#7ee0a6", brightYellow: "#f0c662",
  brightBlue: "#8fbcff", brightMagenta: "#d7a3e0", brightCyan: "#6fd9c4", brightWhite: "#ffffff",
};
const ANSI_LIGHT = {
  black: "#000000", red: "#cd3131", green: "#00a300", yellow: "#949800", blue: "#0451a5",
  magenta: "#bc05bc", cyan: "#0598bc", white: "#555555",
  brightBlack: "#666666", brightRed: "#cd3131", brightGreen: "#14ce14", brightYellow: "#b5ba00",
  brightBlue: "#0451a5", brightMagenta: "#bc05bc", brightCyan: "#0598bc", brightWhite: "#a5a5a5",
};
export function xtermTheme() {
  const th = THEMES[settings.theme] ?? THEMES.vs2026;
  const bg = th.vars["color-surface-1"];
  return {
    background: bg,
    foreground: th.vars["color-ink"],
    // il cursore di xterm è invisibile: lo disegna TerminalCaret sopra la griglia (M63)
    cursor: "#00000000",
    cursorAccent: bg,
    selectionBackground: th.vars["cm-selection"],
    ...(th.light ? ANSI_LIGHT : ANSI_DARK),
  };
}
