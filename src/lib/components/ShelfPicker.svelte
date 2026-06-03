<script lang="ts">
  import { scale } from "svelte/transition";
  import Icon from "./Icon.svelte";
  import Backdrop from "./Backdrop.svelte";
  import { basename } from "../util";
  import {
    shelf,
    relOf,
    allCategories,
    shelveFolder,
    unshelveCategory,
    unshelveFolder,
  } from "../state/shelf.svelte";

  interface Props {
    x: number;
    y: number;
    absPath: string;
    onClose: () => void;
  }
  let { x, y, absPath, onClose }: Props = $props();

  let rel = $derived(relOf(absPath));
  let current = $derived(shelf.map[rel] ?? []);
  let cats = $derived(allCategories());
  let newName = $state("");

  const W = 240;
  let left = $derived(Math.min(x, window.innerWidth - W - 6));
  let top = $derived(Math.min(y, window.innerHeight - 280));

  function toggle(cat: string) {
    if (current.includes(cat)) unshelveCategory(rel, cat);
    else shelveFolder(absPath, cat);
  }
  function create() {
    const n = newName.trim();
    if (!n) return;
    shelveFolder(absPath, n);
    newName = "";
  }
</script>

<Backdrop {onClose} z={92} />

<div class="picker" style="left:{left}px; top:{top}px; width:{W}px" role="menu" transition:scale={{ duration: 90, start: 0.97, opacity: 0.3 }}>
  <div class="head">
    <Icon name="archive" size={13} strokeWidth={1.7} />
    <span class="ttl">Shelf · {basename(absPath)}</span>
  </div>

  {#if cats.length}
    <div class="list">
      {#each cats as c (c)}
        <button class="cat" class:on={current.includes(c)} onclick={() => toggle(c)}>
          <span class="box">{#if current.includes(c)}<Icon name="check" size={12} strokeWidth={2.4} />{/if}</span>
          <span class="cn">{c}</span>
        </button>
      {/each}
    </div>
  {/if}

  <input
    class="newcat"
    bind:value={newName}
    placeholder="New category…"
    onkeydown={(e) => { if (e.key === "Enter") create(); }}
  />

  {#if current.length}
    <div class="divider"></div>
    <button class="remove" onclick={() => { unshelveFolder(rel); onClose(); }}>
      <Icon name="trash" size={13} strokeWidth={1.8} />
      <span>Remove from shelf</span>
    </button>
  {/if}
</div>

<style>
  .picker {
    position: fixed;
    z-index: 93;
    padding: 6px;
    background: var(--color-surface-2);
    border: 1px solid var(--color-line-strong);
    border-radius: var(--radius);
    box-shadow: var(--shadow-pop);
    user-select: none;
  }
  .head {
    display: flex;
    align-items: center;
    gap: 7px;
    padding: 2px 4px 7px;
    color: var(--color-ink-muted);
    font-size: 11.5px;
  }
  .ttl {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .list {
    max-height: 180px;
    overflow: auto;
    display: flex;
    flex-direction: column;
    gap: 1px;
  }
  .cat {
    display: flex;
    align-items: center;
    gap: 8px;
    width: 100%;
    padding: 5px 6px;
    border: 0;
    border-radius: 5px;
    background: transparent;
    color: var(--color-ink);
    font-size: 12.5px;
    text-align: left;
    cursor: pointer;
  }
  .cat:hover {
    background: var(--color-surface-3);
  }
  .box {
    flex: 0 0 14px;
    height: 14px;
    display: grid;
    place-items: center;
    border: 1px solid var(--color-line-strong);
    border-radius: 3px;
    color: var(--color-accent);
  }
  .cat.on .box {
    border-color: var(--color-accent);
  }
  .cn {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .newcat {
    width: 100%;
    box-sizing: border-box;
    margin-top: 5px;
    padding: 6px 8px;
    border: 1px solid var(--color-line-strong);
    border-radius: 5px;
    background: var(--color-surface-1);
    color: var(--color-ink);
    font-family: var(--font-sans);
    font-size: 12.5px;
    outline: none;
  }
  .newcat:focus {
    border-color: var(--color-accent);
  }
  .divider {
    height: 1px;
    margin: 6px 4px;
    background: var(--color-line);
  }
  .remove {
    display: flex;
    align-items: center;
    gap: 8px;
    width: 100%;
    padding: 5px 6px;
    border: 0;
    border-radius: 5px;
    background: transparent;
    color: var(--color-ink-muted);
    font-size: 12.5px;
    cursor: pointer;
  }
  .remove:hover {
    background: rgba(241, 76, 76, 0.16);
    color: #ff9b9b;
  }
</style>
