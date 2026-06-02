<script lang="ts">
  import Icon from "./Icon.svelte";
  import { layout } from "../state/layout.svelte";
  import { workspace } from "../state/workspace.svelte";

  const titles: Record<string, string> = {
    explorer: "Esplora risorse",
    git: "Controllo sorgente",
    search: "Cerca",
  };
  let title = $derived(titles[layout.sidebarView] ?? "");
</script>

<aside class="sidebar" style="width:{layout.sidebarWidth}px">
  <header class="head">
    <span class="title">{title}</span>
  </header>

  <div class="body">
    {#if layout.sidebarView === "explorer"}
      {#if workspace.rootPath}
        <div class="placeholder">Albero file (milestone 3)</div>
      {:else}
        <div class="empty">
          <p class="muted">Nessuna cartella aperta.</p>
          <button class="primary">
            <Icon name="folder-open" size={15} strokeWidth={1.7} />
            Apri cartella…
          </button>
        </div>
      {/if}
    {:else if layout.sidebarView === "git"}
      <div class="empty">
        <p class="muted">Nessun repository git.</p>
        <p class="hint">Apri una cartella che contiene un repository.</p>
      </div>
    {:else}
      <div class="empty">
        <p class="muted">Cerca nei file</p>
        <p class="hint">Disponibile dopo l'apertura di una cartella.</p>
      </div>
    {/if}
  </div>
</aside>

<style>
  .sidebar {
    flex: 0 0 auto;
    min-width: 0;
    height: 100%;
    background: var(--color-surface-2);
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }
  .head {
    height: 35px;
    flex: 0 0 35px;
    display: flex;
    align-items: center;
    padding: 0 16px 0 18px;
  }
  .title {
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--color-ink-muted);
  }
  .body {
    flex: 1;
    overflow: auto;
    min-height: 0;
  }
  .placeholder {
    padding: 8px 18px;
    color: var(--color-ink-subtle);
    font-size: 12px;
  }
  .empty {
    padding: 14px 18px;
    display: flex;
    flex-direction: column;
    gap: 10px;
    align-items: flex-start;
  }
  .muted {
    margin: 0;
    color: var(--color-ink-muted);
    font-size: 12.5px;
  }
  .hint {
    margin: 0;
    color: var(--color-ink-subtle);
    font-size: 12px;
    line-height: 1.45;
  }
  .primary {
    display: inline-flex;
    align-items: center;
    gap: 7px;
    background: var(--color-accent);
    color: #08111f;
    font-weight: 600;
    font-size: 12.5px;
    border: 0;
    border-radius: 6px;
    padding: 6px 11px;
    cursor: pointer;
    transition: filter 90ms ease;
  }
  .primary:hover {
    filter: brightness(1.08);
  }
</style>
