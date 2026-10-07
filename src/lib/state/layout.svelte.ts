// Stato reattivo del layout della shell (Svelte 5 runes in modulo .svelte.ts).
// Fonte unica di verità per visibilità e dimensioni dei pannelli.
import { settings, MOTION_BASE_MS } from "./settings.svelte";

export type SidebarView = "explorer" | "git" | "search" | "docs" | "activity";
export type FocusPanel = "sidebar" | "editor" | "terminal";

export const layout = $state({
  sidebarView: "explorer" as SidebarView,
  sidebarVisible: true,
  sidebarWidth: 260,
  terminalVisible: true,
  terminalWidth: 440, // il terminale è docked a destra
  focusPanel: "editor" as FocusPanel, // pannello con focus (bordo-accento)
  // area editor senza tab → stretta alla larghezza minima, il pannello terminale si prende il resto.
  // Derivato a runtime (effetto in App.svelte), NON persistito: `terminalWidth` resta quello scelto.
  editorCollapsed: false,
  // Chat affiancate (M54), persistito in sessione: pannello terminale a tutta larghezza (l'editor
  // resta montato ma nascosto). La disposizione dei riquadri è per repo, in terminals.svelte.ts.
  terminalMaximized: false,
  // Movimento fluido (M56): true per ~motionMs() dopo un cambio PROGRAMMATICO del layout della shell
  // (cambio repo, collasso dell'editor, pannello massimizzato, pannelli mostrati/nascosti): i componenti
  // accendono le transition CSS sulle larghezze. Il trascinamento degli splitter NON lo accende: deve
  // seguire il mouse. (I riquadri del pannello terminale animano sempre, salvo `still`: TerminalPanel.)
  animating: false,
});

// ---- movimento fluido ------------------------------------------------------------------------
/** Durata delle transizioni di layout: MOTION_BASE_MS con l'impostazione "Smooth panel transitions"
 *  accesa, 0 se spenta (stesso valore che applySettings scrive in `--motion-ms`). */
export function motionMs(): number {
  return settings.motion ? MOTION_BASE_MS : 0;
}
let motionTimer: ReturnType<typeof setTimeout> | undefined;
let motionDepth = 0;
let motionEnd = 0;

/** Istante (performance.now) in cui finisce la transizione in corso; 0 = nessuna. I terminali lo usano
 *  per rifittare xterm UNA volta alla fine invece che a ogni frame (ogni fit = pty_resize = ridisegno
 *  dei programmi TUI). Vale MAX finché una transizione è aperta e non ancora chiusa con `end()`. */
export function motionUntil(): number {
  return motionEnd;
}

/** Apre una transizione del layout e ritorna `end()`, da chiamare quando lo stato è tutto applicato:
 *  da lì la transizione CSS dura motionMs(). Tra begin ed end (anche attraverso `await`) i fit dei
 *  terminali restano sospesi. Chiamate annidate si fondono: chiude l'ultima. `kind` "panes" (riquadri
 *  del pannello terminale) non tocca `layout.animating`: serve solo a differire i fit di xterm. */
export function beginMotion(kind: "shell" | "panes" = "shell"): () => void {
  if (kind === "shell") layout.animating = true;
  if (motionTimer) clearTimeout(motionTimer);
  motionDepth++;
  motionEnd = Number.MAX_SAFE_INTEGER;
  let done = false;
  return () => {
    if (done) return;
    done = true;
    motionDepth = Math.max(0, motionDepth - 1);
    if (motionDepth > 0) return;
    const ms = motionMs();
    motionEnd = performance.now() + ms;
    if (motionTimer) clearTimeout(motionTimer);
    motionTimer = setTimeout(() => {
      layout.animating = false;
      motionEnd = 0;
    }, ms + 60);
  };
}

/** Modifica sincrona animata: `fn` cambia lo stato e la transizione parte subito. */
export function animate(fn: () => void, kind: "shell" | "panes" = "shell") {
  const end = beginMotion(kind);
  try {
    fn();
  } finally {
    end();
  }
}

export function toggleTerminalMaximized() {
  animate(() => {
    layout.terminalMaximized = !layout.terminalMaximized;
    if (layout.terminalMaximized) layout.terminalVisible = true;
  });
}

/** Segna quale pannello ha il focus (per il bordo-accento). */
export function setFocusPanel(p: FocusPanel) {
  layout.focusPanel = p;
}

const SIDEBAR_MIN = 180;
const SIDEBAR_MAX = 560;
const TERMINAL_MIN = 280;
const TERMINAL_MAX = 2400; // tetto generoso: l'editor mantiene comunque il suo min-width

/** Click su una voce della top bar: seleziona la vista o, se già attiva, chiude la sidebar. */
export function selectView(view: SidebarView) {
  if (layout.sidebarVisible && layout.sidebarView === view) {
    animate(() => (layout.sidebarVisible = false));
  } else {
    layout.sidebarView = view;
    if (!layout.sidebarVisible) animate(() => (layout.sidebarVisible = true));
  }
}

export function toggleSidebar() {
  animate(() => (layout.sidebarVisible = !layout.sidebarVisible));
}

export function toggleTerminal() {
  animate(() => (layout.terminalVisible = !layout.terminalVisible));
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
