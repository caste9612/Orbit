<script lang="ts">
  // Impostazioni (M64): una finestra grande a categorie, come in JetBrains — ricerca in alto, categorie a
  // sinistra, voci a destra, versione e aggiornamenti in fondo. Ogni voce è descritta in ROWS (nome,
  // descrizione e parole chiave: la ricerca guarda lì) e disegnata dallo snippet `control`; la categoria
  // Keyboard aggiunge l'elenco delle scorciatoie (SettingsKeyboard, prima una finestra a parte).
  import { onMount, untrack } from "svelte";
  import { scale } from "svelte/transition";
  import Icon from "./Icon.svelte";
  import Switch from "./Switch.svelte";
  import Backdrop from "./Backdrop.svelte";
  import Lazy from "./Lazy.svelte";
  import MatchText from "./MatchText.svelte";
  import SettingsKeyboard from "./SettingsKeyboard.svelte";
  import SettingsShelf from "./SettingsShelf.svelte";
  import { shelfUi, setShelfPeek, shelfGlobal } from "../state/shelf.svelte";
  import {
    settings,
    settingsUI,
    closeSettings,
    MONO_FONTS,
    ACCENTS,
    THEMES,
    SCROLLBACK_OPTIONS,
    MIN_FONT,
    MAX_FONT,
    type AccentName,
    type ThemeName,
    type SettingsSection,
  } from "../state/settings.svelte";
  import { mergedGroups, formatKey, hasCustom, createCustom, deleteCustom } from "../state/keybindings.svelte";
  import { openLogs } from "../state/logs.svelte";
  import { openPrompts, openClaudeConfig } from "../state/claude.svelte";
  import { workspace } from "../state/workspace.svelte";
  import { invoke } from "@tauri-apps/api/core";
  import { updates, checkForUpdates, openUpdateDialog } from "../state/updater.svelte";
  import { queryTerms, matchesAll } from "../searchText";
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

  // ---- versione e aggiornamenti (piè della finestra, M61) ----------------------------------------
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

  // ---- categorie e voci ---------------------------------------------------------------------------
  const SECTIONS: { id: SettingsSection; label: string; icon: string }[] = [
    { id: "appearance", label: "Appearance", icon: "paintbrush" },
    { id: "editor", label: "Editor", icon: "code" },
    { id: "shelf", label: "Shelf", icon: "archive" },
    { id: "terminal", label: "Terminal", icon: "terminal" },
    { id: "claude", label: "Claude", icon: "sparkles" },
    { id: "notifications", label: "Notifications", icon: "bell" },
    { id: "keyboard", label: "Keyboard", icon: "keyboard" },
    { id: "updates", label: "Updates & logs", icon: "download" },
  ];
  const labelOf = (s: SettingsSection) => SECTIONS.find((x) => x.id === s)?.label ?? "";

  const accentNames = Object.keys(ACCENTS) as AccentName[];
  // il predefinito (VS 2026) per primo, poi gli altri nell'ordine di definizione
  const themeNames = ["vs2026", ...Object.keys(THEMES).filter((k) => k !== "vs2026")] as ThemeName[];

  type RowId =
    | "theme" | "accent" | "motion"
    | "edFont" | "edSize" | "edCaret" | "codeLens" | "autosave" | "mdMode"
    | "shelfPeek" | "shelfRules"
    | "tmFont" | "tmSize" | "tmCaret" | "webgl" | "scrollback"
    | "claudeTerminal" | "claudeNotify" | "claudeMenu"
    | "bellNotify" | "notifySound" | "dnd"
    | "keymap"
    | "checkUpdates" | "logging" | "logViewer";
  interface Row {
    id: RowId;
    section: SettingsSection;
    name: string;
    hint: string; // `codice` fra backtick
    kw?: string; // parole in più per la ricerca (sinonimi, valori)
  }
  const CARET_KW = "caret blink glide trail glow shape smooth classic comet elastic blaze";
  const ROWS: Row[] = [
    { id: "theme", section: "appearance", name: "Theme", hint: "Full color palette — editor and terminal included",
      kw: `colors dark light ${themeNames.map((t) => THEMES[t].label).join(" ")}` },
    { id: "accent", section: "appearance", name: "Accent color", hint: "Interface highlight — Auto follows the theme",
      kw: `colour ${accentNames.join(" ")}` },
    { id: "motion", section: "appearance", name: "Smooth panel transitions",
      hint: "Animate panel sizes when switching repos, collapsing the editor or arranging chats (ignores the system “reduce motion” setting)",
      kw: "animation motion" },

    { id: "edFont", section: "editor", name: "Font", hint: "Monospace family for code — shared with the terminal", kw: "family typeface" },
    { id: "edSize", section: "editor", name: "Font size", hint: "Or Ctrl+scroll over the editor", kw: "zoom" },
    { id: "edCaret", section: "editor", name: "Cursor", hint: "The caret in code files — Customize for shape, glide, blink, trail and glow", kw: CARET_KW },
    { id: "codeLens", section: "editor", name: "Code lens", hint: "References and implementations above classes and methods (counted by name)" },
    { id: "autosave", section: "editor", name: "Autosave", hint: "Save edited files on focus loss and when switching tabs (IntelliJ-style)", kw: "save" },
    { id: "mdMode", section: "editor", name: "Open Markdown as", hint: "Default view for `.md` files — preview, source, or preview for READMEs only",
      kw: "markdown readme preview source" },

    { id: "shelfPeek", section: "shelf", name: "Show shelved items in the tree",
      hint: "Shelved folders and files stay in place, dimmed — the eye in the Shelf header does the same", kw: "shelf dim hide peek explorer" },
    { id: "shelfRules", section: "shelf", name: "Rules for every repository",
      hint: "Names or patterns (`*`, `?`) shelved in every repository on this PC — below, with the categories' colors and search option",
      kw: "shelf global pattern folders files category color search quick open explorer" },

    { id: "tmFont", section: "terminal", name: "Font", hint: "Monospace family — shared with the editor", kw: "family typeface" },
    { id: "tmSize", section: "terminal", name: "Font size", hint: "Or Ctrl+scroll over the terminal", kw: "zoom" },
    { id: "tmCaret", section: "terminal", name: "Cursor", hint: "Shells and Claude chats (a bar in chats by default); fast output never animates it", kw: CARET_KW },
    { id: "webgl", section: "terminal", name: "GPU rendering (WebGL)",
      hint: "Draws terminal text on the GPU — much less CPU with busy output; only visible terminals use it", kw: "performance" },
    { id: "scrollback", section: "terminal", name: "Scrollback", hint: "Lines of history kept per terminal — more lines use more memory",
      kw: "history lines buffer memory" },

    { id: "claudeTerminal", section: "claude", name: "Launch Claude in the default terminal",
      hint: "When Orbit opens a terminal for you, start `claude` instead of a plain shell" },
    { id: "claudeNotify", section: "claude", name: "When a chat is waiting",
      hint: "Notices, sound and Do not disturb have their own page", kw: "notification bell attention sound" },
    { id: "claudeMenu", section: "claude", name: "Claude menu of this project",
      hint: "Prompts, wrappers, command and flags live in `.orbit/claude.json`, next to the code", kw: "shortcuts args model" },

    { id: "bellNotify", section: "notifications", name: "Notify when a chat is waiting",
      hint: "A notice and a tab marker when a terminal rings the bell — e.g. `claude` finished or is waiting — while you're looking elsewhere; with more chats, one notice lists them all",
      kw: "notification bell attention claude terminal" },
    { id: "notifySound", section: "notifications", name: "Play a sound",
      hint: "A short chime when a chat is waiting and Orbit isn't in front", kw: "audio chime notification" },
    { id: "dnd", section: "notifications", name: "Do not disturb",
      hint: "Only errors show up as notices, with no sound; everything still goes to the 🔔 list in the status bar",
      kw: "quiet mute silence focus notification" },

    { id: "keymap", section: "keyboard", name: "Keymap", hint: "Shortcut preset — Orbit, Visual Studio or IntelliJ; Customize to rebind them",
      kw: "keybindings shortcuts preset custom" },

    { id: "checkUpdates", section: "updates", name: "Check for updates automatically", hint: "At startup and every 6 hours, from the releases on GitHub",
      kw: "version release" },
    { id: "logging", section: "updates", name: "Diagnostic logs",
      hint: "Collect logs (paste, clipboard, terminal, errors) to investigate issues; export them from the viewer", kw: "debug" },
    { id: "logViewer", section: "updates", name: "Log viewer", hint: "View, filter and export the collected logs", kw: "debug" },
  ];

  type BoolKey =
    | "motion" | "codeLens" | "autosave" | "webgl" | "claudeTerminal" | "bellNotify" | "notifySound" | "dnd" | "checkUpdates" | "logging";
  const SWITCHES: Partial<Record<RowId, BoolKey>> = {
    motion: "motion",
    codeLens: "codeLens",
    autosave: "autosave",
    webgl: "webgl",
    claudeTerminal: "claudeTerminal",
    bellNotify: "bellNotify",
    notifySound: "notifySound",
    dnd: "dnd",
    checkUpdates: "checkUpdates",
    logging: "logging",
  };

  function hintOf(r: Row): string {
    if (r.id === "keymap" && settings.keymap === "custom")
      return "Click a shortcut below to rebind it — press the new keys, or Esc to cancel";
    if (r.id === "claudeMenu" && !workspace.rootPath)
      return "Open a project to edit its prompts, wrappers and flags (`.orbit/claude.json`)";
    return r.hint;
  }

  // ---- ricerca -------------------------------------------------------------------------------------
  let query = $state("");
  const terms = $derived(queryTerms(query));
  const searching = $derived(terms.length > 0);
  const hits = $derived(
    ROWS.filter((r) => matchesAll(`${r.name} ${r.hint} ${r.kw ?? ""} ${labelOf(r.section)}`, terms)),
  );
  // scorciatoie: tutte nella categoria Keyboard, quelle trovate quando si cerca
  const kbGroups = $derived.by(() => {
    const all = mergedGroups();
    if (!searching) return all;
    return all
      .map((g) => ({
        category: g.category,
        items: g.items.filter((it) =>
          matchesAll(`${it.label} ${it.key} ${formatKey(it.key)} ${g.category} keyboard shortcut`, terms),
        ),
      }))
      .filter((g) => g.items.length > 0);
  });
  const kbCount = $derived(kbGroups.reduce((n, g) => n + g.items.length, 0));
  const countIn = (s: SettingsSection) => hits.filter((r) => r.section === s).length + (s === "keyboard" ? kbCount : 0);

  let searchEl = $state<HTMLInputElement>();
  let contentEl = $state<HTMLDivElement>();

  function go(s: SettingsSection) {
    query = "";
    settingsUI.section = s;
  }
  // un'altra categoria o un'altra ricerca: si riparte dall'alto
  $effect(() => {
    void settingsUI.section;
    void terms;
    untrack(() => contentEl && (contentEl.scrollTop = 0));
  });

  function onSearchKey(e: KeyboardEvent) {
    // il primo Esc svuota la ricerca; con la ricerca vuota chiude la finestra (Backdrop)
    if (e.key === "Escape" && query) {
      e.stopPropagation();
      query = "";
    }
  }
  function onWindowKey(e: KeyboardEvent) {
    if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && e.key.toLowerCase() === "f") {
      e.preventDefault();
      searchEl?.focus();
      searchEl?.select();
    }
  }
  onMount(() => searchEl?.focus());

  // ---- cursore (M63): uno stile pronto riscrive il comportamento (la forma resta); un'opzione
  // ritoccata fa diventare lo stile "Custom" se non coincide più con uno pronto.
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
  // altezza delle anteprime prima che arrivino (CodeMirror/xterm a richiesta): le voci sotto non saltano
  const edPreviewH = $derived(Math.round(settings.editorFontSize * 1.55 * 5 + 14));
  const tmPreviewH = $derived(Math.round(settings.terminalFontSize * 1.55) * 5 + 42); // righe di xterm: ~1,55 × font

  // ---- tastiera ------------------------------------------------------------------------------------
  function customize() {
    if (settings.keymap === "custom") return;
    if (hasCustom())
      settings.keymap = "custom"; // riprendi la mappa esistente senza sovrascriverla
    else createCustom(settings.keymap); // copia il preset attivo in una nuova mappa Custom
  }
