// Stato reattivo del layout della shell (Svelte 5 runes in modulo .svelte.ts).
// Fonte unica di verità per visibilità e dimensioni dei pannelli.

export type SidebarView = "explorer" | "git" | "search";

export const layout = $state({
  sidebarView: "explorer" as SidebarView,
  sidebarVisible: true,
  sidebarWidth: 264,
  terminalVisible: true,
  terminalHeight: 240,
});

const SIDEBAR_MIN = 180;
const SIDEBAR_MAX = 560;
const TERMINAL_MIN = 96;
const TERMINAL_MAX = 760;

/** Click su un'icona della activity bar: seleziona la vista o, se già attiva, chiude la sidebar. */
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

/** Lo splitter del terminale è sopra di esso: trascinare in su (delta negativo) alza il terminale. */
export function resizeTerminal(delta: number) {
  layout.terminalHeight = clamp(layout.terminalHeight - delta, TERMINAL_MIN, TERMINAL_MAX);
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
