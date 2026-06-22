<script lang="ts">
  import { onMount, onDestroy } from "svelte";
  import { getCurrentWindow } from "@tauri-apps/api/window";
  import type { UnlistenFn } from "@tauri-apps/api/event";
  import Icon from "./Icon.svelte";
  import Logo from "./Logo.svelte";
  import ContextMenu, { type MenuItem } from "./ContextMenu.svelte";
  import { layout, selectView, toggleTerminal } from "../state/layout.svelte";
  import { workspace } from "../state/workspace.svelte";
  import { openFolderDialog } from "../state/explorer.svelte";
  import { folders, openFromList, removeFolder } from "../state/folders.svelte";
  import { changedCount } from "../state/git.svelte";
  import { run, runConfig, openConfig, teachClaude } from "../state/run.svelte";
  import {
    claude,
    launchClaude,
    runShortcut,
    openWrapper,
    openClaudeConfig,
    teachClaudeConfig,
  } from "../state/claude.svelte";
  import { open as openDialog } from "@tauri-apps/plugin-dialog";
  import { invoke } from "@tauri-apps/api/core";
  import { openSettings } from "../state/settings.svelte";
  import { openScratch } from "../state/scratch";

  const win = getCurrentWindow();

  async function newWindow() {
    try {
      const sel = await openDialog({ directory: true, multiple: false });
      if (typeof sel === "string") await invoke("open_new_window", { dir: sel });
    } catch (e) {
      console.error("nuova finestra", e);
    }
  }
  // Chiude tutte le finestre di Orbit (anche le altre istanze): salva il set per riaprirle al prossimo avvio.
  async function closeAll() {
    try {
      await invoke("close_all_windows");
    } catch (e) {
      console.error("chiudi tutte", e);
    }
  }
  let maximized = $state(false);
  let changed = $derived(changedCount()); // file modificati → badge sul pulsante Git

  // top bar stretta / molte repo: la fila di tab scorre; tieni la tab ATTIVA sempre in vista
  let repobarEl = $state<HTMLElement>();
  $effect(() => {
    workspace.rootPath; // dipendenza: rieffettua al cambio repo
    repobarEl?.querySelector(".repotab.active")?.scrollIntoView({ inline: "nearest", block: "nearest" });
  });

  // posizione di un menu a tendina, appena sotto il pulsante che l'ha aperto
  function menuPos(e: MouseEvent) {
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    return { x: r.left, y: r.bottom + 4 };
  }

  let runMenu = $state<{ x: number; y: number } | null>(null);
  function openRunMenu(e: MouseEvent) {
    runMenu = menuPos(e);
  }
  function runMenuItems(): MenuItem[] {
    const items: MenuItem[] = run.configs.map((c) => ({
      label: c.name,
      icon: "play",
      onClick: () => runConfig(c),
    }));
    items.push({
      label: "Open .orbit/run.json",
      icon: "braces",
      separatorBefore: items.length > 0,
      onClick: openConfig,
    });
    items.push({ label: "Set up for Claude (CLAUDE.md)", icon: "doc", onClick: teachClaude });
    return items;
  }

  let claudeMenu = $state<{ x: number; y: number } | null>(null);
  function openClaudeMenu(e: MouseEvent) {
    claudeMenu = menuPos(e);
  }
  function claudeMenuItems(): MenuItem[] {
    const items: MenuItem[] = [
      { label: "Open Claude here", icon: "sparkles", onClick: () => launchClaude() },
    ];
    if (claude.shortcuts.length) {
      items.push({ label: "Prompts", header: true, separatorBefore: true });
      claude.shortcuts.forEach((s) =>
        items.push({ label: s.name, icon: s.icon ?? "play", onClick: () => runShortcut(s) }),
      );
    }
    if (claude.wrappers.length) {
      // i wrapper aprono il composer (scrivi → copia negli appunti); "…" = chiedono input
      items.push({ label: "Wrappers (compose + copy)", header: true, separatorBefore: true });
      claude.wrappers.forEach((w) =>
        items.push({ label: `${w.name}…`, icon: w.icon ?? "type", onClick: () => openWrapper(w) }),
      );
    }
    items.push({ label: "Configuration", header: true, separatorBefore: true });
    items.push({ label: "Edit .orbit/claude.json", icon: "braces", onClick: openClaudeConfig });
    items.push({ label: "Update CLAUDE.md for Claude", icon: "doc", onClick: teachClaudeConfig });
    return items;
  }

  const views = [
    { id: "explorer", icon: "explorer", label: "Explorer" },
    { id: "git", icon: "git-branch", label: "Git" },
    { id: "search", icon: "search", label: "Search" },
    { id: "docs", icon: "book-open", label: "Docs" },
    { id: "claude", icon: "message", label: "Chats" },
  ] as const;

  let offResized: UnlistenFn | undefined;
  onMount(async () => {
    try {
      maximized = await win.isMaximized();
      offResized = await win.onResized(async () => {
        maximized = await win.isMaximized();
      });
    } catch {
      /* fuori dal contesto Tauri */
    }
  });
  onDestroy(() => offResized?.());
