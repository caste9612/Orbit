<script lang="ts">
  import { scale } from "svelte/transition";
  import Icon from "./Icon.svelte";
  import Switch from "./Switch.svelte";
  import Backdrop from "./Backdrop.svelte";
  import { settings, closeSettings, MONO_FONTS, ACCENTS, THEMES, SCROLLBACK_OPTIONS, type AccentName, type ThemeName } from "../state/settings.svelte";
  import { openShortcuts } from "../state/keybindings.svelte";
  import { openLogs } from "../state/logs.svelte";
  import { invoke } from "@tauri-apps/api/core";
  import { updates, checkForUpdates, openUpdateDialog } from "../state/updater.svelte";
  import {
    EDITOR_PRESETS,
    TERM_PRESETS,
    STYLE_NAMES,
    styleOf,
    type Blink,
    type CaretStyle,
    type EditorCaret,
    type EditorShape,
    type Glide,
    type Glow,
    type TermCaret,
    type TermShape,
    type Trail,
    type TrailLen,
  } from "../caretStyles";

  let version = $state("");
  void invoke<string>("app_version")
    .then((v) => (version = v))
    .catch(() => {});
  let updateHint = $derived(
    updates.available
      ? `Version ${updates.available.version} is available`
      : updates.checking
        ? "Checking…"
        : updates.checked
          ? "Up to date"
          : "New releases install in place and reopen your windows",
  );

  const accentNames = Object.keys(ACCENTS) as AccentName[];
  // il predefinito (VS 2026) per primo, poi gli altri nell'ordine di definizione
  const themeNames = ["vs2026", ...Object.keys(THEMES).filter((k) => k !== "vs2026")] as ThemeName[];

  // Cursore (M63): uno stile pronto riscrive il comportamento (la forma resta); un'opzione ritoccata fa
  // diventare lo stile "Custom" se non coincide più con uno pronto.
  let edOpen = $state(false);
  let tmOpen = $state(false);
  type Choices = [string, string][];
  const EDITOR_SHAPES: Choices = [["thin", "Thin line"], ["line", "Line"], ["thick", "Thick line"], ["block", "Block"], ["hollow", "Hollow block"], ["under", "Underline"]];
  const TERM_SHAPES: Choices = [["block", "Block"], ["hollow", "Hollow block"], ["bar", "Bar"], ["under", "Underline"]];
  const GLIDES: Choices = [["off", "Off"], ["jumps", "On jumps only"], ["always", "Always"]];
  const BLINKS: Choices = [["none", "Off"], ["hard", "Hard"], ["smooth", "Smooth"], ["phase", "Phase"], ["expand", "Expand"]];
  const TRAILS: Choices = [["none", "None"], ["comet", "Comet"], ["smear", "Elastic"], ["blaze", "Blaze"]];
  const TRAIL_LENS: Choices = [["short", "Short"], ["medium", "Medium"], ["long", "Long"]];
  const GLOWS: Choices = [["off", "Off"], ["on", "Steady"], ["breathe", "Breathing"]];
  function setEditorStyle(st: CaretStyle) {
    if (st !== "custom") settings.editorCaret = { ...settings.editorCaret, ...EDITOR_PRESETS[st], style: st };
  }
  function setTermStyle(st: CaretStyle) {
    if (st !== "custom") settings.termCaret = { ...settings.termCaret, ...TERM_PRESETS[st], style: st };
  }
  function setEditor<K extends keyof EditorCaret>(k: K, v: EditorCaret[K]) {
    const next = { ...settings.editorCaret, [k]: v };
    next.style = styleOf(next, EDITOR_PRESETS);
    settings.editorCaret = next;
  }
  function setTerm<K extends keyof TermCaret>(k: K, v: TermCaret[K]) {
    const next = { ...settings.termCaret, [k]: v };
    next.style = styleOf(next, TERM_PRESETS);
    settings.termCaret = next;
  }
</script>

