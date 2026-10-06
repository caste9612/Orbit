<script lang="ts">
  import { onMount, onDestroy } from "svelte";
  import Icon from "./Icon.svelte";
  import Terminal from "./LazyTerminal.svelte";
  import ContextMenu, { type MenuItem } from "./ContextMenu.svelte";
  import { WebviewWindow } from "@tauri-apps/api/webviewWindow";
  import { getCurrentWindow } from "@tauri-apps/api/window";
  import { invoke } from "@tauri-apps/api/core";
  import { layout, toggleTerminal, setFocusPanel, toggleTerminalMaximized } from "../state/layout.svelte";
  import { workspace } from "../state/workspace.svelte";
  import {
    terminals,
    addTerminal,
    setActiveTerminal,
    closeTerminal,
    ensureTerminal,
    removeTerminalKeepPty,
    notifyTerminalBell,
    clearAttention,
    panesOf,
    splitWith,
    showInPane,
    closePane,
    toggleZoom,
  } from "../state/terminals.svelte";
  import { launchClaude } from "../state/claude.svelte";
  import { gridFor, MAX_PANES, type SplitMode } from "../state/terminalLayout";

  interface ShellInfo {
    label: string;
    program: string;
  }

  let shells = $state<ShellInfo[]>([]);
  let shellMenu = $state<{ x: number; y: number } | null>(null);
  let splitMenu = $state<{ x: number; y: number } | null>(null);

  // Schede della repo ATTIVA (le altre restano montate ma nascoste → PTY/scrollback vivi).
  let visibleTabs = $derived(terminals.list.filter((t) => t.root === workspace.rootPath));

  // ---- chat affiancate (M54) ----------------------------------------------------------------
  // Tutti i terminali restano montati nella stessa superficie: affiancarli vuol dire solo dare a più
  // di uno un posto nella griglia (niente rimontaggio → Claude non si interrompe, lo storico resta).
  let panes = $derived(panesOf(workspace.rootPath));
  let split = $derived(panes.length >= 2);
  let zoom = $derived(split && terminals.zoomId && panes.includes(terminals.zoomId) ? terminals.zoomId : null);
  let shown = $derived<string[]>(zoom ? [zoom] : split ? panes : terminals.activeId ? [terminals.activeId] : []);
  let surfW = $state(0);
  let surfH = $state(0);
  let grid = $derived(gridFor(shown.length, surfW, surfH, layout.termSplit));

  /** Posto nella griglia del terminale `id` ("" = non visibile). */
  function placement(id: string): string {
    const i = shown.indexOf(id);
    const c = i >= 0 ? grid.cells[i] : undefined;
    return c ? `grid-column:${c.col} / span ${c.colSpan};grid-row:${c.row} / span ${c.rowSpan}` : "";
  }

  function openSplitMenu(e: MouseEvent) {
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    splitMenu = { x: Math.max(8, r.right - 240), y: r.bottom + 4 };
  }

  function splitMenuItems(): MenuItem[] {
    const items: MenuItem[] = [
      { label: "New Claude to the side", icon: "sparkles", onClick: () => void launchClaude(undefined, "Claude", { side: true }) },
      { label: "New terminal to the side", icon: "terminal", onClick: () => addTerminal({ side: true }) },
    ];
    const others = visibleTabs.filter((t) => !shown.includes(t.id));
    if (others.length && panes.length < MAX_PANES) {
      items.push({ label: "Show to the side", header: true, separatorBefore: true });
      for (const t of others) {
        items.push({ label: t.title, icon: tabVisual(t.shell, t.title).icon, onClick: () => splitWith(t.id) });
      }
    }
    const modes: [SplitMode, string][] = [
      ["auto", "Automatic"],
      ["columns", "Side by side"],
      ["rows", "Stacked"],
    ];
    items.push({ label: "Layout", header: true, separatorBefore: true });
    for (const [m, label] of modes) {
      items.push({ label, icon: layout.termSplit === m ? "check" : undefined, onClick: () => (layout.termSplit = m) });
    }
    return items;
  }

  // Drag di una scheda su un riquadro (pointer-based, come le schede dell'editor: con
  // dragDropEnabled l'HTML5 DnD non funziona). Al centro: il riquadro mostra quella scheda; vicino a
  // un bordo: la scheda si affianca lì (prima per sinistra/alto, dopo per destra/basso).
  type Zone = "center" | "left" | "right" | "top" | "bottom";
  let dragId = $state<string | null>(null);
  let dropTarget = $state<{ id: string; zone: Zone } | null>(null);
  let pending: { id: string; x: number; y: number } | null = null;

  function onTabPointerDown(e: PointerEvent, id: string) {
    if (e.button !== 0) return;
    pending = { id, x: e.clientX, y: e.clientY };
    window.addEventListener("pointermove", onTabPointerMove);
    window.addEventListener("pointerup", onTabPointerUp);
  }

  function onTabPointerMove(e: PointerEvent) {
    if (e.buttons === 0) {
      onTabPointerUp(); // rilascio fuori dalla finestra
      return;
    }
    if (pending && !dragId) {
      if (Math.hypot(e.clientX - pending.x, e.clientY - pending.y) < 6) return; // ancora un click
      dragId = pending.id;
    }
    if (!dragId) return;
    const el = document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null;
    const slot = el?.closest(".slot.shown") as HTMLElement | null;
    const id = slot?.dataset.term;
    if (!slot || !id) {
      dropTarget = null;
      return;
    }
    const r = slot.getBoundingClientRect();
    const fx = (e.clientX - r.left) / r.width;
    const fy = (e.clientY - r.top) / r.height;
    const near: [Zone, number][] = [
      ["left", fx],
      ["right", 1 - fx],
      ["top", fy],
      ["bottom", 1 - fy],
    ];
    near.sort((a, b) => a[1] - b[1]);
    dropTarget = { id, zone: near[0][1] < 0.25 ? near[0][0] : "center" };
  }

  function onTabPointerUp() {
    const id = dragId;
    const t = dropTarget;
    if (id && t && id !== t.id) {
      if (t.zone === "center") showInPane(id, t.id);
      else splitWith(id, t.id, t.zone === "left" || t.zone === "top");
    }
    cancelDrag();
  }

  function cancelDrag() {
    dragId = null;
    dropTarget = null;
    pending = null;
    window.removeEventListener("pointermove", onTabPointerMove);
    window.removeEventListener("pointerup", onTabPointerUp);
  }

  // icona + colore identità per tipo di terminale (Claude in accento ✨, shell coi loro colori)
  function tabVisual(shell: string | null, title: string): { icon: string; color: string } {
    const s = `${shell ?? ""} ${title}`.toLowerCase();
    if (s.includes("claude")) return { icon: "sparkles", color: "var(--color-accent)" };
    if (s.includes("pwsh") || s.includes("powershell")) return { icon: "terminal", color: "#5391fe" };
    if (s.includes("cmd") || s.includes("comandi")) return { icon: "terminal", color: "#9aa3b2" };
    if (s.includes("git") || s.includes("bash") || s.includes("zsh") || s.includes("fish"))
      return { icon: "terminal", color: "#4eaa25" };
    if (s.includes("wsl")) return { icon: "terminal", color: "#c586c0" };
    return { icon: "terminal", color: "var(--color-ink-muted)" };
  }

  // tornando a fuoco sull'app, la scheda attiva è "vista" → spegni il suo pallino d'attenzione
  let offFocus: (() => void) | undefined;

  onMount(async () => {
    try {
      shells = await invoke<ShellInfo[]>("list_shells");
    } catch {
      shells = [];
    }
    try {
      offFocus = await getCurrentWindow().onFocusChanged(({ payload: focused }) => {
        if (focused) clearAttention(terminals.activeId);
      });
    } catch {
      /* fuori dal contesto Tauri */
    }
  });

  onDestroy(() => {
    offFocus?.();
    cancelDrag(); // smontaggio a metà drag: via i listener su window
  });

  // Pannello mostrato senza terminali → crea una shell NORMALE (mai Claude: il default Claude
  // all'avvio è gestito una volta sola in App.svelte). Così l'icona terminale apre sempre una shell.
  $effect(() => {
    if (workspace.ready && terminals.list.length === 0) ensureTerminal();
  });

  // Estrae un terminale (di default quello attivo) in una finestra flottante (stesso PTY: Claude
  // continua a girare).
  let detaching = false; // guardia sincrona contro doppio-click (eviterebbe due finestre)
  async function detach(id: string | null = terminals.activeId) {
    if (detaching) return;
    detaching = true;
    try {
      const t = terminals.list.find((x) => x.id === id);
      if (!t) return;
      // etichetta UNICA per terminale: permette più finestre flottanti e niente conflitti/
      // "fantasmi" di label riusata (era il bug: il detach funzionava una volta sola).
      const label = `term-float-${t.id}`;
      const existing = await WebviewWindow.getByLabel(label);
      if (existing) {
        await existing.setFocus();
        return;
      }
      const params = new URLSearchParams({
        float: t.id,
        title: t.title,
        shell: t.shell ?? "",
        from: getCurrentWindow().label,
        root: workspace.rootName ?? "", // snapshot per il badge della finestra flottante
        branch: workspace.branch ?? "",
      });
      const url = new URL(window.location.href);
      url.search = params.toString();
      url.hash = "";
      const w = new WebviewWindow(label, {
        url: url.toString(),
        title: "Orbit · Terminal",
        width: 760,
        height: 460,
        minWidth: 360,
        minHeight: 200,
        alwaysOnTop: true,
        decorations: false,
      });
      // togli la scheda dal pannello SOLO quando la finestra è creata (il PTY resta vivo);
      // se la creazione fallisce la scheda resta dov'è (niente terminale orfano).
      w.once("tauri://created", () => removeTerminalKeepPty(t.id));
      w.once("tauri://error", (e) => console.error("finestra flottante:", e));
    } finally {
      detaching = false;
    }
  }

  function openShellMenu(e: MouseEvent) {
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    shellMenu = { x: r.left, y: r.bottom + 4 };
  }

  function shellMenuItems(): MenuItem[] {
    const items: MenuItem[] = [
      { label: "Terminal (default)", icon: "terminal", onClick: () => addTerminal() },
    ];
    for (const sh of shells) {
      items.push({
        label: sh.label,
        icon: "terminal",
        separatorBefore: items.length === 1,
        onClick: () => addTerminal({ shell: sh.program, title: sh.label }),
      });
    }
    return items;
  }
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<section
  class="terminal-panel"
  class:focused={layout.focusPanel === "terminal"}
  class:fill={layout.editorCollapsed || layout.terminalMaximized}
  class:dragging={dragId !== null}
  style="width:{layout.terminalWidth}px"
  onpointerdown={() => setFocusPanel("terminal")}
