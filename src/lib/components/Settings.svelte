<script lang="ts">
  import { scale } from "svelte/transition";
  import Icon from "./Icon.svelte";
  import Switch from "./Switch.svelte";
  import Backdrop from "./Backdrop.svelte";
  import { settings, closeSettings, MONO_FONTS, ACCENTS, THEMES, type AccentName, type ThemeName } from "../state/settings.svelte";
  import { openShortcuts } from "../state/keybindings.svelte";

  const accentNames = Object.keys(ACCENTS) as AccentName[];
  const themeNames = Object.keys(THEMES) as ThemeName[];
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
        <span class="name">Theme</span>
        <span class="hint">Full color palette — editor included</span>
      </div>
      <div class="swatches">
        {#each themeNames as tn (tn)}
          {@const th = THEMES[tn]}
          <button
            class="theme-sw"
            class:on={settings.theme === tn}
            style="background:{th.vars['color-surface-1']}; box-shadow: inset 0 0 0 1px {th.vars['color-line-strong']}"
            title={th.label}
            aria-label={th.label}
            onclick={() => (settings.theme = tn)}
          >
            <span class="tdot" style="background:{th.vars['color-accent']}"></span>
          </button>
        {/each}
      </div>
    </div>

    <div class="row">
      <div class="label">
        <span class="name">Accent color</span>
        <span class="hint">Interface highlight — Auto follows the theme</span>
      </div>
      <div class="swatches">
        <button
          class="autoacc"
          class:on={settings.accent === "auto"}
          title="Match the theme's accent"
          onclick={() => (settings.accent = "auto")}>Auto</button
        >
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
        <span class="name">Notify when a terminal needs you</span>
        <span class="hint">A toast and a tab marker when a terminal rings the bell — e.g. <code>claude</code> finished or is waiting — while you're looking elsewhere</span>
      </div>
      <Switch
        checked={settings.bellNotify}
        onToggle={() => (settings.bellNotify = !settings.bellNotify)}
        label="Notify when a terminal needs you"
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

    <div class="row">
      <div class="label">
        <span class="name">Keyboard shortcuts</span>
        <span class="hint">Preset (Orbit / Visual Studio / IntelliJ) and full reference</span>
      </div>
      <button class="control" onclick={openShortcuts}>View &amp; presets…</button>
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
    max-height: calc(100vh - 120px);
    overflow-y: auto;
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
    align-items: center;
    flex-wrap: wrap;
    justify-content: flex-end;
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
  /* preview di tema (anteprima viva: superficie editor + pallino accento del tema) */
  .theme-sw {
    width: 30px;
    height: 22px;
    border-radius: 6px;
    border: 2px solid transparent;
    display: grid;
    place-items: center;
    cursor: pointer;
    transition: transform 90ms ease;
  }
  .theme-sw:hover {
    transform: scale(1.08);
  }
  .theme-sw.on {
    border-color: var(--color-accent);
  }
  .tdot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
  }
  /* chip "Auto": l'accento segue il tema (vedi anche gli swatch espliciti accanto) */
  .autoacc {
    height: 24px;
    padding: 0 10px;
    border-radius: 12px;
    border: 2px solid transparent;
    background: var(--color-surface-1);
    color: var(--color-ink-muted);
    font-family: var(--font-sans);
    font-size: 11.5px;
    cursor: pointer;
    transition:
      color 90ms ease,
      border-color 90ms ease;
  }
  .autoacc:hover {
    color: var(--color-ink);
  }
  .autoacc.on {
    border-color: var(--color-accent);
    color: var(--color-ink);
  }
  /* "View & presets…" usa lo stile .control (come i select) ma è un button */
  button.control {
    cursor: pointer;
  }
</style>