{#snippet opt(label: string, value: string, choices: [string, string][], pick: (v: string) => void)}
  <div class="sub">
    <span class="sname">{label}</span>
    <select class="control" {value} onchange={(e) => pick(e.currentTarget.value)}>
      {#each choices as [v, name] (v)}
        <option value={v}>{name}</option>
      {/each}
    </select>
  </div>
{/snippet}

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
        <span class="name">Editor font size</span>
        <span class="hint">Or Ctrl+scroll over the editor</span>
      </div>
      <div class="size">
        <input type="range" min="10" max="24" step="1" bind:value={settings.editorFontSize} />
        <span class="px">{settings.editorFontSize}px</span>
      </div>
    </div>
    <div class="row">
      <div class="label">
        <span class="name">Terminal font size</span>
        <span class="hint">Or Ctrl+scroll over the terminal</span>
      </div>
      <div class="size">
        <input type="range" min="10" max="24" step="1" bind:value={settings.terminalFontSize} />
        <span class="px">{settings.terminalFontSize}px</span>
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
        <span class="name">Smooth panel transitions</span>
        <span class="hint">Animate panel sizes when switching repos, collapsing the editor or arranging chats (ignores the system "reduce motion" setting)</span>
      </div>
      <Switch
        checked={settings.motion}
        onToggle={() => (settings.motion = !settings.motion)}
        label="Smooth panel transitions"
      />
    </div>

    <div class="row" class:open={edOpen}>
      <div class="label">
        <span class="name">Editor cursor</span>
        <span class="hint">The caret in code files — <em>Customize</em> for shape, glide, blink, trail and glow</span>
      </div>
      <div class="pair">
        <select class="control" value={settings.editorCaret.style} onchange={(e) => setEditorStyle(e.currentTarget.value as CaretStyle)}>
          {#each STYLE_NAMES as [v, name] (v)}
            <option value={v}>{name}</option>
          {/each}
          {#if settings.editorCaret.style === "custom"}<option value="custom">Custom</option>{/if}
        </select>
        <button class="control" aria-expanded={edOpen} onclick={() => (edOpen = !edOpen)}>Customize</button>
      </div>
    </div>
    {#if edOpen}
      <div class="subs">
        {@render opt("Shape", settings.editorCaret.shape, EDITOR_SHAPES, (v) => setEditor("shape", v as EditorShape))}
        {@render opt("Glide", settings.editorCaret.glide, GLIDES, (v) => setEditor("glide", v as Glide))}
        {@render opt("Blink", settings.editorCaret.blink, BLINKS, (v) => setEditor("blink", v as Blink))}
        {@render opt("Trail", settings.editorCaret.trail, TRAILS, (v) => setEditor("trail", v as Trail))}
        {#if settings.editorCaret.trail !== "none"}
          {@render opt("Trail length", settings.editorCaret.trailLen, TRAIL_LENS, (v) => setEditor("trailLen", v as TrailLen))}
        {/if}
        {@render opt("Glow", settings.editorCaret.glow, GLOWS, (v) => setEditor("glow", v as Glow))}
      </div>
    {/if}

    <div class="row" class:open={tmOpen}>
      <div class="label">
        <span class="name">Terminal cursor</span>
        <span class="hint">Shells and Claude chats (a bar in chats by default); fast output never animates</span>
      </div>
      <div class="pair">
        <select class="control" value={settings.termCaret.style} onchange={(e) => setTermStyle(e.currentTarget.value as CaretStyle)}>
          {#each STYLE_NAMES as [v, name] (v)}
            <option value={v}>{name}</option>
          {/each}
          {#if settings.termCaret.style === "custom"}<option value="custom">Custom</option>{/if}
        </select>
        <button class="control" aria-expanded={tmOpen} onclick={() => (tmOpen = !tmOpen)}>Customize</button>
      </div>
    </div>
    {#if tmOpen}
      <div class="subs">
        {@render opt("Shape in shells", settings.termCaret.shell, TERM_SHAPES, (v) => setTerm("shell", v as TermShape))}
        {@render opt("Shape in Claude chats", settings.termCaret.chat, TERM_SHAPES, (v) => setTerm("chat", v as TermShape))}
        {@render opt("Glide", settings.termCaret.glide, GLIDES, (v) => setTerm("glide", v as Glide))}
        {@render opt("Blink", settings.termCaret.blink, BLINKS, (v) => setTerm("blink", v as Blink))}
        {@render opt("Trail", settings.termCaret.trail, TRAILS, (v) => setTerm("trail", v as Trail))}
        {#if settings.termCaret.trail !== "none"}
          {@render opt("Trail length", settings.termCaret.trailLen, TRAIL_LENS, (v) => setTerm("trailLen", v as TrailLen))}
        {/if}
        {@render opt("Glow", settings.termCaret.glow, GLOWS, (v) => setTerm("glow", v as Glow))}
      </div>
    {/if}

    <div class="row">
      <div class="label">
        <span class="name">Code lens</span>
        <span class="hint">References and implementations above classes and methods (counted by name)</span>
      </div>
      <Switch
        checked={settings.codeLens}
        onToggle={() => (settings.codeLens = !settings.codeLens)}
        label="Code lens"
      />
    </div>

    <div class="row">
      <div class="label">
        <span class="name">Autosave</span>
        <span class="hint">Save edited files on focus loss and when switching tabs (IntelliJ-style)</span>
      </div>
      <Switch
        checked={settings.autosave}
        onToggle={() => (settings.autosave = !settings.autosave)}
        label="Autosave"
      />
    </div>

    <div class="row">
      <div class="label">
        <span class="name">Open Markdown as</span>
        <span class="hint">Default view for <code>.md</code> files — preview, source, or preview for READMEs only</span>
      </div>
      <select class="control" bind:value={settings.mdMode}>
        <option value="readme">README only</option>
        <option value="preview">Preview</option>
        <option value="source">Source</option>
      </select>
    </div>

    <div class="row">
      <div class="label">
        <span class="name">Terminal GPU rendering (WebGL)</span>
        <span class="hint">Draws terminal text on the GPU — much less CPU with busy output; only visible terminals use it</span>
      </div>
      <Switch
        checked={settings.webgl}
        onToggle={() => (settings.webgl = !settings.webgl)}
        label="Terminal GPU rendering"
      />
    </div>

    <div class="row">
      <div class="label">
        <span class="name">Terminal scrollback</span>
        <span class="hint">Lines of history kept per terminal — more lines use more memory</span>
      </div>
      <select class="control" bind:value={settings.terminalScrollback}>
        {#each SCROLLBACK_OPTIONS as n (n)}
          <option value={n}>{n.toLocaleString("en-US")} lines</option>
        {/each}
      </select>
    </div>

    <div class="row">
      <div class="label">
        <span class="name">Keyboard shortcuts</span>
        <span class="hint">Preset (Orbit / Visual Studio / IntelliJ) and full reference</span>
      </div>
      <button class="control" onclick={openShortcuts}>View &amp; presets…</button>
    </div>

    <div class="row">
      <div class="label">
        <span class="name">Diagnostic logs</span>
        <span class="hint">Collect logs (paste, clipboard, terminal, errors) to investigate issues; export from the viewer</span>
      </div>
      <Switch
        checked={settings.logging}
        onToggle={() => (settings.logging = !settings.logging)}
        label="Collect diagnostic logs"
      />
    </div>

    <div class="row">
      <div class="label">
        <span class="name">Log viewer</span>
        <span class="hint">View, filter and export the collected logs</span>
      </div>
      <button class="control" onclick={() => { closeSettings(); openLogs(); }}>Open logs…</button>
    </div>

    <div class="row">
      <div class="label">
        <span class="name">Check for updates automatically</span>
        <span class="hint">At startup and every 6 hours, from the releases on GitHub</span>
      </div>
      <Switch
        checked={settings.checkUpdates}
        onToggle={() => (settings.checkUpdates = !settings.checkUpdates)}
        label="Check for updates automatically"
      />
    </div>
  </div>

  <!-- versione e aggiornamenti fuori dalla lista che scorre: sempre in vista (M61) -->
  <footer class="foot">
    <div class="label">
      <span class="name">Orbit {version}</span>
      <span class="hint">{updateHint}</span>
    </div>
    {#if updates.available}
      <button class="control" onclick={() => { closeSettings(); openUpdateDialog(); }}>Update…</button>
    {:else}
      <button class="control" disabled={updates.checking} onclick={() => void checkForUpdates(true)}>Check now</button>
    {/if}
  </footer>
</div>

<style>
  .panel {
    position: fixed;
    z-index: 111;
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
    min-height: 0; /* scorre solo la lista: testata e piè restano fermi */
    padding: 6px 14px 14px;
    overflow-y: auto;
    scrollbar-gutter: stable;
  }
  /* 26px a destra = 14 di padding + 12 della scrollbar (app.css) riservata nella lista: il pulsante
     resta allineato ai controlli delle righe sopra */
  .foot {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    padding: 11px 26px 11px 14px;
    border-top: 1px solid var(--color-line);
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
  /* cursore (M63): stile + "Customize", con le opzioni sotto, rientrate */
  .pair {
    display: flex;
    gap: 6px;
    flex: 0 0 auto;
  }
  .row.open {
    border-bottom-color: transparent;
  }
  .subs {
    margin: -8px 0 0;
    padding: 2px 0 10px 12px;
    border-left: 2px solid rgba(var(--accent-rgb), 0.35);
    border-bottom: 1px solid var(--color-line);
  }
  .sub {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    padding: 4px 0;
  }
  .sname {
    font-size: 12.5px;
    color: var(--color-ink-muted);
  }
  .sub select {
    min-width: 132px; /* stessa larghezza per tutti: le scelte si leggono in colonna */
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
    border-radius: var(--r-md);
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
    border-radius: var(--r-xxl);
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
