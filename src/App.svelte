<script lang="ts">
  import { onMount } from "svelte";
  import { invoke } from "@tauri-apps/api/core";
  import ActivityBar from "./lib/components/ActivityBar.svelte";
  import Sidebar from "./lib/components/Sidebar.svelte";
  import EditorArea from "./lib/components/EditorArea.svelte";
  import TerminalPanel from "./lib/components/TerminalPanel.svelte";
  import StatusBar from "./lib/components/StatusBar.svelte";
  import Splitter from "./lib/components/Splitter.svelte";
  import { layout, resizeSidebar, resizeTerminal, toggleSidebar, toggleTerminal } from "./lib/state/layout.svelte";
  import { openRoot, openFolderDialog } from "./lib/state/explorer.svelte";
  import { openFile, saveActive } from "./lib/state/workspace.svelte";

  onMount(async () => {
    try {
      const s = await invoke<{ dir: string | null; file: string | null }>("startup");
      if (s.dir) await openRoot(s.dir);
      if (s.file) await openFile(s.file);
    } catch (e) {
      console.error("startup", e);
    }
  });

  function onKey(e: KeyboardEvent) {
    if (!(e.ctrlKey || e.metaKey) || e.altKey) return;
    switch (e.key) {
      case "b":
        e.preventDefault();
        toggleSidebar();
        break;
      case "`":
        e.preventDefault();
        toggleTerminal();
        break;
      case "k":
        e.preventDefault();
        openFolderDialog();
        break;
      case "s":
        e.preventDefault();
        saveActive();
        break;
    }
  }
</script>

<svelte:window onkeydown={onKey} />

<div class="shell">
  <div class="body">
    <ActivityBar />

    {#if layout.sidebarVisible}
      <Sidebar />
      <Splitter orientation="vertical" onResize={resizeSidebar} />
    {/if}

    <main class="main">
      <EditorArea />

      {#if layout.terminalVisible}
        <Splitter orientation="horizontal" onResize={resizeTerminal} />
        <TerminalPanel />
      {/if}
    </main>
  </div>

  <StatusBar />
</div>

<style>
  .shell {
    height: 100%;
    display: flex;
    flex-direction: column;
    background: var(--color-surface-1);
  }
  .body {
    flex: 1;
    min-height: 0;
    display: flex;
    align-items: stretch;
  }
  .main {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
  }
</style>
