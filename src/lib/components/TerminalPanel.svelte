<script lang="ts">
  import { onMount, onDestroy } from "svelte";
  import Icon from "./Icon.svelte";
  import Terminal from "./LazyTerminal.svelte";
  import ContextMenu, { type MenuItem } from "./ContextMenu.svelte";
  import { WebviewWindow } from "@tauri-apps/api/webviewWindow";
  import { getCurrentWindow } from "@tauri-apps/api/window";
  import { invoke } from "@tauri-apps/api/core";
  import { layout, toggleTerminal, setFocusPanel } from "../state/layout.svelte";
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
  } from "../state/terminals.svelte";

  interface ShellInfo {
    label: string;
    program: string;
  }

  let shells = $state<ShellInfo[]>([]);
  let shellMenu = $state<{ x: number; y: number } | null>(null);

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

  onDestroy(() => offFocus?.());

  // Pannello mostrato senza terminali → crea una shell NORMALE (mai Claude: il default Claude
  // all'avvio è gestito una volta sola in App.svelte). Così l'icona terminale apre sempre una shell.
  $effect(() => {
    if (workspace.ready && terminals.list.length === 0) ensureTerminal();
  });

  // Estrae IL terminale attivo in una finestra flottante (stesso PTY: Claude continua a girare).
  let detaching = false; // guardia sincrona contro doppio-click (eviterebbe due finestre)
  async function detach() {
    if (detaching) return;
    detaching = true;
    try {
      const t = terminals.list.find((x) => x.id === terminals.activeId);
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
<section class="terminal-panel" class:focused={layout.focusPanel === "terminal"} style="width:{layout.terminalWidth}px" onpointerdown={() => setFocusPanel("terminal")}>
  <header class="head">
    <div class="tabs">
      {#each terminals.list as t (t.id)}
        {@const tv = tabVisual(t.shell, t.title)}
        <div class="tab" class:active={t.id === terminals.activeId}>
          <button class="tab-main" title={t.needsAttention ? `${t.title} — waiting for you` : t.title} onclick={() => setActiveTerminal(t.id)}>
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
      <button class="act" title="Open in floating window (always on top)" aria-label="Floating window" onclick={detach}>
        <Icon name="external-link" size={14} strokeWidth={1.8} />
      </button>
      <button class="act" title="Hide panel (Ctrl+`)" aria-label="Hide panel" onclick={toggleTerminal}>
        <Icon name="x" size={15} strokeWidth={1.9} />
      </button>
    </div>
  </header>

  <div class="surface">
    {#each terminals.list as t (t.id)}
      <div class="slot" class:active={t.id === terminals.activeId}>
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
    {/each}
  </div>
</section>

{#if shellMenu}
  <ContextMenu x={shellMenu.x} y={shellMenu.y} items={shellMenuItems()} onClose={() => (shellMenu = null)} />
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
  .surface {
    flex: 1;
    min-height: 0;
    position: relative;
    overflow: hidden;
  }
  .slot {
    position: absolute;
    inset: 0;
    display: none;
  }
  .slot.active {
    display: block;
  }
</style>
