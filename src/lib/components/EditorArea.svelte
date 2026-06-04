<script lang="ts">
  import Icon from "./Icon.svelte";
  import Editor from "./LazyEditor.svelte";
  import DiffView from "./DiffView.svelte";
  import MarkdownView from "./MarkdownView.svelte";
  import Backdrop from "./Backdrop.svelte";
  import { confirm } from "@tauri-apps/plugin-dialog";
  import { fileIcon, relTo } from "../util";
  import { layout, setFocusPanel } from "../state/layout.svelte";
  import {
    workspace,
    editorStatus,
    fileByPath,
    setActiveTab,
    setActiveGroup,
    closeTab,
    moveTab,
    reorderTab,
    splitWithTab,
    updateContent,
    savePath,
    togglePreview,
    type OpenFile,
  } from "../state/workspace.svelte";

  const isMd = (name: string) => /\.(md|markdown)$/i.test(name);

  // ---- drag & drop delle schede --------------------------------------------
  let drag = $state<{ groupId: string; path: string } | null>(null);
  let splitHover = $state(false);

  // Sicurezza: se la scheda trascinata sparisce a metà drag (es. rename/delete esterno via
  // fs-changed), `ondragend` può non scattare → annullo il drag così l'overlay non si blocca.
  $effect(() => {
    if (drag && !workspace.groups.some((g) => g.tabs.includes(drag!.path))) {
      drag = null;
      splitHover = false;
    }
  });

  // menu "tutte le schede" del riquadro (overflow), per vederle/chiuderle quando sono molte
  let tabMenu = $state<{ groupId: string; right: number; top: number } | null>(null);
  function openTabMenu(e: MouseEvent, groupId: string) {
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    tabMenu = { groupId, right: window.innerWidth - r.right, top: r.bottom + 4 };
  }

  function onDragStart(e: DragEvent, groupId: string, path: string) {
    drag = { groupId, path };
    if (e.dataTransfer) {
      e.dataTransfer.effectAllowed = "move";
      e.dataTransfer.setData("text/plain", path);
    }
  }
  function onDragEnd() {
    drag = null;
    splitHover = false;
  }
  /** Indice di inserimento nella barra in base alla posizione del cursore (esclude la dragged). */
  function dropIndex(e: DragEvent): number {
    const bar = e.currentTarget as HTMLElement;
    let idx = 0;
    for (const el of bar.querySelectorAll<HTMLElement>(".tab")) {
      if (el.dataset.path === drag?.path) continue;
      const r = el.getBoundingClientRect();
      if (e.clientX > r.left + r.width / 2) idx++;
      else break;
    }
    return idx;
  }
  function onTabbarDragOver(e: DragEvent) {
    if (!drag) return;
    e.preventDefault();
    if (e.dataTransfer) e.dataTransfer.dropEffect = "move";
  }
  function onSplitDragOver(e: DragEvent) {
    if (!drag) return;
    e.preventDefault();
    if (e.dataTransfer) e.dataTransfer.dropEffect = "move";
  }
  function onTabbarDrop(e: DragEvent, groupId: string) {
    if (!drag) return;
    e.preventDefault();
    const idx = dropIndex(e);
    if (drag.groupId === groupId) reorderTab(groupId, drag.path, idx);
    else moveTab(drag.groupId, drag.path, groupId, idx);
    onDragEnd();
  }
  function onSplitDrop(e: DragEvent) {
    if (!drag) return;
    e.preventDefault();
    splitWithTab(drag.groupId, drag.path);
    onDragEnd();
  }

  // chiusura con conferma se ci sono modifiche non salvate (solo se è l'ultima copia aperta)
  async function tryClose(groupId: string, f: OpenFile) {
    const refs = workspace.groups.filter((g) => g.tabs.includes(f.path)).length;
    if (f.dirty && f.kind === "file" && refs <= 1) {
      const ok = await confirm(`"${f.name}" has unsaved changes. Close without saving?`, {
        title: "Unsaved changes",
        kind: "warning",
      });
      if (!ok) return;
    }
    closeTab(groupId, f.path);
  }

  // segmenti del percorso (relativo alla radice) per il breadcrumb
  function crumbs(path: string): string[] {
    return relTo(path, workspace.rootPath).split("/").filter(Boolean);
  }

  function tabIcon(f: OpenFile) {
    return f.kind === "diff" ? { glyph: "git-commit", color: "#a3acb9" } : fileIcon(f.name);
  }
</script>

