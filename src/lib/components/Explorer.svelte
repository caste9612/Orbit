<script lang="ts">
  import Icon from "./Icon.svelte";
  import { tree, toggle, flatten, type TreeNode } from "../state/explorer.svelte";
  import { openFile, workspace } from "../state/workspace.svelte";

  // Lista virtuale ad altezza fissa: rende solo le righe nel viewport (+overscan).
  const ROW = 22;
  const OVERSCAN = 8;

  let rows = $derived(flatten(tree.roots));
  let scrollTop = $state(0);
  let viewportH = $state(600);

  let start = $derived(Math.max(0, Math.floor(scrollTop / ROW) - OVERSCAN));
  let end = $derived(
    Math.min(rows.length, Math.ceil((scrollTop + viewportH) / ROW) + OVERSCAN),
  );
  let visible = $derived(rows.slice(start, end));

  function onScroll(e: Event) {
    scrollTop = (e.currentTarget as HTMLElement).scrollTop;
  }
  function activate(n: TreeNode) {
    if (n.entry.isDir) toggle(n);
    else openFile(n.entry.path);
  }
</script>

<div class="tree" onscroll={onScroll} bind:clientHeight={viewportH}>
  <div class="canvas" style="height:{rows.length * ROW}px">
    {#each visible as n, i (n.entry.path)}
      <button
        type="button"
        class="row"
        class:active={!n.entry.isDir && workspace.activePath === n.entry.path}
        style="top:{(start + i) * ROW}px; height:{ROW}px; padding-left:{6 + n.depth * 14}px"
        onclick={() => activate(n)}
        title={n.entry.name}
      >
        <span class="chev" class:open={n.expanded}>
          {#if n.entry.isDir}<Icon name="chevron-right" size={14} strokeWidth={2} />{/if}
        </span>
        <span class="ic" class:dir={n.entry.isDir}>
          <Icon
            name={n.entry.isDir ? (n.expanded ? "folder-open" : "folder") : "file"}
            size={15}
            strokeWidth={1.6}
          />
        </span>
        <span class="name">{n.entry.name}</span>
      </button>
    {/each}
  </div>
</div>

<style>
  .tree {
    height: 100%;
    overflow: auto;
    position: relative;
  }
  .canvas {
    position: relative;
    width: 100%;
  }
  .row {
    position: absolute;
    left: 0;
    right: 0;
    display: flex;
    align-items: center;
    gap: 3px;
    padding-right: 8px;
    background: transparent;
    border: 0;
    color: var(--color-ink);
    font-size: 13px;
    text-align: left;
    white-space: nowrap;
    cursor: pointer;
  }
  .row:hover {
    background: var(--color-surface-3);
  }
  .row.active {
    background: var(--color-surface-4);
  }
  .row:focus-visible {
    outline: 1px solid var(--color-accent);
    outline-offset: -1px;
  }
  .chev {
    flex: 0 0 16px;
    display: grid;
    place-items: center;
    color: var(--color-ink-subtle);
    transition: transform 110ms ease;
  }
  .chev.open {
    transform: rotate(90deg);
  }
  .ic {
    flex: 0 0 auto;
    display: grid;
    place-items: center;
    color: var(--color-ink-subtle);
  }
  .ic.dir {
    color: var(--color-ink-muted);
  }
  .name {
    overflow: hidden;
    text-overflow: ellipsis;
  }
</style>
