// Stato reattivo del layout della shell (Svelte 5 runes in modulo .svelte.ts).
// Fonte unica di verità per visibilità e dimensioni dei pannelli.

export type SidebarView = "explorer" | "git" | "search" | "docs";
export type FocusPanel = "sidebar" | "editor" | "terminal";

export const layout = $state({
  sidebarView: "explorer" as SidebarView,
  sidebarVisible: true,
  sidebarWidth: 260,
  terminalVisible: true,
  terminalWidth: 440, // il terminale è docked a destra
  focusPanel: "editor" as FocusPanel, // pannello con focus (bordo-accento)
});

/** Segna quale pannello ha il focus (per il bordo-accento). */
export function setFocusPanel(p: FocusPanel) {
  layout.focusPanel = p;
}

const SIDEBAR_MIN = 180;
const SIDEBAR_MAX = 560;
const TERMINAL_MIN = 280;
const TERMINAL_MAX = 1000;

/** Click su una voce della top bar: seleziona la vista o, se già attiva, chiude la sidebar. */
export function selectView(view: SidebarView) {
  if (layout.sidebarVisible && layout.sidebarView === view) {
    layout.sidebarVisible = false;
  } else {
    layout.sidebarView = view;
    layout.sidebarVisible = true;
  }
}

export function toggleSidebar() {
  layout.sidebarVisible = !layout.sidebarVisible;
}

export function toggleTerminal() {
  layout.terminalVisible = !layout.terminalVisible;
}

/** Lo splitter della sidebar è alla sua destra: trascinare a destra allarga. */
export function resizeSidebar(delta: number) {
  layout.sidebarWidth = clamp(layout.sidebarWidth + delta, SIDEBAR_MIN, SIDEBAR_MAX);
}

/** Il terminale è a destra, con lo splitter alla sua sinistra: trascinare a sinistra lo allarga. */
export function resizeTerminal(delta: number) {
  layout.terminalWidth = clamp(layout.terminalWidth - delta, TERMINAL_MIN, TERMINAL_MAX);
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
