<script lang="ts">
  import Icon from "./Icon.svelte";
  import Editor from "./Editor.svelte";
  import DiffView from "./DiffView.svelte";
  import { fileIcon } from "../util";
  import {
    workspace,
    activeFile,
    setActive,
    closeFile,
    updateContent,
    saveActive,
  } from "../state/workspace.svelte";

  let active = $derived(activeFile());
</script>

<section class="editor-area">
  <div class="tabbar">
    {#each workspace.openFiles as f (f.path)}
      {@const fi = f.kind === "diff" ? { glyph: "git-commit", color: "#a3acb9" } : fileIcon(f.name)}
      <div class="tab" class:active={f.path === workspace.activePath}>
        <button type="button" class="sel" onclick={() => setActive(f.path)} title={f.path}>
          <span class="ti" style="color:{fi.color}"><Icon name={fi.glyph} size={14} strokeWidth={1.6} /></span>
          <span class="label">{f.name}</span>
          {#if f.dirty}<span class="dot" aria-label="non salvato"></span>{/if}
        </button>
        <button type="button" class="close" aria-label="Chiudi {f.name}" onclick={() => closeFile(f.path)}>
          <Icon name="x" size={13} strokeWidth={2} />
        </button>
      </div>
    {/each}
  </div>

  {#if active}
    <div class="surface">
      {#key active.path}
        {#if active.kind === "diff"}
          <DiffView content={active.content} />
        {:else}
          <Editor
            doc={active.content}
            path={active.path}
            readonly={active.readonly}
            onChange={(c) => updateContent(active.path, c)}
            onSave={saveActive}
          />
        {/if}
      {/key}
    </div>
  {:else}
    <div class="surface center">
      <div class="welcome">
        <div class="mark">Orbit</div>
        <div class="tagline">IDE leggero · companion per Claude Code</div>
        <ul class="hints">
          <li><kbd>Ctrl</kbd><kbd>K</kbd><span>Apri cartella</span></li>
          <li><kbd>Ctrl</kbd><kbd>B</kbd><span>Mostra/nascondi sidebar</span></li>
          <li><kbd>Ctrl</kbd><kbd>`</kbd><span>Terminale integrato</span></li>
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
  }

  .tabbar {
    height: 36px;
    flex: 0 0 36px;
    background: var(--color-surface-2);
    border-bottom: 1px solid var(--color-line);
    display: flex;
    align-items: stretch;
    overflow-x: auto;
    overflow-y: hidden;
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
    border-top-color: var(--color-accent);
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
