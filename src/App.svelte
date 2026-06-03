<script lang="ts">
  import { onMount } from "svelte";
  import { invoke } from "@tauri-apps/api/core";
  import TopBar from "./lib/components/TopBar.svelte";
  import Sidebar from "./lib/components/Sidebar.svelte";
  import EditorArea from "./lib/components/EditorArea.svelte";
  import TerminalPanel from "./lib/components/TerminalPanel.svelte";
  import StatusBar from "./lib/components/StatusBar.svelte";
  import Splitter from "./lib/components/Splitter.svelte";
  import Terminal from "./lib/components/LazyTerminal.svelte";
  import QuickOpen from "./lib/components/QuickOpen.svelte";
  import Toaster from "./lib/components/Toaster.svelte";
  import Settings from "./lib/components/Settings.svelte";
  import { layout, resizeSidebar, resizeTerminal, toggleSidebar, toggleTerminal } from "./lib/state/layout.svelte";
  import { listen } from "@tauri-apps/api/event";
  import { openFolderDialog, refreshTree } from "./lib/state/explorer.svelte";
  import { openFile, saveActive, reloadOpenFiles } from "./lib/state/workspace.svelte";
  import { setQuery } from "./lib/state/search.svelte";
  import { refreshStatus } from "./lib/state/git.svelte";
  import { quickopen, openPalette } from "./lib/state/quickopen.svelte";
  import { loadRunConfig } from "./lib/state/run.svelte";
  import { loadShelf } from "./lib/state/shelf.svelte";
  import { loadSettings, startSettingsAutosave, settingsUI, nudgeFontSize } from "./lib/state/settings.svelte";
  import { loadSession, startAutosave } from "./lib/state/persist.svelte";
  import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";

  // La finestra flottante (label "term-float") mostra solo un terminale a tutta finestra.
  let isFloatingTerminal = false;
  try {
    isFloatingTerminal = getCurrentWebviewWindow().label === "term-float";
  } catch {
    /* fuori dal contesto Tauri */
  }

  onMount(async () => {
    loadSettings(); // applica font/dimensione/accento/caret (anche nella finestra flottante)
    // Ctrl+rotella = zoom del font di editor/terminale (intercetta prima del WebView)
    window.addEventListener(
      "wheel",
      (e) => {
        if (!e.ctrlKey) return;
        e.preventDefault();
        nudgeFontSize(e.deltaY < 0 ? 1 : -1);
      },
      { passive: false },
    );
    if (isFloatingTerminal) return;
    startSettingsAutosave();
    // aggiornamento in tempo reale: il backend emette fs-changed (debounced)
    listen("fs-changed", () => {
      refreshTree();
      refreshStatus();
      reloadOpenFiles();
      loadRunConfig(); // ricarica il menu Esegui se Claude tocca .orbit/run.json
      loadShelf(); // ricarica lo scaffale se Claude tocca .orbit/shelf.json
    });
    try {
      const s = await invoke<{ dir: string | null; file: string | null; search: string | null }>(
        "startup",
      );
      if (s.dir) {
        // avvio esplicito (arg CLI / env, es. "Nuova finestra"): apre quella cartella
        // ripristinandone la sessione (tab/layout) se esiste, altrimenti fresca
        await loadSession(s.dir);
        if (s.file) await openFile(s.file);
        if (s.search) {
          layout.sidebarView = "search";
          layout.sidebarVisible = true;
          setQuery(s.search);
        }
      } else {
        // nessun avvio esplicito: ripristina l'ultima sessione
        await loadSession();
      }
    } catch (e) {
      console.error("startup", e);
    }
    startAutosave(); // d'ora in poi persiste cartella, tab e pannelli
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
      case "p":
        e.preventDefault();
        openPalette();
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
    <Terminal id="float" active />
  </div>
{:else}
  <div class="shell">
    <TopBar />
    <div class="body">
      {#if layout.sidebarVisible}
        <Sidebar />
        <Splitter orientation="vertical" onResize={resizeSidebar} />
      {/if}

      <EditorArea />

      {#if layout.terminalVisible}
        <Splitter orientation="vertical" onResize={resizeTerminal} />
        <TerminalPanel />
      {/if}
    </div>

    <StatusBar />
  </div>

  {#if quickopen.open}
    <QuickOpen />
  {/if}
  {#if settingsUI.open}
    <Settings />
  {/if}
  <Toaster />
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
    padding: 4px;
    background: var(--color-bg);
  }
  .floatwrap {
    height: 100%;
    background: var(--color-surface-1);
  }
</style>
