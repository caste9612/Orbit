<script lang="ts">
  import Icon from "./Icon.svelte";
  import Explorer from "./Explorer.svelte";
  import GitPanel from "./GitPanel.svelte";
  import { layout } from "../state/layout.svelte";
  import { workspace } from "../state/workspace.svelte";
  import { openFolderDialog } from "../state/explorer.svelte";

  const titles: Record<string, string> = {
    explorer: "Esplora risorse",
    git: "Controllo sorgente",
    search: "Cerca",
  };
  let title = $derived(
    layout.sidebarView === "explorer" && workspace.rootName
      ? workspace.rootName
      : (titles[layout.sidebarView] ?? ""),
  );
</script>

<aside class="sidebar" style="width:{layout.sidebarWidth}px">
  <header class="head">
    <span class="title">{title}</span>
    {#if layout.sidebarView === "explorer" && workspace.rootPath}
      <button class="act" title="Apri un'altra cartella" aria-label="Apri un'altra cartella" onclick={openFolderDialog}>
        <Icon name="folder-open" size={15} strokeWidth={1.7} />
      </button>
    {/if}
  </header>

  <div class="body">
    {#if layout.sidebarView === "explorer"}
      {#if workspace.rootPath}
        <Explorer />
      {:else}
        <div class="empty">
          <p class="muted">Nessuna cartella aperta.</p>
          <button class="primary" onclick={openFolderDialog}>
            <Icon name="folder-open" size={15} strokeWidth={1.7} />
            Apri cartella…
          </button>
        </div>
      {/if}
    {:else if layout.sidebarView === "git"}
      {#if workspace.rootPath}
        <GitPanel />
      {:else}
        <div class="empty">
          <p class="muted">Nessun repository git.</p>
          <p class="hint">Apri prima una cartella.</p>
        </div>
      {/if}
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
    justify-content: space-between;
    padding: 0 6px 0 18px;
  }
  .title {
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--color-ink-muted);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .act {
    width: 26px;
    height: 26px;
    flex: 0 0 auto;
    display: grid;
    place-items: center;
    background: transparent;
    border: 0;
    border-radius: 5px;
    color: var(--color-ink-muted);
    cursor: pointer;
  }
  .act:hover {
    color: var(--color-ink);
    background: var(--color-surface-3);
  }
  .body {
    flex: 1;
    overflow: hidden;
    min-height: 0;
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
