// Ricerca testuale nel progetto (via comando Rust search_in_project), con debounce.
import { invoke } from "@tauri-apps/api/core";
import { workspace, openFileAt } from "./workspace.svelte";

export interface SearchMatch {
  line: number;
  text: string;
}
export interface FileMatches {
  path: string;
  rel: string;
  matches: SearchMatch[];
}

export const search = $state({
  query: "",
  results: [] as FileMatches[],
  count: 0,
  running: false,
  done: false,
});

let timer: ReturnType<typeof setTimeout> | undefined;

export function setQuery(q: string) {
  search.query = q;
  if (timer) clearTimeout(timer);
  if (!q.trim()) {
    search.results = [];
    search.count = 0;
    search.done = false;
    return;
  }
  timer = setTimeout(run, 250);
}

/** Azzera la ricerca: al cambio cartella i risultati/query del repo precedente non devono restare. */
export function resetSearch() {
  if (timer) clearTimeout(timer);
  search.query = "";
  search.results = [];
  search.count = 0;
  search.running = false;
  search.done = false;
}

async function run() {
  if (!workspace.rootPath || !search.query.trim()) return;
  search.running = true;
  try {
    const res = await invoke<FileMatches[]>("search_in_project", {
      root: workspace.rootPath,
      query: search.query,
    });
    search.results = res;
    search.count = res.reduce((n, f) => n + f.matches.length, 0);
    search.done = true;
  } catch (e) {
    console.error("search", e);
  } finally {
    search.running = false;
  }
}

export function openResult(path: string, line: number) {
  void openFileAt(path, line);
}