</script>

<header class="topbar" data-tauri-drag-region>
  <div class="brand" data-tauri-drag-region>
    <Logo size={18} />
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
        {#if v.id === "git" && changed > 0}<span class="badge">{changed}</span>{/if}
      </button>
    {/each}
    <span class="sep"></span>
    <button
      class="view only"
      class:active={layout.terminalVisible}
      title="Terminal (Ctrl+`)"
      aria-label="Terminal"
      onclick={toggleTerminal}
    >
      <Icon name="terminal" size={15} strokeWidth={1.7} />
    </button>
  </nav>

  <div class="spacer" data-tauri-drag-region>
    {#if workspace.rootName}
      <div class="repobar" bind:this={repobarEl}>
        {#each folders.list as f (f.path)}
          {@const active = f.path === workspace.rootPath}
          <div class="repotab" class:active>
            <button class="rt-main" title={f.path} onclick={() => openFromList(f.path)}>
              <Icon name={active ? "folder-open" : "folder"} size={12} strokeWidth={1.8} />
              <span class="rt-name">{f.name}</span>
              {#if active && workspace.branch}
                <span class="rt-branch"><Icon name="git-branch" size={10} strokeWidth={1.8} />{workspace.branch}</span>
              {/if}
            </button>
            {#if !active}
              <button class="rt-close" title="Remove from list" aria-label="Remove from list" onclick={() => removeFolder(f.path)}>
                <Icon name="x" size={11} strokeWidth={2} />
              </button>
            {/if}
          </div>
        {/each}
        <button class="repoadd" title="Add folder…" aria-label="Add folder" onclick={openFolderDialog}>
          <Icon name="plus" size={13} strokeWidth={2} />
        </button>
      </div>
    {/if}
  </div>

  <div class="actions">
    {#if workspace.rootName}
      <button class="view only" title="Scratchpad — notes & prompts" aria-label="Scratchpad" onclick={openScratch}>
        <Icon name="note" size={15} strokeWidth={1.7} />
      </button>
      <button class="view only claude" title="Claude…" aria-label="Claude" onclick={openClaudeMenu}>
        <Icon name="sparkles" size={15} strokeWidth={1.7} />
      </button>
      <button class="view only run" title="Run…" aria-label="Run" onclick={openRunMenu}>
        <Icon name="play" size={14} strokeWidth={1.8} />
      </button>
    {/if}
    <button class="view only" title="Open folder (Ctrl+K)" aria-label="Open folder" onclick={openFolderDialog}>
      <Icon name="folder-open" size={15} strokeWidth={1.7} />
    </button>
    <button class="view only" title="New window (another folder)" aria-label="New window" onclick={newWindow}>
      <Icon name="new-window" size={15} strokeWidth={1.7} />
    </button>
    <button class="view only" title="Close all Orbit windows (reopen on next launch)" aria-label="Close all windows" onclick={closeAll}>
      <Icon name="windows-close" size={15} strokeWidth={1.7} />
    </button>
    <button class="view only" title="Settings" aria-label="Settings" onclick={openSettings}>
      <Icon name="settings" size={15} strokeWidth={1.7} />
    </button>
  </div>

  <div class="wctrls">
    <button class="wc" title="Minimize" aria-label="Minimize" onclick={() => win.minimize()}>
      <Icon name="win-minimize" size={15} strokeWidth={1.3} />
    </button>
    <button class="wc" title={maximized ? "Restore" : "Maximize"} aria-label="Maximize" onclick={() => win.toggleMaximize()}>
      <Icon name={maximized ? "win-restore" : "win-maximize"} size={14} strokeWidth={1.3} />
    </button>
    <button class="wc close" title="Close" aria-label="Close" onclick={() => win.close()}>
      <Icon name="x" size={16} strokeWidth={1.6} />
    </button>
  </div>
</header>

{#if runMenu}
  <ContextMenu x={runMenu.x} y={runMenu.y} items={runMenuItems()} onClose={() => (runMenu = null)} />
{/if}
{#if claudeMenu}
  <ContextMenu x={claudeMenu.x} y={claudeMenu.y} items={claudeMenuItems()} onClose={() => (claudeMenu = null)} />
{/if}

<style>
  .topbar {
    height: 30px;
    flex: 0 0 30px;
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
    padding-right: 10px;
    margin-right: 5px;
    border-right: 1px solid var(--color-line);
    height: 18px;
  }

  .views {
    display: flex;
    align-items: center;
    gap: 2px;
  }
  .view {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    height: 23px;
    padding: 0 9px;
    border: 0;
    border-radius: var(--radius-sm);
    background: transparent;
    color: var(--color-ink-muted);
    font-size: 12px;
    cursor: pointer;
    transition:
      background 100ms ease,
      color 100ms ease;
  }
  .view.only {
    padding: 0 7px;
  }
  .view:hover {
    background: var(--color-surface-3);
    color: var(--color-ink);
  }
  .view.active {
    background: rgba(var(--accent-rgb), 0.18);
    color: #cfe5ff;
  }
  .badge {
    display: inline-grid;
    place-items: center;
    min-width: 16px;
    height: 16px;
    padding: 0 4px;
    border-radius: 8px;
    background: var(--color-accent);
    color: #08111f;
    font-size: 10.5px;
    font-weight: 700;
    line-height: 1;
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
  .repobar {
    display: flex;
    align-items: center;
    gap: 4px;
    max-width: 100%;
    height: 22px;
    overflow-x: auto;
    scrollbar-width: none;
  }
  .repobar::-webkit-scrollbar {
    display: none;
  }
  .repotab {
    display: inline-flex;
    align-items: center;
    flex: 0 0 auto;
    max-width: 220px;
    height: 22px;
    border: 1px solid var(--color-line);
    border-radius: 7px;
    background: var(--color-surface-1);
    color: var(--color-ink-muted);
    overflow: hidden;
    transition: background 90ms ease, border-color 90ms ease, color 90ms ease;
  }
  .repotab:not(.active):hover {
    background: var(--color-surface-3);
    color: var(--color-ink);
  }
  .repotab.active {
    color: var(--color-ink);
    background: rgba(var(--accent-rgb), 0.16);
    border-color: rgba(var(--accent-rgb), 0.5);
  }
  .rt-main {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    height: 100%;
    padding: 0 5px 0 9px;
    border: 0;
    background: transparent;
    color: inherit;
    font: inherit;
    font-size: 12px;
    cursor: pointer;
    min-width: 0;
  }
  .rt-name {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .rt-branch {
    flex: 0 0 auto;
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding-left: 2px;
    color: var(--color-ink-muted);
    font-size: 11px;
  }
  .rt-close {
    display: grid;
    place-items: center;
    width: 16px;
    height: 16px;
    margin-right: 4px;
    border: 0;
    border-radius: 4px;
    background: transparent;
    color: var(--color-ink-subtle);
    cursor: pointer;
    opacity: 0;
    transition: opacity 90ms ease, background 90ms ease;
  }
  .repotab:hover .rt-close {
    opacity: 1;
  }
  .rt-close:hover {
    background: var(--color-surface-4);
    color: var(--color-ink);
  }
  .repoadd {
    flex: 0 0 auto;
    display: grid;
    place-items: center;
    width: 26px;
    height: 22px;
    border: 1px solid var(--color-line);
    border-radius: 7px;
    background: var(--color-surface-1);
    color: var(--color-ink-muted);
    cursor: pointer;
    transition: background 90ms ease, color 90ms ease;
  }
  .repoadd:hover {
    background: var(--color-surface-3);
    color: var(--color-ink);
  }

  .actions {
    display: flex;
    align-items: center;
    gap: 2px;
    padding-right: 4px;
  }
  .actions .run {
    color: var(--color-success);
  }
  .actions .run:hover {
    color: var(--color-success);
    background: rgba(78, 201, 176, 0.16);
  }
  .actions .claude {
    color: var(--color-accent);
  }
  .actions .claude:hover {
    color: var(--color-accent);
    background: rgba(var(--accent-rgb), 0.16);
  }

  .wctrls {
    display: flex;
    align-items: stretch;
    height: 100%;
    margin-left: 4px;
  }
  .wc {
    width: 44px;
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
