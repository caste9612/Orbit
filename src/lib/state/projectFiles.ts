// Elenco file del progetto (comando Rust `list_files`), con cache per-root e dedup delle
// chiamate concorrenti. Condiviso da Quick Open e dalla vista Docs, così aprirli entrambi
// non costa due walk dell'albero. La cache si invalida su `fs-changed` (vedi App.svelte).
import { invoke } from "@tauri-apps/api/core";

export interface FileRef {
  path: string; // assoluto (per aprire)
  rel: string; // relativo alla radice, separatori "/"
}

let cacheRoot: string | null = null;
let cache: FileRef[] | null = null;
let inflight: Promise<FileRef[]> | null = null;

/** Elenco file del progetto, dalla cache se possibile (altrimenti un solo walk condiviso). */
export async function listFiles(root: string): Promise<FileRef[]> {
  if (cacheRoot === root) {
    if (cache) return cache;
    if (inflight) return inflight;
  }
  cacheRoot = root;
  cache = null;
  inflight = (async () => {
    try {
      const r = await invoke<FileRef[]>("list_files", { root });
      if (cacheRoot === root) cache = r;
      return r;
    } finally {
      inflight = null;
    }
  })();
  return inflight;
}

/** Invalida la cache (cambio file nel progetto o cambio cartella). */
export function invalidateFiles() {
  cacheRoot = null;
  cache = null;
  inflight = null;
}
