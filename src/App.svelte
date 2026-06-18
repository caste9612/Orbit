<script lang="ts">
  import { onMount, onDestroy, untrack } from "svelte";
  import { invoke } from "@tauri-apps/api/core";
  import TopBar from "./lib/components/TopBar.svelte";
  import Sidebar from "./lib/components/Sidebar.svelte";
  import EditorArea from "./lib/components/EditorArea.svelte";
  import TerminalPanel from "./lib/components/TerminalPanel.svelte";
  import StatusBar from "./lib/components/StatusBar.svelte";
  import Splitter from "./lib/components/Splitter.svelte";
  import Terminal from "./lib/components/LazyTerminal.svelte";
  import Lazy from "./lib/components/Lazy.svelte";
  import Toaster from "./lib/components/Toaster.svelte";
  import Logo from "./lib/components/Logo.svelte";
  import Icon from "./lib/components/Icon.svelte";
  import { layout, resizeSidebar, resizeTerminal, toggleSidebar, toggleTerminal } from "./lib/state/layout.svelte";
  import { listen, emit } from "@tauri-apps/api/event";
  import { getCurrentWindow } from "@tauri-apps/api/window";
  import { openFolderDialog, refreshTree, revealInTree } from "./lib/state/explorer.svelte";
  import { workspace, openFile, saveActive, reloadOpenFiles, activeFile } from "./lib/state/workspace.svelte";
  import { setQuery } from "./lib/state/search.svelte";
  import { refreshStatus } from "./lib/state/git.svelte";
  import { quickopen, openPalette } from "./lib/state/quickopen.svelte";
  import { symbols, openSymbols } from "./lib/state/symbols.svelte";
  import { loadRunConfig } from "./lib/state/run.svelte";
  import { loadClaudeConfig, launchClaude, wrapperUI } from "./lib/state/claude.svelte";
  import { loadShelf } from "./lib/state/shelf.svelte";
  import { loadDocs } from "./lib/state/docs.svelte";
  import { invalidateFiles } from "./lib/state/projectFiles";
  import { loadSettings, startSettingsAutosave, settingsUI, nudgeFontSize, settings } from "./lib/state/settings.svelte";
  import { loadSession, startAutosave } from "./lib/state/persist.svelte";
  import { redockTerminal, terminals } from "./lib/state/terminals.svelte";
  import { initIndex, scheduleRescan, wsPalette, openWsPalette, navBack, navForward, goToDefinitionAtCursor } from "./lib/state/codeIndex.svelte";
  import { matchCommand, shortcutsUI } from "./lib/state/keybindings.svelte";
  import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";

  // Le finestre flottanti hanno label "term-float-<id>" e mostrano un terminale a tutta finestra.
  // const (calcolato una volta): non è reattivo, così può essere letto in un $effect senza warning.
  const isFloatingTerminal = (() => {
    try {
      return getCurrentWebviewWindow().label.startsWith("term-float");
    } catch {
      return false; // fuori dal contesto Tauri
    }
  })();

  // parametri della finestra flottante: quale terminale (PTY) agganciare e chi l'ha estratto
  const fq = new URLSearchParams(window.location.search);
  const floatId = fq.get("float") ?? "float";
  const floatShell = fq.get("shell") || null;
  const floatTitle = fq.get("title") || "Terminal";
  const floatFrom = fq.get("from") ?? "";
  // snapshot (al momento dell'estrazione) di cartella e branch, per il badge della finestra flottante
  const floatRoot = fq.get("root") ?? "";
  const floatBranch = fq.get("branch") ?? "";

  // unlisten dell'handler di chiusura della finestra flottante (hoisted: lo usa anche il close)
  let floatUnlisten: (() => void) | undefined;

  // finestra flottante: riaggancia al pannello (la chiusura innesca il redock via onCloseRequested)
  async function dockFloatTerminal() {
    try {
      await getCurrentWindow().close();
    } catch {
      /* */
    }
  }
  // finestra flottante: chiude davvero il terminale (termina il PTY, niente redock)
  async function closeFloatTerminal() {
    floatUnlisten?.(); // disattiva il redock: stiamo chiudendo sul serio
    floatUnlisten = undefined;
    try {
      await invoke("pty_kill", { id: floatId });
    } catch {
      /* */
    }
    try {
      await getCurrentWindow().destroy();
    } catch {
      /* */
    }
  }

  // finestra flottante: pin "sempre in primo piano". Nasce attiva (alwaysOnTop:true alla creazione);
  // il toggle la accende/spegne a runtime con setAlwaysOnTop.
  let floatPinned = $state(true);
  async function toggleFloatPin() {
    floatPinned = !floatPinned;
    try {
      await getCurrentWindow().setAlwaysOnTop(floatPinned);
    } catch (e) {
      console.error("setAlwaysOnTop", e);
    }
  }

  // Ctrl+rotella = zoom del font di editor/terminale (intercetta prima del WebView)
  function addWheelZoom() {
    window.addEventListener(
      "wheel",
      (e) => {
        if (!e.ctrlKey) return;
        e.preventDefault();
        nudgeFontSize(e.deltaY < 0 ? 1 : -1);
      },
      { passive: false },
    );
  }

  // Soppressione dei comportamenti NATIVI di WebView2, registrata su <svelte:window> nel markup
  // (non in onMount) così l'HMR la applica subito senza rimontare.
  // menu contestuale: consentito SOLO nei campi di testo (incolla/seleziona); soppresso ovunque
  // altrove, EDITOR INCLUSO → niente menu di WebView2 sui file aperti.
  function onAppContextMenu(e: MouseEvent) {
    const t = e.target as HTMLElement | null;
    if (!t?.closest("input, textarea")) e.preventDefault();
  }
  // drag nativo: consentito dove si trascina testo (campi + editor CodeMirror); soppresso altrove
  // (tab, chrome) dove darebbe il cursore "stop" e ruberebbe gli eventi pointer al drag delle tab.
  function onAppDragStart(e: DragEvent) {
    const t = e.target as HTMLElement | null;
    if (!t?.closest("input, textarea, .cm-editor")) e.preventDefault();
  }

  // unlisten degli eventi globali della finestra principale (vivono quanto la finestra)
  let offFsChanged: (() => void) | undefined;
  let offRedock: (() => void) | undefined;
  onDestroy(() => {
    offFsChanged?.();
    offRedock?.();
  });

  // Titolo finestra = nome del progetto aperto → con più istanze di Orbit le anteprime nella
  // taskbar di Windows (e Alt-Tab) diventano distinguibili invece di essere tutte "Orbit".
  $effect(() => {
    if (isFloatingTerminal) return;
    const name = workspace.rootName;
    void getCurrentWindow()
      .setTitle(name ? `${name} — Orbit` : "Orbit")
      .catch(() => {});
  });

  // Registro multi-finestra: comunica al backend la cartella aperta, così un avvio "nudo" può
  // riaprire tutte le finestre della sessione precedente. Reattivo al cambio cartella; mai per le flottanti.
  $effect(() => {
    if (isFloatingTerminal) return;
    const folder = workspace.rootPath;
    if (folder) void invoke("register_window", { folder });
  });

  // Indice simboli del progetto ("rubrica"): (ri)costruito quando cambia la cartella aperta.
  $effect(() => {
    if (isFloatingTerminal) return;
    workspace.rootPath; // dipendenza reattiva: re-inizializza al cambio cartella
    void initIndex();
  });

  // "Segui il file attivo": se il toggle è attivo, espande l'albero e porta in vista il file
  // corrente a ogni cambio di tab/gruppo (e quando lo si attiva). Segue anche go-to-definition/ricerca.
  // `untrack`: revealInTree muove `tree`/`reveal` (incl. `reveal.seq++`); senza untrack quelle
  // letture/scritture diventerebbero dipendenze dell'effetto → auto-invalidazione → loop infinito.
  $effect(() => {
    if (isFloatingTerminal) return;
    if (!settings.revealActive) return;
    const f = activeFile();
    // file/image/pdf hanno un path reale sul disco; "diff" è un id sintetico → da non rivelare
    if (f && f.kind !== "diff") {
      const p = f.path; // letto in modo tracciato: l'effetto ri-rivela al cambio di file
      untrack(() => void revealInTree(p));
    }
  });

  onMount(async () => {
    loadSettings(); // applica font/dimensione/accento/caret (anche nella finestra flottante)
    if (isFloatingTerminal) {
      // Registra SUBITO l'handler di chiusura (prima di ogni altro await): una chiusura OS
      // precoce non deve perdere il redock e lasciare il PTY orfano. Riaggancia il terminale
      // a chi l'ha estratto (il PTY resta vivo: "torna" nel pannello, Claude continua).
      try {
        const w = getCurrentWindow();
        floatUnlisten = await w.onCloseRequested(async (e) => {
          e.preventDefault();
          await emit("term-redock", { id: floatId, title: floatTitle, shell: floatShell, from: floatFrom });
          floatUnlisten?.();
          floatUnlisten = undefined;
          await w.destroy();
        });
      } catch {
        /* fuori dal contesto Tauri */
      }
      addWheelZoom();
      return;
    }
    addWheelZoom();
    startSettingsAutosave();
    // aggiornamento in tempo reale: il backend emette fs-changed (debounced)
    offFsChanged = await listen("fs-changed", () => {
      refreshTree();
      refreshStatus();
      reloadOpenFiles();
      loadRunConfig(); // ricarica il menu Esegui se Claude tocca .orbit/run.json
      loadClaudeConfig(); // ricarica il menu Claude se cambia .orbit/claude.json
      loadShelf(); // ricarica lo scaffale se Claude tocca .orbit/shelf.json
      invalidateFiles(); // l'elenco file cachato (Docs/Quick Open) non è più aggiornato
      if (layout.sidebarView === "docs") loadDocs(); // aggiorna l'indice Docs se visibile
      scheduleRescan(); // aggiorna la rubrica dei simboli del progetto (debounced)
    });
    // un terminale estratto torna nel pannello quando la sua finestra flottante si chiude
    offRedock = await listen("term-redock", (e) => {
      const p = e.payload as { id: string; title: string; shell: string | null; from?: string };
      // `from` = label della finestra che ha estratto il terminale. Nota: gli eventi Tauri sono
      // per-processo e ogni istanza ("Nuova finestra") è un processo separato con una sola
      // finestra "main", quindi oggi il filtro è sempre verificato; resta per chiarezza/futuro.
      try {
        if (p.from && p.from !== getCurrentWebviewWindow().label) return;
      } catch {
        /* */
      }
      void redockTerminal({ id: p.id, title: p.title, shell: p.shell });
    });
    try {
      const s = await invoke<{ dir: string | null; file: string | null; search: string | null }>(
        "startup",
      );
      if (s.dir) {
        // avvio esplicito (arg CLI / env, es. "Nuova finestra"): apre quella cartella
        // ripristinandone la sessione (tab/layout) se esiste, altrimenti fresca
        await loadSession(s.dir);
        if (s.file) await openFile(s.file);
        if (s.search) {
          layout.sidebarView = "search";
          layout.sidebarVisible = true;
          setQuery(s.search);
        }
      } else {
        // nessun avvio esplicito: ripristina l'ultima sessione
        await loadSession();
      }
    } catch (e) {
      console.error("startup", e);
    }
    startAutosave(); // d'ora in poi persiste cartella, tab e pannelli
    // Terminale di default all'avvio: Claude SOLO qui (se abilitato, c'è una cartella e il pannello
    // è mostrato). L'icona terminale e il "+" creano sempre shell normali → niente Claude a sorpresa.
    if (layout.terminalVisible && settings.claudeTerminal && workspace.rootPath && terminals.list.length === 0) {
      launchClaude();
    }
    workspace.ready = true; // sessione caricata: il pannello può creare una shell normale se serve
  });

  // Dispatch tastiera centralizzato: il tasto premuto → comando (secondo il preset attivo) → azione.
  function onKey(e: KeyboardEvent) {
    if (isFloatingTerminal) return;
    const cmd = matchCommand(e);
    if (!cmd) return;
    // Le scorciatoie SENZA Ctrl/Cmd (F12, Alt+←/→) non vanno rubate al terminale o ai campi di testo
    // (ci si scrive/naviga dentro); quelle con Ctrl/Cmd restano globali ovunque (stile VS Code).
    // L'editor CodeMirror NON è escluso: lì F12=vai-alla-definizione e Alt+frecce=cronologia sono voluti.
    if (!(e.ctrlKey || e.metaKey)) {
      const t = e.target as HTMLElement | null;
      if (t?.closest("input, textarea, .xterm")) return;
    }
    e.preventDefault();
    switch (cmd) {
      case "quickOpen":
        openPalette();
        break;
      case "workspaceSymbols":
        openWsPalette();
        break;
      case "fileSymbols":
        openSymbols();
        break;
      case "goToDefinition":
        goToDefinitionAtCursor();
        break;
      case "navBack":
        navBack();
        break;
      case "navForward":
        navForward();
        break;
      case "save":
        saveActive();
        break;
      case "openFolder":
        openFolderDialog();
        break;
      case "toggleSidebar":
        toggleSidebar();
        break;
      case "toggleTerminal":
        toggleTerminal();
        break;
    }
  }
