// Registro CENTRALE delle scorciatoie di Orbit: fonte unica per il dispatch (App.svelte) e per il
// riepilogo in Impostazioni. Ogni comando ha un tasto per preset (Orbit / Visual Studio / IntelliJ);
// il preset attivo è `settings.keymap`. Niente dipendenze: il matcher confronta il KeyboardEvent.
import { settings, type KeymapBase } from "./settings.svelte";

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
  keys: Record<KeymapBase, string>; // tasto per ciascun preset BASE (formato "Ctrl+Shift+O", "F12", "Alt+ArrowLeft")
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

/** Tasto attivo per un comando: dal preset "custom" se attivo (fallback Orbit), altrimenti dalla base. */
function activeKey(cmd: Command): string {
  const km = settings.keymap;
  if (km === "custom") return settings.customKeys?.[cmd.id] ?? cmd.keys.orbit;
  return cmd.keys[km];
}

/** Tasto attivo (preset corrente) per un comando. */
export function keyFor(cmd: Command): string {
  return activeKey(cmd);
}

/** Tasto attivo, già formattato (frecce come simboli), per un id comando — per i tooltip. */
export function keyForId(id: CommandId): string {
  const c = COMMANDS.find((x) => x.id === id);
  return c ? formatKey(activeKey(c)) : "";
}

/** Comando il cui tasto (preset attivo) corrisponde all'evento, o null. */
export function matchCommand(e: KeyboardEvent): CommandId | null {
  for (const c of COMMANDS) {
    if (eventMatches(e, activeKey(c))) return c.id;
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

// ---- riepilogo + preset "Custom" --------------------------------------------------------------

export interface ShortcutRow {
  id?: CommandId; // presente solo per i comandi configurabili (ribindabili in modalità custom)
  label: string;
  key: string; // tasto grezzo ("Ctrl+Shift+O") — il pannello applica formatKey per la resa
}

/** Comandi (configurabili) + fissi, raggruppati per categoria, col tasto attivo — per il pannello. */
export function mergedGroups(): { category: string; items: ShortcutRow[] }[] {
  const groups = new Map<string, ShortcutRow[]>();
  const add = (category: string, row: ShortcutRow) => {
    if (!groups.has(category)) groups.set(category, []);
    groups.get(category)!.push(row);
  };
  for (const c of COMMANDS) add(c.category, { id: c.id, label: c.label, key: activeKey(c) });
  for (const f of FIXED) add(f.category, { label: f.label, key: f.key });
  return [...groups.entries()].map(([category, items]) => ({ category, items }));
}

/** True se esiste una mappa "Custom" (creata dall'utente). */
export function hasCustom(): boolean {
  return settings.customKeys != null;
}

/** Crea (o ricrea) la mappa "Custom" copiando un preset base, e la attiva. */
export function createCustom(base: KeymapBase) {
  const map: Record<string, string> = {};
  for (const c of COMMANDS) map[c.id] = c.keys[base];
  settings.customKeys = map;
  settings.keymap = "custom";
}

/** Elimina la mappa Custom e torna a un preset base. */
export function deleteCustom(base: KeymapBase = "orbit") {
  settings.customKeys = null;
  settings.keymap = base;
}

/** Riassegna il tasto di un comando nel preset Custom (lo crea da Orbit se mancante). */
export function setCustomKey(id: CommandId, key: string) {
  const map: Record<string, string> = { ...(settings.customKeys ?? {}) };
  if (!settings.customKeys) for (const c of COMMANDS) map[c.id] = c.keys.orbit;
  map[id] = key;
  settings.customKeys = map;
}

/** Tasti (normalizzati) usati da più di un comando nel preset attivo → per evidenziare i conflitti. */
export function conflictKeys(): Set<string> {
  const count = new Map<string, number>();
  for (const c of COMMANDS) {
    const k = activeKey(c).toLowerCase();
    count.set(k, (count.get(k) ?? 0) + 1);
  }
  const dup = new Set<string>();
  for (const [k, n] of count) if (n > 1) dup.add(k);
  return dup;
}

/**
 * Costruisce la stringa-tasto ("Ctrl+Shift+O") da un KeyboardEvent durante il rebinding.
 * Ritorna null se l'evento non è (ancora) una scorciatoia valida: solo modificatori, spazio, o un
 * tasto "nudo" che non sia una F-key/freccia (eviterebbe di rompere la digitazione normale).
 */
export function keyStringFromEvent(e: KeyboardEvent): string | null {
  const k = e.key;
  if (k === "Control" || k === "Shift" || k === "Alt" || k === "Meta" || k === " ") return null;
  const parts: string[] = [];
  if (e.ctrlKey || e.metaKey) parts.push("Ctrl");
  if (e.shiftKey) parts.push("Shift");
  if (e.altKey) parts.push("Alt");
  const main = k.length === 1 ? k.toUpperCase() : k; // "a"→"A", "1"→"1"; "ArrowLeft"/"F12" invariati
  const bareOk = /^F\d{1,2}$/.test(main) || main.startsWith("Arrow");
  if (parts.length === 0 && !bareOk) return null; // tasto nudo non-funzione: rifiuta
  parts.push(main);
  return parts.join("+");
}
