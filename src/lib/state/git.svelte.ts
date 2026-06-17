// Stato e azioni git (via comandi Rust/libgit2). Operazioni locali.
import { invoke } from "@tauri-apps/api/core";
import { confirm } from "@tauri-apps/plugin-dialog";
import { workspace, openDiff } from "./workspace.svelte";
import { notify } from "./toast.svelte";
import { addTerminal } from "./terminals.svelte";
import { layout, setFocusPanel } from "./layout.svelte";
import { basename, normSlash } from "../util";

export interface StatusEntry {
  path: string;
  staged: string | null;
  unstaged: string | null;
}

export interface CommitInfo {
  id: string;
  short: string;
  summary: string;
  author: string;
  time: number; // secondi epoch
}

export const git = $state({
  isRepo: false,
  branch: null as string | null,
  staged: [] as StatusEntry[],
  unstaged: [] as StatusEntry[],
  branches: [] as string[],
  loading: false,
  committing: false,
  view: "changes" as "changes" | "history",
  log: [] as CommitInfo[],
  logLoading: false,
  tick: 0, // incrementa a ogni refresh: segnale per ricaricare i marcatori nel gutter
  // tracking vs remoto (calcolato in locale con libgit2, nessuna rete)
  ahead: 0,
  behind: 0,
  upstream: null as string | null, // es. "origin/main"; null se il branch non traccia un remoto
  hasRemote: false, // il repo ha almeno un remoto configurato
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
    git.tick++;
    void loadUpstream(); // non bloccante: ahead/behind si aggiorna a parte, non rallenta il path caldo
  } catch (e) {
    console.error("git_status", e);
  } finally {
    git.loading = false;
  }
}

/** Ahead/behind vs il remoto tracciato (locale, via libgit2). */
export async function loadUpstream() {
  if (!workspace.rootPath) return;
  try {
    const u = await invoke<{ ahead: number; behind: number; upstream: string | null; hasRemote: boolean }>(
      "git_upstream",
      { root: workspace.rootPath },
    );
    git.ahead = u.ahead;
    git.behind = u.behind;
    git.upstream = u.upstream;
    git.hasRemote = u.hasRemote;
  } catch {
    git.ahead = 0;
    git.behind = 0;
    git.upstream = null;
    git.hasRemote = false;
  }
}

// ── Operazioni di rete (fetch/pull/push/merge) ────────────────────────────────
// Approccio ibrido: l'ahead/behind si calcola in locale con libgit2 (sopra), ma le
// operazioni che toccano il remoto girano nel `git` CLI dentro una tab del terminale.
// Così riusiamo l'autenticazione git già configurata dall'utente (credential manager,
// chiavi SSH) e mostriamo l'output reale, senza trascinare openssl/libssh2 in libgit2.

/** Lancia un comando git in una nuova tab del terminale, nella radice del progetto. */
function runGit(label: string, command: string) {
  if (!workspace.rootPath) {
    notify("Nessuna cartella aperta", "error");
    return;
  }
  layout.terminalVisible = true;
  setFocusPanel("terminal"); // porta il terminale in primo piano: senza, la tab si apre a destra e sembra "non succede nulla"
  addTerminal({ title: `git · ${label}`, cwd: workspace.rootPath, initCommand: command });
  notify(`git ${label} → eseguito nel terminale`, "info", 2200);
}

/** Scarica i riferimenti dal remoto (senza fondere), potando i rami spariti. */
export function gitFetch() {
  runGit("fetch", "git fetch --all --prune");
}

/** Aggiorna il branch corrente dal suo upstream. */
export function gitPull() {
  runGit("pull", "git pull");
}

/** Pubblica i commit locali. Se il branch non traccia un upstream, lo imposta su origin. */
export function gitPush() {
  const cmd = git.upstream
    ? "git push"
    : git.branch
      ? `git push -u origin ${git.branch}`
      : "git push";
  runGit("push", cmd);
}

/** Fonde `branch` nel branch corrente. */
export function gitMerge(branch: string) {
  runGit("merge", `git merge ${branch}`);
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
  // in parallelo: una sola attesa invece di N round-trip IPC seriali
  await Promise.all(
    git.unstaged.map((e) =>
      invoke("git_stage", { root: workspace.rootPath, path: e.path }).catch(() => {}),
    ),
  );
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

/** Crea un nuovo branch da HEAD e ci passa sopra. */
export async function createBranch(name: string) {
  if (!workspace.rootPath || !name.trim()) return;
  await invoke("git_create_branch", { root: workspace.rootPath, name: name.trim() });
  await refreshStatus();
  await loadBranches();
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

/** Annulla le modifiche di un file (untracked eliminato, tracciato riportato a HEAD). */
export async function discardFile(entry: StatusEntry) {
  if (!workspace.rootPath) return;
  const untracked = entry.unstaged === "U";
  const ok = await confirm(
    untracked
      ? `Delete untracked file "${entry.path}"?`
      : `Discard changes to "${entry.path}"? This cannot be undone.`,
    { title: "Discard changes", kind: "warning" },
  );
  if (!ok) return;
  try {
    await invoke("git_discard", { root: workspace.rootPath, path: entry.path });
    await refreshStatus();
  } catch (e) {
    notify(`Discard failed: ${e}`, "error");
    console.error("git_discard", e);
  }
}

export async function loadLog() {
  if (!workspace.rootPath) return;
  git.logLoading = true;
  try {
    git.log = await invoke<CommitInfo[]>("git_log", { root: workspace.rootPath, limit: 100 });
  } catch (e) {
    console.error("git_log", e);
  } finally {
    git.logLoading = false;
  }
}

export function setView(v: "changes" | "history") {
  git.view = v;
  if (v === "history") void loadLog();
}

/** Decorazioni git per l'albero: file modificati (path assoluto "/"→codice) e cartelle
 *  che li contengono. Reattivo se usato dentro $derived. Mostra a colpo d'occhio cosa
 *  è cambiato sul disco (es. i file che Claude ha appena toccato). */
export function decorations(): { files: Map<string, string>; dirs: Set<string> } {
  const files = new Map<string, string>();
  const dirs = new Set<string>();
  const root = workspace.rootPath;
  if (!root) return { files, dirs };
  const rootN = normSlash(root);
  const add = (rel: string, code: string) => {
    const abs = `${rootN}/${normSlash(rel)}`;
    if (files.has(abs)) return;
    files.set(abs, code);
    let d = abs.slice(0, abs.lastIndexOf("/"));
    while (d.length > rootN.length) {
      dirs.add(d);
      d = d.slice(0, d.lastIndexOf("/"));
    }
  };
  // unstaged prima: è ciò che è cambiato nel working tree (es. da Claude)
  for (const e of git.unstaged) add(e.path, e.unstaged ?? "M");
  for (const e of git.staged) add(e.path, e.staged ?? "M");
  return { files, dirs };
}

/** Numero di file con modifiche (staged ∪ unstaged), per il badge "rivedi". */
export function changedCount(): number {
  const s = new Set<string>();
  for (const e of git.unstaged) s.add(e.path);
  for (const e of git.staged) s.add(e.path);
  return s.size;
}

/** Apre il diff di un commit (vs primo genitore) in una tab di sola lettura. */
export async function showCommit(c: CommitInfo) {
  if (!workspace.rootPath) return;
  try {
    const patch = await invoke<string>("git_show", { root: workspace.rootPath, id: c.id });
    openDiff(`commit:${c.id}`, `${c.short} · ${c.summary || "(no message)"}`, patch);
  } catch (e) {
    console.error("git_show", e);
  }
}
