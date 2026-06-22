<script lang="ts">
  // Pannello leggero per gestire prompt e wrapper di Claude: aggiungine uno al volo (nome +
  // testo, icona opzionale) o cancellane uno con il cestino. Ogni modifica scrive .orbit/claude.json
  // e il menu si aggiorna da solo. NON è un editor completo: niente modifica in-place né riordino.
  import { scale } from "svelte/transition";
  import Icon from "./Icon.svelte";
  import Backdrop from "./Backdrop.svelte";
  import {
    claude,
    closePrompts,
    addShortcut,
    removeShortcut,
    addWrapper,
    removeWrapper,
  } from "../state/claude.svelte";

  let kind = $state<"prompt" | "wrapper">("prompt");
  let name = $state("");
  let body = $state("");
  let icon = $state("");

  const canAdd = $derived(name.trim().length > 0 && body.trim().length > 0);

  function add() {
    if (!canAdd) return;
    const ic = icon.trim() || undefined;
    if (kind === "prompt") {
      addShortcut({ name: name.trim(), prompt: body.trim(), icon: ic });
    } else {
      addWrapper({ name: name.trim(), template: body, icon: ic }); // il template può essere multiriga
    }
    name = "";
    body = "";
    icon = "";
  }

  function onKey(e: KeyboardEvent) {
    if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
      e.preventDefault();
      add();
    }
  }
</script>