>
  <header class="head">
    <div class="tabs">
      {#each visibleTabs as t (t.id)}
        {@const tv = tabVisual(t.shell, t.title)}
        <div class="tab" class:active={t.id === terminals.activeId} class:shown={split && shown.includes(t.id)}>
          <button
            class="tab-main"
            title={t.needsAttention ? `${t.title} — waiting for you` : `${t.title} — drag onto a pane to show it side by side`}
            onclick={() => setActiveTerminal(t.id)}
            onpointerdown={(e) => onTabPointerDown(e, t.id)}
          >
            <span class="tic" style="color:{tv.color}"><Icon name={tv.icon} size={13} strokeWidth={1.8} /></span>
            {#if t.needsAttention}<span class="attn" aria-hidden="true"></span>{/if}
            <span>{t.title}</span>
          </button>
          <button class="tab-close" title="Close terminal" aria-label="Close terminal" onclick={() => closeTerminal(t.id)}>
            <Icon name="x" size={12} strokeWidth={2} />
          </button>
        </div>
      {/each}
      <button class="newt" title="New terminal" aria-label="New terminal" onclick={() => addTerminal()}>
        <Icon name="plus" size={14} strokeWidth={2} />
      </button>
      <button class="newt caret" title="Choose shell…" aria-label="Choose shell" onclick={openShellMenu}>
        <Icon name="chevron-down" size={13} strokeWidth={2} />
      </button>
    </div>
    <div class="actions">
      <button class="act" class:on={split} title="Side by side: new Claude, new terminal or another tab next to this one" aria-label="Split" onclick={openSplitMenu}>
        <Icon name="columns" size={14} strokeWidth={1.8} />
      </button>
      <button
        class="act"
        class:on={layout.terminalMaximized}
        title={layout.terminalMaximized ? "Show the editor again" : "Use the whole window for the terminals"}
        aria-label={layout.terminalMaximized ? "Restore editor" : "Maximize panel"}
        aria-pressed={layout.terminalMaximized}
        onclick={toggleTerminalMaximized}
      >
        <Icon name={layout.terminalMaximized ? "minimize" : "maximize"} size={14} strokeWidth={1.8} />
      </button>
      <button class="act" title="Open in floating window (always on top)" aria-label="Floating window" onclick={() => detach()}>
        <Icon name="external-link" size={14} strokeWidth={1.8} />
      </button>
      <button class="act" title="Hide panel (Ctrl+`)" aria-label="Hide panel" onclick={toggleTerminal}>
        <Icon name="x" size={15} strokeWidth={1.9} />
      </button>
    </div>
  </header>

  <div
    class="surface"
    class:split
    bind:clientWidth={surfW}
    bind:clientHeight={surfH}
    style="grid-template-columns:repeat({grid.cols}, minmax(0, 1fr));grid-template-rows:repeat({grid.rows}, minmax(0, 1fr))"
  >
    {#each terminals.list as t (t.id)}
      {@const isShownHere = shown.includes(t.id)}
      {@const tv = tabVisual(t.shell, t.title)}
      <div
        class="slot"
        class:shown={isShownHere}
        class:active={t.id === terminals.activeId}
        data-term={t.id}
        style={placement(t.id)}
      >
        {#if split && isShownHere}
          <!-- svelte-ignore a11y_no_static_element_interactions -->
          <div class="pane-head" onpointerdown={() => setActiveTerminal(t.id)}>
            <span class="tic" style="color:{tv.color}"><Icon name={tv.icon} size={12} strokeWidth={1.8} /></span>
            {#if t.needsAttention}<span class="attn" aria-hidden="true"></span>{/if}
            <span class="pane-title">{t.title}</span>
            {#if t.needsAttention}<span class="pane-wait">waiting for you</span>{/if}
            <span class="pane-sp"></span>
            <button
              class="pane-btn"
              title={zoom === t.id ? "Back to side by side" : "Zoom this pane (the others keep running)"}
              aria-label={zoom === t.id ? "Restore panes" : "Zoom pane"}
              onclick={() => toggleZoom(t.id)}
            >
              <Icon name={zoom === t.id ? "minimize" : "maximize"} size={12} strokeWidth={1.9} />
            </button>
            <button class="pane-btn" title="Open in floating window" aria-label="Pop out" onclick={() => detach(t.id)}>
              <Icon name="external-link" size={12} strokeWidth={1.9} />
            </button>
            <button class="pane-btn" title="Remove from side by side (the terminal stays open as a tab)" aria-label="Close pane" onclick={() => closePane(t.id)}>
              <Icon name="x" size={12} strokeWidth={2} />
            </button>
          </div>
        {/if}
        <div class="pane-body">
          <Terminal
            id={t.id}
            cwd={t.cwd ?? workspace.rootPath}
            persistent={true}
            shell={t.shell}
            active={t.id === terminals.activeId}
            attach={t.attach}
            initCommand={t.started ? null : t.initCommand}
            onStart={() => (t.started = true)}
            onBell={() => notifyTerminalBell(t.id)}
          />
        </div>
        {#if dropTarget?.id === t.id}
          <div class="dropmark {dropTarget.zone}" aria-hidden="true"></div>
        {/if}
      </div>
    {/each}
  </div>
</section>

{#if shellMenu}
  <ContextMenu x={shellMenu.x} y={shellMenu.y} items={shellMenuItems()} onClose={() => (shellMenu = null)} />
{/if}
{#if splitMenu}
  <ContextMenu x={splitMenu.x} y={splitMenu.y} items={splitMenuItems()} onClose={() => (splitMenu = null)} />
{/if}

<style>
  .terminal-panel {
    flex: 0 1 auto; /* si comprime quando la finestra è stretta, invece di coprire l'editor */
    min-width: 180px;
    display: flex;
    flex-direction: column;
    background: var(--color-surface-1);
    overflow: hidden;
    border-radius: 8px;
    border: 1px solid var(--color-line);
    transition: border-color 120ms ease;
  }
  .terminal-panel.focused {
    border-color: var(--color-accent);
  }
  /* editor senza tab (collassato al minimo): il pannello si prende tutto lo spazio restante */
  .terminal-panel.fill {
    flex: 1 1 auto;
  }
  .head {
    height: 30px;
    flex: 0 0 30px;
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
    min-width: 0;
    overflow-x: auto;
    scrollbar-width: none;
  }
  .tabs::-webkit-scrollbar {
    display: none;
  }
  .tab {
    display: inline-flex;
    align-items: center;
    height: 100%;
    border-top: 2px solid transparent;
    color: var(--color-ink-muted);
    flex: 0 0 auto;
    min-width: 120px; /* schede uniformi → X di chiusura allineate */
    max-width: 180px;
  }
  .tab:not(.active):hover {
    background: var(--color-surface-3);
  }
  .tab.active {
    color: var(--color-ink);
    border-top-color: transparent;
    background: rgba(var(--accent-rgb), 0.18); /* prova: evidenzia tutto il rettangolo, non solo il bordo */
  }
  .tab-main {
    display: inline-flex;
    align-items: center;
    gap: 7px;
    height: 100%;
    padding: 0 4px 0 13px;
    border: 0;
    background: transparent;
    color: inherit;
    font-size: 12px;
    cursor: pointer;
    flex: 1; /* riempie la scheda → la X resta ancorata al bordo destro */
    min-width: 0;
  }
  .tab-main span {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .tab-main .tic {
    flex: 0 0 auto;
    display: inline-flex;
    align-items: center;
    overflow: visible;
  }
  /* pallino "attenzione": il terminale ha suonato la bell (Claude finito / in attesa) e non lo guardi.
     Pulsa in accento; sparisce appena la scheda diventa attiva (notifyTerminalBell azzera il flag). */
  .tab-main .attn {
    flex: 0 0 auto;
    width: 7px;
    height: 7px;
    margin-left: -2px;
    border-radius: 50%;
    overflow: visible;
    background: var(--color-accent);
    animation: attn-pulse 1.6s ease-out infinite;
  }
  @keyframes attn-pulse {
    0% {
      box-shadow: 0 0 0 0 rgba(var(--accent-rgb), 0.5);
    }
    70% {
      box-shadow: 0 0 0 5px rgba(var(--accent-rgb), 0);
    }
    100% {
      box-shadow: 0 0 0 0 rgba(var(--accent-rgb), 0);
    }
  }
  .tab-close {
    display: grid;
    place-items: center;
    width: 18px;
    height: 18px;
    margin-right: 5px;
    border: 0;
    border-radius: 4px;
    background: transparent;
    color: var(--color-ink-subtle);
    cursor: pointer;
    opacity: 0;
    transition: opacity 90ms ease, background 90ms ease;
  }
  .tab:hover .tab-close,
  .tab.active .tab-close {
    opacity: 1;
  }
  .tab-close:hover {
    background: var(--color-surface-3);
    color: var(--color-ink);
  }
  .newt {
    display: grid;
    place-items: center;
    width: 26px;
    height: 100%;
    border: 0;
    background: transparent;
    color: var(--color-ink-muted);
    cursor: pointer;
    flex: 0 0 auto;
  }
  .newt.caret {
    width: 18px;
    margin-left: -6px;
  }
  .newt:hover {
    color: var(--color-ink);
    background: var(--color-surface-3);
  }
  .actions {
    display: flex;
    align-items: center;
    gap: 1px;
    flex: 0 0 auto;
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
  .act.on {
    color: var(--color-accent);
    background: rgba(var(--accent-rgb), 0.14);
  }
  /* Superficie a griglia: tutti i terminali restano montati, solo quelli "shown" hanno un posto
     (grid-column/row inline da placement()); gli altri sono display:none e non si ridimensionano. */
  .surface {
    flex: 1;
    min-height: 0;
    position: relative;
    overflow: hidden;
    display: grid;
  }
  .surface.split {
    gap: 4px;
    padding: 4px;
    background: var(--color-bg);
  }
  .slot {
    display: none;
    position: relative;
    min-width: 0;
    min-height: 0;
  }
  .slot.shown {
    display: flex;
    flex-direction: column;
  }
  .surface.split .slot.shown {
    border: 1px solid var(--color-line);
    border-radius: 6px;
    overflow: hidden;
    background: var(--color-surface-1);
  }
  .surface.split .slot.shown.active {
    border-color: rgba(var(--accent-rgb), 0.6);
  }
  .pane-body {
    flex: 1;
    min-height: 0;
    position: relative;
  }
  /* testata del riquadro (solo con le chat affiancate) */
  .pane-head {
    height: 26px;
    flex: 0 0 26px;
    display: flex;
    align-items: center;
    gap: 7px;
    padding: 0 4px 0 10px;
    background: var(--color-surface-2);
    border-bottom: 1px solid var(--color-line);
    color: var(--color-ink-muted);
    font-size: 12px;
    user-select: none;
  }
  .slot.active .pane-head {
    color: var(--color-ink);
    background: rgba(var(--accent-rgb), 0.12);
  }
  .pane-head .tic {
    display: inline-flex;
    align-items: center;
  }
  .pane-head .attn {
    flex: 0 0 auto;
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: var(--color-accent);
    animation: attn-pulse 1.6s ease-out infinite;
  }
  .pane-title {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-weight: 500;
  }
  .pane-wait {
    flex: 0 0 auto;
    color: var(--color-accent);
    font-size: 11px;
  }
  .pane-sp {
    flex: 1;
  }
  .pane-btn {
    display: grid;
    place-items: center;
    width: 22px;
    height: 20px;
    border: 0;
    border-radius: 4px;
    background: transparent;
    color: var(--color-ink-subtle);
    cursor: pointer;
  }
  .pane-btn:hover {
    color: var(--color-ink);
    background: var(--color-surface-3);
  }
  /* schede visibili in un riquadro (ma non attive): sottolineatura discreta */
  .tab.shown:not(.active) {
    box-shadow: inset 0 -2px 0 rgba(var(--accent-rgb), 0.45);
  }
  /* drag di una scheda sopra i riquadri */
  .terminal-panel.dragging,
  .terminal-panel.dragging * {
    cursor: grabbing !important;
  }
  .dropmark {
    position: absolute;
    z-index: 10;
    pointer-events: none;
    background: rgba(var(--accent-rgb), 0.16);
    border: 2px solid rgba(var(--accent-rgb), 0.7);
    border-radius: 6px;
  }
  .dropmark.center {
    inset: 0;
  }
  .dropmark.left {
    inset: 0 50% 0 0;
  }
  .dropmark.right {
    inset: 0 0 0 50%;
  }
  .dropmark.top {
    inset: 0 0 50% 0;
  }
  .dropmark.bottom {
    inset: 50% 0 0 0;
  }
</style>
