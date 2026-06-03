// Configurazioni di esecuzione ("Esegui ▶", stile IntelliJ). Le config vivono in
// `.orbit/run.json` (create/modificate da Claude Code) e si lanciano in una tab del
// terminale. L'IDE documenta il formato in CLAUDE.md così Claude sa come crearle.
import { invoke } from "@tauri-apps/api/core";
import { workspace, openFile } from "./workspace.svelte";
import { addTerminal } from "./terminals.svelte";
import { layout } from "./layout.svelte";
import { joinPath } from "../util";

export interface RunConfig {
  name: string;
  command: string;
  cwd?: string;
}

export const run = $state({
  configs: [] as RunConfig[],
  loaded: false, // true se `.orbit/run.json` esiste ed è valido
});

function configPath(): string | null {
  return workspace.rootPath ? joinPath(joinPath(workspace.rootPath, ".orbit"), "run.json") : null;
}

/** Legge `.orbit/run.json` e aggiorna l'elenco (no-op se assente/invalido). */
export async function loadRunConfig() {
  const p = configPath();
  if (!p) {
    run.configs = [];
    run.loaded = false;
    return;
  }
  try {
    const raw = await invoke<string>("read_file", { path: p });
    const data = JSON.parse(raw);
    const arr = Array.isArray(data?.configurations) ? data.configurations : [];
    run.configs = arr
      .filter((c: any) => c && typeof c.name === "string" && typeof c.command === "string")
      .map((c: any) => ({
        name: c.name,
        command: c.command,
        cwd: typeof c.cwd === "string" ? c.cwd : undefined,
      }));
    run.loaded = true;
  } catch {
    run.configs = [];
    run.loaded = false;
  }
}

/** Lancia una configurazione in una nuova tab del terminale. */
export function runConfig(cfg: RunConfig) {
  const root = workspace.rootPath;
  if (!root) return;
  const cwd = cfg.cwd && cfg.cwd !== "." ? joinPath(root, cfg.cwd) : root;
  layout.terminalVisible = true;
  addTerminal({ title: cfg.name, initCommand: cfg.command, cwd });
}

const TEMPLATE = `{
  "configurations": [
  ]
}
`;

/** Garantisce l'esistenza di `.orbit/run.json` (con template vuoto) e ne ritorna il path. */
async function ensureConfigFile(): Promise<string | null> {
  const root = workspace.rootPath;
  if (!root) return null;
  const dir = joinPath(root, ".orbit");
  const p = joinPath(dir, "run.json");
  try {
    await invoke<string>("read_file", { path: p });
  } catch {
    await invoke("create_dir", { path: dir }).catch(() => {});
    await invoke("write_file", { path: p, content: TEMPLATE }).catch((e) => console.error("run.json", e));
  }
  return p;
}

/** Crea/apre `.orbit/run.json` nell'editor per la modifica manuale. */
export async function openConfig() {
  const p = await ensureConfigFile();
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
  const root = workspace.rootPath;
  if (!root) return;
  await ensureConfigFile();
  const claudePath = joinPath(root, "CLAUDE.md");
  let existing = "";
  try {
    existing = await invoke<string>("read_file", { path: claudePath });
  } catch {
    existing = "";
  }
  if (!existing.includes("orbit:run-config")) {
    const sep = existing.trim().length ? "\n\n" : "";
    await invoke("write_file", { path: claudePath, content: existing + sep + CLAUDE_SECTION }).catch((e) =>
      console.error("CLAUDE.md", e),
    );
  }
  await loadRunConfig();
  void openFile(claudePath);
}
