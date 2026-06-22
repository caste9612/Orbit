// Configurazioni di esecuzione ("Esegui ▶", stile IntelliJ). Le config vivono in
// `.orbit/run.json` (create/modificate da Claude Code) e si lanciano in una tab del
// terminale. L'IDE documenta il formato in CLAUDE.md così Claude sa come crearle.
import { workspace, openFile } from "./workspace.svelte";
import { addTerminal } from "./terminals.svelte";
import { layout } from "./layout.svelte";
import { basename, dirname, joinPath, runCommand } from "../util";
import { readOrbitConfig, ensureOrbitFile, teachClaudeSection } from "./dotorbit";
import { notify } from "./toast.svelte";

export interface RunConfig {
  name: string;
  command: string;
  cwd?: string;
}

export const run = $state({
  configs: [] as RunConfig[],
  loaded: false, // true se `.orbit/run.json` esiste ed è valido
});

let runInvalid = false; // per non ripetere il toast a ogni fs-changed finché il file resta rotto

/** Legge `.orbit/run.json` e aggiorna l'elenco. Avvisa se il JSON è rotto (senza svuotare il menu). */
export async function loadRunConfig() {
  const { data, status } = await readOrbitConfig<{ configurations?: unknown }>("run.json");
  if (status === "invalid") {
    if (!runInvalid) notify("`.orbit/run.json`: JSON non valido — menu Esegui invariato", "error", 3500);
    runInvalid = true;
    return; // tieni le config correnti: meglio del menu vuoto
  }
  runInvalid = false;
  if (status === "absent" || !data) {
    run.configs = [];
    run.loaded = false;
    return;
  }
  const arr = Array.isArray(data.configurations) ? data.configurations : [];
  run.configs = arr
    .filter((c: any) => c && typeof c.name === "string" && typeof c.command === "string")
    .map((c: any) => ({
      name: c.name,
      command: c.command,
      cwd: typeof c.cwd === "string" ? c.cwd : undefined,
    }));
  run.loaded = true;
}

/** Lancia una configurazione in una nuova tab del terminale. */
export function runConfig(cfg: RunConfig) {
  const root = workspace.rootPath;
  if (!root) return;
  const cwd = cfg.cwd && cfg.cwd !== "." ? joinPath(root, cfg.cwd) : root;
  layout.terminalVisible = true;
  addTerminal({ title: cfg.name, initCommand: cfg.command, cwd });
}

/** Esegue uno script (.ps1/.cmd/.bat/.sh/.bash) in una nuova tab del terminale, nella sua cartella. */
export function runFile(path: string) {
  const cmd = runCommand(basename(path));
  if (!cmd) return;
  layout.terminalVisible = true;
  addTerminal({ title: `▶ ${basename(path)}`, cwd: dirname(path), initCommand: cmd });
}

/** True se il file è uno script eseguibile da Orbit (per mostrare l'azione Run). */
export function isRunnable(name: string): boolean {
  return runCommand(name) !== null;
}

const TEMPLATE = `{
  "configurations": [
  ]
}
`;

/** Crea/apre `.orbit/run.json` nell'editor per la modifica manuale. */
export async function openConfig() {
  const p = await ensureOrbitFile("run.json", TEMPLATE);
  await loadRunConfig();
  if (p) void openFile(p);
}

const CLAUDE_SECTION = [
  "<!-- orbit:run-config -->",
  "## Configurazioni di esecuzione (Orbit)",
  "",
  "Orbit (l'IDE) mostra un menu **Esegui ▶** con i comandi definiti in `.orbit/run.json`.",
  "Per aggiungere un comando lanciabile con un click, aggiungi una voce a quel file:",
  "",
  "```json",
  "{",
  '  "configurations": [',
  '    { "name": "Dev", "command": "npm run dev", "cwd": "." },',
  '    { "name": "Test", "command": "cargo test", "cwd": "src-tauri" }',
  "  ]",
  "}",
  "```",
  "",
  "- `name`: etichetta mostrata nel menu Esegui.",
  "- `command`: comando shell, eseguito in una tab del terminale di Orbit.",
  '- `cwd` (opzionale): cartella di lavoro relativa alla radice del progetto (default ".").',
  "",
  "Quando l'utente chiede un modo per avviare/buildare/testare qualcosa, aggiungi o aggiorna",
  "una voce in `.orbit/run.json`: Orbit ricarica il menu automaticamente.",
  "",
].join("\n");

/** Documenta il formato in CLAUDE.md (così Claude Code sa creare le run config). */
export async function teachClaude() {
  if (!workspace.rootPath) return;
  await ensureOrbitFile("run.json", TEMPLATE);
  await loadRunConfig();
  await teachClaudeSection("orbit:run-config", CLAUDE_SECTION);
}
