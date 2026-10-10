<script lang="ts">
  import { onMount, onDestroy, untrack } from "svelte";
  import Icon from "./Icon.svelte";
  import Terminal from "./LazyTerminal.svelte";
  import ContextMenu, { type MenuItem } from "./ContextMenu.svelte";
  import { WebviewWindow } from "@tauri-apps/api/webviewWindow";
  import { getCurrentWindow } from "@tauri-apps/api/window";
  import { invoke } from "@tauri-apps/api/core";
  import { panelSlide } from "../motion";
  import { layout, toggleTerminal, setFocusPanel, toggleTerminalMaximized, motionMs } from "../state/layout.svelte";
  import { workspace } from "../state/workspace.svelte";
  import {
    terminals,
    addTerminal,
    displayTitle,
    renameTerminal,
    setTerminalColor,
    setAutoTitle,
    TAB_COLORS,
    setActiveTerminal,
    closeTerminal,
    ensureTerminal,
    removeTerminalKeepPty,
    notifyTerminalBell,
    clearAttention,
    panesOf,
    layoutOf,
    isAutoLayout,
    effectiveLayout,
    setSurface,
    setArrangement,
    splitWith,
    showInPane,
    closePane,
    toggleZoom,
    sizesFor,
    setSizes,
    selfSplitPartner,
    tabIcon,
    type PaneSizes,
  } from "../state/terminals.svelte";
  import { launchClaude } from "../state/claude.svelte";
  import { dropZone, flatten, locate, MAX_PANES, type Arrangement, type Layout, type Zone } from "../state/terminalLayout";
  import { focusOnMount } from "../focus";

  interface ShellInfo {
    label: string;
    program: string;
  }

  let shells = $state<ShellInfo[]>([]);
  let shellMenu = $state<{ x: number; y: number } | null>(null);
  let splitMenu = $state<{ x: number; y: number } | null>(null);

  // ---- nome e colore delle schede ------------------------------------------------------------
  // Doppio clic su scheda o testata → rinomina inline; tasto destro sulla scheda → menu con rinomina,
  // affianca, finestra flottante, colore (palette di Attività) e chiusura. Il nome automatico arriva
  // dal titolo che il programma imposta nel terminale (Claude: riassunto della chat).
  let renameId = $state<string | null>(null);
  let renameValue = $state("");
  let tabMenu = $state<{ x: number; y: number; id: string } | null>(null);
  function startRename(id: string) {
    const t = terminals.list.find((s) => s.id === id);
    if (!t) return;
    renameValue = displayTitle(t);
    renameId = id;
  }
  function commitRename() {
    if (renameId) renameTerminal(renameId, renameValue);
    renameId = null;
  }
  function onRenameKey(e: KeyboardEvent) {
    if (e.key === "Enter") commitRename();
    else if (e.key === "Escape") {
      e.stopPropagation();
      renameId = null;
    }
  }
  function openTabMenu(e: MouseEvent, id: string) {
    e.preventDefault();
    e.stopPropagation();
    tabMenu = { x: e.clientX, y: e.clientY, id };
  }
  function tabMenuItems(): MenuItem[] {
    const t = terminals.list.find((s) => s.id === tabMenu?.id);
    if (!t) return [];
    const items: MenuItem[] = [
      { label: "Rename…", icon: "pencil", onClick: () => startRename(t.id) },
      { label: "Open to the side", icon: "columns", onClick: () => splitWith(t.id) },
      { label: "Floating window", icon: "external-link", onClick: () => void detach(t.id) },
      { label: "Color", header: true, separatorBefore: true },
    ];
    for (const c of TAB_COLORS) {
      items.push(
        t.color === c.color
          ? { label: c.name, icon: "check", onClick: () => setTerminalColor(t.id, c.color) }
          : { label: c.name, swatch: c.color, onClick: () => setTerminalColor(t.id, c.color) },
      );
    }
    items.push({ label: "Close terminal", icon: "x", danger: true, separatorBefore: true, onClick: () => void closeTerminal(t.id) });
    return items;
  }

  // Schede della repo ATTIVA (le altre restano montate ma nascoste → PTY/scrollback vivi).
  let visibleTabs = $derived(terminals.list.filter((t) => t.root === workspace.rootPath));

  // ---- chat affiancate (M54) ----------------------------------------------------------------
  // Tutti i terminali restano montati nella stessa superficie: affiancarli vuol dire solo dare a più
  // di uno un posto nella griglia (niente rimontaggio → Claude non si interrompe, lo storico resta).
  let panes = $derived(panesOf(workspace.rootPath));
  let split = $derived(panes.length >= 2);
  let zoom = $derived(split && terminals.zoomId && panes.includes(terminals.zoomId) ? terminals.zoomId : null);
  let surfW = $state(0);
  let surfH = $state(0);
  // lo stato conosce la superficie: le scelte automatiche (menu Split, "to the side") la usano
  $effect(() => setSurface(surfW, surfH));
  // superficie in cambiamento (finestra o splitter del pannello) → i riquadri la seguono subito, senza
  // la transition di posizione (classe `still`); torna ferma ~160 ms dopo l'ultima variazione
  let resizing = $state(false);
  let resizeTimer: ReturnType<typeof setTimeout> | undefined;
  $effect(() => {
    void surfW;
    void surfH;
    untrack(() => {
      resizing = true;
      if (resizeTimer) clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => (resizing = false), 160);
    });
  });
  let paneDrag = $state(false); // separatore fra riquadri in trascinamento: niente transition
  // disposizione mostrata: lo zoom, oppure lo split della repo (adattivo allo spazio se in auto),
  // oppure la sola scheda attiva
  let shownLayout = $derived<Layout>(
    zoom ? [[zoom]] : split ? effectiveLayout(workspace.rootPath, surfW, surfH) : terminals.activeId ? [[terminals.activeId]] : [],
  );
  let shown = $derived(flatten(shownLayout));

  // ---- geometria dei riquadri ------------------------------------------------------------------
  // Posizionamento ASSOLUTO in px dalle frazioni (colonne, e righe per colonna): a differenza di una
  // griglia CSS, ogni colonna può avere righe di altezze diverse, e i separatori si trascinano.
  const GAP = 4; // px fra i riquadri e dal bordo della superficie (solo in split)
  let sizes = $derived(sizesFor(workspace.rootPath, shownLayout));
  function colGeom(c: number): { x: number; w: number } {
    const innerW = Math.max(0, surfW - GAP * (shownLayout.length + 1));
    let x = GAP;
    for (let i = 0; i < c; i++) x += (sizes.cols[i] ?? 0) * innerW + GAP;
    return { x, w: (sizes.cols[c] ?? 1) * innerW };
  }
  function rowGeom(c: number, r: number): { y: number; h: number } {
    const rows = sizes.rows[c] ?? [1];
    const innerH = Math.max(0, surfH - GAP * (rows.length + 1));
    let y = GAP;
    for (let i = 0; i < r; i++) y += (rows[i] ?? 0) * innerH + GAP;
    return { y, h: (rows[r] ?? 1) * innerH };
  }
  /** Posizione del terminale `id` nella superficie ("" = non visibile). */
  function rect(id: string): string {
    if (!shown.includes(id)) return "";
    if (!split || zoom) return "left:0;top:0;width:100%;height:100%";
    const pos = locate(shownLayout, id);
    if (!pos) return "";
    const { x, w } = colGeom(pos.c);
    const { y, h } = rowGeom(pos.c, pos.r);
    return `left:${x}px;top:${y}px;width:${w}px;height:${h}px`;
  }
  // separatori trascinabili: fra colonne (verticali, a tutta altezza) e fra le righe di una colonna
  let vSplits = $derived(split && !zoom ? shownLayout.slice(1).map((_, i) => ({ c: i, x: colGeom(i + 1).x - GAP })) : []);
  let hSplits = $derived(
    split && !zoom
      ? shownLayout.flatMap((col, c) =>
          col.slice(1).map((_, r) => {
            const g = colGeom(c);
            return { c, r, x: g.x, w: g.w, y: rowGeom(c, r + 1).y - GAP };
          }),
        )
      : [],
  );
  let sizing: { kind: "col" | "row"; c: number; r: number; start: number; a: number; b: number; inner: number } | null = null;
  function sizeDown(e: PointerEvent, kind: "col" | "row", c: number, r: number) {
    const inner = kind === "col" ? surfW - GAP * (shownLayout.length + 1) : surfH - GAP * ((sizes.rows[c]?.length ?? 1) + 1);
    const arr = kind === "col" ? sizes.cols : (sizes.rows[c] ?? [1]);
    const i = kind === "col" ? c : r;
    sizing = { kind, c, r, start: kind === "col" ? e.clientX : e.clientY, a: arr[i], b: arr[i + 1], inner };
    paneDrag = true;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    e.preventDefault();
    e.stopPropagation();
  }
  function sizeMove(e: PointerEvent) {
    if (!sizing) return;
    const cur = sizing.kind === "col" ? e.clientX : e.clientY;
    const df = (cur - sizing.start) / Math.max(1, sizing.inner);
    const min = Math.max(0.1, 140 / Math.max(1, sizing.inner)); // mai sotto ~140px
    let a = sizing.a + df;
    let b = sizing.b - df;
    if (a < min) {
      b -= min - a;
      a = min;
    }
    if (b < min) {
      a -= min - b;
      b = min;
    }
    const next: PaneSizes = { shape: sizes.shape, cols: [...sizes.cols], rows: sizes.rows.map((row) => [...row]) };
    if (sizing.kind === "col") {
      next.cols[sizing.c] = a;
      next.cols[sizing.c + 1] = b;
    } else {
      next.rows[sizing.c][sizing.r] = a;
      next.rows[sizing.c][sizing.r + 1] = b;
    }
    setSizes(workspace.rootPath, shownLayout, next);
  }
  function sizeUp(e: PointerEvent) {
    if (!sizing) return;
    sizing = null;
    paneDrag = false;
    try {
      (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {
      /* no-op */
    }
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
        items.push({ label: t.title, icon: tabIcon(t), onClick: () => splitWith(t.id) });
      }
    }
    // disposizione della repo corrente: auto (adattiva) o una delle due fisse; dopo un trascinamento
    // con direzione è manuale e può non coincidere con nessuna delle tre
    const root = workspace.rootPath;
    const auto = isAutoLayout(root);
    const lay = layoutOf(root);
    const modes: [Arrangement, string, boolean][] = [
      ["auto", "Automatic", auto],
      ["columns", "Side by side", !auto && lay.length >= 2 && lay.every((c) => c.length === 1)],
      ["rows", "Stacked", !auto && lay.length === 1],
    ];
    items.push({ label: "Layout", header: true, separatorBefore: true });
    for (const [m, label, on] of modes) {
      items.push({ label, icon: on ? "check" : undefined, onClick: () => setArrangement(root, m) });
    }
    return items;
  }

  // Drag di una scheda su un riquadro (pointer-based, come le schede dell'editor: con
  // dragDropEnabled l'HTML5 DnD non funziona). Al centro: il riquadro mostra quella scheda; vicino a
  // un bordo (entro un terzo, dropZone): la scheda si affianca lì. Trascinando la chat GIÀ visibile
  // sul suo riquadro (senza split) un bordo la affianca alla scheda usata più di recente; il segno di
  // rilascio compare solo se il rilascio farà davvero qualcosa (prima compariva e poi nulla, M57).
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
    const zone = dropZone((e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height);
    if (id === dragId) {
      // la chat trascinata È quella del riquadro: al centro non cambierebbe nulla; su un bordo, senza
      // split in corso, si affianca alla scheda più recente (dall'altra parte). Altrimenti niente segno.
      dropTarget = !split && zone !== "center" && selfSplitPartner(id) ? { id, zone } : null;
      return;
    }
    dropTarget = { id, zone };
  }

  function onTabPointerUp() {
    const id = dragId;
    const t = dropTarget;
    if (id && t) {
      if (t.zone === "center") showInPane(id, t.id);
      else splitWith(id, t.id, t.zone); // la direzione del rilascio decide colonna o riga (t.id === id: split di sé)
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
        title: displayTitle(t),
        color: t.color,
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
  class:animating={layout.animating}
  style="width:{layout.terminalWidth}px"
  transition:panelSlide|global={{ duration: workspace.ready ? motionMs() : 0 }}
  onpointerdown={() => setFocusPanel("terminal")}
>
  <header class="head">
    <div class="tabs">
      {#each visibleTabs as t (t.id)}
        {@const tic = tabIcon(t)}
        <div class="tab" class:active={t.id === terminals.activeId} class:shown={split && shown.includes(t.id)}>
          {#if renameId === t.id}
            <input class="rename" use:focusOnMount={{ select: true }} bind:value={renameValue} onkeydown={onRenameKey} onblur={commitRename} aria-label="Tab name" />
          {:else}
            <button
              class="tab-main"
              title={`${displayTitle(t)}${t.autoTitle ? ` · ${t.autoTitle}` : t.title !== displayTitle(t) ? ` · ${t.title}` : ""}${t.needsAttention ? " — waiting for you" : " — double-click to rename, drag onto a pane to show it side by side"}`}
              onclick={() => setActiveTerminal(t.id)}
              ondblclick={() => startRename(t.id)}
              oncontextmenu={(e) => openTabMenu(e, t.id)}
              onpointerdown={(e) => onTabPointerDown(e, t.id)}
            >
              <span class="tic" style="color:{t.color}"><Icon name={tic} size={13} strokeWidth={1.8} /></span>
              {#if t.needsAttention}<span class="attn" aria-hidden="true"></span>{/if}
              <span>{displayTitle(t)}</span>
            </button>
          {/if}
          <button class="tab-close" title="Close terminal" aria-label="Close terminal" onclick={() => closeTerminal(t.id)}>
            <Icon name="x" size={12} strokeWidth={2} />
          </button>
        </div>
      {/each}
      <button class="newt claude" title="New Claude chat" aria-label="New Claude chat" onclick={() => void launchClaude()}>
        <Icon name="sparkles" size={13} strokeWidth={1.8} />
      </button>
      <button class="newt" title="New terminal" aria-label="New terminal" onclick={() => addTerminal()}>
        <Icon name="plus" size={13} strokeWidth={2} />
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
      <span class="hsep" aria-hidden="true"></span>
      <!-- comprime il pannello in una striscia sul bordo (M57): le chat restano vive e visibili lì -->
      <button class="act" title="Collapse panel (Ctrl+`)" aria-label="Collapse panel" onclick={toggleTerminal}>
        <Icon name="chevrons-right" size={14} strokeWidth={1.8} />
      </button>
    </div>
  </header>

  <!-- `still`: niente transition sui riquadri mentre seguono frame per frame la superficie (vedi CSS) -->
  <div class="surface" class:split class:still={layout.animating || resizing || paneDrag} bind:clientWidth={surfW} bind:clientHeight={surfH}>
    {#each terminals.list as t (t.id)}
      {@const isShownHere = shown.includes(t.id)}
      {@const tic = tabIcon(t)}
      <div
        class="slot"
        class:shown={isShownHere}
        class:active={t.id === terminals.activeId}
        data-term={t.id}
        style={rect(t.id)}
      >
        {#if split && isShownHere}
          <!-- testata: un click attiva il riquadro, un trascinamento lo sposta come una scheda
               (al centro di un altro riquadro = scambio, su un bordo = colonna/riga da quel lato) -->
          <!-- svelte-ignore a11y_no_static_element_interactions -->
          <div
            class="pane-head"
            title="Drag to move this pane · double-click the name to rename"
            onpointerdown={(e) => {
              setActiveTerminal(t.id);
              onTabPointerDown(e, t.id);
            }}
          >
            <span class="pane-bar" style="background:{t.color}" aria-hidden="true"></span>
            <span class="tic" style="color:{t.color}"><Icon name={tic} size={12} strokeWidth={1.8} /></span>
            {#if t.needsAttention}<span class="attn" aria-hidden="true"></span>{/if}
            {#if renameId === t.id}
              <input
                class="rename"
                use:focusOnMount={{ select: true }}
                bind:value={renameValue}
                onkeydown={onRenameKey}
                onblur={commitRename}
                onpointerdown={(e) => e.stopPropagation()}
                aria-label="Pane name"
              />
            {:else}
              <!-- svelte-ignore a11y_no_static_element_interactions -->
              <span class="pane-title" ondblclick={() => startRename(t.id)}>{displayTitle(t)}</span>
              {#if t.autoTitle}<span class="pane-sub" title={t.autoTitle}>{t.autoTitle}</span>{/if}
            {/if}
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
            onTitle={(x: string) => setAutoTitle(t.id, x)}
          />
        </div>
        {#if dropTarget?.id === t.id}
          <div class="dropmark {dropTarget.zone}" aria-hidden="true"></div>
        {/if}
      </div>
    {/each}
    {#each vSplits as s (s.c)}
      <!-- svelte-ignore a11y_no_static_element_interactions -->
      <div
        class="psplit v"
        style="left:{s.x}px;top:{GAP}px;height:{Math.max(0, surfH - GAP * 2)}px"
        title="Drag to resize"
        onpointerdown={(e) => sizeDown(e, "col", s.c, 0)}
        onpointermove={sizeMove}
        onpointerup={sizeUp}
        onpointercancel={sizeUp}
      ></div>
    {/each}
    {#each hSplits as s (`${s.c}-${s.r}`)}
      <!-- svelte-ignore a11y_no_static_element_interactions -->
      <div
        class="psplit h"
        style="left:{s.x}px;top:{s.y}px;width:{s.w}px"
        title="Drag to resize"
        onpointerdown={(e) => sizeDown(e, "row", s.c, s.r)}
        onpointermove={sizeMove}
        onpointerup={sizeUp}
        onpointercancel={sizeUp}
      ></div>
    {/each}
  </div>
</section>

{#if shellMenu}
  <ContextMenu x={shellMenu.x} y={shellMenu.y} items={shellMenuItems()} onClose={() => (shellMenu = null)} />
{/if}
{#if splitMenu}
  <ContextMenu x={splitMenu.x} y={splitMenu.y} items={splitMenuItems()} onClose={() => (splitMenu = null)} />
{/if}
{#if tabMenu}
  <ContextMenu x={tabMenu.x} y={tabMenu.y} items={tabMenuItems()} onClose={() => (tabMenu = null)} />
{/if}

<style>
  .terminal-panel {
    flex: 0 1 auto; /* si comprime quando la finestra è stretta, invece di coprire l'editor */
    min-width: 180px;
    display: flex;
    flex-direction: column;
    background: var(--color-surface-1);
    overflow: hidden;
    border-radius: var(--r-lg);
    border: 1px solid var(--color-line);
    transition: border-color 120ms ease;
  }
  .terminal-panel.focused {
    border-color: var(--color-accent);
  }
  /* movimento fluido (M56): larghezza e riempimento animati nei cambi programmatici del layout */
  .terminal-panel.animating {
    transition:
      width var(--motion-ms) var(--motion-ease),
      flex-grow var(--motion-ms) var(--motion-ease),
      border-color 120ms ease;
  }
  /* editor senza tab (collassato al minimo): il pannello si prende tutto lo spazio restante */
  .terminal-panel.fill {
    flex: 1 1 auto;
  }
  .head {
    height: var(--h-head);
    flex: 0 0 var(--h-head);
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
    border-radius: var(--r-sm);
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
    /* larghezza DISPARI come l'altezza (--h-head pari meno il bordo da 1), icone da 13: margini interi
       e uguali (M57) */
    width: 27px;
    height: 100%;
    border: 0;
    background: transparent;
    color: var(--color-ink-muted);
    cursor: pointer;
    flex: 0 0 auto;
  }
  .newt.caret {
    width: 19px;
    margin-left: -6px;
  }
  .newt.claude {
    color: var(--color-accent); /* scorciatoia "nuova chat Claude", stesso accento dell'icona in top bar */
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
    border-radius: var(--r-md);
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
  /* separa le azioni del pannello dal comando "comprimi" (come nella barra laterale) */
  .hsep {
    flex: 0 0 auto;
    width: 1px;
    height: 14px;
    margin: 0 3px;
    background: var(--color-line);
  }
  /* Superficie a griglia: tutti i terminali restano montati, solo quelli "shown" hanno un posto
     (grid-column/row inline da placement()); gli altri sono display:none e non si ridimensionano. */
  .surface {
    flex: 1;
    min-height: 0;
    position: relative;
    overflow: hidden;
  }
  .surface.split {
    background: var(--color-bg);
  }
  /* i riquadri (e i loro separatori) scivolano alla nuova geometria quando cambia la disposizione
     (split, chiusura, zoom, menu Layout). `still` li ferma — seguono subito — mentre la superficie si
     ridimensiona (finestra, splitter del pannello), durante un movimento della shell e trascinando i
     separatori fra riquadri. La classe va accesa PRIMA del cambio di geometria: lo è, perché deriva
     dagli stessi eventi che la causano. */
  .surface.split .slot.shown,
  .surface.split .psplit {
    transition:
      left var(--motion-ms) var(--motion-ease),
      top var(--motion-ms) var(--motion-ease),
      width var(--motion-ms) var(--motion-ease),
      height var(--motion-ms) var(--motion-ease);
  }
  .surface.still .slot.shown,
  .surface.still .psplit {
    transition: none;
  }
  .slot {
    display: none;
    position: absolute; /* posizione e dimensione in px da rect() */
    min-width: 0;
    min-height: 0;
    box-sizing: border-box;
  }
  .slot.shown {
    display: flex;
    flex-direction: column;
  }
  /* separatori fra i riquadri: invisibili a riposo (si vede lo sfondo), accento all'hover/drag */
  .psplit {
    position: absolute;
    z-index: 6;
  }
  .psplit.v {
    width: 4px;
    cursor: col-resize;
  }
  .psplit.h {
    height: 4px;
    cursor: row-resize;
  }
  .psplit::after {
    content: "";
    position: absolute;
    inset: 1px;
    border-radius: 2px;
    background: transparent;
    transition: background 80ms ease;
  }
  .psplit:hover::after,
  .psplit:active::after {
    background: var(--color-accent);
  }
  .surface.split .slot.shown {
    border: 1px solid var(--color-line);
    border-radius: var(--r-md);
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
    cursor: grab;
  }
  .slot.active .pane-head {
    color: var(--color-ink);
    background: rgba(var(--accent-rgb), 0.12);
  }
  .pane-head .tic {
    display: inline-flex;
    align-items: center;
  }
  /* barra colorata al bordo sinistro della testata: la tinta della scheda, visibile anche da lontano */
  .pane-bar {
    align-self: stretch;
    flex: 0 0 3px;
    width: 3px;
    margin: 0 3px 0 -10px;
  }
  /* campo di rinomina inline (scheda e testata) */
  .rename {
    height: 20px;
    min-width: 110px;
    margin: 0 6px;
    padding: 0 6px;
    border: 1px solid var(--color-accent);
    border-radius: var(--r-sm);
    background: var(--color-surface-1);
    color: var(--color-ink);
    font: 500 12px var(--font-sans);
    outline: 0;
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
    flex: 0 0 auto;
    white-space: nowrap;
    font-weight: 500;
  }
  /* riassunto della chat scritto da Claude Code (titolo del terminale): attenuato, si tronca per primo */
  .pane-sub {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    color: var(--color-ink-subtle);
    font-size: 11.5px;
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
    border-radius: var(--r-sm);
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
    border-radius: var(--r-md);
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
