<script lang="ts">
  import { onMount } from "svelte";
  import { getCurrentWindow } from "@tauri-apps/api/window";
  import Icon from "./Icon.svelte";
  import Logo from "./Logo.svelte";
  import { layout, selectView, toggleTerminal } from "../state/layout.svelte";
  import { workspace } from "../state/workspace.svelte";
  import { openFolderDialog } from "../state/explorer.svelte";

  const win = getCurrentWindow();
  let maximized = $state(false);

  const views = [
    { id: "explorer", icon: "explorer", label: "Esplora" },
    { id: "git", icon: "git-branch", label: "Git" },
    { id: "search", icon: "search", label: "Cerca" },
  ] as const;

  onMount(async () => {
    try {
      maximized = await win.isMaximized();
      win.onResized(async () => {
        maximized = await win.isMaximized();
      });
    } catch {
      /* fuori dal contesto Tauri */
    }
  });
</script>

<header class="topbar" data-tauri-drag-region>
  <div class="brand" data-tauri-drag-region>
    <Logo size={21} gid="topGrad" />
  </div>

  <nav class="views">
    {#each views as v (v.id)}
      <button
        class="view"
        class:active={layout.sidebarVisible && layout.sidebarView === v.id}
        title={v.label}
        onclick={() => selectView(v.id)}
      >
        <Icon name={v.icon} size={15} strokeWidth={1.7} />
        <span>{v.label}</span>
      </button>
    {/each}
    <span class="sep"></span>
    <button
      class="view only"
      class:active={layout.terminalVisible}
      title="Terminale (Ctrl+`)"
      aria-label="Terminale"
      onclick={toggleTerminal}
    >
      <Icon name="terminal" size={15} strokeWidth={1.7} />
    </button>
  </nav>

  <div class="spacer" data-tauri-drag-region>
    {#if workspace.rootName}
      <span class="ws" data-tauri-drag-region>
        {workspace.rootName}{#if workspace.branch}<span class="dim"> · {workspace.branch}</span>{/if}
      </span>
    {/if}
  </div>

  <div class="actions">
    <button class="view only" title="Apri cartella (Ctrl+K)" aria-label="Apri cartella" onclick={openFolderDialog}>
      <Icon name="folder-open" size={15} strokeWidth={1.7} />
    </button>
    <button class="view only" title="Impostazioni" aria-label="Impostazioni">
      <Icon name="settings" size={15} strokeWidth={1.7} />
    </button>
  </div>

  <div class="wctrls">
    <button class="wc" title="Riduci a icona" aria-label="Riduci" onclick={() => win.minimize()}>
      <Icon name="win-minimize" size={15} strokeWidth={1.3} />
    </button>
    <button class="wc" title={maximized ? "Ripristina" : "Ingrandisci"} aria-label="Ingrandisci" onclick={() => win.toggleMaximize()}>
      <Icon name={maximized ? "win-restore" : "win-maximize"} size={14} strokeWidth={1.3} />
    </button>
    <button class="wc close" title="Chiudi" aria-label="Chiudi" onclick={() => win.close()}>
      <Icon name="x" size={16} strokeWidth={1.6} />
    </button>
  </div>
</header>

<style>
  .topbar {
    height: 38px;
    flex: 0 0 38px;
    display: flex;
    align-items: center;
    gap: 4px;
    padding-left: 11px;
    background: var(--color-surface-0);
    border-bottom: 1px solid var(--color-line);
    user-select: none;
  }
  .brand {
    display: flex;
    align-items: center;
    padding-right: 11px;
    margin-right: 6px;
    border-right: 1px solid var(--color-line);
    height: 22px;
  }

  .views {
    display: flex;
    align-items: center;
    gap: 2px;
  }
  .view {
    display: inline-flex;
    align-items: center;
    gap: 7px;
    height: 27px;
    padding: 0 11px;
    border: 0;
    border-radius: var(--radius-sm);
    background: transparent;
    color: var(--color-ink-muted);
    font-size: 12.5px;
    cursor: pointer;
    transition:
      background 100ms ease,
      color 100ms ease;
  }
  .view.only {
    padding: 0 8px;
  }
  .view:hover {
    background: var(--color-surface-3);
    color: var(--color-ink);
  }
  .view.active {
    background: rgba(var(--accent-rgb), 0.18);
    color: #cfe5ff;
  }
  .sep {
    width: 1px;
    height: 18px;
    background: var(--color-line);
    margin: 0 5px;
  }

  .spacer {
    flex: 1;
    height: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    min-width: 0;
  }
  .ws {
    font-size: 12px;
    color: var(--color-ink-muted);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    padding: 0 12px;
  }
  .ws .dim {
    color: var(--color-ink-subtle);
  }

  .actions {
    display: flex;
    align-items: center;
    gap: 2px;
    padding-right: 4px;
  }

  .wctrls {
    display: flex;
    align-items: stretch;
    height: 100%;
    margin-left: 4px;
  }
  .wc {
    width: 46px;
    display: grid;
    place-items: center;
    border: 0;
    background: transparent;
    color: var(--color-ink-muted);
    cursor: pointer;
    transition: background 100ms ease;
  }
  .wc:hover {
    background: var(--color-surface-3);
    color: var(--color-ink);
  }
  .wc.close:hover {
    background: #e81123;
    color: #fff;
  }
</style>
