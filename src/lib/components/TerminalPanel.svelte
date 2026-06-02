<script lang="ts">
  import Icon from "./Icon.svelte";
  import Terminal from "./Terminal.svelte";
  import { WebviewWindow } from "@tauri-apps/api/webviewWindow";
  import { layout, toggleTerminal } from "../state/layout.svelte";
  import { workspace } from "../state/workspace.svelte";

  async function detach() {
    const existing = await WebviewWindow.getByLabel("term-float");
    if (existing) {
      await existing.setFocus();
      return;
    }
    const w = new WebviewWindow("term-float", {
      url: window.location.href,
      title: "Lume · Terminale",
      width: 760,
      height: 460,
      minWidth: 360,
      minHeight: 200,
      alwaysOnTop: true,
    });
    w.once("tauri://error", (e) => console.error("finestra flottante:", e));
  }
</script>

<section class="terminal-panel" style="width:{layout.terminalWidth}px">
  <header class="head">
    <div class="tabs">
      <div class="tab active">
        <Icon name="terminal" size={13} strokeWidth={1.8} />
        <span>Terminale</span>
      </div>
    </div>
    <div class="actions">
      <button class="act" title="Apri in finestra flottante (always-on-top)" aria-label="Finestra flottante" onclick={detach}>
        <Icon name="external-link" size={14} strokeWidth={1.8} />
      </button>
      <button class="act" title="Nascondi pannello (Ctrl+`)" aria-label="Nascondi pannello" onclick={toggleTerminal}>
        <Icon name="x" size={15} strokeWidth={1.9} />
      </button>
    </div>
  </header>

  <div class="surface">
    <Terminal id="main" cwd={workspace.rootPath} persistent={true} />
  </div>
</section>

<style>
  .terminal-panel {
    flex: 0 0 auto;
    display: flex;
    flex-direction: column;
    background: var(--color-surface-1);
    overflow: hidden;
  }
  .head {
    height: 34px;
    flex: 0 0 34px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    background: var(--color-surface-2);
    border-bottom: 1px solid var(--color-line);
    padding: 0 6px 0 0;
  }
  .tabs {
    display: flex;
    align-items: stretch;
    height: 100%;
  }
  .tab {
    display: inline-flex;
    align-items: center;
    gap: 7px;
    height: 100%;
    padding: 0 14px;
    border-top: 2px solid transparent;
    color: var(--color-ink-muted);
    font-size: 12px;
  }
  .tab.active {
    color: var(--color-ink);
    border-top-color: var(--color-accent);
    background: var(--color-surface-1);
  }
  .actions {
    display: flex;
    align-items: center;
    gap: 1px;
  }
  .act {
    width: 28px;
    height: 26px;
    display: grid;
    place-items: center;
    background: transparent;
    border: 0;
    border-radius: 5px;
    color: var(--color-ink-muted);
    cursor: pointer;
    transition:
      color 90ms ease,
      background 90ms ease;
  }
  .act:hover {
    color: var(--color-ink);
    background: var(--color-surface-3);
  }
  .surface {
    flex: 1;
    min-height: 0;
    overflow: hidden;
  }
</style>
