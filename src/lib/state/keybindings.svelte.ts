// Registro CENTRALE delle scorciatoie di Orbit: fonte unica per il dispatch (App.svelte) e per il
// riepilogo in Impostazioni. Ogni comando ha un tasto per preset (Orbit / Visual Studio / IntelliJ);
// il preset attivo è `settings.keymap`. Niente dipendenze: il matcher confronta il KeyboardEvent.
import { settings, type KeymapName } from "./settings.svelte";

export type CommandId =
  | "quickOpen"
  | "workspaceSymbols"
  | "fileSymbols"
  | "goToDefinition"
  | "navBack"
  | "navForward"
  | "nextRepo"
  | "prevRepo"
  | "save"
  | "openFolder"
  | "toggleSidebar"
  | "toggleTerminal";

export interface Command {
  id: CommandId;
  label: string;
  category: string;
  keys: Record<KeymapName, string>; // tasto per ciascun preset (formato "Ctrl+Shift+O", "F12", "Alt+ArrowLeft")
}

// I tasti usano solo combinazioni "matchabili" via KeyboardEvent (niente simboli che cambiano con
// Shift): lettere, cifre, F-key e frecce. "Ctrl" matcha anche Cmd (Mac).
export const COMMANDS: Command[] = [
  { id: "quickOpen", label: "Quick open file", category: "Navigation", keys: { orbit: "Ctrl+P", vs: "Ctrl+,", intellij: "Ctrl+Shift+N" } },
  { id: "workspaceSymbols", label: "Project symbols", category: "Navigation", keys: { orbit: "Ctrl+T", vs: "Ctrl+T", intellij: "Ctrl+Alt+Shift+N" } },
  { id: "fileSymbols", label: "Go to symbol in file", category: "Navigation", keys: { orbit: "Ctrl+Shift+O", vs: "Ctrl+Shift+O", intellij: "Ctrl+F12" } },
  { id: "goToDefinition", label: "Go to definition", category: "Navigation", keys: { orbit: "F12", vs: "F12", intellij: "Ctrl+B" } },
  { id: "navBack", label: "Navigate back", category: "Navigation", keys: { orbit: "Alt+ArrowLeft", vs: "Alt+ArrowLeft", intellij: "Ctrl+Alt+ArrowLeft" } },
  { id: "navForward", label: "Navigate forward", category: "Navigation", keys: { orbit: "Alt+ArrowRight", vs: "Alt+ArrowRight", intellij: "Ctrl+Alt+ArrowRight" } },
  { id: "nextRepo", label: "Next repository", category: "Navigation", keys: { orbit: "Ctrl+Tab", vs: "Ctrl+Tab", intellij: "Ctrl+Tab" } },
  { id: "prevRepo", label: "Previous repository", category: "Navigation", keys: { orbit: "Ctrl+Shift+Tab", vs: "Ctrl+Shift+Tab", intellij: "Ctrl+Shift+Tab" } },
  { id: "save", label: "Save file", category: "File", keys: { orbit: "Ctrl+S", vs: "Ctrl+S", intellij: "Ctrl+S" } },
  { id: "openFolder", label: "Open folder", category: "File", keys: { orbit: "Ctrl+K", vs: "Ctrl+K", intellij: "Ctrl+K" } },
  { id: "toggleSidebar", label: "Toggle sidebar", category: "View", keys: { orbit: "Ctrl+B", vs: "Ctrl+B", intellij: "Alt+1" } },
  { id: "toggleTerminal", label: "Toggle terminal", category: "View", keys: { orbit: "Ctrl+`", vs: "Ctrl+`", intellij: "Alt+F12" } },
];

// Scorciatoie FISSE (non configurabili): editor / mouse. Solo per il riepilogo.
export const FIXED: { label: string; key: string; category: string }[] = [
  { label: "Find / replace (in editor)", key: "Ctrl+F", category: "Editor" },
  { label: "Undo", key: "Ctrl+Z", category: "Editor" },
  { label: "Redo", key: "Ctrl+Y", category: "Editor" },
  { label: "Go to definition (mouse)", key: "Ctrl+Click", category: "Editor" },
  { label: "Zoom font", key: "Ctrl+Wheel", category: "Editor" },
  { label: "Switch to repository 1–9", key: "Ctrl+1…9", category: "Navigation" },
];

/** Tasto attivo (preset corrente) per un comando. */
export function keyFor(cmd: Command): string {
  return cmd.keys[settings.keymap];
}

/** Comando il cui tasto (preset attivo) corrisponde all'evento, o null. */
export function matchCommand(e: KeyboardEvent): CommandId | null {
  for (const c of COMMANDS) {
    if (eventMatches(e, c.keys[settings.keymap])) return c.id;
  }
  return null;
}

function eventMatches(e: KeyboardEvent, key: string): boolean {
  if (!key) return false;
  const parts = key.split("+");
  const main = parts[parts.length - 1].toLowerCase();
  const mods = parts.slice(0, -1).map((m) => m.toLowerCase());
  // "Ctrl" matcha ctrl OPPURE meta (Cmd su Mac)
  if (mods.includes("ctrl") !== (e.ctrlKey || e.metaKey)) return false;
  if (mods.includes("shift") !== e.shiftKey) return false;
  if (mods.includes("alt") !== e.altKey) return false;
  return e.key.toLowerCase() === main;
}

/** Formato leggibile per il riepilogo (frecce come simboli). */
export function formatKey(key: string): string {
  return key
    .replace("ArrowLeft", "←")
    .replace("ArrowRight", "→")
    .replace("ArrowUp", "↑")
    .replace("ArrowDown", "↓");
}

// Pannello "Keyboard shortcuts" (aperto da Impostazioni con un click, così non sporca i Settings).
export const shortcutsUI = $state({ open: false });
export function openShortcuts() {
  shortcutsUI.open = true;
}
export function closeShortcuts() {
  shortcutsUI.open = false;
}

/** Comandi (configurabili) + fissi, raggruppati per categoria, col tasto attivo — per il pannello. */
export function shortcutGroups(): { category: string; items: { label: string; key: string }[] }[] {
  const groups = new Map<string, { label: string; key: string }[]>();
  const add = (category: string, label: string, key: string) => {
    if (!groups.has(category)) groups.set(category, []);
    groups.get(category)!.push({ label, key: formatKey(key) });
  };
  for (const c of COMMANDS) add(c.category, c.label, keyFor(c));
  for (const f of FIXED) add(f.category, f.label, f.key);
  return [...groups.entries()].map(([category, items]) => ({ category, items }));
}
