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

// Wrapper: template di prompt con segnaposto `{{input}}` dove finisce ciò che scrivi tu.
// Si compone nel composer e si copia negli appunti (poi lo incolli in Claude).
export interface ClaudeWrapper {
  name: string;
  template: string;
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

// Wrapper di default (usato se manca `.orbit/claude.json`). Template con `{{input}}`, multiriga ok.
const DEFAULT_WRAPPERS: ClaudeWrapper[] = [
  {
    name: "Analizza log di test",
    icon: "search",
    template:
      "Il team di test ci ha appena inviato una nuova cartella di log di una sessione di test.\n" +
      "Analizza con cura il contenuto della cartella, ricordati di decomprimere anche eventuali altre cartelle zippate che potrebbero contenere log ulteriori.\n" +
      "Cerchiamo di ricostruire quello che è successo da quello che dice il team di test, senza prenderlo per vero in modo assoluto, e dai log.\n\n{{input}}",
  },
];

export const claude = $state({
  command: "claude", // come si invoca la CLI
  args: "", // flag liberi (es. "--model opus"); future-proof se i settings cambiano
  shortcuts: [...DEFAULT_SHORTCUTS] as ClaudeShortcut[],
  wrappers: [...DEFAULT_WRAPPERS] as ClaudeWrapper[],
  loaded: false, // true se `.orbit/claude.json` esiste ed è valido
});

// Stato del composer dei wrapper (aperto dal menu Claude: scrivi → copia negli appunti).
export const wrapperUI = $state({ open: false, wrapper: null as ClaudeWrapper | null });

/** Legge `.orbit/claude.json`; se assente/invalido usa i default (menu sempre funzionante). */
export async function loadClaudeConfig() {
  const data = await readOrbitJson<{
    command?: unknown;
    args?: unknown;
    shortcuts?: unknown;
    wrappers?: unknown;
  }>("claude.json");
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
  claude.wrappers = Array.isArray(data.wrappers)
    ? data.wrappers
        .filter((w: any) => w && typeof w.name === "string" && typeof w.template === "string")
        .map((w: any) => ({
          name: w.name,
          template: w.template,
          icon: typeof w.icon === "string" ? w.icon : undefined,
        }))
    : [...DEFAULT_WRAPPERS];
  claude.loaded = true;
}

function resetDefaults() {
  claude.command = "claude";
  claude.args = "";
  claude.shortcuts = [...DEFAULT_SHORTCUTS];
  claude.wrappers = [...DEFAULT_WRAPPERS];
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

/** Sostituisce `{{input}}` nel template col testo dell'utente (se assente, lo accoda). */
export function composeWrapper(template: string, input: string): string {
  return template.includes("{{input}}")
    ? template.split("{{input}}").join(input)
    : `${template.trimEnd()}\n\n${input}`;
}
export function openWrapper(w: ClaudeWrapper) {
  wrapperUI.wrapper = w;
  wrapperUI.open = true;
}
export function closeWrapper() {
  wrapperUI.open = false;
}

/** Riprende una sessione Claude esistente in una tab del terminale (`claude --resume <id>`). */
export function resumeClaude(id: string) {
  const root = workspace.rootPath;
  if (!root || !/^[A-Za-z0-9-]+$/.test(id)) return; // id sessione = UUID: niente injection
  layout.terminalVisible = true;
  addTerminal({ title: "Claude · resume", cwd: root, initCommand: `${buildCommand()} --resume ${id}` });
}

const TEMPLATE = JSON.stringify(
  { command: "claude", args: "", shortcuts: DEFAULT_SHORTCUTS, wrappers: DEFAULT_WRAPPERS },
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
  "## Orbit — IDE e integrazione Claude",
  "",
  "Stai lavorando dentro **Orbit**, un IDE leggero (Tauri + Svelte) companion di Claude Code. Questa",
  "sezione — generata da Orbit (menu Claude → *Update CLAUDE.md for Claude*) — riassume cosa offre",
  "l'IDE e come configurarlo.",
  "",
  "### Menu Claude",
  "Apre `claude` nella radice del progetto e offre: *scorciatoie* (prompt fissi), *wrapper* (template",
  "con segnaposto `{{input}}`: scrivi il testo, lo componi e lo **copi negli appunti**) e le *chat*",
  "recenti del progetto (riprese con `claude --resume`). Tutto vive in `.orbit/claude.json`:",
  "",
  "```json",
  "{",
  '  "command": "claude",',
  '  "args": "",',
  '  "shortcuts": [',
  '    { "name": "Aggiorna documentazione", "icon": "book-open", "prompt": "Rileggi il progetto e aggiorna README e docs/…" }',
  "  ],",
  '  "wrappers": [',
  '    { "name": "Revisione codice", "icon": "search", "template": "Rivedi e segnala bug e migliorie:\\n\\n{{input}}" }',
  "  ]",
  "}",
  "```",
  "",
  "- `command` / `args`: come invocare la CLI (default `claude`) e flag liberi (es. `--model opus`).",
  "- `shortcuts[]`: `name` (etichetta nel menu), `prompt` (una riga, passato a `claude`), `icon` opz.",
  "- `wrappers[]`: `name`, `icon`, `template` con `{{input}}` (se manca, il testo va in coda); il",
  "  `template` può essere multiriga e il risultato composto si copia negli appunti.",
  "",
  "Quando l'utente chiede una scorciatoia o un wrapper per un compito ricorrente, aggiungi una voce",
  "a `.orbit/claude.json`: Orbit ricarica il menu automaticamente.",
  "",
  "### Cosa offre Orbit (per orientarti)",
  "- **Editor** multi-file con *split view*; *Vai al simbolo* (Ctrl/Cmd+Shift+O); anteprima Markdown;",
  "  viewer inline per **immagini e PDF**; si trascinano file da Esplora risorse per aprirli.",
  "- **Terminale** integrato (più tab, scelta shell) con **finestre flottanti** multiple; i percorsi",
  "  nell'output sono cliccabili (anche relativi).",
  "- **Git** locale: stato, diff, stage/unstage, commit, branch, cronologia, indicatore *ahead/behind*;",
  "  fetch/pull/push/merge girano nel terminale (riusano la tua autenticazione git).",
  "- **Esegui ▶**: comandi da `.orbit/run.json` (vedi la sezione dedicata).",
  "- **Scratchpad** (📝): `.orbit/scratch.md`, appunti/prompt persistenti.",
  "- **Scaffale**: cartelle messe da parte per categoria in `.orbit/shelf.json`.",
  "- Menu contestuali (editor e albero), decorazioni git nell'albero, vista **Docs** dei Markdown.",
  "",
  "### File `.orbit/` (committati e modificabili)",
  "- `run.json` — comandi del menu Esegui.",
  "- `claude.json` — comando, scorciatoie e wrapper Claude (sopra).",
  "- `shelf.json` — cartelle nello scaffale (preferenza personale, git-ignored).",
  "<!-- /orbit:claude-config -->",
  "",
].join("\n");

/** Documenta il formato in CLAUDE.md (così Claude sa creare/modificare le scorciatoie). */
export async function teachClaudeConfig() {
  if (!workspace.rootPath) return;
  await ensureOrbitFile("claude.json", TEMPLATE);
  await loadClaudeConfig();
  await teachClaudeSection("orbit:claude-config", CLAUDE_SECTION);
}
