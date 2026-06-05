// Integrazione con Claude Code. Apre Claude in una tab del terminale (nella radice del
// progetto) e offre "scorciatoie": prompt predefiniti lanciati come `claude "<prompt>"`.
// Comando, flag e scorciatoie vivono in `.orbit/claude.json` (committato, modificabile
// anche da Claude stesso): l'IDE documenta il formato in CLAUDE.md. Claude parte sempre
// INTERATTIVO nel terminale, così l'utente supervisiona (cruciale per commit/push).
import { workspace, openFile } from "./workspace.svelte";
import { addTerminal } from "./terminals.svelte";
import { layout } from "./layout.svelte";
import { readOrbitJson, ensureOrbitFile, teachClaudeSection } from "./dotorbit";

export interface ClaudeShortcut {
  name: string;
  prompt: string;
  icon?: string;
}

// Scorciatoie di default (usate se manca `.orbit/claude.json`). Prompt su una sola riga.
const DEFAULT_SHORTCUTS: ClaudeShortcut[] = [
  {
    name: "Aggiorna documentazione",
    icon: "book-open",
    prompt:
      "Rileggi il progetto e aggiorna la documentazione (README, la cartella docs/, ed eventuali NOTES e CLAUDE.md) per allinearla allo stato attuale del codice. Mantieni stile e struttura esistenti, cambia solo ciò che è obsoleto o mancante, e alla fine elencami le modifiche fatte.",
  },
  {
    name: "Recupera contesto progetto",
    icon: "search",
    prompt:
      "Studia questo progetto per costruirti un quadro completo: struttura delle cartelle, stack e dipendenze, punti di ingresso, come si builda/testa/avvia, e le convenzioni principali. Non modificare nessun file: riassumimi cos'è il progetto e com'è organizzato.",
  },
  {
    name: "Commit & push (con revisione)",
    icon: "git-commit",
    prompt:
      "Esamina tutte le modifiche correnti con git status e git diff. Dimmi cosa conviene tenere e cosa scartare, raggruppa le modifiche correlate e proponimi messaggi di commit chiari. Procedi con i commit solo dopo la mia conferma e non fare push finché non te lo approvo esplicitamente.",
  },
];

export const claude = $state({
  command: "claude", // come si invoca la CLI
  args: "", // flag liberi (es. "--model opus"); future-proof se i settings cambiano
  shortcuts: [...DEFAULT_SHORTCUTS] as ClaudeShortcut[],
  loaded: false, // true se `.orbit/claude.json` esiste ed è valido
});

/** Legge `.orbit/claude.json`; se assente/invalido usa i default (menu sempre funzionante). */
export async function loadClaudeConfig() {
  const data = await readOrbitJson<{ command?: unknown; args?: unknown; shortcuts?: unknown }>(
    "claude.json",
  );
  if (!data) {
    resetDefaults();
    return;
  }
  claude.command =
    typeof data.command === "string" && data.command.trim() ? data.command.trim() : "claude";
  claude.args = typeof data.args === "string" ? data.args : "";
  claude.shortcuts = Array.isArray(data.shortcuts)
    ? data.shortcuts
        .filter((s: any) => s && typeof s.name === "string" && typeof s.prompt === "string")
        .map((s: any) => ({
          name: s.name,
          prompt: s.prompt,
          icon: typeof s.icon === "string" ? s.icon : undefined,
        }))
    : [...DEFAULT_SHORTCUTS];
  claude.loaded = true;
}

function resetDefaults() {
  claude.command = "claude";
  claude.args = "";
  claude.shortcuts = [...DEFAULT_SHORTCUTS];
  claude.loaded = false;
}

/** Prompt → argomento shell sicuro: una riga, niente virgolette doppie interne. */
function quotePrompt(prompt: string): string {
  return prompt.replace(/"/g, "'").replace(/\s+/g, " ").trim();
}

/** Costruisce la riga di comando: `claude <args>` (+ `"<prompt>"` se presente). */
function buildCommand(prompt?: string): string {
  const cmd = claude.command.trim() || "claude";
  const base = [cmd, claude.args.trim()].filter(Boolean).join(" ");
  return prompt ? `${base} "${quotePrompt(prompt)}"` : base;
}

/** Apre una tab del terminale nella radice del progetto e avvia Claude (interattivo). */
export function launchClaude(prompt?: string, title = "Claude") {
  const root = workspace.rootPath;
  if (!root) return;
  layout.terminalVisible = true;
  addTerminal({ title, cwd: root, initCommand: buildCommand(prompt) });
}

export function runShortcut(s: ClaudeShortcut) {
  launchClaude(s.prompt, `Claude · ${s.name}`);
}

/** Riprende una sessione Claude esistente in una tab del terminale (`claude --resume <id>`). */
export function resumeClaude(id: string) {
  const root = workspace.rootPath;
  if (!root || !/^[A-Za-z0-9-]+$/.test(id)) return; // id sessione = UUID: niente injection
  layout.terminalVisible = true;
  addTerminal({ title: "Claude · resume", cwd: root, initCommand: `${buildCommand()} --resume ${id}` });
}

const TEMPLATE = JSON.stringify(
  { command: "claude", args: "", shortcuts: DEFAULT_SHORTCUTS },
  null,
  2,
) + "\n";

/** Crea/apre `.orbit/claude.json` nell'editor per la modifica manuale. */
export async function openClaudeConfig() {
  const p = await ensureOrbitFile("claude.json", TEMPLATE);
  await loadClaudeConfig();
  if (p) void openFile(p);
}

const CLAUDE_SECTION = [
  "<!-- orbit:claude-config -->",
  "## Integrazione Claude (Orbit)",
  "",
  'Orbit mostra un menu **Claude** con cui aprire Claude Code in una tab del terminale',
  "(nella radice del progetto) e lanciare *scorciatoie*: prompt predefiniti avviati come",
  "`claude \"<prompt>\"`. Comando, flag e scorciatoie vivono in `.orbit/claude.json`:",
  "",
  "```json",
  "{",
  '  "command": "claude",',
  '  "args": "",',
  '  "shortcuts": [',
  '    { "name": "Aggiorna documentazione", "icon": "book-open", "prompt": "Rileggi il progetto e aggiorna README e docs/…" },',
  '    { "name": "Esegui i test e correggi", "icon": "play", "prompt": "Esegui la suite di test e sistema i fallimenti, spiegandomi le cause." }',
  "  ]",
  "}",
  "```",
  "",
  "- `command`: come invocare la CLI di Claude (default `claude`).",
  '- `args`: flag liberi passati a Claude (es. `--model opus`); opzionale.',
  "- `shortcuts[].name`: etichetta nel menu Claude.",
  "- `shortcuts[].prompt`: prompt iniziale (una riga), passato a `claude` come argomento.",
  '- `shortcuts[].icon` (opzionale): nome icona (es. `doc`, `search`, `git-commit`, `play`).',
  "",
  "Quando l'utente chiede una scorciatoia per un compito ricorrente (aggiornare i docs,",
  "lanciare i test, fare release…), aggiungi una voce a `.orbit/claude.json`: Orbit ricarica",
  "il menu automaticamente.",
  "",
].join("\n");

/** Documenta il formato in CLAUDE.md (così Claude sa creare/modificare le scorciatoie). */
export async function teachClaudeConfig() {
  if (!workspace.rootPath) return;
  await ensureOrbitFile("claude.json", TEMPLATE);
  await loadClaudeConfig();
  await teachClaudeSection("orbit:claude-config", CLAUDE_SECTION);
}
