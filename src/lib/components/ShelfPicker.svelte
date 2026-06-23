<script lang="ts">
  import { untrack } from "svelte";
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
    shelveByName,
    unshelveByNameCategory,
    unshelveName,
    isNameRuled,
  } from "../state/shelf.svelte";

  interface Props {
    x: number;
    y: number;
    absPath: string;
    onClose: () => void;
  }
  let { x, y, absPath, onClose }: Props = $props();

  let rel = $derived(relOf(absPath));
  let name = $derived(basename(absPath));
  // se esiste già una regola per questo nome, apri in modalità "per nome" così la vedi/modifichi
  let applyByName = $state(untrack(() => isNameRuled(basename(absPath))));
  // categorie attive sul bersaglio corrente: regola-per-nome se attiva, altrimenti la singola cartella
  let current = $derived(applyByName ? (shelf.byName[name] ?? []) : (shelf.map[rel] ?? []));
  let cats = $derived(allCategories());
  let newName = $state("");

  const W = 240;
  let left = $derived(Math.min(x, window.innerWidth - W - 6));
  let top = $derived(Math.min(y, window.innerHeight - 320));

  function toggle(cat: string) {
    if (current.includes(cat)) {
      if (applyByName) unshelveByNameCategory(name, cat);
      else unshelveCategory(rel, cat);
    } else {
      if (applyByName) shelveByName(name, cat);
      else shelveFolder(absPath, cat);
    }
  }
  function create() {
    const n = newName.trim();
    if (!n) return;
    if (applyByName) shelveByName(name, n);
    else shelveFolder(absPath, n);
    newName = "";
  }
</script>

<Backdrop {onClose} z={92} />

<div class="picker" style="left:{left}px; top:{top}px; width:{W}px" role="menu" transition:scale={{ duration: 90, start: 0.97, opacity: 0.3 }}>
  <div class="head">
    <Icon name="archive" size={13} strokeWidth={1.7} />
    <span class="ttl">Shelf · {name}</span>
  </div>

  <button
    class="byname"
    class:on={applyByName}
    onclick={() => (applyByName = !applyByName)}
    title="Nascondi TUTTE le cartelle chiamate «{name}», anche annidate o ricreate dopo (es. bin/obj di una soluzione C#)"
  >
    <span class="box">{#if applyByName}<Icon name="check" size={12} strokeWidth={2.4} />{/if}</span>
    <span class="bn">Tutte le cartelle «{name}»</span>
  </button>

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
    <button class="remove" onclick={() => { if (applyByName) unshelveName(name); else unshelveFolder(rel); onClose(); }}>
      <Icon name="trash" size={13} strokeWidth={1.8} />
      <span>{applyByName ? `Rimuovi regola «${name}»` : "Remove from shelf"}</span>
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
  .byname {
    display: flex;
    align-items: center;
    gap: 8px;
    width: 100%;
    margin-bottom: 5px;
    padding: 5px 6px;
    border: 0;
    border-radius: 5px;
    background: transparent;
    color: var(--color-ink-muted);
    font-size: 12px;
    text-align: left;
    cursor: pointer;
  }
  .byname:hover {
    background: var(--color-surface-3);
  }
  .byname.on {
    color: var(--color-ink);
  }
  .byname .bn {
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
