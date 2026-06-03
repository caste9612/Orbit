<script lang="ts">
  import Icon from "./Icon.svelte";
  import Editor from "./LazyEditor.svelte";
  import DiffView from "./DiffView.svelte";
  import { confirm } from "@tauri-apps/plugin-dialog";
  import { fileIcon } from "../util";
  import { layout, setFocusPanel } from "../state/layout.svelte";
  import {
    workspace,
    editorStatus,
    activeFile,
    setActive,
    closeFile,
    updateContent,
    saveActive,
    type OpenFile,
  } from "../state/workspace.svelte";

  let active = $derived(activeFile());

  // indicatore della tab attiva che "scorre": misura geometria della tab attiva
  let tabbarEl: HTMLElement | undefined;
  let ind = $state({ left: 0, width: 0, show: false });
  $effect(() => {
    workspace.activePath; // dipendenza
    workspace.openFiles.length;
    const el = tabbarEl?.querySelector(".tab.active") as HTMLElement | null;
    if (el) ind = { left: el.offsetLeft, width: el.offsetWidth, show: true };
    else ind = { left: 0, width: 0, show: false };
  });

  // chiusura con conferma se ci sono modifiche non salvate
  async function tryClose(f: OpenFile) {
    if (f.dirty && f.kind === "file") {
      const ok = await confirm(`"${f.name}" has unsaved changes. Close without saving?`, {
        title: "Unsaved changes",
        kind: "warning",
      });
      if (!ok) return;
    }
    closeFile(f.path);
  }

  // segmenti del percorso (relativo alla radice) per il breadcrumb
  function crumbs(path: string): string[] {
    const root = workspace.rootPath;
    let rel = path.replace(/\\/g, "/");
    if (root) {
      const r = root.replace(/\\/g, "/").replace(/\/+$/, "");
      if (rel.startsWith(r + "/")) rel = rel.slice(r.length + 1);
    }
    return rel.split("/").filter(Boolean);
  }
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<section class="editor-area" class:focused={layout.focusPanel === "editor"} onpointerdown={() => setFocusPanel("editor")}>
  <div class="tabbar" bind:this={tabbarEl}>
    {#if ind.show}
      <div class="tab-indicator" style="transform:translateX({ind.left}px); width:{ind.width}px"></div>
    {/if}
    {#each workspace.openFiles as f (f.path)}
      {@const fi = f.kind === "diff" ? { glyph: "git-commit", color: "#a3acb9" } : fileIcon(f.name)}
      <div class="tab" class:active={f.path === workspace.activePath}>
        <button type="button" class="sel" onclick={() => setActive(f.path)} title={f.path}>
          <span class="ti" style="color:{fi.color}"><Icon name={fi.glyph} size={14} strokeWidth={1.6} /></span>
          <span class="label">{f.name}</span>
          {#if f.externallyChanged}
            <span class="dot warn" aria-label="changed on disk"></span>
          {:else if f.dirty}
            <span class="dot" aria-label="unsaved"></span>
          {/if}
        </button>
        <button type="button" class="close" aria-label="Close {f.name}" onclick={() => tryClose(f)}>
          <Icon name="x" size={13} strokeWidth={2} />
        </button>
      </div>
    {/each}
  </div>

  {#if active}
    {#if active.kind === "file"}
      {@const parts = crumbs(active.path)}
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
      </div>
    {/if}
    <div class="surface">
      {#key active.path}
        {#if active.kind === "diff"}
          <DiffView content={active.content} />
        {:else}
          <Editor
            doc={active.content}
            path={active.path}
            readonly={active.readonly}
            rev={active.rev}
            gotoLine={active.gotoLine}
            onChange={(c: string) => updateContent(active.path, c)}
            onSave={saveActive}
            onGotoHandled={() => {
              if (active) active.gotoLine = null;
            }}
            onCursor={(line: number, col: number) => {
              editorStatus.line = line;
              editorStatus.col = col;
            }}
          />
        {/if}
      {/key}
    </div>
  {:else}
    <div class="surface center">
      <div class="welcome">
        <div class="mark">Orbit</div>
        <div class="tagline">Lightweight IDE · companion for Claude Code</div>
        <ul class="hints">
          <li><kbd>Ctrl</kbd><kbd>K</kbd><span>Open folder</span></li>
          <li><kbd>Ctrl</kbd><kbd>P</kbd><span>Quick open file</span></li>
          <li><kbd>Ctrl</kbd><kbd>`</kbd><span>Integrated terminal</span></li>
        </ul>
      </div>
    </div>
  {/if}
</section>

<style>
  .editor-area {
    flex: 1;
    min-height: 0;
    min-width: 0;
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

  .tabbar {
    position: relative;
    height: 32px;
    flex: 0 0 32px;
    background: var(--color-surface-2);
    border-bottom: 1px solid var(--color-line);
    display: flex;
    align-items: stretch;
    overflow-x: auto;
    overflow-y: hidden;
  }
  .tab-indicator {
    position: absolute;
    top: 0;
    left: 0;
    height: 2px;
    background: var(--color-accent);
    border-radius: 0 0 2px 2px;
    transition:
      transform 180ms ease,
      width 180ms ease;
    pointer-events: none;
    z-index: 1;
  }
  .tabbar::-webkit-scrollbar {
    height: 0;
  }
  .tab {
    display: flex;
    align-items: center;
    border-right: 1px solid var(--color-line);
    border-top: 2px solid transparent;
    background: transparent;
    max-width: 220px;
  }
  .tab.active {
    background: var(--color-surface-1);
  }
  .sel {
    display: flex;
    align-items: center;
    gap: 7px;
    height: 100%;
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