</script>

<svelte:window
  onkeydown={isFloatingTerminal ? undefined : onKey}
  oncontextmenu={onAppContextMenu}
  ondragstart={onAppDragStart}
/>

{#if isFloatingTerminal}
  <div class="floatshell">
    <header class="floatbar" data-tauri-drag-region>
      <div class="fbrand" data-tauri-drag-region>
        <Logo size={14} />
        <span>{floatTitle}</span>
      </div>
      {#if floatRoot}
        <div class="fws" data-tauri-drag-region>
          <span class="fwsname">{floatRoot}</span>
          {#if floatBranch}
            <span class="fwssep"></span>
            <span class="fwsbranch"><Icon name="git-branch" size={10} strokeWidth={1.8} />{floatBranch}</span>
          {/if}
        </div>
      {/if}
      <div class="fctrls">
        <button
          class="fc pin"
          class:on={floatPinned}
          title={floatPinned ? "Always on top: on (click to unpin)" : "Always on top: off (click to pin)"}
          aria-label="Toggle always on top"
          aria-pressed={floatPinned}
          onclick={toggleFloatPin}
        >
          <Icon name="pin" size={14} strokeWidth={1.7} />
        </button>
        <button class="fc dock" title="Dock to main window" aria-label="Dock to main window" onclick={dockFloatTerminal}>
          <Icon name="panel-bottom" size={15} strokeWidth={1.6} />
        </button>
        <button class="fc" title="Minimize" aria-label="Minimize" onclick={() => getCurrentWindow().minimize()}>
          <Icon name="win-minimize" size={14} strokeWidth={1.3} />
        </button>
        <button class="fc close" title="Close terminal" aria-label="Close terminal" onclick={closeFloatTerminal}>
          <Icon name="x" size={15} strokeWidth={1.6} />
        </button>
      </div>
    </header>
    <div class="floatbody">
      <div class="floatpanel">
        <Terminal id={floatId} shell={floatShell} attach active persistent enableLinks={false} />
      </div>
    </div>
  </div>
{:else}
  <div class="shell">
    <TopBar />
    <div class="body">
      {#if layout.sidebarVisible}
        <Sidebar />
        <Splitter orientation="vertical" onResize={resizeSidebar} />
      {/if}

      <EditorArea />

      {#if layout.terminalVisible}
        <Splitter orientation="vertical" onResize={resizeTerminal} />
        <TerminalPanel />
      {/if}
    </div>

    <StatusBar />
  </div>

  {#if quickopen.open}
    <Lazy load={() => import("./lib/components/QuickOpen.svelte")} />
  {/if}
  {#if symbols.open}
    <Lazy load={() => import("./lib/components/SymbolPalette.svelte")} />
  {/if}
  {#if wsPalette.open}
    <Lazy load={() => import("./lib/components/WorkspaceSymbols.svelte")} />
  {/if}
  {#if settingsUI.open}
    <Lazy load={() => import("./lib/components/Settings.svelte")} />
  {/if}
  {#if shortcutsUI.open}
    <Lazy load={() => import("./lib/components/ShortcutsDialog.svelte")} />
  {/if}
  {#if wrapperUI.open}
    <Lazy load={() => import("./lib/components/WrapperComposer.svelte")} />
  {/if}
  <Toaster />
{/if}

<style>
  .shell {
    height: 100%;
    display: flex;
    flex-direction: column;
    background: var(--color-surface-1);
  }
  .body {
    flex: 1;
    min-height: 0;
    display: flex;
    align-items: stretch;
    padding: 4px;
    background: var(--color-bg);
    overflow: hidden; /* niente sovrapposizioni se i pannelli non entrano */
  }
  .floatshell {
    height: 100%;
    display: flex;
    flex-direction: column;
    background: var(--color-surface-1);
  }
  .floatbar {
    height: 30px;
    flex: 0 0 30px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    background: var(--color-surface-0);
    border-bottom: 1px solid var(--color-line);
    padding-left: 11px;
    user-select: none;
  }
  .fbrand {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 12px;
    color: var(--color-ink-muted);
    flex: 0 0 auto;
  }
  /* badge cartella + branch (snapshot), come la top bar della finestra principale */
  .fws {
    display: inline-flex;
    align-items: center;
    gap: 7px;
    max-width: 50%;
    height: 20px;
    padding: 0 10px;
    background: var(--color-surface-1);
    border: 1px solid var(--color-line);
    border-radius: 7px;
    font-size: 11.5px;
    white-space: nowrap;
    overflow: hidden;
  }
  .fwsname {
    color: #eaeef3;
    font-weight: 500;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .fwssep {
    flex: 0 0 auto;
    width: 1px;
    height: 11px;
    background: var(--color-line-strong);
  }
  .fwsbranch {
    flex: 0 0 auto;
    display: inline-flex;
    align-items: center;
    gap: 4px;
    color: var(--color-ink-muted);
  }
  .fctrls {
    display: flex;
    align-items: stretch;
    height: 100%;
  }
  .fc {
    width: 42px;
    display: grid;
    place-items: center;
    border: 0;
    background: transparent;
    color: var(--color-ink-muted);
    cursor: pointer;
    transition: background 100ms ease;
  }
  .fc:hover {
    background: var(--color-surface-3);
    color: var(--color-ink);
  }
  .fc.pin.on {
    color: var(--color-accent);
  }
  .fc.pin.on:hover {
    color: var(--color-accent);
    background: rgba(var(--accent-rgb), 0.16);
  }
  .fc.close:hover {
    background: #e81123;
    color: #fff;
  }
  .fc.dock:hover {
    color: var(--color-accent);
    background: rgba(var(--accent-rgb), 0.16);
  }
  .floatbody {
    flex: 1;
    min-height: 0;
    padding: 4px;
    background: var(--color-bg);
  }
  .floatpanel {
    height: 100%;
    border: 1px solid var(--color-accent);
    border-radius: 8px;
    overflow: hidden;
    background: var(--color-surface-1);
  }
</style>