{#snippet welcome()}
  <div class="welcome">
    <div class="mark">Orbit</div>
    <div class="tagline">Lightweight IDE · companion for Claude Code</div>
    <ul class="hints">
      <li><kbd>Ctrl</kbd><kbd>K</kbd><span>Open folder</span></li>
      <li><kbd>Ctrl</kbd><kbd>P</kbd><span>Quick open file</span></li>
      <li><kbd>Ctrl</kbd><kbd>`</kbd><span>Integrated terminal</span></li>
    </ul>
  </div>
{/snippet}

<!-- annulla il drag anche se rilasciato fuori da un target (Esc / drop nel vuoto) -->
<svelte:window ondragend={onDragEnd} />

<!-- svelte-ignore a11y_no_static_element_interactions -->
<section class="editor-area" class:focused={layout.focusPanel === "editor"} onpointerdown={() => setFocusPanel("editor")}>
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
            <div class="tabs" ondragover={onTabbarDragOver} ondrop={(e) => onTabbarDrop(e, g.id)}>
            {#each g.tabs as path (path)}
              {@const f = fileByPath(path)}
              {#if f}
                {@const fi = tabIcon(f)}
                <!-- svelte-ignore a11y_no_static_element_interactions -->
                <div
                  class="tab"
                  class:active={g.activePath === path}
                  data-path={path}
                  draggable="true"
                  ondragstart={(e) => onDragStart(e, g.id, path)}
                  ondragend={onDragEnd}
                >
                  <button type="button" class="sel" onclick={() => setActiveTab(g.id, path)} title={path}>
                    <span class="ti" style="color:{fi.color}"><Icon name={fi.glyph} size={14} strokeWidth={1.6} /></span>
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
                <Icon name="chevron-down" size={14} strokeWidth={2} />
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
                    <span class="cci" style="color:{fi.color}"><Icon name={fi.glyph} size={13} strokeWidth={1.7} /></span>
                    {p}
                  </span>
                {:else}
                  <span class="crumb dim">{p}</span>
                {/if}
              {/each}
              {#if isMd(af.name)}
                <button
                  class="mdtoggle"
                  class:on={af.preview}
                  onclick={() => af && togglePreview(af.path)}
                  title={af.preview ? "Show source" : "Show preview"}
                >
                  <Icon name={af.preview ? "code" : "book-open"} size={13} strokeWidth={1.8} />
                  <span>{af.preview ? "Source" : "Preview"}</span>
                </button>
              {/if}
            </div>
          {/if}

          <div class="surface" class:center={!af}>
            {#if af}
              {#key g.id + "::" + af.path}
                {#if af.kind === "diff"}
                  <DiffView content={af.content} />
                {:else if isMd(af.name) && af.preview}
                  <MarkdownView
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

      {#if drag}
        <!-- svelte-ignore a11y_no_static_element_interactions -->
        <div
          class="splitzone"
          class:hover={splitHover}
          ondragenter={() => (splitHover = true)}
          ondragleave={() => (splitHover = false)}
          ondragover={onSplitDragOver}
          ondrop={onSplitDrop}
        >
          <div class="splithint"><Icon name="panel-left" size={18} strokeWidth={1.6} /><span>Split</span></div>
        </div>
      {/if}
    </div>
  {/if}
</section>

{#if tabMenu}
  {@const tm = tabMenu}
  {@const grp = workspace.groups.find((x) => x.id === tm.groupId)}
  {#if grp}
    <Backdrop onClose={() => (tabMenu = null)} z={90} />
    <div class="tabmenu" style="right:{tm.right}px; top:{tm.top}px">
      {#each grp.tabs as path (path)}
        {@const f = fileByPath(path)}
        {#if f}
          {@const fi = tabIcon(f)}
          <div class="tabmenu-row" class:active={grp.activePath === path}>
            <button class="tabmenu-sel" title={path} onclick={() => { setActiveTab(grp.id, path); tabMenu = null; }}>
              <span class="ti" style="color:{fi.color}"><Icon name={fi.glyph} size={14} strokeWidth={1.6} /></span>
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
  {/if}
{/if}

<style>
  .editor-area {
    flex: 1 1 0;
    min-height: 0;
    min-width: 220px; /* non collassare quando il terminale è largo / finestra stretta */
    display: flex;
    flex-direction: column;
    background: var(--color-surface-1);
    border-radius: 8px;
    border: 1px solid var(--color-line);
    overflow: hidden;
    transition: border-color 120ms ease;
  }
  .editor-area.focused {
    border-color: var(--color-accent);
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
    height: 32px;
    flex: 0 0 32px;
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
  }
  .tab.active {
    background: var(--color-surface-1);
    border-top-color: var(--color-accent);
  }
  .sel {
    display: flex;
    align-items: center;
    gap: 7px;
    height: 100%;
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
    width: 22px;
    height: 22px;
    margin-right: 5px;
    display: grid;
    place-items: center;
    background: transparent;
    border: 0;
    border-radius: 5px;
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
    border-radius: 5px;
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
  .mdtoggle.on {
    color: var(--color-accent);
    border-color: color-mix(in srgb, var(--color-accent) 45%, var(--color-line));
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
    width: 64px;
    height: 100%;
    display: grid;
    place-items: center;
    border-left: 2px dashed transparent;
    background: transparent;
    z-index: 5;
  }
  .splitzone.hover {
    background: rgba(var(--accent-rgb), 0.12);
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
    opacity: 0;
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
    overflow-y: auto;
    padding: 4px;
    background: var(--color-surface-2);
    border: 1px solid var(--color-line-strong);
    border-radius: var(--radius);
    box-shadow: var(--shadow-pop);
  }
  .tabmenu-row {
    display: flex;
    align-items: center;
    border-radius: 5px;
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
    padding: 6px 8px;
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
    border-radius: 4px;
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
    font-size: 58px;
    font-weight: 750;
    letter-spacing: -0.035em;
    line-height: 1;
    background: linear-gradient(120deg, #eaf0f8 0%, #9cc0ff 52%, #b69cff 100%);
    -webkit-background-clip: text;
    background-clip: text;
    color: transparent;
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
    border-radius: 5px;
    padding: 2px 7px;
    min-width: 16px;
    text-align: center;
  }
</style>
