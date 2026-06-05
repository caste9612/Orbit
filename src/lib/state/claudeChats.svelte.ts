// Sessioni Claude Code del progetto aperto: lette dai transcript JSONL in
// ~/.claude/projects/<slug>/*.jsonl tramite il comando Rust `claude_sessions`.
import { invoke } from "@tauri-apps/api/core";
import { workspace } from "./workspace.svelte";

export interface ClaudeSession {
  id: string; // id sessione (nome file .jsonl)
  title: string; // primo messaggio utente "vero" (può essere vuoto)
  modified: number; // unix secondi (ultima modifica del transcript)
}

export const claudeChats = $state({
  sessions: [] as ClaudeSession[],
  loading: false,
});

export async function loadClaudeChats() {
  const root = workspace.rootPath;
  if (!root) {
    claudeChats.sessions = [];
    return;
  }
  claudeChats.loading = true;
  try {
    const sessions = await invoke<ClaudeSession[]>("claude_sessions", { root });
    if (workspace.rootPath !== root) return; // root cambiato durante l'await: scarta il risultato stale
    claudeChats.sessions = sessions;
  } catch (e) {
    console.error("claude_sessions", e);
    if (workspace.rootPath === root) claudeChats.sessions = [];
  } finally {
    if (workspace.rootPath === root) claudeChats.loading = false;
  }
}