<Backdrop onClose={closePrompts} dim z={120} />
<div class="panel" role="dialog" aria-modal="true" aria-label="Prompts & wrappers" transition:scale={{ duration: 110, start: 0.97, opacity: 0.3 }}>
  <header class="head">
    <span class="title">Prompts &amp; wrappers</span>
    <button class="x" aria-label="Close" onclick={closePrompts}><Icon name="x" size={16} strokeWidth={1.8} /></button>
  </header>

  <div class="body">
    <!-- form quick-add -->
    <div class="add">
      <div class="seg">
        <button class="segbtn" class:on={kind === "prompt"} onclick={() => (kind = "prompt")}>Prompt</button>
        <button class="segbtn" class:on={kind === "wrapper"} onclick={() => (kind = "wrapper")}>Wrapper</button>
      </div>
      <div class="fields">
        <input class="ctl" bind:value={name} placeholder="Name" spellcheck="false" />
        <input class="ctl icon" bind:value={icon} placeholder="icon (optional)" spellcheck="false" title="Lucide-style icon name, e.g. search, book-open, git-commit" />
      </div>
      {#if kind === "prompt"}
        <textarea class="ctl ta" bind:value={body} rows="3" spellcheck="false" placeholder="Prompt sent to Claude (one line)" onkeydown={onKey}></textarea>
      {:else}
        <textarea class="ctl ta" bind:value={body} rows="3" spellcheck="false" placeholder={"Template with {{input}} where your text goes (multiline ok)"} onkeydown={onKey}></textarea>
      {/if}
      <div class="addrow">
        <span class="hint">Ctrl+Enter to add</span>
        <button class="addbtn" disabled={!canAdd} onclick={add}>
          <Icon name="plus" size={14} strokeWidth={2} /> Add {kind}
        </button>
      </div>
    </div>

    <!-- elenchi con quick-delete -->
    <div class="sect">Prompts</div>
    {#if claude.shortcuts.length === 0}
      <div class="empty">No prompts yet.</div>
    {:else}
      {#each claude.shortcuts as s, i (i)}
        <div class="item">
          <Icon name={s.icon ?? "play"} size={14} strokeWidth={1.7} />
          <span class="iname">{s.name}</span>
          <button class="del" title="Delete" aria-label="Delete prompt" onclick={() => removeShortcut(i)}>
            <Icon name="trash" size={14} strokeWidth={1.7} />
          </button>
        </div>
      {/each}
    {/if}

    <div class="sect">Wrappers</div>
    {#if claude.wrappers.length === 0}
      <div class="empty">No wrappers yet.</div>
    {:else}
      {#each claude.wrappers as w, i (i)}
        <div class="item">
          <Icon name={w.icon ?? "type"} size={14} strokeWidth={1.7} />
          <span class="iname">{w.name}</span>
          <button class="del" title="Delete" aria-label="Delete wrapper" onclick={() => removeWrapper(i)}>
            <Icon name="trash" size={14} strokeWidth={1.7} />
          </button>
        </div>
      {/each}
    {/if}
  </div>
</div>

<style>
  .panel {
    position: fixed;
    z-index: 121;
    top: 64px;
    left: 50%;
    transform: translateX(-50%);
    width: min(560px, 92vw);
    max-height: calc(100vh - 110px);
    display: flex;
    flex-direction: column;
    background: var(--color-surface-2);
    border: 1px solid var(--color-line-strong);
    border-radius: var(--radius-lg);
    box-shadow: var(--shadow-pop);
    overflow: hidden;
  }
  .head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 12px 14px;
    border-bottom: 1px solid var(--color-line);
    flex: 0 0 auto;
  }
  .title {
    font-size: 14px;
    font-weight: 600;
    color: var(--color-ink);
  }
  .x {
    display: grid;
    place-items: center;
    width: 26px;
    height: 26px;
    border: 0;
    border-radius: var(--radius-sm);
    background: transparent;
    color: var(--color-ink-muted);
    cursor: pointer;
  }
  .x:hover {
    background: var(--color-surface-3);
    color: var(--color-ink);
  }
  .body {
    padding: 12px 14px 14px;
    overflow-y: auto;
  }
  .add {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 12px;
    background: var(--color-surface-1);
    border: 1px solid var(--color-line);
    border-radius: 8px;
  }
  .seg {
    display: inline-flex;
    align-self: flex-start;
    border: 1px solid var(--color-line-strong);
    border-radius: 6px;
    overflow: hidden;
  }
  .segbtn {
    padding: 4px 12px;
    border: 0;
    background: transparent;
    color: var(--color-ink-muted);
    font-family: var(--font-sans);
    font-size: 12px;
    cursor: pointer;
  }
  .segbtn.on {
    background: var(--color-accent);
    color: #08111f;
    font-weight: 600;
  }
  .fields {
    display: flex;
    gap: 8px;
  }
  .ctl {
    box-sizing: border-box;
    background: var(--color-surface-2);
    border: 1px solid var(--color-line);
    border-radius: 6px;
    color: var(--color-ink);
    font-family: var(--font-sans);
    font-size: 13px;
    padding: 7px 9px;
    outline: none;
  }
  .ctl:focus {
    border-color: var(--color-accent);
  }
  .fields .ctl {
    flex: 1;
    min-width: 0;
  }
  .fields .icon {
    flex: 0 0 150px;
    font-family: var(--font-mono);
    font-size: 12px;
  }
  .ta {
    width: 100%;
    resize: vertical;
    line-height: 1.45;
  }
  .addrow {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: 10px;
  }
  .hint {
    margin-right: auto;
    color: var(--color-ink-subtle);
    font-size: 11px;
  }
  .addbtn {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    height: 30px;
    padding: 0 13px;
    border-radius: 6px;
    border: 1px solid var(--color-accent);
    background: var(--color-accent);
    color: #08111f;
    font-size: 12.5px;
    font-weight: 600;
    cursor: pointer;
  }
  .addbtn:hover:not(:disabled) {
    filter: brightness(1.08);
  }
  .addbtn:disabled {
    opacity: 0.45;
    cursor: default;
  }
  .sect {
    font-size: 10.5px;
    font-weight: 700;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--color-ink-subtle);
    margin: 16px 0 6px;
  }
  .empty {
    font-size: 12px;
    color: var(--color-ink-subtle);
    padding: 2px 2px 4px;
  }
  .item {
    display: flex;
    align-items: center;
    gap: 9px;
    padding: 7px 8px;
    border-radius: 6px;
    color: var(--color-ink);
  }
  .item:hover {
    background: var(--color-surface-3);
  }
  .item :global(svg) {
    color: var(--color-ink-muted);
    flex: 0 0 auto;
  }
  .iname {
    flex: 1;
    min-width: 0;
    font-size: 12.5px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .del {
    display: grid;
    place-items: center;
    width: 26px;
    height: 26px;
    border: 0;
    border-radius: var(--radius-sm);
    background: transparent;
    color: var(--color-ink-subtle);
    cursor: pointer;
    opacity: 0;
    transition: opacity 90ms ease, background 90ms ease, color 90ms ease;
  }
  .item:hover .del {
    opacity: 1;
  }
  .del:hover {
    background: rgba(241, 76, 76, 0.16);
    color: #ff9b9b;
  }
</style>
