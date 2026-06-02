<script lang="ts">
  import ActivityBar from "./lib/components/ActivityBar.svelte";
  import Sidebar from "./lib/components/Sidebar.svelte";
  import EditorArea from "./lib/components/EditorArea.svelte";
  import TerminalPanel from "./lib/components/TerminalPanel.svelte";
  import StatusBar from "./lib/components/StatusBar.svelte";
  import Splitter from "./lib/components/Splitter.svelte";
  import { layout, resizeSidebar, resizeTerminal } from "./lib/state/layout.svelte";
</script>

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
