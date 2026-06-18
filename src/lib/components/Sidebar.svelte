<script lang="ts">
  import Icon from "./Icon.svelte";
  import Explorer from "./Explorer.svelte";
  import Lazy from "./Lazy.svelte";
  import { layout, setFocusPanel } from "../state/layout.svelte";
  import { workspace } from "../state/workspace.svelte";
  import { openFolderDialog, startCreate } from "../state/explorer.svelte";
  import { settings } from "../state/settings.svelte";

  const titles: Record<string, string> = {
    explorer: "Explorer",
    git: "Source Control",
    search: "Search",
    docs: "Documentation",
    claude: "Claude chats",
  };
  let title = $derived(
    layout.sidebarView === "explorer" && workspace.rootName
      ? workspace.rootName
      : (titles[layout.sidebarView] ?? ""),
  );
</script>

<aside class="sidebar" class:focused={layout.focusPanel === "sidebar"} style="width:{layout.sidebarWidth}px" onpointerdown={() => setFocusPanel("sidebar")}>
  <header class="head">
    <span class="title">{title}</span>
    {#if layout.sidebarView === "explorer" && workspace.rootPath}
      <div class="acts">
        <button
          class="act"
          class:on={settings.revealActive}
          title={settings.revealActive ? "Following active file — click to stop" : "Follow active file in tree"}
          aria-label="Follow active file in tree"
          aria-pressed={settings.revealActive}
          onclick={() => (settings.revealActive = !settings.revealActive)}
        >
          <Icon name="crosshair" size={15} strokeWidth={1.7} />
        </button>
        <button class="act" title="New File" aria-label="New File" onclick={() => startCreate(workspace.rootPath!, "file")}>
          <Icon name="file-plus" size={15} strokeWidth={1.7} />
        </button>
        <button class="act" title="New Folder" aria-label="New Folder" onclick={() => startCreate(workspace.rootPath!, "dir")}>
          <Icon name="folder-plus" size={15} strokeWidth={1.7} />
        </button>
        <button class="act" title="Open another folder" aria-label="Open another folder" onclick={openFolderDialog}>
          <Icon name="folder-open" size={15} strokeWidth={1.7} />
        </button>
      </div>
    {/if}
  </header>

  <div class="body">
    {#if layout.sidebarView === "explorer"}
      {#if workspace.rootPath}
        <Explorer />
      {:else}
        <div class="empty">
          <p class="muted">No folder open.</p>
          <button class="primary" onclick={openFolderDialog}>
            <Icon name="folder-open" size={15} strokeWidth={1.7} />
            Open folder…
          </button>
        </div>
      {/if}
    {:else if layout.sidebarView === "git"}
      {#if workspace.rootPath}
        <Lazy load={() => import("./GitPanel.svelte")} />
      {:else}
        <div class="empty">
          <p class="muted">No git repository.</p>
          <p class="hint">Open a folder first.</p>
        </div>
      {/if}
    {:else if layout.sidebarView === "docs"}
      {#if workspace.rootPath}
        <Lazy load={() => import("./DocsView.svelte")} />
      {:else}
        <div class="empty">
          <p class="muted">No documentation.</p>
          <p class="hint">Open a folder first.</p>
        </div>
      {/if}
    {:else if layout.sidebarView === "claude"}
      {#if workspace.rootPath}
        <Lazy load={() => import("./ClaudeChatsView.svelte")} />
      {:else}
        <div class="empty">
          <p class="muted">No Claude sessions.</p>
          <p class="hint">Open a folder first.</p>
        </div>
      {/if}
    {:else if workspace.rootPath}
      <Lazy load={() => import("./SearchView.svelte")} />
    {:else}
      <div class="empty">
        <p class="muted">Search in files</p>
        <p class="hint">Open a folder first.</p>
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
    border-radius: 8px;
    border: 1px solid var(--color-line);
    transition: border-color 120ms ease;
  }
  .sidebar.focused {
    border-color: var(--color-accent);
  }
  .head {
    height: 30px;
    flex: 0 0 30px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0 6px 0 14px;
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
  .acts {
    display: flex;
    align-items: center;
    gap: 1px;
    flex: 0 0 auto;
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
  .act.on {
    color: var(--color-accent);
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
