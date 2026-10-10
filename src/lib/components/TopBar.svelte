<script lang="ts">
  import { onMount, onDestroy } from "svelte";
  import { getCurrentWindow } from "@tauri-apps/api/window";
  import type { UnlistenFn } from "@tauri-apps/api/event";
  import Icon from "./Icon.svelte";
  import Logo from "./Logo.svelte";
  import ContextMenu, { type MenuItem } from "./ContextMenu.svelte";
  import { layout, selectView, toggleTerminal } from "../state/layout.svelte";
  import { workspace, activeFile } from "../state/workspace.svelte";
  import { openActivity } from "../state/activity.svelte";
  import { openFolderDialog } from "../state/explorer.svelte";
  import { folders, openFromList, removeFolder, moveFolder } from "../state/folders.svelte";
  import { changedCount } from "../state/git.svelte";
  import { repoNeedsAttention, anyNeedsAttention, waitingTerminals, goToTerminal, displayTitle } from "../state/terminals.svelte";
  import { nav, navBack, navForward } from "../state/codeIndex.svelte";
  import { keyForId } from "../state/keybindings.svelte";
  import { run, runConfig, openConfig, teachClaude } from "../state/run.svelte";
  import {
    claude,
    launchClaude,
    runShortcut,
    openWrapper,
    openPrompts,
    openClaudeConfig,
    teachClaudeConfig,
  } from "../state/claude.svelte";
  import { open as openDialog, confirm } from "@tauri-apps/plugin-dialog";
  import { invoke } from "@tauri-apps/api/core";
  import { openSettings } from "../state/settings.svelte";
  import { openScratch } from "../state/scratch";
  import { promoteLight, prepareQuit } from "../state/persist.svelte";
  import { updates, openUpdateDialog } from "../state/updater.svelte";
  import { basename } from "../util";

  const win = getCurrentWindow();
  const activeKind = $derived(activeFile()?.kind); // per evidenziare il bottone Activity quando la board è la tab attiva

  async function newWindow() {
    try {
      const sel = await openDialog({ directory: true, multiple: false });
      if (typeof sel === "string") await invoke("open_new_window", { dir: sel });
    } catch (e) {
      console.error("nuova finestra", e);
    }
  }
  // Chiude tutte le finestre di Orbit (anche le altre istanze): salva il set per riaprirle al prossimo avvio.
  // Azione distruttiva su TUTTE le istanze → chiede conferma prima.
  async function closeAll() {
    const ok = await confirm(
      "Close all Orbit windows (every instance)? They'll reopen at their positions on next launch.",
      { title: "Close all windows", kind: "warning" },
    );
    if (!ok) return;
    // le modifiche di questa finestra; le altre finestre chiedono da sé quando ricevono il segnale (M59)
    if (!(await prepareQuit())) return;
    try {
      await invoke("close_all_windows");
    } catch (e) {
      console.error("chiudi tutte", e);
    }
  }
  let maximized = $state(false);
  let changed = $derived(changedCount()); // file modificati → badge sul pulsante Git
  let backKey = $derived(keyForId("navBack")); // scorciatoia attiva (dipende dal preset) → tooltip
  let fwdKey = $derived(keyForId("navForward"));

  // top bar stretta / molte repo: la fila di tab scorre; tieni la tab ATTIVA sempre in vista
  let repobarEl = $state<HTMLElement>();
  $effect(() => {
    workspace.rootPath; // dipendenza: rieffettua al cambio repo
    repobarEl?.querySelector(".repotab.active")?.scrollIntoView({ inline: "nearest", block: "nearest" });
  });

  // se le tab non entrano nella barra: un "…" apre il menu con TUTTE le repo (oltre allo scroll)
  let overflowing = $state(false);
  function repobarOverflow(node: HTMLElement) {
    const measure = () => {
      overflowing = node.scrollWidth > node.clientWidth + 1;
      // stringendo la finestra il repo SELEZIONATO (che può non essere il primo) deve restare in
      // vista: lo riporto in vista a ogni resize. rAF: fuori dal callback del ResizeObserver.
      requestAnimationFrame(() =>
        node.querySelector(".repotab.active")?.scrollIntoView({ inline: "nearest", block: "nearest" }),
      );
    };
    const ro = new ResizeObserver(measure); // cambi di larghezza (finestra / altri elementi)
    ro.observe(node);
    const mo = new MutationObserver(measure); // aggiunta/rimozione di tab → cambia scrollWidth
    mo.observe(node, { childList: true, subtree: true });
    measure();
    return {
      destroy() {
        ro.disconnect();
        mo.disconnect();
      },
    };
  }
  // Riordino dei repo per trascinamento: la tab presa segue il puntatore (transform), le altre scivolano
  // di una posizione (transform con transition) e la LISTA cambia solo al rilascio, così il DOM non si
  // riordina durante il drag. Soglia di 5 px: sotto, è un click (cambio repo).
  const TAB_GAP = 4;
  let drag = $state<{ from: number; to: number; dx: number; width: number } | null>(null);
  let settling = $state(false); // al rilascio: un frame senza transition (il DOM riordinato coincide col visivo)
  let dragPending: { index: number; x0: number; pointerId: number; el: HTMLElement } | null = null;
  let tabRects: { left: number; width: number }[] = [];
  let suppressClick = false;
  function repoDown(e: PointerEvent, index: number) {
    if (e.button !== 0 || (e.target as HTMLElement).closest(".rt-close")) return;
    dragPending = { index, x0: e.clientX, pointerId: e.pointerId, el: e.currentTarget as HTMLElement };
  }
  function repoMove(e: PointerEvent) {
    if (!dragPending) return;
    if (!drag) {
      if (Math.abs(e.clientX - dragPending.x0) < 5) return;
      const tabs = [...(repobarEl?.querySelectorAll(".repotab") ?? [])] as HTMLElement[];
      tabRects = tabs.map((t) => {
        const r = t.getBoundingClientRect();
        return { left: r.left, width: r.width };
      });
      try {
        dragPending.el.setPointerCapture(dragPending.pointerId);
      } catch {
        /* no-op */
      }
      drag = { from: dragPending.index, to: dragPending.index, dx: 0, width: tabRects[dragPending.index]?.width ?? 0 };
    }
    drag.dx = e.clientX - dragPending.x0;
    // destinazione: dove cade il CENTRO della tab trascinata rispetto ai centri delle altre
    const center = tabRects[drag.from].left + drag.width / 2 + drag.dx;
    let to = drag.from;
    for (let i = drag.from - 1; i >= 0; i--) {
      if (center < tabRects[i].left + tabRects[i].width / 2) to = i;
      else break;
    }
    if (to === drag.from) {
      for (let i = drag.from + 1; i < tabRects.length; i++) {
        if (center > tabRects[i].left + tabRects[i].width / 2) to = i;
        else break;
      }
    }
    drag.to = to;
  }
  function repoUp(e: PointerEvent) {
    if (drag) {
      const { from, to } = drag;
      settling = true; // niente transition mentre il DOM si riordina e i transform si azzerano
      drag = null;
      if (from !== to) moveFolder(from, to);
      requestAnimationFrame(() => requestAnimationFrame(() => (settling = false)));
      suppressClick = true; // il click che segue il rilascio NON deve cambiare repo
      setTimeout(() => (suppressClick = false), 0);
      try {
        (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
      } catch {
        /* no-op */
      }
    }
    dragPending = null;
  }
  /** Transform della tab `i` durante il drag: quella presa segue il puntatore, le altre fra origine e
   *  destinazione scivolano di una posizione. */
  function repoShift(i: number): string {
    if (!drag) return "";
    if (i === drag.from) return `translateX(${drag.dx}px)`;
    const step = drag.width + TAB_GAP;
    if (drag.from < drag.to && i > drag.from && i <= drag.to) return `translateX(${-step}px)`;
    if (drag.to < drag.from && i >= drag.to && i < drag.from) return `translateX(${step}px)`;
    return "";
  }
  function repoClick(path: string) {
    if (suppressClick) {
      suppressClick = false;
      return;
    }
    void openFromList(path);
  }
  let folderMenu = $state<{ x: number; y: number } | null>(null);
  function openFolderMenu(e: MouseEvent) {
    folderMenu = menuPos(e);
  }
  function folderMenuItems(): MenuItem[] {
    const items: MenuItem[] = folders.list.map((f) => ({
      label: f.name,
      icon: f.path === workspace.rootPath ? "folder-open" : "folder",
      onClick: () => void openFromList(f.path),
    }));
    items.push({ label: "Add folder…", icon: "folder-plus", separatorBefore: items.length > 0, onClick: openFolderDialog });
    return items;
  }

  // posizione di un menu a tendina, appena sotto il pulsante che l'ha aperto
  function menuPos(e: MouseEvent) {
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    return { x: r.left, y: r.bottom + 4 };
  }

  // notifica "Claude in attesa": pill persistente in top bar (vedi terminals.notifyTerminalBell).
  // Click sul pill → vai al più vecchio in attesa; il caret (solo se >1) apre l'elenco di tutti.
  let waitMenu = $state<{ x: number; y: number } | null>(null);
  function openWaitMenu(e: MouseEvent) {
    waitMenu = menuPos(e);
  }
  function waitMenuItems(): MenuItem[] {
    return waitingTerminals().map((t) => ({
      label: t.root ? `${basename(t.root)} › ${displayTitle(t)}` : displayTitle(t),
      icon: "sparkles",
      onClick: () => void goToTerminal(t.id),
    }));
  }

  let runMenu = $state<{ x: number; y: number } | null>(null);
  function openRunMenu(e: MouseEvent) {
    runMenu = menuPos(e);
  }
  function runMenuItems(): MenuItem[] {
    const items: MenuItem[] = run.configs.map((c) => ({
      label: c.name,
      icon: "play",
      onClick: () => runConfig(c),
    }));
    items.push({
      label: "Open .orbit/run.json",
      icon: "braces",
      separatorBefore: items.length > 0,
      onClick: openConfig,
    });
    items.push({ label: "Set up for Claude (CLAUDE.md)", icon: "doc", onClick: teachClaude });
    return items;
  }

  let claudeMenu = $state<{ x: number; y: number } | null>(null);
  function openClaudeMenu(e: MouseEvent) {
    claudeMenu = menuPos(e);
  }
  function claudeMenuItems(): MenuItem[] {
    const items: MenuItem[] = [
      { label: "Open Claude here", icon: "sparkles", onClick: () => launchClaude() },
      { label: "Open Claude to the side", icon: "columns", onClick: () => launchClaude(undefined, "Claude", { side: true }) },
    ];
    if (claude.shortcuts.length) {
      items.push({ label: "Prompts", header: true, separatorBefore: true });
      claude.shortcuts.forEach((s) =>
        items.push({ label: s.name, icon: s.icon ?? "play", onClick: () => runShortcut(s) }),
      );
    }
    if (claude.wrappers.length) {
      // i wrapper aprono il composer (scrivi → copia negli appunti); "…" = chiedono input
      items.push({ label: "Wrappers (compose + copy)", header: true, separatorBefore: true });
      claude.wrappers.forEach((w) =>
        items.push({ label: `${w.name}…`, icon: w.icon ?? "type", onClick: () => openWrapper(w) }),
      );
    }
    items.push({ label: "Configuration", header: true, separatorBefore: true });
    items.push({ label: "Add / remove prompts…", icon: "plus", onClick: openPrompts });
    items.push({ label: "Edit .orbit/claude.json", icon: "braces", onClick: openClaudeConfig });
    items.push({ label: "Update CLAUDE.md for Claude", icon: "doc", onClick: teachClaudeConfig });
    return items;
  }

  const views = [
    { id: "explorer", icon: "explorer", label: "Explorer" },
    { id: "git", icon: "git-branch", label: "Git" },
    { id: "search", icon: "search", label: "Search" },
    { id: "docs", icon: "book-open", label: "Docs" },
  ] as const;

  let offResized: UnlistenFn | undefined;
  onMount(async () => {
    try {
      maximized = await win.isMaximized();
      offResized = await win.onResized(async () => {
        maximized = await win.isMaximized();
      });
    } catch {
      /* fuori dal contesto Tauri */
    }
  });
  onDestroy(() => offResized?.());
</script>

<header class="topbar" data-tauri-drag-region>
  <div class="brand" data-tauri-drag-region>
    <Logo size={18} />
  </div>

  <nav class="views">
    {#each views as v (v.id)}
      <button
        class="view"
        class:active={layout.sidebarVisible && layout.sidebarView === v.id}
        class:gitview={v.id === "git"}
        title={v.label}
        onclick={() => selectView(v.id)}
      >
        <!-- icone da 14 in bottoni alti 22: 4 px sopra e sotto (con 15 erano 3 e 4, M57) -->
        <Icon name={v.icon} size={14} strokeWidth={1.7} />
        <span>{v.label}</span>
        {#if v.id === "git" && changed > 0}<span class="badge">{changed}</span>{/if}
      </button>
    {/each}
    <button class="view" class:active={activeKind === "activity" || (layout.sidebarVisible && layout.sidebarView === "activity")} title="Activity" aria-label="Activity" onclick={openActivity}>
      <Icon name="activity" size={14} strokeWidth={1.7} />
      <span>Activity</span>
    </button>
    <span class="sep"></span>
    <button class="navbtn" disabled={nav.back === 0} title={`Back (${backKey})`} aria-label="Navigate back" onclick={navBack}>
      <Icon name="arrow-left" size={14} strokeWidth={1.8} />
    </button>
    <button class="navbtn" disabled={nav.fwd === 0} title={`Forward (${fwdKey})`} aria-label="Navigate forward" onclick={navForward}>
      <Icon name="arrow-right" size={14} strokeWidth={1.8} />
    </button>
    <button
      class="view only"
      class:active={layout.terminalVisible}
      title="Terminal (Ctrl+`)"
      aria-label="Terminal"
      onclick={toggleTerminal}
    >
      <Icon name="terminal" size={14} strokeWidth={1.7} />
    </button>
  </nav>

  <div class="spacer" data-tauri-drag-region>
    {#if workspace.light}
      <!-- finestra leggera (M57): un file aperto da solo; al posto delle schede repo l'invito a farne
           un progetto (il repo git che lo contiene, o la sua cartella) -->
      <button
        class="lightproj"
        title={`Open ${workspace.lightProject ?? workspace.rootPath} as a project — tree, git, terminals and Claude`}
        onclick={() => void promoteLight()}
      >
        <Icon name="folder-open" size={12} strokeWidth={1.8} />
        <span class="lp-label">Open <strong>{basename(workspace.lightProject ?? workspace.rootPath ?? "")}</strong> as project</span>
      </button>
    {:else if workspace.rootName}
      <div class="repozone">
        <div class="repobar" bind:this={repobarEl} use:repobarOverflow>
          {#each folders.list as f, i (f.path)}
            {@const active = f.path === workspace.rootPath}
            <!-- svelte-ignore a11y_no_static_element_interactions -->
            <div
              class="repotab"
              class:active
              class:dragging={drag?.from === i}
              class:settling
              style:transform={repoShift(i)}
              onpointerdown={(e) => repoDown(e, i)}
              onpointermove={repoMove}
              onpointerup={repoUp}
              onpointercancel={repoUp}
            >
              <button class="rt-main" title={f.path} onclick={() => repoClick(f.path)}>
                <Icon name={active ? "folder-open" : "folder"} size={12} strokeWidth={1.8} />
                <span class="rt-name">{f.name}</span>
                {#if active && workspace.branch}
                  <span class="rt-branch" title={workspace.branch}><Icon name="git-branch" size={10} strokeWidth={1.8} /><span class="rt-bname">{workspace.branch}</span></span>
                {/if}
              </button>
              <button class="rt-close" title={active ? "Remove (switch to a neighbor)" : "Remove from list"} aria-label="Remove from list" onclick={() => removeFolder(f.path)}>
                <Icon name="x" size={10} strokeWidth={2} />
              </button>
              {#if repoNeedsAttention(f.path)}<span class="rt-attn" title="A terminal in this repo is waiting (Claude finished / needs you)"></span>{/if}
            </div>
          {/each}
        </div>
        <!-- "+"/"…" stanno FUORI dalla striscia che scorre: sempre raggiungibili anche da stretto.
             Se le tab non entrano (overflowing) il "…" apre TUTTE le repo (e include "Add folder…"),
             quindi il "+" diventa ridondante e lo nascondo per recuperare spazio. -->
        {#if overflowing}
          <button class="repoadd" title="All repositories" aria-label="All repositories" onclick={openFolderMenu}>
            <Icon name="more" size={14} strokeWidth={2} />
          </button>
        {:else}
          <!-- 14 px in un bottone 26×22 con bordo da 1: 5 px ai lati e 3 sopra e sotto (con 13 il "+"
               cadeva a mezzo pixel e si vedeva spostato di 1 px, M57) -->
          <button class="repoadd" title="Add folder…" aria-label="Add folder" onclick={openFolderDialog}>
            <Icon name="plus" size={14} strokeWidth={2} />
          </button>
        {/if}
      </div>
    {/if}
  </div>

  <div class="actions">
    {#if updates.available}
      <!-- 12 px in 22 con bordo da 1: 4 px sopra e sotto -->
      <button class="updpill" title="Orbit {updates.available.version} is available — click to update" onclick={openUpdateDialog}>
        <Icon name="download" size={12} strokeWidth={1.8} />
        <span class="up-label">Update</span>
      </button>
    {/if}
    {#if anyNeedsAttention()}
      {@const waiting = waitingTerminals()}
      <div class="waitpill" title="Claude is waiting — click to open">
        <button class="wp-main" onclick={() => goToTerminal(waiting[0].id)}>
          <span class="wp-dot"><Icon name="sparkles" size={12} strokeWidth={1.8} /></span>
          <span class="wp-label">Waiting</span>
          <span class="wp-count">{waiting.length}</span>
        </button>
        {#if waiting.length > 1}
          <button class="wp-caret" aria-label="List waiting terminals" title="Show all waiting" onclick={openWaitMenu}>
            <Icon name="chevron-down" size={12} strokeWidth={2} />
          </button>
        {/if}
      </div>
    {/if}
    <!-- strumenti del PROGETTO: non in una finestra leggera, dove scriverebbero nella cartella del file -->
    {#if workspace.rootName && !workspace.light}
      <button class="view only" title="Scratchpad — notes & prompts" aria-label="Scratchpad" onclick={openScratch}>
        <Icon name="note" size={14} strokeWidth={1.7} />
      </button>
      <button class="view only claude" title="Claude…" aria-label="Claude" onclick={openClaudeMenu}>
        <Icon name="sparkles" size={14} strokeWidth={1.7} />
      </button>
      <button class="view only run" title="Run…" aria-label="Run" onclick={openRunMenu}>
        <Icon name="play" size={14} strokeWidth={1.8} />
      </button>
    {/if}
    <button class="view only" title="New window (another folder)" aria-label="New window" onclick={newWindow}>
      <Icon name="new-window" size={14} strokeWidth={1.7} />
    </button>
    <button class="view only" title="Close all Orbit windows (reopen on next launch)" aria-label="Close all windows" onclick={closeAll}>
      <Icon name="windows-close" size={14} strokeWidth={1.7} />
    </button>
    <button class="view only" title="Settings" aria-label="Settings" onclick={openSettings}>
      <Icon name="settings" size={14} strokeWidth={1.7} />
    </button>
  </div>

  <!-- controlli finestra 45×29 (la top bar è alta 30 con il bordo da 1): icone DISPARI → margini interi
       e uguali su tutti i lati (con 44 di larghezza nessuna icona poteva centrarsi in entrambi i versi) -->
  <div class="wctrls">
    <button class="wc" title="Minimize" aria-label="Minimize" onclick={() => win.minimize()}>
      <Icon name="win-minimize" size={15} strokeWidth={1.3} />
    </button>
    <button class="wc" title={maximized ? "Restore" : "Maximize"} aria-label="Maximize" onclick={() => win.toggleMaximize()}>
      <Icon name={maximized ? "win-restore" : "win-maximize"} size={13} strokeWidth={1.3} />
    </button>
    <button class="wc close" title="Close" aria-label="Close" onclick={() => win.close()}>
      <Icon name="x" size={15} strokeWidth={1.6} />
    </button>
  </div>
</header>

{#if runMenu}
  <ContextMenu x={runMenu.x} y={runMenu.y} items={runMenuItems()} onClose={() => (runMenu = null)} />
{/if}
{#if claudeMenu}
  <ContextMenu x={claudeMenu.x} y={claudeMenu.y} items={claudeMenuItems()} onClose={() => (claudeMenu = null)} />
{/if}
{#if folderMenu}
  <ContextMenu x={folderMenu.x} y={folderMenu.y} items={folderMenuItems()} onClose={() => (folderMenu = null)} />
{/if}
{#if waitMenu}
  <ContextMenu x={waitMenu.x} y={waitMenu.y} items={waitMenuItems()} onClose={() => (waitMenu = null)} />
{/if}

<style>
  .topbar {
    height: 30px;
    flex: 0 0 30px;
    display: flex;
    align-items: center;
    gap: 4px;
    padding-left: 11px;
    background: var(--color-surface-0);
    border-bottom: 1px solid var(--color-line);
    user-select: none;
  }
  .brand {
    display: flex;
    align-items: center;
    padding-right: 10px;
    margin-right: 5px;
    border-right: 1px solid var(--color-line);
    height: 18px;
  }

  /* frecce indietro/avanti (cronologia di navigazione) — accanto al toggle terminale */
  .navbtn {
    display: grid;
    place-items: center;
    width: 26px;
    height: 22px;
    border: 0;
    border-radius: var(--radius-sm);
    background: transparent;
    color: var(--color-ink-muted);
    cursor: pointer;
    transition:
      background 100ms ease,
      color 100ms ease;
  }
  .navbtn:hover:not(:disabled) {
    background: var(--color-surface-3);
    color: var(--color-ink);
  }
  .navbtn:disabled {
    opacity: 0.3;
    cursor: default;
  }

  .views {
    display: flex;
    align-items: center;
    gap: 2px;
    flex-shrink: 0; /* il nav non si comprime: a finestra stretta diventa solo-icone (media query in fondo) */
  }
  .view {
    position: relative; /* ancora il badge Git in overlay (vedi .badge) */
    display: inline-flex;
    align-items: center;
    gap: 6px;
    height: 22px;
    padding: 0 9px;
    border: 0;
    border-radius: var(--radius-sm);
    background: transparent;
    color: var(--color-ink-muted);
    font-size: 12px;
    cursor: pointer;
    transition:
      background 100ms ease,
      color 100ms ease;
  }
  .view.only {
    padding: 0 7px;
  }
  .view:hover {
    background: var(--color-surface-3);
    color: var(--color-ink);
  }
  .view.active {
    background: rgba(var(--accent-rgb), 0.18);
    color: #cfe5ff;
  }
  /* il pulsante Git riserva spazio a destra per il badge contatore: così il badge (assoluto) ci sta
     SENZA coprire l'etichetta "Git" e senza far crescere il bottone quando compare (niente shift). */
  .view.gitview {
    padding-right: 22px;
  }
  /* Badge contatore (Git): in OVERLAY assoluto, così il suo comparire/sparire NON ricalcola il layout
     (prima, inline, allargava il bottone e spingeva i controlli a destra). In modalità larga sta nello
     spazio riservato a destra dell'etichetta (vedi .gitview), centrato verticalmente → legge "Git ③"
     senza coprire il testo. In solo-icone diventa badge d'angolo sull'icona (media query in fondo).
     L'anello (color-surface-0) lo stacca dallo sfondo come una notifica. */
  .badge {
    position: absolute;
    top: 50%;
    right: 5px;
    transform: translateY(-50%);
    display: grid;
    place-items: center;
    min-width: 14px;
    height: 14px;
    padding: 0 3px;
    border-radius: var(--r-lg);
    background: var(--color-accent);
    color: #08111f;
    font-size: 9px;
    font-weight: 700;
    line-height: 1;
    box-shadow: 0 0 0 1.5px var(--color-surface-0);
    pointer-events: none;
  }
  .sep {
    width: 1px;
    height: 18px;
    background: var(--color-line);
    margin: 0 5px;
  }

  .spacer {
    flex: 1;
    height: 100%;
    display: flex;
    align-items: center;
    justify-content: center; /* la striscia repo si popola DAL CENTRO (richiesta utente, M56); lo spazio libero
                                resta ai lati e NON comprime la repobar → la tab attiva si vede intera
                                quando c'è spazio; da stretto la repozone riempie lo spacer e scrolla */
    min-width: 0; /* assorbe la compressione: la repobar si stringe/scrolla qui, non spinge fuori i wctrls */
  }
  /* tab repo (striscia che scorre) + "+"/"…" pinnati; tutto entro lo spazio dello spacer */
  .repozone {
    display: flex;
    align-items: center;
    gap: 4px;
    min-width: 0;
    max-width: 100%;
  }
  .repobar {
    display: flex;
    align-items: center;
    gap: 4px;
    flex: 0 1 auto;
    width: max-content; /* larghezza = contenuto PIENO (tab attiva intera) quando c'è spazio… */
    max-width: 100%; /* …ma mai oltre lo spazio disponibile → oltre, scrolla */
    min-width: 0; /* scroll container in x → min-content non la blocca */
    height: 22px;
    overflow-x: auto;
    scrollbar-width: none;
  }
  .repobar::-webkit-scrollbar {
    display: none;
  }
  .repotab {
    position: relative; /* ancora il pallino "attenzione" (un terminale di QUESTA repo è in attesa) */
    display: inline-flex;
    align-items: center;
    flex: 0 0 auto;
    max-width: 220px;
    height: 22px;
    border: 1px solid var(--color-line);
    border-radius: var(--r-lg);
    background: var(--color-surface-1);
    color: var(--color-ink-muted);
    overflow: hidden;
    touch-action: none; /* riordino per trascinamento con pointer capture */
    transition:
      background 90ms ease,
      border-color 90ms ease,
      color 90ms ease,
      transform 150ms var(--motion-ease);
  }
  /* riordino: la tab presa segue il puntatore senza transition e sopra le altre; al rilascio nessuna
     transition per un frame (il DOM riordinato coincide già con la posizione visiva) */
  .repotab.dragging,
  .repotab.settling {
    transition: background 90ms ease, border-color 90ms ease, color 90ms ease;
  }
  .repotab.dragging {
    z-index: 2;
    cursor: grabbing;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.35);
  }
  .repotab:not(.active):hover {
    background: var(--color-surface-3);
    color: var(--color-ink);
  }
  .repotab.active {
    color: var(--color-ink);
    background: rgba(var(--accent-rgb), 0.16);
    border-color: rgba(var(--accent-rgb), 0.5);
    /* la tab ATTIVA mostra nome + branch PER INTERO quando c'è spazio (la repobar usa `width:max-content`
       → niente tetto qui); ma resta COMPRIMIBILE (flex-shrink) così da finestra stretta si accorcia con
       ellissi invece di spingere fuori i controlli. Le inattive restano a 220px. */
    flex: 0 1 auto;
    max-width: none;
    min-width: 0;
  }
  .rt-main {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    height: 100%;
    padding: 0 5px 0 9px;
    border: 0;
    background: transparent;
    color: inherit;
    font: inherit;
    font-size: 12px;
    cursor: pointer;
    min-width: 0;
  }
  .rt-name {
    flex: 0 1 auto; /* sotto pressione si accorcia con ellissi (l'item più lungo cede di più) */
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .rt-branch {
    flex: 0 1 auto; /* intero quando c'è spazio (repobar a max-content); si accorcia con ellissi se serve */
    min-width: 0;
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding-left: 2px;
    color: var(--color-ink-muted);
    font-size: 11px;
  }
  .rt-branch :global(svg) {
    flex: 0 0 auto; /* l'icona del branch non si comprime */
  }
  .rt-bname {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .rt-close {
    display: grid;
    place-items: center;
    width: 16px;
    height: 16px;
    margin-right: 4px;
    border: 0;
    border-radius: var(--r-sm);
    background: transparent;
    color: var(--color-ink-subtle);
    cursor: pointer;
    opacity: 0;
    transition: opacity 90ms ease, background 90ms ease;
  }
  .repotab:hover .rt-close {
    opacity: 1;
  }
  .rt-close:hover {
    background: var(--color-surface-4);
    color: var(--color-ink);
  }
  /* pallino "attenzione" della repo: un suo terminale ha suonato la bell (Claude finito / in attesa).
     Overlay nell'angolo (non sposta il contenuto) e pulsa finché non apri quel terminale. */
  .rt-attn {
    position: absolute;
    top: 2px;
    right: 3px;
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: var(--color-accent);
    box-shadow: 0 0 0 1.5px var(--color-surface-0);
    pointer-events: none;
    animation: rt-attn-pulse 1.6s ease-in-out infinite;
  }
  @keyframes rt-attn-pulse {
    0%, 100% {
      opacity: 1;
    }
    50% {
      opacity: 0.35;
    }
  }
  .repoadd {
    flex: 0 0 auto;
    display: grid;
    place-items: center;
    width: 26px;
    height: 22px;
    border: 1px solid var(--color-line);
    border-radius: var(--r-lg);
    background: var(--color-surface-1);
    color: var(--color-ink-muted);
    cursor: pointer;
    transition: background 90ms ease, color 90ms ease;
  }
  .repoadd:hover {
    background: var(--color-surface-3);
    color: var(--color-ink);
  }
  /* finestra leggera (M57): stessa forma di una scheda repo, l'accento compare al passaggio */
  .lightproj {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    min-width: 0;
    max-width: 100%;
    height: 22px;
    padding: 0 10px;
    border: 1px solid var(--color-line);
    border-radius: var(--r-lg);
    background: var(--color-surface-1);
    color: var(--color-ink-muted);
    font: inherit;
    font-size: 12px;
    cursor: pointer;
    transition:
      background 90ms ease,
      border-color 90ms ease,
      color 90ms ease;
  }
  .lightproj:hover {
    color: var(--color-ink);
    background: rgba(var(--accent-rgb), 0.16);
    border-color: rgba(var(--accent-rgb), 0.5);
  }
  .lightproj :global(svg) {
    flex: 0 0 auto;
  }
  .lp-label {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .lp-label strong {
    color: var(--color-ink);
    font-weight: 600;
  }

  .actions {
    display: flex;
    align-items: center;
    gap: 2px;
    padding-right: 4px;
    flex-shrink: 0; /* azioni sempre visibili, mai tagliate */
  }
  .actions .run {
    color: var(--color-success);
  }
  .actions .run:hover {
    color: var(--color-success);
    background: rgba(78, 201, 176, 0.16);
  }
  .actions .claude {
    color: var(--color-accent);
  }
  .actions .claude:hover {
    color: var(--color-accent);
    background: rgba(var(--accent-rgb), 0.16);
  }

  /* notifica "Claude in attesa": pill compatto in accento, persistente ma non invadente */
  /* versione nuova disponibile (M59): come il pill "Waiting", ma fermo */
  .updpill {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    height: 22px;
    margin-right: 4px;
    padding: 0 8px;
    border: 1px solid rgba(var(--accent-rgb), 0.5);
    border-radius: var(--r-md);
    background: rgba(var(--accent-rgb), 0.14);
    color: var(--color-accent);
    font-size: 12px;
    font-weight: 500;
    cursor: pointer;
  }
  .updpill:hover {
    background: rgba(var(--accent-rgb), 0.22);
  }
  .waitpill {
    display: inline-flex;
    align-items: stretch;
    height: 22px;
    margin-right: 4px;
    border: 1px solid rgba(var(--accent-rgb), 0.5);
    border-radius: var(--r-md);
    background: rgba(var(--accent-rgb), 0.14);
    overflow: hidden;
  }
  .wp-main,
  .wp-caret {
    display: inline-flex;
    align-items: center;
    border: 0;
    background: transparent;
    color: var(--color-accent);
    cursor: pointer;
    font-size: 12px;
  }
  .wp-main {
    gap: 5px;
    padding: 0 8px;
  }
  .wp-main:hover,
  .wp-caret:hover {
    background: rgba(var(--accent-rgb), 0.22);
  }
  .wp-dot {
    display: inline-flex;
    animation: wp-pulse 1.8s ease-in-out infinite;
  }
  .wp-label {
    font-weight: 500;
  }
  .wp-count {
    min-width: 16px;
    height: 16px;
    padding: 0 4px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border-radius: var(--r-lg);
    background: var(--color-accent);
    color: var(--color-surface-0);
    font-size: 11px;
    font-weight: 600;
  }
  .wp-caret {
    padding: 0 5px;
    border-left: 1px solid rgba(var(--accent-rgb), 0.4);
  }
  @keyframes wp-pulse {
    0%,
    100% {
      opacity: 1;
    }
    50% {
      opacity: 0.45;
    }
  }

  .wctrls {
    display: flex;
    align-items: stretch;
    height: 100%;
    margin-left: 4px;
    flex-shrink: 0; /* min/max/close SEMPRE visibili (finestra senza decorazioni) */
  }
  .wc {
    width: 45px;
    display: grid;
    place-items: center;
    border: 0;
    background: transparent;
    color: var(--color-ink-muted);
    cursor: pointer;
    transition: background 100ms ease;
  }
  .wc:hover {
    background: var(--color-surface-3);
    color: var(--color-ink);
  }
  .wc.close:hover {
    background: #e81123;
    color: #fff;
  }

  /* Finestra stretta (≤ minWidth+margine): il nav diventa solo-icone — recupera ~185px di label
     così le azioni e i controlli finestra restano SEMPRE visibili e la repobar ha spazio per
     scorrere. Il badge Git (.badge) resta. La soglia è > somma-parti-fisse-con-label, perciò a
     ogni larghezza ≥ 720 (minWidth) nulla va in overflow oltre il bordo destro. */
  @media (max-width: 980px) {
    .views .view span:not(.badge) {
      display: none;
    }
    .views .view {
      padding: 0 7px;
    }
    /* solo-icone: niente etichetta da rispettare → il badge torna nell'angolo dell'icona */
    .views .badge {
      top: -2px;
      right: -2px;
      transform: none;
    }
    /* il pill "Waiting" resta (icona + conteggio); nascondi solo la parola per risparmiare spazio */
    .waitpill .wp-label,
    .updpill .up-label {
      display: none;
    }
  }
</style>
