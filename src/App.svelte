<script lang="ts">
  import { onMount } from "svelte";
  import { invoke } from "@tauri-apps/api/core";
  import TopBar from "./lib/components/TopBar.svelte";
  import Sidebar from "./lib/components/Sidebar.svelte";
  import EditorArea from "./lib/components/EditorArea.svelte";
  import TerminalPanel from "./lib/components/TerminalPanel.svelte";
  import StatusBar from "./lib/components/StatusBar.svelte";
  import Splitter from "./lib/components/Splitter.svelte";
  import Terminal from "./lib/components/Terminal.svelte";
  import { layout, resizeSidebar, resizeTerminal, toggleSidebar, toggleTerminal } from "./lib/state/layout.svelte";
  import { listen } from "@tauri-apps/api/event";
  import { openRoot, openFolderDialog, refreshTree } from "./lib/state/explorer.svelte";
  import { openFile, saveActive } from "./lib/state/workspace.svelte";
  import { refreshStatus } from "./lib/state/git.svelte";
  import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";

  // La finestra flottante (label "term-float") mostra solo un terminale a tutta finestra.
  let isFloatingTerminal = false;
  try {
    isFloatingTerminal = getCurrentWebviewWindow().label === "term-float";
  } catch {
    /* fuori dal contesto Tauri */
  }

  onMount(async () => {
    if (isFloatingTerminal) return;
    // aggiornamento in tempo reale: il backend emette fs-changed (debounced)
    listen("fs-changed", () => {
      refreshTree();
      refreshStatus();
    });
    try {
      const s = await invoke<{ dir: string | null; file: string | null }>("startup");
      if (s.dir) await openRoot(s.dir);
      if (s.file) await openFile(s.file);
    } catch (e) {
      console.error("startup", e);
    }
  });

  function onKey(e: KeyboardEvent) {
    if (isFloatingTerminal) return;
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

{#if isFloatingTerminal}
  <div class="floatwrap">
    <Terminal id="float" />
  </div>
{:else}
  <div class="shell">
    <TopBar />
    <div class="body">
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
{/if}

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
  .floatwrap {
    height: 100%;
    background: var(--color-surface-1);
  }
</style>
