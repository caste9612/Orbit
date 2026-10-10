<script lang="ts">
  import Icon from "./Icon.svelte";
  import FileGlyph from "./FileGlyph.svelte";
  import RelatedBar from "./RelatedBar.svelte";
  import Editor from "./LazyEditor.svelte";
  import Lazy from "./Lazy.svelte";
  import Backdrop from "./Backdrop.svelte";
  import ContextMenu, { type MenuItem } from "./ContextMenu.svelte";
  import orbitWordmark from "../assets/orbit-wordmark.svg";
  import { onMount, onDestroy, tick } from "svelte";
  import { settings } from "../state/settings.svelte";
  import { getCurrentWebview } from "@tauri-apps/api/webview";
  import { fileIcon, relTo, runCommand } from "../util";
  import { runFile } from "../state/run.svelte";
  import { copyPath, copyRelPath, revealPath } from "../state/explorer.svelte";
  import { askUnsaved } from "../state/unsaved.svelte";
  import { layout, setFocusPanel } from "../state/layout.svelte";
  import {
    workspace,
    openFile,
    editorStatus,
    fileByPath,
    setActiveTab,
    setActiveGroup,
    closeTabs,
    moveTab,
    reorderTab,
    splitWithTab,
    updateContent,
    savePath,
    togglePreview,
    openPreviewToSide,
    type OpenFile,
  } from "../state/workspace.svelte";

  const isMd = (name: string) => /\.(md|markdown)$/i.test(name);
  const isHtml = (name: string) => /\.html?$/i.test(name);

  // HTML: l'anteprima legge il file dal DISCO (asset protocol), non il buffer come il markdown.
  // Salvo prima di alternare, così l'anteprima riflette sempre le modifiche correnti.
  async function toggleWithSave(groupId: string, path: string, name: string) {
    const f = fileByPath(path);
    if (isHtml(name) && f?.dirty && !f.readonly) await savePath(path);
    togglePreview(groupId, path);
  }

  // ---- drag & drop delle schede (pointer-based) ----------------------------
  // L'HTML5 DnD non funziona con dragDropEnabled:true (Tauri intercetta il drop a livello OS),
  // quindi il drag delle tab è gestito a mano coi pointer event + hit-testing (elementFromPoint).
  let drag = $state<{ groupId: string; path: string } | null>(null); // tab in trascinamento
  let dragging = $state(false); // true dopo la soglia di movimento (distingue il drag dal click)
  let dropInfo = $state<{ groupId: string; index: number } | null>(null); // barra+indice sotto il cursore
  let splitHover = $state(false); // cursore sopra la zona di split
  let pending: { groupId: string; path: string; x: number; y: number } | null = null; // pre-drag
  // la zona di split ha senso solo se il gruppo di origine ha più di una scheda (altrimenti
  // splitWithTab è un no-op): così non mostriamo un bersaglio "Split" morto.
  let canSplit = $derived(
    dragging && (workspace.groups.find((g) => g.id === drag?.groupId)?.tabs.length ?? 0) > 1,
  );

  // Sicurezza: se la scheda trascinata sparisce a metà drag (es. rename/delete esterno via
  // fs-changed), annullo tutto così overlay e indicatori non restano bloccati.
  $effect(() => {
    if (drag && !workspace.groups.some((g) => g.tabs.includes(drag!.path))) cancelDrag();
  });

  // La scheda attiva sempre visibile nella sua barra (M59): aprendo un file con molte schede, o
  // scegliendolo dal menu "tutte le schede", la nuova restava fuori vista a destra. Scorrimento manuale
  // e solo della barra (scrollIntoView sposterebbe anche i contenitori con overflow:hidden).
  $effect(() => {
    const key = workspace.groups.map((g) => `${g.id}:${g.activePath ?? ""}:${g.tabs.length}`).join("|");
    void key;
    void tick().then(() => {
      for (const bar of document.querySelectorAll<HTMLElement>(".editor-area .tabs")) {
        const tab = bar.querySelector<HTMLElement>(".tab.active");
        if (!tab) continue;
        const b = bar.getBoundingClientRect();
        const t = tab.getBoundingClientRect();
        const dx = t.left < b.left ? t.left - b.left : t.right > b.right ? t.right - b.right : 0;
        if (dx) bar.scrollBy({ left: dx, behavior: settings.motion ? "smooth" : "auto" });
      }
    });
  });

  // menu "tutte le schede" del riquadro (overflow), per vederle/chiuderle quando sono molte
  let tabMenu = $state<{ groupId: string; right: number; top: number } | null>(null);
  function openTabMenu(e: MouseEvent, groupId: string) {
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    tabMenu = { groupId, right: window.innerWidth - r.right, top: r.bottom + 4 };
  }

  function cancelDrag() {
    drag = null;
    dragging = false;
    dropInfo = null;
    splitHover = false;
    pending = null;
    window.removeEventListener("pointermove", onTabPointerMove);
    window.removeEventListener("pointerup", onTabPointerUp);
  }

  function onTabPointerDown(e: PointerEvent, groupId: string, path: string) {
    if (e.button !== 0) return; // solo tasto sinistro
    pending = { groupId, path, x: e.clientX, y: e.clientY };
    window.addEventListener("pointermove", onTabPointerMove);
    window.addEventListener("pointerup", onTabPointerUp);
  }

  function onTabPointerMove(e: PointerEvent) {
    if (e.buttons === 0) {
      onTabPointerUp(e); // pointerup mancato (rilascio fuori dalla finestra): chiudi comunque
      return;
    }
    if (pending && !dragging) {
      if (Math.hypot(e.clientX - pending.x, e.clientY - pending.y) < 5) return; // ancora un click
      drag = { groupId: pending.groupId, path: pending.path };
      dragging = true;
    }
    if (!dragging) return;
    const el = document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null;
    if (el?.closest(".splitzone")) {
      splitHover = true;
      dropInfo = null;
      return;
    }
    splitHover = false;
    const bar = el?.closest(".tabs") as HTMLElement | null;
    dropInfo = bar?.dataset.group
      ? { groupId: bar.dataset.group, index: barDropIndex(bar, e.clientX) }
      : null;
  }

  /** Indice di inserimento nella barra in base alla X del cursore (esclude la tab trascinata). */
  function barDropIndex(bar: HTMLElement, x: number): number {
    let idx = 0;
    for (const el of bar.querySelectorAll<HTMLElement>(".tab")) {
      if (el.dataset.path === drag?.path) continue;
      const r = el.getBoundingClientRect();
      if (x > r.left + r.width / 2) idx++;
      else break;
    }
    return idx;
  }

  function onTabPointerUp(_e: PointerEvent) {
    const d = drag;
    if (dragging && d) {
      if (splitHover) splitWithTab(d.groupId, d.path);
      else if (dropInfo) {
        if (dropInfo.groupId === d.groupId) reorderTab(d.groupId, d.path, dropInfo.index);
        else moveTab(d.groupId, d.path, dropInfo.groupId, dropInfo.index);
      }
    }
    cancelDrag();
  }

  // ---- drop di file dal SISTEMA OPERATIVO (Esplora risorse) → li apre ---------
  // Richiede dragDropEnabled:true in tauri.conf: solo così Tauri emette gli eventi
  // di drop con il PERCORSO reale del file (l'HTML5 non lo espone, per sicurezza).
  let osDragOver = $state(false);
  let unlistenOsDrop: (() => void) | undefined;
  onMount(async () => {
    try {
      unlistenOsDrop = await getCurrentWebview().onDragDropEvent((e) => {
        const p = e.payload;
        if (p.type === "enter" || p.type === "over") osDragOver = true;
        else if (p.type === "leave") osDragOver = false;
        else if (p.type === "drop") {
          osDragOver = false;
          for (const path of p.paths) void openFile(path); // dir → tab "non apribile": accettabile
        }
      });
    } catch {
      /* fuori dal contesto Tauri */
    }
  });
  onDestroy(() => {
    unlistenOsDrop?.();
    cancelDrag(); // smontaggio a metà drag: rimuovi i listener pointer su window
  });

  // chiusura di una o più schede: se tra i documenti che spariscono del tutto (nessun'altra copia aperta
  // in un altro gruppo) ci sono modifiche non salvate chiede Salva/Non salvare/Annulla, una volta sola
  // per tutti (dialog condiviso, unsaved.svelte.ts)
  type CloseTarget = { groupId: string; path: string };
  async function requestClose(targets: CloseTarget[]) {
    if (!targets.length) return;
    const closing = new Set(targets.map((t) => `${t.groupId}\n${t.path}`));
    const lost = (path: string) => workspace.groups.every((g) => !g.tabs.includes(path) || closing.has(`${g.id}\n${path}`));
    const paths = new Set(targets.map((t) => t.path));
    const dirty = workspace.openFiles.filter((f) => f.dirty && f.kind === "file" && paths.has(f.path) && lost(f.path));
    if (dirty.length) {
      const choice = await askUnsaved(dirty);
      if (choice === "cancel") return;
      if (choice === "save") {
        for (const f of dirty) await savePath(f.path);
        // chiude solo ciò che si è salvato: un salvataggio fallito lascia aperta la sua scheda (con l'errore)
        targets = targets.filter((t) => !fileByPath(t.path)?.dirty);
      }
    }
    closeTargets(targets);
  }
  function closeTargets(targets: CloseTarget[]) {
    const byGroup = new Map<string, string[]>();
    for (const t of targets) byGroup.set(t.groupId, [...(byGroup.get(t.groupId) ?? []), t.path]);
    for (const [groupId, paths] of byGroup) closeTabs(groupId, paths);
  }
  function tryClose(groupId: string, f: OpenFile) {
    void requestClose([{ groupId, path: f.path }]);
  }

  // menu contestuale delle schede (tasto destro): chiusure multiple come in Visual Studio / VS Code,
  // più i percorsi e "Reveal" come nel menu dell'albero
  let tabCtx = $state<{ x: number; y: number; groupId: string; path: string } | null>(null);
  function openTabCtx(e: MouseEvent, groupId: string, path: string) {
    e.preventDefault();
    tabCtx = { x: e.clientX, y: e.clientY, groupId, path };
  }
  const inGroup = (groupId: string, paths: string[]) => paths.map((path) => ({ groupId, path }));
  /** Tutte le schede di tutti i gruppi (Close all con l'editor diviso). */
  const everyTab = () => workspace.groups.flatMap((g) => inGroup(g.id, g.tabs));
  function tabCtxItems(): MenuItem[] {
    const c = tabCtx;
    const g = c && workspace.groups.find((x) => x.id === c.groupId);
    const f = c && fileByPath(c.path);
    if (!c || !g || !f) return [];
    const i = g.tabs.indexOf(c.path);
    const others = g.tabs.filter((p) => p !== c.path);
    const right = g.tabs.slice(i + 1);
    const saved = g.tabs.filter((p) => !fileByPath(p)?.dirty);
    const split = workspace.groups.length > 1;
    const items: MenuItem[] = [
      { label: "Close", icon: "x", onClick: () => tryClose(g.id, f) },
      { label: "Close others", disabled: !others.length, onClick: () => requestClose(inGroup(g.id, others)) },
      { label: "Close to the right", disabled: !right.length, onClick: () => requestClose(inGroup(g.id, right)) },
      { label: "Close saved", disabled: !saved.length, onClick: () => requestClose(inGroup(g.id, saved)) },
      // con l'editor diviso "Close all" chiude tutto; "… in this group" solo il riquadro della scheda
      ...(split ? [{ label: "Close all in this group", onClick: () => requestClose(inGroup(g.id, g.tabs)) }] : []),
      { label: "Close all", onClick: () => requestClose(everyTab()) },
    ];
    // i documenti su disco (non diff, Attività, grafo): percorsi e "Reveal" come nell'albero
    if (f.kind === "file" || f.kind === "image" || f.kind === "pdf") {
      items.push(
        { label: "Copy path", icon: "copy", separatorBefore: true, onClick: () => void copyPath(f.path) },
        { label: "Copy relative path", icon: "copy", onClick: () => void copyRelPath(f.path) },
        { label: "Reveal in Explorer", icon: "external-link", onClick: () => revealPath(f.path) },
      );
    }
    return items;
  }

  // segmenti del percorso (relativo alla radice) per il breadcrumb
  function crumbs(path: string): string[] {
    return relTo(path, workspace.rootPath).split("/").filter(Boolean);
  }

  function tabIcon(f: OpenFile) {
    if (f.kind === "diff") return { glyph: "git-commit", color: "#a3acb9" };
    if (f.kind === "activity") return { glyph: "activity", color: "#3b9dff" };
    if (f.kind === "gitgraph") return { glyph: "git-branch", color: "#3fb950" };
    return fileIcon(f.name);
  }
