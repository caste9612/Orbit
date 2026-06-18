<script lang="ts">
  // Pannello dedicato "Keyboard shortcuts": preset (Orbit / Visual Studio / IntelliJ) + riepilogo
  // completo. Aperto con un click da Impostazioni, così la lista non sporca i Settings.
  import { scale } from "svelte/transition";
  import Icon from "./Icon.svelte";
  import Backdrop from "./Backdrop.svelte";
  import { settings } from "../state/settings.svelte";
  import { shortcutGroups, closeShortcuts } from "../state/keybindings.svelte";

  const groups = $derived(shortcutGroups());
</script>

<Backdrop onClose={closeShortcuts} dim z={112} />

<div class="panel" role="dialog" aria-label="Keyboard shortcuts" transition:scale={{ duration: 110, start: 0.97, opacity: 0.3 }}>
  <header class="head">
    <span class="title">Keyboard shortcuts</span>
    <button class="x" aria-label="Close" onclick={closeShortcuts}><Icon name="x" size={16} strokeWidth={1.8} /></button>
  </header>

  <div class="kmrow">
    <span class="kmlabel">Keymap</span>
    <select class="control" bind:value={settings.keymap}>
      <option value="orbit">Orbit (default)</option>
      <option value="vs">Visual Studio</option>
      <option value="intellij">IntelliJ</option>
    </select>
  </div>

  <div class="list">
    {#each groups as g (g.category)}
      <div class="cat">{g.category}</div>
      {#each g.items as it (it.label)}
        <div class="scrow">
          <span class="lbl">{it.label}</span>
          <kbd>{it.key}</kbd>
        </div>
      {/each}
    {/each}
  </div>
</div>

<style>
  .panel {
    position: fixed;
    z-index: 113;
    top: 64px;
    left: 50%;
    transform: translateX(-50%);
    width: min(520px, 92vw);
    max-height: calc(100vh - 110px);
    display: flex;
    flex-direction: column;
    background: var(--color-surface-2);
    border: 1px solid var(--color-line-strong);
    border-radius: var(--radius-lg);
    box-shadow: var(--shadow-pop);
    overflow: hidden;
  }
  .head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 12px 14px;
    border-bottom: 1px solid var(--color-line);
    flex: 0 0 auto;
  }
  .title {
    font-size: 14px;
    font-weight: 600;
    color: var(--color-ink);
  }
  .x {
    display: grid;
    place-items: center;
    width: 26px;
    height: 26px;
    border: 0;
    border-radius: var(--radius-sm);
    background: transparent;
    color: var(--color-ink-muted);
    cursor: pointer;
  }
  .x:hover {
    background: var(--color-surface-3);
    color: var(--color-ink);
  }
  .kmrow {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    padding: 12px 14px;
    border-bottom: 1px solid var(--color-line);
    flex: 0 0 auto;
  }
  .kmlabel {
    font-size: 13px;
    color: var(--color-ink);
  }
  .control {
    background: var(--color-surface-1);
    border: 1px solid var(--color-line-strong);
    border-radius: var(--radius-sm);
    color: var(--color-ink);
    font-family: var(--font-sans);
    font-size: 12.5px;
    padding: 6px 8px;
    cursor: pointer;
    outline: none;
  }
  .control:focus {
    border-color: var(--color-accent);
  }
  .list {
    overflow-y: auto;
    padding: 8px 14px 14px;
  }
  .cat {
    font-size: 10.5px;
    font-weight: 600;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--color-ink-subtle);
    margin: 10px 0 4px;
  }
  .scrow {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 4px 0;
  }
  .lbl {
    font-size: 12.5px;
    color: var(--color-ink-muted);
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  kbd {
    flex: 0 0 auto;
    font-family: var(--font-mono);
    font-size: 11px;
    color: var(--color-ink);
    background: var(--color-surface-1);
    border: 1px solid var(--color-line-strong);
    border-bottom-width: 2px;
    border-radius: 5px;
    padding: 2px 7px;
  }
</style>
