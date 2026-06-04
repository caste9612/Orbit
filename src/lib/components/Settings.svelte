<script lang="ts">
  import { scale } from "svelte/transition";
  import Icon from "./Icon.svelte";
  import Switch from "./Switch.svelte";
  import Backdrop from "./Backdrop.svelte";
  import { settings, closeSettings, MONO_FONTS, ACCENTS, type AccentName } from "../state/settings.svelte";

  const accentNames = Object.keys(ACCENTS) as AccentName[];
</script>

<Backdrop onClose={closeSettings} dim z={110} />

<div class="panel" role="dialog" aria-label="Settings" transition:scale={{ duration: 110, start: 0.97, opacity: 0.3 }}>
  <header class="head">
    <span class="title">Settings</span>
    <button class="x" aria-label="Close" onclick={closeSettings}><Icon name="x" size={16} strokeWidth={1.8} /></button>
  </header>

  <div class="body">
    <div class="row">
      <div class="label">
        <span class="name">Editor &amp; terminal font</span>
        <span class="hint">Monospace family for code and terminal</span>
      </div>
      <select class="control" bind:value={settings.fontMono}>
        {#each MONO_FONTS as f (f.label)}
          <option value={f.label}>{f.label}</option>
        {/each}
      </select>
    </div>

    <div class="row">
      <div class="label">
        <span class="name">Font size</span>
        <span class="hint">Editor and terminal</span>
      </div>
      <div class="size">
        <input type="range" min="10" max="24" step="1" bind:value={settings.fontSize} />
        <span class="px">{settings.fontSize}px</span>
      </div>
    </div>

    <div class="row">
      <div class="label">
        <span class="name">Accent color</span>
        <span class="hint">Interface highlight</span>
      </div>
      <div class="swatches">
        {#each accentNames as a (a)}
          <button
            class="swatch"
            class:on={settings.accent === a}
            style="--sw:{ACCENTS[a].accent}"
            title={a}
            aria-label={a}
            onclick={() => (settings.accent = a)}
          ></button>
        {/each}
      </div>
    </div>

    <div class="row">
      <div class="label">
        <span class="name">Launch Claude in the default terminal</span>
        <span class="hint">When Orbit opens a terminal for you, start <code>claude</code> instead of a plain shell</span>
      </div>
      <Switch
        checked={settings.claudeTerminal}
        onToggle={() => (settings.claudeTerminal = !settings.claudeTerminal)}
        label="Launch Claude in the default terminal"
      />
    </div>

    <div class="row">
      <div class="label">
        <span class="name">Smooth caret</span>
        <span class="hint">Animate the editor cursor while typing</span>
      </div>
      <Switch
        checked={settings.smoothCursor}
        onToggle={() => (settings.smoothCursor = !settings.smoothCursor)}
        label="Smooth caret"
      />
    </div>

    <div class="row">
      <div class="label">
        <span class="name">Terminal GPU rendering (WebGL)</span>
        <span class="hint">Sharper text — uses noticeably more memory</span>
      </div>
      <Switch
        checked={settings.webgl}
        onToggle={() => (settings.webgl = !settings.webgl)}
        label="Terminal GPU rendering"
      />
    </div>
  </div>
</div>

<style>
  .panel {
    position: fixed;
    z-index: 111;
    top: 64px;
    left: 50%;
    transform: translateX(-50%);
    width: min(520px, 92vw);
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
  .body {
    padding: 6px 14px 14px;
  }
  .row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    padding: 13px 0;
    border-bottom: 1px solid var(--color-line);
  }
  .row:last-child {
    border-bottom: 0;
  }
  .label {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
  }
  .name {
    font-size: 13px;
    color: var(--color-ink);
  }
  .hint {
    font-size: 11.5px;
    color: var(--color-ink-subtle);
  }
  .hint code {
    font-family: var(--font-mono);
    font-size: 0.92em;
    color: var(--color-ink-muted);
  }
  .control {
    flex: 0 0 auto;
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
  .size {
    display: flex;
    align-items: center;
    gap: 10px;
  }
  .size input {
    accent-color: var(--color-accent);
  }
  .px {
    font-family: var(--font-mono);
    font-size: 12px;
    color: var(--color-ink-muted);
    min-width: 38px;
    text-align: right;
  }
  .swatches {
    display: flex;
    gap: 8px;
  }
  .swatch {
    width: 24px;
    height: 24px;
    border-radius: 50%;
    border: 2px solid transparent;
    background: var(--sw);
    cursor: pointer;
    transition: transform 90ms ease;
  }
  .swatch:hover {
    transform: scale(1.1);
  }
  .swatch.on {
    border-color: var(--color-ink);
    box-shadow: 0 0 0 2px var(--color-surface-2) inset;
  }
</style>
