<script lang="ts">
  import { invoke } from "@tauri-apps/api/core";

  // Smoke test della milestone 1: conferma render Svelte + utility Tailwind + IPC Tauri.
  let info = $state("connessione al backend…");

  invoke<string>("app_info")
    .then((v) => (info = v))
    .catch((e) => (info = `errore IPC: ${e}`));
</script>

<main class="flex h-full flex-col items-center justify-center gap-2">
  <div class="text-3xl font-semibold tracking-tight text-ink">Lume</div>
  <div class="text-sm text-ink-muted">IDE leggero · companion per Claude Code</div>
  <div
    class="mt-4 rounded-md border border-line bg-surface-2 px-3 py-1.5 font-mono text-xs text-ink-subtle"
  >
    {info}
  </div>
</main>
