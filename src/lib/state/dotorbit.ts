// Helper condivisi per la configurazione di progetto in `.orbit/` (run.json, claude.json):
// path, lettura JSON, creazione da template e documentazione del formato in CLAUDE.md.
import { invoke } from "@tauri-apps/api/core";
import { workspace, openFile } from "./workspace.svelte";
import { joinPath } from "../util";

/** Path assoluto di un file dentro `.orbit/` del progetto (null se nessuna cartella aperta). */
export function orbitPath(file: string): string | null {
  return workspace.rootPath ? joinPath(joinPath(workspace.rootPath, ".orbit"), file) : null;
}

/** Legge e fa il parse di un JSON in `.orbit/` (null se assente/invalido). */
export async function readOrbitJson<T = unknown>(file: string): Promise<T | null> {
  const p = orbitPath(file);
  if (!p) return null;
  try {
    return JSON.parse(await invoke<string>("read_file", { path: p })) as T;
  } catch {
    return null;
  }
}

/** Garantisce l'esistenza di `.orbit/<file>` (col template) e ne ritorna il path. */
export async function ensureOrbitFile(file: string, template: string): Promise<string | null> {
  const root = workspace.rootPath;
  if (!root) return null;
  const dir = joinPath(root, ".orbit");
  const p = joinPath(dir, file);
  try {
    await invoke<string>("read_file", { path: p });
  } catch {
    await invoke("create_dir", { path: dir }).catch(() => {});
    await invoke("write_file", { path: p, content: template }).catch((e) => console.error(file, e));
  }
  return p;
}

/** Aggiunge a CLAUDE.md una sezione (marcata) se non già presente, poi apre il file. */
export async function teachClaudeSection(marker: string, section: string) {
  const root = workspace.rootPath;
  if (!root) return;
  const claudePath = joinPath(root, "CLAUDE.md");
  let existing = "";
  try {
    existing = await invoke<string>("read_file", { path: claudePath });
  } catch {
    existing = "";
  }
  // `section` inizia con `<!-- marker -->` e finisce con `<!-- /marker -->`.
  const start = `<!-- ${marker} -->`;
  const end = `<!-- /${marker} -->`;
  const si = existing.indexOf(start);
  const ei = existing.indexOf(end);
  let next: string;
  if (si !== -1 && ei > si) {
    next = existing.slice(0, si) + section + existing.slice(ei + end.length); // aggiorna
  } else if (si === -1) {
    next = existing.trim().length ? `${existing}\n\n${section}` : section; // accoda
  } else {
    void openFile(claudePath); // legacy (solo start marker): non tocco il resto del file
    return;
  }
  if (next !== existing) {
    await invoke("write_file", { path: claudePath, content: next }).catch((e) =>
      console.error("CLAUDE.md", e),
    );
  }
  void openFile(claudePath);
}