</script>

{#snippet welcome()}
  <div class="welcome">
    <img class="mark" src={orbitWordmark} alt="Orbit" draggable="false" />
    <div class="tagline">Lightweight IDE · companion for Claude Code</div>
    <ul class="hints">
      <li><kbd>Ctrl</kbd><kbd>K</kbd><span>Open folder</span></li>
      <li><kbd>Ctrl</kbd><kbd>P</kbd><span>Quick open file</span></li>
      <li><kbd>Ctrl</kbd><kbd>`</kbd><span>Integrated terminal</span></li>
    </ul>
  </div>
{/snippet}

<!-- svelte-ignore a11y_no_static_element_interactions -->
<section
  class="editor-area"
  class:focused={layout.focusPanel === "editor"}
  class:collapsed={layout.editorCollapsed}
  class:hidden={layout.terminalMaximized && layout.terminalVisible}
  class:animating={layout.animating}
  onpointerdown={() => setFocusPanel("editor")}
>
  {#if workspace.groups.length === 0}
    <div class="surface center">{@render welcome()}</div>
  {:else}
    <div class="groups">
      {#each workspace.groups as g (g.id)}
        {@const af = g.activePath ? fileByPath(g.activePath) : undefined}
        <!-- svelte-ignore a11y_no_static_element_interactions -->
        <div class="group" class:active={g.id === workspace.activeGroupId} onpointerdown={() => setActiveGroup(g.id)}>
          <!-- svelte-ignore a11y_no_static_element_interactions -->
          <div class="tabbar">
            <!-- svelte-ignore a11y_no_static_element_interactions -->
            <div class="tabs" class:droptarget={dragging && dropInfo?.groupId === g.id} data-group={g.id}>
            {#each g.tabs as path (path)}
              {@const f = fileByPath(path)}
              {#if f}
                {@const fi = tabIcon(f)}
                <!-- svelte-ignore a11y_no_static_element_interactions -->
                <div
                  class="tab"
                  class:active={g.activePath === path}
                  class:dragging={dragging && drag?.path === path && drag?.groupId === g.id}
                  data-path={path}
                  onpointerdown={(e) => onTabPointerDown(e, g.id, path)}
                  oncontextmenu={(e) => openTabCtx(e, g.id, path)}
                  ondragstart={(e) => e.preventDefault()}
                >
                  <button type="button" class="sel" onclick={() => setActiveTab(g.id, path)} title={path}>
                    <span class="ti"><FileGlyph glyph={fi.glyph} color={fi.color} size={15} /></span>
                    <span class="label">{f.name}</span>
                    {#if f.externallyChanged}
                      <span class="dot warn" aria-label="changed on disk"></span>
                    {:else if f.dirty}
                      <span class="dot" aria-label="unsaved"></span>
                    {/if}
                  </button>
                  <button type="button" class="close" aria-label="Close {f.name}" onclick={() => tryClose(g.id, f)}>
                    <Icon name="x" size={13} strokeWidth={2} />
                  </button>
                </div>
              {/if}
            {/each}
            </div>
            {#if g.tabs.length > 0}
              <button class="tabmore" title="All tabs in this group" aria-label="All tabs" onclick={(e) => openTabMenu(e, g.id)}>
                <Icon name="chevron-down" size={13} strokeWidth={2} />
              </button>
            {/if}
          </div>

          {#if af && af.kind === "file"}
            {@const parts = crumbs(af.path)}
            <div class="crumbs">
              {#if workspace.rootName}<span class="crumb dim">{workspace.rootName}</span>{/if}
              {#each parts as p, i (i)}
                <span class="csep"><Icon name="chevron-right" size={12} strokeWidth={2} /></span>
                {#if i === parts.length - 1}
                  {@const fi = fileIcon(p)}
                  <span class="crumb">
                    <span class="cci"><FileGlyph glyph={fi.glyph} color={fi.color} size={13} /></span>
                    {p}
                  </span>
                {:else}
                  <span class="crumb dim">{p}</span>
                {/if}
              {/each}
              {#if runCommand(af.name)}
                <button class="runbtn" onclick={() => af && runFile(af.path)} title="Run this file">
                  <Icon name="play" size={12} strokeWidth={2} />
                  <span>Run</span>
                </button>
              {/if}
              {#if isMd(af.name) || isHtml(af.name)}
                {@const pv = g.previews.includes(af.path)}
                <button
                  class="mdtoggle"
                  class:on={pv}
                  onclick={() => af && void toggleWithSave(g.id, af.path, af.name)}
                  title={pv ? "Show source" : "Show preview"}
                >
                  <Icon name={pv ? "code" : isHtml(af.name) ? "globe" : "book-open"} size={13} strokeWidth={1.8} />
                  <span>{pv ? "Source" : "Preview"}</span>
                </button>
                {#if !pv}
                  <button
                    class="mdtoggle side"
                    onclick={() => af && void openPreviewToSide(af.path)}
                    title="Open preview to the side"
                    aria-label="Open preview to the side"
                  >
                    <Icon name="panel-left" size={13} strokeWidth={1.8} />
                  </button>
                {/if}
              {/if}
            </div>
          {/if}

          {#if af && af.kind === "file" && g.id === workspace.activeGroupId}
            <RelatedBar path={af.path} />
          {/if}

          <div class="surface" class:center={!af}>
            {#if af}
              {#key g.id + "::" + af.path}
                {#if af.kind === "diff"}
                  <Lazy load={() => import("./DiffView.svelte")} content={af.content} />
                {:else if af.kind === "activity"}
                  <Lazy load={() => import("./ActivityBoard.svelte")} />
                {:else if af.kind === "gitgraph"}
                  <Lazy load={() => import("./GitGraph.svelte")} />
                {:else if af.kind === "image" || af.kind === "pdf"}
                  <Lazy load={() => import("./AssetView.svelte")} path={af.path} kind={af.kind} />
                {:else if isHtml(af.name) && g.previews.includes(af.path)}
                  <Lazy load={() => import("./HtmlView.svelte")} path={af.path} diskRev={af.diskRev} />
                {:else if isMd(af.name) && g.previews.includes(af.path)}
                  <Lazy
                    load={() => import("./MarkdownView.svelte")}
                    content={af.content}
                    path={af.path}
                    onTaskToggle={(c: string) => {
                      updateContent(af.path, c);
                      void savePath(af.path);
                    }}
                  />
                {:else}
                  <Editor
                    doc={af.content}
                    path={af.path}
                    readonly={af.readonly}
                    rev={af.rev}
                    gotoLine={af.gotoLine}
                    onChange={(c: string) => updateContent(af.path, c)}
                    onSave={() => savePath(af.path)}
                    onGotoHandled={() => {
                      if (af) af.gotoLine = null;
                    }}
                    onCursor={(line: number, col: number) => {
                      if (g.id === workspace.activeGroupId) {
                        editorStatus.line = line;
                        editorStatus.col = col;
                      }
                    }}
                  />
                {/if}
              {/key}
            {:else}
              {@render welcome()}
            {/if}
          </div>
        </div>
      {/each}

      {#if canSplit}
        <div class="splitzone" class:hover={splitHover}>
          <div class="splithint"><Icon name="panel-left" size={18} strokeWidth={1.6} /><span>Split</span></div>
        </div>
      {/if}
    </div>
  {/if}

  {#if osDragOver}
    <div class="dropmask">
      <div class="drophint">
        <Icon name="download" size={22} strokeWidth={1.6} />
        <span>Drop files to open</span>
      </div>
    </div>
  {/if}
</section>

{#if tabMenu}
  {@const tm = tabMenu}
  {@const grp = workspace.groups.find((x) => x.id === tm.groupId)}
  {#if grp}
    <Backdrop onClose={() => (tabMenu = null)} z={90} />
    <div class="tabmenu" style="right:{tm.right}px; top:{tm.top}px">
      <div class="tabmenu-list">
        {#each grp.tabs as path (path)}
          {@const f = fileByPath(path)}
          {#if f}
            {@const fi = tabIcon(f)}
            <div class="tabmenu-row" class:active={grp.activePath === path}>
              <button class="tabmenu-sel" title={path} onclick={() => { setActiveTab(grp.id, path); tabMenu = null; }}>
                <span class="ti"><FileGlyph glyph={fi.glyph} color={fi.color} size={14} /></span>
                <span class="label">{f.name}</span>
                {#if f.externallyChanged}<span class="dot warn"></span>{:else if f.dirty}<span class="dot"></span>{/if}
              </button>
              <button class="tabmenu-x" aria-label="Close {f.name}" onclick={() => tryClose(grp.id, f)}>
                <Icon name="x" size={12} strokeWidth={2} />
              </button>
            </div>
          {/if}
        {/each}
      </div>
      <!-- fuori dalla lista che scorre: con tante schede resta sempre a portata -->
      <div class="tabmenu-sep"></div>
      <button
        class="tabmenu-sel tabmenu-all"
        onclick={() => {
          // le schede PRIMA di chiudere il menu: grp è un {@const} che si ricalcola su tabMenu, e a menu
          // chiuso (tabMenu null) leggerlo lancerebbe un errore
          const targets = inGroup(grp.id, grp.tabs);
          tabMenu = null;
          requestClose(targets);
        }}
      >
        <span class="ti"><Icon name="x" size={14} strokeWidth={2} /></span>
        <span class="label">{workspace.groups.length > 1 ? "Close all in this group" : "Close all"}</span>
      </button>
    </div>
  {/if}
{/if}

{#if tabCtx}
  <ContextMenu x={tabCtx.x} y={tabCtx.y} items={tabCtxItems()} onClose={() => (tabCtx = null)} />
{/if}

<style>
  .editor-area {
    flex: 1 1 0;
    min-height: 0;
    min-width: 220px; /* non collassare quando il terminale è largo / finestra stretta */
    position: relative; /* ancora l'overlay di drop dei file dal SO */
    display: flex;
    flex-direction: column;
    background: var(--color-surface-1);
    border-radius: var(--r-lg);
    border: 1px solid var(--color-line);
    overflow: hidden;
    transition: border-color 120ms ease;
  }
  .editor-area.focused {
    border-color: var(--color-accent);
  }
  /* movimento fluido (M56): collasso e nascondimento animati (flex-basis/grow, non display) */
  .editor-area.animating {
    transition:
      flex-basis var(--motion-ms) var(--motion-ease),
      flex-grow var(--motion-ms) var(--motion-ease),
      min-width var(--motion-ms) var(--motion-ease),
      border-width var(--motion-ms) var(--motion-ease),
      opacity var(--motion-ms) var(--motion-ease),
      visibility var(--motion-ms),
      border-color 120ms ease;
  }
  /* nessuna tab aperta: l'area si stringe alla larghezza minima e lascia lo spazio al pannello
     terminale (layout.editorCollapsed, deciso in App). Il benvenuto si compatta al solo logo. */
  .editor-area.collapsed {
    flex: 0 0 220px;
  }
  .editor-area.collapsed .mark {
    height: auto;
    width: 150px;
    opacity: 0.7;
  }
  .editor-area.collapsed .tagline,
  .editor-area.collapsed .hints {
    display: none;
  }
  /* pannello terminale a tutta larghezza (chat affiancate): l'editor resta montato, solo nascosto.
     Larghezza 0 (non display:none) così il passaggio si può animare; visibility toglie focus e click. */
  .editor-area.hidden {
    flex: 0 0 0px;
    min-width: 0;
    border-width: 0;
    opacity: 0;
    visibility: hidden;
    pointer-events: none;
  }

  .groups {
    position: relative;
    flex: 1;
    min-height: 0;
    display: flex;
    align-items: stretch;
  }
  .group {
    flex: 1 1 0;
    min-width: 0;
    display: flex;
    flex-direction: column;
    border-right: 1px solid var(--color-line);
  }
  .group:last-child {
    border-right: 0;
  }

  .tabbar {
    position: relative;
    height: var(--h-tabs);
    flex: 0 0 var(--h-tabs);
    background: var(--color-surface-2);
    border-bottom: 1px solid var(--color-line);
    display: flex;
    align-items: stretch;
  }
  .tabs {
    flex: 1 1 auto;
    min-width: 0;
    display: flex;
    align-items: stretch;
    overflow-x: auto;
    overflow-y: hidden;
  }
  .tabs.droptarget {
    box-shadow: inset 0 -2px 0 0 var(--color-accent); /* "rilascia qui" sulla barra di destinazione */
    background: rgba(var(--accent-rgb), 0.05);
  }
  .tabs::-webkit-scrollbar {
    height: 0;
  }
  .tabmore {
    flex: 0 0 auto;
    width: 28px;
    display: grid;
    place-items: center;
    background: var(--color-surface-2);
    border: 0;
    border-left: 1px solid var(--color-line);
    color: var(--color-ink-muted);
    cursor: pointer;
  }
  .tabmore:hover {
    background: var(--color-surface-3);
    color: var(--color-ink);
  }
  .tab {
    display: flex;
    align-items: center;
    border-right: 1px solid var(--color-line);
    border-top: 2px solid transparent;
    background: transparent;
    flex: 0 1 auto; /* si stringono fino a una larghezza leggibile, poi la barra scorre */
    min-width: 124px;
    max-width: 200px;
    user-select: none; /* niente selezione testo / drag nativo durante il trascinamento */
  }
  .tab:not(.active):hover {
    background: var(--color-surface-3);
  }
  .tab.active {
    background: rgba(var(--accent-rgb), 0.18); /* prova: evidenzia tutto il rettangolo, non solo il bordo */
    border-top-color: transparent;
  }
  .tab.dragging {
    opacity: 0.4; /* feedback: scheda in trascinamento (manca il "ghost" nativo dell'HTML5 DnD) */
  }
  .sel {
    display: flex;
    align-items: center;
    gap: 7px;
    height: 100%;
    flex: 1; /* riempie la scheda → la X resta sempre ancorata al bordo destro, allineata */
    min-width: 0; /* permette al nome di troncarsi quando la tab si stringe */
    padding: 0 6px 0 12px;
    background: transparent;
    border: 0;
    color: var(--color-ink-muted);
    font-size: 12.5px;
    cursor: pointer;
    overflow: hidden;
  }
  .tab.active .sel {
    color: var(--color-ink);
  }
  .ti {
    display: inline-flex;
    align-items: center;
    flex: 0 0 auto;
  }
  .label {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .dot {
    flex: 0 0 auto;
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: var(--color-ink-muted);
  }
  .dot.warn {
    background: var(--color-warning);
  }
  .close {
    /* 23×23 con la ✕ da 13: margini interi (5 px) e centrata anche nell'altezza DISPARI della scheda
       (barra --h-tabs pari, meno 3 px di bordi) — con 22×22 l'icona e il riquadro cadevano a mezzo px (M57) */
    width: 23px;
    height: 23px;
    margin-right: 5px;
    display: grid;
    place-items: center;
    background: transparent;
    border: 0;
    border-radius: var(--r-md);
    color: var(--color-ink-subtle);
    cursor: pointer;
    opacity: 0;
    transition:
      opacity 90ms ease,
      background 90ms ease,
      color 90ms ease;
  }
  .tab:hover .close,
  .tab.active .close {
    opacity: 1;
  }
  .close:hover {
    color: var(--color-ink);
    background: var(--color-surface-3);
  }

  .crumbs {
    flex: 0 0 auto;
    height: 26px;
    display: flex;
    align-items: center;
    gap: 2px;
    padding: 0 12px;
    background: var(--color-surface-1);
    border-bottom: 1px solid var(--color-line);
    font-size: 11.5px;
    color: var(--color-ink-muted);
    overflow: hidden;
    white-space: nowrap;
    user-select: none;
  }
  .crumb {
    display: inline-flex;
    align-items: center;
    gap: 5px;
  }
  .crumb.dim {
    color: var(--color-ink-subtle);
  }
  .cci {
    display: inline-flex;
    align-items: center;
  }
  .csep {
    display: inline-flex;
    align-items: center;
    color: var(--color-ink-subtle);
    opacity: 0.6;
  }
  .mdtoggle {
    margin-left: auto;
    display: inline-flex;
    align-items: center;
    gap: 5px;
    height: 19px;
    padding: 0 8px;
    background: var(--color-surface-2);
    border: 1px solid var(--color-line);
    border-radius: var(--r-md);
    color: var(--color-ink-muted);
    font-size: 11px;
    font-weight: 550;
    cursor: pointer;
    transition:
      background 90ms ease,
      color 90ms ease,
      border-color 90ms ease;
  }
  .mdtoggle:hover {
    color: var(--color-ink);
    background: var(--color-surface-3);
  }
  /* il bottone "anteprima a fianco" sta ATTACCATO al toggle: solo il primo
     bottone della coppia porta il margin-left:auto che li allinea a destra */
  .mdtoggle.side {
    margin-left: 6px;
    padding: 0 6px;
  }
  .mdtoggle.on {
    color: var(--color-accent);
    border-color: color-mix(in srgb, var(--color-accent) 45%, var(--color-line));
  }
  /* pulsante "Run" per i file script (.ps1/.cmd/.bat/.sh) — verde all'hover */
  .runbtn {
    margin-left: auto;
    display: inline-flex;
    align-items: center;
    gap: 5px;
    height: 19px;
    padding: 0 9px;
    background: var(--color-surface-2);
    border: 1px solid var(--color-line);
    border-radius: var(--r-md);
    color: var(--color-ink-muted);
    font-size: 11px;
    font-weight: 550;
    cursor: pointer;
    transition:
      background 90ms ease,
      color 90ms ease,
      border-color 90ms ease;
  }
  .runbtn:hover {
    color: var(--color-success);
    background: var(--color-surface-3);
    border-color: color-mix(in srgb, var(--color-success) 45%, var(--color-line));
  }

  .surface {
    flex: 1;
    min-height: 0;
    overflow: hidden;
  }
  .surface.center {
    display: grid;
    place-items: center;
    overflow: auto;
  }

  .splitzone {
    position: absolute;
    top: 0;
    right: 0;
    width: 120px; /* zona ampia: il drop di split è facile da centrare */
    height: 100%;
    display: grid;
    place-items: center;
    border-left: 2px dashed var(--color-line-strong);
    background: rgba(var(--accent-rgb), 0.05); /* visibile già durante il drag, non solo all'hover */
    z-index: 5;
  }
  .splitzone.hover {
    background: rgba(var(--accent-rgb), 0.18);
    border-left-color: var(--color-accent);
  }
  .splithint {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 4px;
    color: var(--color-ink-subtle);
    font-size: 10.5px;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    pointer-events: none;
    opacity: 0.5;
    transition: opacity 90ms ease;
  }
  .splitzone.hover .splithint {
    opacity: 1;
    color: var(--color-accent);
  }

  .tabmenu {
    position: fixed;
    z-index: 91;
    width: 250px;
    max-height: 60vh;
    display: flex;
    flex-direction: column;
    padding: 4px;
    background: var(--color-surface-2);
    border: 1px solid var(--color-line-strong);
    border-radius: var(--radius);
    box-shadow: var(--shadow-pop);
  }
  .tabmenu-list {
    min-height: 0;
    overflow-y: auto;
  }
  /* come il separatore del menu contestuale */
  .tabmenu-sep {
    flex: 0 0 auto;
    height: 1px;
    margin: 4px 6px;
    background: var(--color-line);
  }
  /* > per prevalere su .tabmenu-sel (definita dopo): nella colonna del menu non deve allungarsi */
  .tabmenu > .tabmenu-all {
    flex: 0 0 auto;
    border-radius: var(--r-md);
  }
  .tabmenu > .tabmenu-all:hover {
    background: var(--color-surface-3);
  }
  .tabmenu-all .ti {
    color: var(--color-ink-muted);
  }
  .tabmenu-row {
    display: flex;
    align-items: center;
    border-radius: var(--r-md);
  }
  .tabmenu-row:hover {
    background: var(--color-surface-3);
  }
  .tabmenu-row.active {
    background: rgba(var(--accent-rgb), 0.16);
  }
  .tabmenu-sel {
    flex: 1 1 auto;
    min-width: 0;
    display: flex;
    align-items: center;
    gap: 8px;
    height: 30px; /* esplicita: dal padding + riga di testo veniva 30,8 e il glifo cadeva a mezzo px (M57) */
    padding: 0 8px;
    background: transparent;
    border: 0;
    color: var(--color-ink);
    font-size: 12.5px;
    cursor: pointer;
    overflow: hidden;
  }
  .tabmenu-sel .label {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .tabmenu-x {
    flex: 0 0 auto;
    width: 22px;
    height: 22px;
    margin-right: 4px;
    display: grid;
    place-items: center;
    background: transparent;
    border: 0;
    border-radius: var(--r-sm);
    color: var(--color-ink-subtle);
    cursor: pointer;
  }
  .tabmenu-x:hover {
    background: var(--color-surface-4);
    color: var(--color-ink);
  }

  .welcome {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 6px;
    user-select: none;
    transform: translateY(-6%);
  }
  .mark {
    height: 64px;
    width: auto;
    user-select: none;
  }
  .tagline {
    color: var(--color-ink-muted);
    font-size: 13px;
    margin-bottom: 22px;
  }
  .hints {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 11px;
  }
  .hints li {
    display: grid;
    grid-template-columns: auto auto 1fr;
    align-items: center;
    gap: 6px;
  }
  .hints span {
    color: var(--color-ink-muted);
    font-size: 12.5px;
    margin-left: 10px;
  }
  kbd {
    font-family: var(--font-mono);
    font-size: 11px;
    color: var(--color-ink-muted);
    background: var(--color-surface-3);
    border: 1px solid var(--color-line-strong);
    border-bottom-width: 2px;
    border-radius: var(--r-md);
    padding: 2px 7px;
    min-width: 16px;
    text-align: center;
  }

  /* overlay quando si trascinano file dal SO sopra l'area editor */
  .dropmask {
    position: absolute;
    inset: 0;
    z-index: 30;
    display: grid;
    place-items: center;
    background: rgba(var(--accent-rgb), 0.1);
    border: 2px dashed var(--color-accent);
    border-radius: var(--r-lg);
    pointer-events: none; /* puramente visivo: il drop è gestito a livello OS da Tauri */
  }
  .drophint {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 6px;
    color: var(--color-accent);
    font-size: 12px;
    font-weight: 600;
    letter-spacing: 0.03em;
  }
</style>
