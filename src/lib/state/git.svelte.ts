// Stato e azioni git (via comandi Rust/libgit2). Operazioni locali.
import { invoke } from "@tauri-apps/api/core";
import { workspace, openDiff } from "./workspace.svelte";
import { basename } from "../util";

export interface StatusEntry {
  path: string;
  staged: string | null;
  unstaged: string | null;
}

export const git = $state({
  isRepo: false,
  branch: null as string | null,
  staged: [] as StatusEntry[],
  unstaged: [] as StatusEntry[],
  branches: [] as string[],
  loading: false,
  committing: false,
});

export async function refreshStatus() {
  if (!workspace.rootPath) return;
  git.loading = true;
  try {
    const s = await invoke<{ isRepo: boolean; branch: string | null; entries: StatusEntry[] }>(
      "git_status",
      { root: workspace.rootPath },
    );
    git.isRepo = s.isRepo;
    git.branch = s.branch;
    workspace.branch = s.branch;
    git.staged = s.entries.filter((e) => e.staged);
    git.unstaged = s.entries.filter((e) => e.unstaged);
  } catch (e) {
    console.error("git_status", e);
  } finally {
    git.loading = false;
  }
}

export async function stage(path: string) {
  if (!workspace.rootPath) return;
  await invoke("git_stage", { root: workspace.rootPath, path }).catch((e) => console.error(e));
  await refreshStatus();
}

export async function unstage(path: string) {
  if (!workspace.rootPath) return;
  await invoke("git_unstage", { root: workspace.rootPath, path }).catch((e) => console.error(e));
  await refreshStatus();
}

export async function stageAll() {
  if (!workspace.rootPath) return;
  for (const e of git.unstaged) {
    await invoke("git_stage", { root: workspace.rootPath, path: e.path }).catch(() => {});
  }
  await refreshStatus();
}

export async function commit(message: string) {
  if (!workspace.rootPath || !message.trim()) return;
  git.committing = true;
  try {
    await invoke("git_commit", { root: workspace.rootPath, message });
    await refreshStatus();
  } finally {
    git.committing = false;
  }
}

export async function loadBranches() {
  if (!workspace.rootPath) return;
  try {
    const b = await invoke<{ current: string | null; all: string[] }>("git_branches", {
      root: workspace.rootPath,
    });
    git.branches = b.all;
    git.branch = b.current;
  } catch (e) {
    console.error("git_branches", e);
  }
}

export async function checkout(name: string) {
  if (!workspace.rootPath) return;
  await invoke("git_checkout_branch", { root: workspace.rootPath, name });
  await refreshStatus();
}

export async function showDiff(entry: StatusEntry, staged: boolean) {
  if (!workspace.rootPath) return;
  try {
    const patch = await invoke<string>("git_diff", {
      root: workspace.rootPath,
      path: entry.path,
      staged,
    });
    const id = `diff:${staged ? "s" : "w"}:${entry.path}`;
    openDiff(id, `${basename(entry.path)} ↔ ${staged ? "HEAD" : "index"}`, patch);
  } catch (e) {
    console.error("git_diff", e);
  }
}
