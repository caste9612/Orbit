<script lang="ts">
  import Icon from "./Icon.svelte";
  import { layout, toggleTerminal } from "../state/layout.svelte";
</script>

<section class="terminal-panel" style="height:{layout.terminalHeight}px">
  <header class="head">
    <div class="tabs">
      <button class="tab active">
        <Icon name="terminal" size={13} strokeWidth={1.8} />
        <span>Terminale</span>
      </button>
    </div>
    <div class="actions">
      <button class="act" title="Nuovo terminale" aria-label="Nuovo terminale">
        <Icon name="plus" size={15} strokeWidth={1.9} />
      </button>
      <button class="act" title="Sposta in finestra flottante" aria-label="Sposta in finestra flottante">
        <Icon name="external-link" size={14} strokeWidth={1.8} />
      </button>
      <button class="act" title="Chiudi pannello" aria-label="Chiudi pannello" onclick={toggleTerminal}>
        <Icon name="x" size={15} strokeWidth={1.9} />
      </button>
    </div>
  </header>

  <div class="surface">
    <div class="ghost">
      <span class="prompt">$</span> il terminale integrato apparirà qui (milestone 6)
    </div>
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
    background: transparent;
    border: 0;
    border-top: 2px solid transparent;
    color: var(--color-ink-muted);
    font-size: 12px;
    cursor: pointer;
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
    overflow: auto;
    padding: 8px 12px;
    font-family: var(--font-mono);
    font-size: 12.5px;
    line-height: 1.5;
    color: var(--color-ink);
  }
  .ghost {
    color: var(--color-ink-subtle);
  }
  .prompt {
    color: var(--color-success);
    margin-right: 6px;
  }
</style>