</script>

<svelte:window onkeydown={onWindowKey} />

{#snippet opt(label: string, value: string, choices: Choices, pick: (v: string) => void)}
  <label class="sub">
    <span class="sname">{label}</span>
    <select class="control" {value} onchange={(e) => pick(e.currentTarget.value)}>
      {#each choices as [v, name] (v)}
        <option value={v}>{name}</option>
      {/each}
    </select>
  </label>
{/snippet}

{#snippet styleSelect(value: CaretStyle, pick: (v: CaretStyle) => void)}
  <select class="control" {value} onchange={(e) => pick(e.currentTarget.value as CaretStyle)}>
    {#each STYLE_NAMES as [v, name] (v)}
      <option value={v}>{name}</option>
    {/each}
    {#if value === "custom"}<option value="custom">Custom</option>{/if}
  </select>
{/snippet}

{#snippet control(id: RowId)}
  {@const sw = SWITCHES[id]}
  {#if id === "shelfPeek"}
    <Switch checked={shelfUi.peek} onToggle={() => setShelfPeek(!shelfUi.peek)} label="Show shelved items in the tree" />
  {:else if id === "shelfRules"}
    {@const n = Object.keys(shelfGlobal.folders).length + Object.keys(shelfGlobal.files).length}
    <span class="ctext">{n === 1 ? "1 rule" : `${n} rules`}</span>
  {:else if sw}
    <Switch checked={settings[sw]} onToggle={() => (settings[sw] = !settings[sw])} label={ROWS.find((r) => r.id === id)?.name} />
  {:else if id === "accent"}
    <div class="swatches">
      <button class="autoacc" class:on={settings.accent === "auto"} title="Match the theme's accent" onclick={() => (settings.accent = "auto")}
        >Auto</button
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
  {:else if id === "edFont" || id === "tmFont"}
    <select class="control" bind:value={settings.fontMono}>
      {#each MONO_FONTS as f (f.label)}
        <option value={f.label}>{f.label}</option>
      {/each}
    </select>
  {:else if id === "edSize"}
    <div class="size">
      <input type="range" min={MIN_FONT} max={MAX_FONT} step="1" bind:value={settings.editorFontSize} aria-label="Editor font size" />
      <span class="px">{settings.editorFontSize}px</span>
    </div>
  {:else if id === "tmSize"}
    <div class="size">
      <input type="range" min={MIN_FONT} max={MAX_FONT} step="1" bind:value={settings.terminalFontSize} aria-label="Terminal font size" />
      <span class="px">{settings.terminalFontSize}px</span>
    </div>
  {:else if id === "edCaret"}
    <div class="pair">
      {@render styleSelect(settings.editorCaret.style, setEditorStyle)}
      <button class="control more" aria-expanded={edOpen} onclick={() => (edOpen = !edOpen)}>
        Customize<Icon name="chevron-down" size={12} strokeWidth={2} />
      </button>
    </div>
  {:else if id === "tmCaret"}
    <div class="pair">
      {@render styleSelect(settings.termCaret.style, setTermStyle)}
      <button class="control more" aria-expanded={tmOpen} onclick={() => (tmOpen = !tmOpen)}>
        Customize<Icon name="chevron-down" size={12} strokeWidth={2} />
      </button>
    </div>
  {:else if id === "mdMode"}
    <select class="control" bind:value={settings.mdMode}>
      <option value="readme">README only</option>
      <option value="preview">Preview</option>
      <option value="source">Source</option>
    </select>
  {:else if id === "scrollback"}
    <select class="control" bind:value={settings.terminalScrollback}>
      {#each SCROLLBACK_OPTIONS as n (n)}
        <option value={n}>{n.toLocaleString("en-US")} lines</option>
      {/each}
    </select>
  {:else if id === "claudeNotify"}
    <button class="control" onclick={() => go("notifications")}>Open</button>
  {:else if id === "claudeMenu"}
    <div class="pair">
      <button class="control" disabled={!workspace.rootPath} onclick={() => { closeSettings(); openPrompts(); }}>Add / remove prompts…</button>
      <button class="control" disabled={!workspace.rootPath} onclick={() => { closeSettings(); void openClaudeConfig(); }}>Edit JSON</button>
    </div>
  {:else if id === "keymap"}
    <div class="pair">
      <select class="control" bind:value={settings.keymap}>
        <option value="orbit">Orbit (default)</option>
        <option value="vs">Visual Studio</option>
        <option value="intellij">IntelliJ</option>
        {#if hasCustom()}<option value="custom">Custom</option>{/if}
      </select>
      {#if settings.keymap === "custom"}
        <button class="control danger" onclick={() => deleteCustom("orbit")} title="Delete the custom keymap and go back to Orbit">Delete</button>
      {:else if hasCustom()}
        <button class="control" onclick={customize} title="Resume editing your custom keymap">Edit custom</button>
      {:else}
        <button class="control" onclick={customize} title="Create an editable copy of this preset">Customize…</button>
      {/if}
    </div>
  {:else if id === "logViewer"}
    <button class="control" onclick={() => { closeSettings(); openLogs(); }}>Open logs…</button>
  {/if}
{/snippet}

{#snippet row(r: Row)}
  <div class="item">
    <div class="row">
      <div class="label">
        <span class="name"><MatchText text={r.name} {terms} /></span>
        <span class="hint"><MatchText text={hintOf(r)} {terms} /></span>
      </div>
      {@render control(r.id)}
    </div>

    {#if r.id === "theme"}
      <div class="themes">
        {#each themeNames as tn (tn)}
          {@const v = THEMES[tn].vars}
          <button
            class="tcard"
            class:on={settings.theme === tn}
            aria-pressed={settings.theme === tn}
            onclick={() => (settings.theme = tn)}
          >
            <!-- miniatura dipinta coi colori del tema: barra, pannello laterale, righe di codice -->
            <span
              class="tmini"
              style="--b:{v['color-surface-1']};--s:{v['color-surface-2']};--t:{v['color-surface-0']};--l:{v['color-line-strong']};--i:{v['color-ink-muted']};--u:{v['color-ink-subtle']};--a:{v['color-accent']}"
            >
              <span class="tbar"></span>
              <span class="tside"><span style="width:78%"></span><span style="width:56%"></span><span style="width:66%"></span></span>
              <span class="tcode"
                ><span class="acc" style="width:42%"></span><span style="width:70%"></span><span style="width:58%"></span><span
                  style="width:32%"
                ></span></span
              >
            </span>
            <span class="tname"><MatchText text={THEMES[tn].label} {terms} /></span>
          </button>
        {/each}
      </div>
    {:else if r.id === "edCaret"}
      {#if edOpen}
        <div class="subs">
          {@render opt("Shape", settings.editorCaret.shape, EDITOR_SHAPES, (v) => setEditor("shape", v as EditorShape))}
          {@render opt("Glide", settings.editorCaret.glide, GLIDES, (v) => setEditor("glide", v as Glide))}
          {@render opt("Blink", settings.editorCaret.blink, BLINKS, (v) => setEditor("blink", v as Blink))}
          {@render opt("Glow", settings.editorCaret.glow, GLOWS, (v) => setEditor("glow", v as Glow))}
          {@render opt("Trail", settings.editorCaret.trail, TRAILS, (v) => setEditor("trail", v as Trail))}
          {#if settings.editorCaret.trail !== "none"}
            {@render opt("Trail length", settings.editorCaret.trailLen, TRAIL_LENS, (v) => setEditor("trailLen", v as TrailLen))}
          {/if}
        </div>
      {/if}
      <div class="preview" style="min-height:{edPreviewH}px">
        <Lazy load={() => import("./EditorCaretPreview.svelte")} />
      </div>
    {:else if r.id === "tmCaret"}
      {#if tmOpen}
        <div class="subs">
          {@render opt("Shape in shells", settings.termCaret.shell, TERM_SHAPES, (v) => setTerm("shell", v as TermShape))}
          {@render opt("Shape in Claude chats", settings.termCaret.chat, TERM_SHAPES, (v) => setTerm("chat", v as TermShape))}
          {@render opt("Glide", settings.termCaret.glide, GLIDES, (v) => setTerm("glide", v as Glide))}
          {@render opt("Blink", settings.termCaret.blink, BLINKS, (v) => setTerm("blink", v as Blink))}
          {@render opt("Glow", settings.termCaret.glow, GLOWS, (v) => setTerm("glow", v as Glow))}
          {@render opt("Trail", settings.termCaret.trail, TRAILS, (v) => setTerm("trail", v as Trail))}
          {#if settings.termCaret.trail !== "none"}
            {@render opt("Trail length", settings.termCaret.trailLen, TRAIL_LENS, (v) => setTerm("trailLen", v as TrailLen))}
          {/if}
        </div>
      {/if}
      <div class="preview" style="min-height:{tmPreviewH}px">
        <Lazy load={() => import("./TerminalCaretPreview.svelte")} />
      </div>
    {/if}
  </div>
{/snippet}

<Backdrop onClose={closeSettings} dim z={110} />

<div class="panel" role="dialog" aria-label="Settings" transition:scale={{ duration: 110, start: 0.97, opacity: 0.3 }}>
  <header class="head">
    <span class="title">Settings</span>
    <div class="search">
      <Icon name="search" size={14} strokeWidth={1.8} />
      <input
        bind:this={searchEl}
        bind:value={query}
        onkeydown={onSearchKey}
        placeholder="Search settings"
        aria-label="Search settings"
        spellcheck="false"
        autocomplete="off"
      />
      {#if query}
        <button class="clear" aria-label="Clear search" onclick={() => { query = ""; searchEl?.focus(); }}>
          <Icon name="x" size={12} strokeWidth={2} />
        </button>
      {/if}
    </div>
    <button class="x" aria-label="Close" onclick={closeSettings}><Icon name="x" size={16} strokeWidth={1.8} /></button>
  </header>

  <nav class="nav" aria-label="Settings categories">
    {#each SECTIONS as s (s.id)}
      {@const n = searching ? countIn(s.id) : 0}
      <button
        class="cat"
        class:on={!searching && settingsUI.section === s.id}
        class:dim={searching && n === 0}
        aria-current={!searching && settingsUI.section === s.id ? "page" : undefined}
        onclick={() => go(s.id)}
      >
        <Icon name={s.icon} size={15} strokeWidth={1.7} />
        <span class="clabel">{s.label}</span>
        {#if n > 0}<span class="count">{n}</span>{/if}
      </button>
    {/each}
  </nav>

  <div class="content" bind:this={contentEl}>
    {#if searching}
      {#each SECTIONS as s (s.id)}
        {@const rows = hits.filter((r) => r.section === s.id)}
        {@const kb = s.id === "keyboard" ? kbGroups : []}
        {#if rows.length || kb.length}
          <button class="rhead" onclick={() => go(s.id)} title="Show all of {s.label}">
            <Icon name={s.icon} size={13} strokeWidth={1.8} />{s.label}
          </button>
          {#each rows as r (r.id)}
            {@render row(r)}
          {/each}
          {#if kb.length}<SettingsKeyboard groups={kb} {terms} flat />{/if}
        {/if}
      {/each}
      {#if !hits.length && !kbCount}
        <div class="empty">No settings match “{query.trim()}”</div>
      {/if}
    {:else}
      <h2 class="stitle">{labelOf(settingsUI.section)}</h2>
      <!-- «Rules for every repository» serve alla ricerca: nella pagina Shelf c'è il blocco completo (SettingsShelf) -->
      {#each ROWS.filter((r) => r.section === settingsUI.section && r.id !== "shelfRules") as r (r.id)}
        {@render row(r)}
      {/each}
      {#if settingsUI.section === "keyboard"}<SettingsKeyboard groups={kbGroups} />{/if}
      {#if settingsUI.section === "shelf"}<SettingsShelf />{/if}
    {/if}
  </div>

  <!-- versione e aggiornamenti fuori dalla lista che scorre: sempre in vista (M61) -->
  <footer class="foot">
    <span class="ver">
      <span class="vname">Orbit {version}</span><span class="vsep">·</span><span class="vhint">{updateHint}</span>
    </span>
    {#if updates.available}
      <button class="control" onclick={() => { closeSettings(); openUpdateDialog(); }}>Update…</button>
    {:else}
      <button class="control" disabled={updates.checking} onclick={() => void checkForUpdates(true)}>Check now</button>
    {/if}
  </footer>
</div>

<style>
  /* Geometria: colonna delle categorie da 208 px; il testo delle voci parte a 28 px dalla colonna e la
     ricerca in testata si allinea lì; a destra 16 px + 12 di scrollbar riservata = 28, come il piè. */
  .panel {
    --w: min(900px, calc(100vw - 48px));
    --h: min(660px, calc(100vh - 64px));
    position: fixed;
    /* centrata su pixel interi e senza transform: con una finestra larga un numero dispari di pixel
       il centro cadrebbe a mezzo pixel e il testo si sfocherebbe */
    left: round(down, calc((100vw - var(--w)) / 2), 1px);
    top: round(down, calc((100vh - var(--h)) / 2), 1px);
    z-index: 111;
    width: var(--w);
    height: var(--h);
    display: grid;
    grid-template-columns: 208px minmax(0, 1fr);
    grid-template-rows: auto minmax(0, 1fr) auto;
    background: var(--color-surface-2);
    border: 1px solid var(--color-line-strong);
    border-radius: var(--radius-lg);
    box-shadow: var(--shadow-pop);
    overflow: hidden;
  }
  .head {
    grid-column: 1 / -1;
    display: flex;
    align-items: center;
    height: 52px;
    padding-right: 12px;
    border-bottom: 1px solid var(--color-line);
  }
  .title {
    flex: 0 0 208px;
    padding-left: 18px; /* = icone delle categorie */
    font-size: 14px;
    font-weight: 600;
    color: var(--color-ink);
  }
  .search {
    flex: 1;
    max-width: 440px;
    margin-left: 28px;
    display: flex;
    align-items: center;
    gap: 8px;
    height: 32px;
    padding: 0 6px 0 10px;
    background: var(--color-surface-1);
    border: 1px solid var(--color-line-strong);
    border-radius: var(--r-md);
    color: var(--color-ink-subtle);
  }
  .search:focus-within {
    border-color: var(--color-accent);
  }
  .search input {
    flex: 1;
    min-width: 0;
    height: 100%;
    border: 0;
    outline: none;
    background: transparent;
    color: var(--color-ink);
    font-family: var(--font-sans);
    font-size: 13px;
  }
  .search input::placeholder {
    color: var(--color-ink-subtle);
  }
  .clear,
  .x {
    display: grid;
    place-items: center;
    border: 0;
    border-radius: var(--radius-sm);
    background: transparent;
    color: var(--color-ink-muted);
    cursor: pointer;
  }
  .clear {
    width: 20px;
    height: 20px;
  }
  .x {
    width: 28px;
    height: 28px;
    margin-left: auto;
  }
  .clear:hover,
  .x:hover {
    background: var(--color-surface-3);
    color: var(--color-ink);
  }

  /* ---- categorie ---- */
  .nav {
    display: flex;
    flex-direction: column;
    gap: 2px;
    padding: 10px 8px;
    border-right: 1px solid var(--color-line);
    overflow-y: auto;
  }
  .cat {
    display: flex;
    align-items: center;
    gap: 10px;
    height: 34px;
    flex: 0 0 auto;
    padding: 0 10px;
    border: 0;
    border-radius: var(--r-md);
    background: transparent;
    color: var(--color-ink-muted);
    font-family: var(--font-sans);
    font-size: 13px;
    text-align: left;
    cursor: pointer;
    transition:
      background 90ms ease,
      color 90ms ease,
      opacity 120ms ease;
  }
  .cat:hover {
    background: var(--color-surface-3);
    color: var(--color-ink);
  }
  .cat.on {
    background: rgba(var(--accent-rgb), 0.16);
    color: var(--color-ink);
  }
  .cat.on :global(svg) {
    color: var(--color-accent);
  }
  .cat.dim {
    opacity: 0.45;
  }
  .clabel {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .count {
    font-size: 11px;
    font-variant-numeric: tabular-nums;
    color: var(--color-ink-subtle);
  }

  /* ---- voci ---- */
  .content {
    min-height: 0;
    overflow-y: auto;
    scrollbar-gutter: stable;
    padding: 20px 16px 24px 28px;
  }
  .stitle {
    margin: 0 0 4px;
    font-size: 16px;
    font-weight: 600;
    color: var(--color-ink);
  }
  .rhead {
    display: flex;
    align-items: center;
    gap: 7px;
    margin: 22px 0 2px;
    padding: 0;
    border: 0;
    background: none;
    color: var(--color-ink-muted);
    font-family: var(--font-sans);
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    cursor: pointer;
  }
  .rhead:first-child {
    margin-top: 0;
  }
  .rhead:hover {
    color: var(--color-accent);
  }
  .empty {
    padding: 48px 0;
    text-align: center;
    font-size: 12.5px;
    color: var(--color-ink-subtle);
  }
  .item {
    padding: 14px 0;
    border-bottom: 1px solid var(--color-line);
  }
  .item:last-child {
    border-bottom: 0;
  }
  .row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 24px;
  }
  .label {
    display: flex;
    flex-direction: column;
    gap: 3px;
    min-width: 0;
  }
  .name {
    font-size: 13px;
    color: var(--color-ink);
  }
  .hint {
    font-size: 11.5px;
    line-height: 1.45;
    color: var(--color-ink-subtle);
  }
  /* un valore da leggere al posto di un controllo (es. quante regole globali ha lo scaffale) */
  .ctext {
    flex: 0 0 auto;
    color: var(--color-ink-muted);
    font-size: 12px;
  }
  .control {
    flex: 0 0 auto;
    height: 30px;
    background: var(--color-surface-1);
    border: 1px solid var(--color-line-strong);
    border-radius: var(--radius-sm);
    color: var(--color-ink);
    font-family: var(--font-sans);
    font-size: 12.5px;
    padding: 0 8px;
    cursor: pointer;
    outline: none;
  }
  .control:focus-visible {
    border-color: var(--color-accent);
  }
  button.control {
    padding: 0 12px;
  }
  button.control:hover:not(:disabled) {
    background: var(--color-surface-3);
  }
  button.control:disabled {
    opacity: 0.5;
    cursor: default;
  }
  .control.danger:hover {
    background: rgba(241, 76, 76, 0.16);
    color: #ff9b9b;
    border-color: rgba(241, 76, 76, 0.4);
  }
  .pair {
    display: flex;
    gap: 6px;
    flex: 0 0 auto;
  }
  .more {
    display: inline-flex;
    align-items: center;
    gap: 6px;
  }
  .more :global(svg) {
    color: var(--color-ink-muted);
    transition: transform 140ms ease;
  }
  .more[aria-expanded="true"] :global(svg) {
    transform: rotate(180deg);
  }

  /* cursore: opzioni di Customize su due colonne, poi l'anteprima */
  .subs {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 6px 32px;
    margin-top: 12px;
    padding: 2px 0 2px 14px;
    border-left: 2px solid rgba(var(--accent-rgb), 0.35);
  }
  .sub {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    min-width: 0;
  }
  .sname {
    font-size: 12.5px;
    color: var(--color-ink-muted);
    white-space: nowrap;
  }
  .sub select {
    width: 140px; /* stessa larghezza per tutti: le scelte si leggono in colonna */
  }
  .preview {
    margin-top: 12px;
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

  /* temi: miniature dipinte coi colori di ciascuno */
  .themes {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 14px;
    margin-top: 14px;
  }
  .tcard {
    display: flex;
    flex-direction: column;
    gap: 7px;
    padding: 0;
    border: 0;
    background: none;
    text-align: left;
    cursor: pointer;
  }
  .tmini {
    display: grid;
    grid-template-columns: 27% 1fr;
    grid-template-rows: 9px 1fr;
    height: 74px;
    border-radius: var(--r-md);
    overflow: hidden;
    background: var(--b);
    box-shadow: 0 0 0 1px var(--l);
    transition: box-shadow 90ms ease;
  }
  .tcard:hover .tmini {
    box-shadow: 0 0 0 1px var(--color-ink-subtle);
  }
  .tcard.on .tmini {
    box-shadow: 0 0 0 2px var(--color-accent);
  }
  .tbar {
    grid-column: 1 / -1;
    background: var(--t);
    border-bottom: 1px solid var(--l);
  }
  .tside {
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding: 9px 8px;
    background: var(--s);
    border-right: 1px solid var(--l);
  }
  .tside span {
    height: 3px;
    border-radius: 2px;
    background: var(--u);
  }
  .tcode {
    display: flex;
    flex-direction: column;
    gap: 7px;
    padding: 9px 10px;
  }
  .tcode span {
    height: 4px;
    border-radius: 2px;
    background: var(--i);
  }
  .tcode span.acc {
    background: var(--a);
  }
  .tname {
    font-size: 12px;
    color: var(--color-ink-muted);
  }
  .tcard.on .tname {
    color: var(--color-ink);
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

  /* ---- piè: versione e aggiornamenti ---- */
  .foot {
    grid-column: 1 / -1;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    padding: 10px 28px 10px 18px;
    border-top: 1px solid var(--color-line);
  }
  .ver {
    display: flex;
    align-items: baseline;
    gap: 8px;
    min-width: 0;
    font-size: 12px;
  }
  .vname {
    color: var(--color-ink);
    white-space: nowrap;
  }
  .vsep {
    color: var(--color-ink-subtle);
  }
  .vhint {
    color: var(--color-ink-subtle);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
</style>
