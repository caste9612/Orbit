<script lang="ts">
  import Icon from "./Icon.svelte";
  import { docs, loadDocs, openDoc, type DocNode } from "../state/docs.svelte";
  import { workspace, activePath } from "../state/workspace.svelte";

  // (ri)carica l'albero quando cambia la cartella aperta (e al primo montaggio)
  $effect(() => {
    workspace.rootPath; // dipendenza
    void loadDocs();
  });

  // cartelle espanse (per key stabile); riassegno il Set per la reattività
  let expanded = $state(new Set<string>());
  function toggle(key: string) {
    const next = new Set(expanded);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    expanded = next;
  }
</script>

<div class="docs">
  {#if docs.loading && docs.count === 0}
    <p class="muted">Loading…</p>
  {:else if docs.count === 0}
    <div class="empty">
      <Icon name="book-open" size={22} strokeWidth={1.5} />
      <p class="muted">No documentation yet.</p>
      <p class="hint">Add a <code>README.md</code> or a <code>docs/</code> folder and it shows up here.</p>
    </div>
  {:else}
    {#each docs.roots as n (n.key)}
      {@render node(n, 0)}
    {/each}
  {/if}
</div>

{#snippet node(n: DocNode, depth: number)}
  {#if n.isDir}
    <button
      class="row dir"
      class:meta={n.meta}
      style="padding-left:{depth * 12 + 8}px"
      onclick={() => toggle(n.key)}
      title={n.key}
    >
      <span class="chev"><Icon name={expanded.has(n.key) ? "chevron-down" : "chevron-right"} size={13} strokeWidth={2} /></span>
      <span class="fi"><Icon name={expanded.has(n.key) ? "folder-open" : "folder"} size={14} strokeWidth={1.6} /></span>
      {#if n.num}<span class="num">{n.num}</span>{/if}
      <span class="t">{n.title}</span>
    </button>
    {#if expanded.has(n.key)}
      {#each n.children as c (c.key)}
        {@render node(c, depth + 1)}
      {/each}
    {/if}
  {:else}
    <button
      class="row page"
      class:active={n.path === activePath()}
      style="padding-left:{depth * 12 + 27}px"
      onclick={() => openDoc(n)}
      title={n.rel}
    >
      <span class="fi doc"><Icon name="doc" size={14} strokeWidth={1.6} /></span>
      <span class="t">{n.title}</span>
    </button>
  {/if}
{/snippet}

<style>
  .docs {
    height: 100%;
    overflow: auto;
    padding: 4px 6px 12px;
  }
  .row {
    display: flex;
    align-items: center;
    gap: 6px;
    width: 100%;
    text-align: left;
    height: 26px;
    padding-right: 8px;
    background: transparent;
    border: 0;
    border-radius: 5px;
    color: var(--color-ink);
    cursor: pointer;
    transition: background 80ms ease;
  }
  .row:hover {
    background: var(--color-surface-3);
  }
  .page.active {
    background: rgba(var(--accent-rgb), 0.16);
  }
  .chev {
    flex: 0 0 auto;
    display: inline-flex;
    color: var(--color-ink-subtle);
    margin-left: -2px;
  }
  .fi {
    flex: 0 0 auto;
    display: inline-flex;
    color: var(--color-ink-muted);
  }
  .fi.doc {
    color: var(--color-accent);
  }
  .dir .fi {
    color: #c9a86a; /* cartelle: ocra discreto */
  }
  .num {
    flex: 0 0 auto;
    font-size: 10px;
    font-variant-numeric: tabular-nums;
    color: var(--color-ink-subtle);
    background: var(--color-surface-3);
    border-radius: 4px;
    padding: 1px 4px;
    line-height: 1.4;
  }
  .t {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 12.5px;
  }
  .dir .t {
    font-weight: 550;
  }
  .row.meta {
    opacity: 0.55;
  }
  .row.meta:hover {
    opacity: 0.85;
  }
  .empty {
    padding: 22px 16px;
    display: flex;
    flex-direction: column;
    gap: 8px;
    align-items: flex-start;
    color: var(--color-ink-muted);
  }
  .muted {
    margin: 0;
    color: var(--color-ink-muted);
    font-size: 12.5px;
    padding: 6px 8px;
  }
  .hint {
    margin: 0;
    color: var(--color-ink-subtle);
    font-size: 12px;
    line-height: 1.5;
  }
  code {
    font-family: var(--font-mono);
    font-size: 0.9em;
    background: var(--color-surface-3);
    padding: 0.1em 0.35em;
    border-radius: 4px;
  }
</style>
