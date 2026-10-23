<script lang="ts" module>
  import type { ShelfRule } from "../state/shelfRules";
  /** Cosa si mette nello scaffale: una voce dell'albero (cartella o file), o una regola già esistente. */
  export type PickerTarget = { abs: string; isDir: boolean } | { rule: ShelfRule };
</script>

<script lang="ts">
  // Picker dello scaffale: la voce (questa cartella o questo file, oppure tutte le cartelle o i file che
  // corrispondono a un nome o a un pattern, nella repo o in ogni repo) e le sue categorie (M73).
  import { untrack } from "svelte";
  import { scale } from "svelte/transition";
  import Icon from "./Icon.svelte";
  import Backdrop from "./Backdrop.svelte";
  import { basename } from "../util";
  import {
    relOf,
    allCategories,
    categoriesOf,
    categoryMeta,
    exactRule,
    shelvePath,
    unshelvePathCategory,
    unshelvePath,
    shelveRule,
    unshelveRuleCategory,
    unshelveRule,
    setRuleGlobal,
  } from "../state/shelf.svelte";

  interface Props {
    x: number;
    y: number;
    target: PickerTarget;
    onClose: () => void;
  }
  let { x, y, target, onClose }: Props = $props();

  // la voce non cambia mentre il picker è aperto: valori iniziali letti una volta
  const init = untrack(() => {
    if ("rule" in target) return { isRule: true, kind: target.rule.kind, name: target.rule.pattern, rel: "", rule: target.rule };
    const kind = target.isDir ? ("folders" as const) : ("files" as const);
    const name = basename(target.abs);
    const found = exactRule(kind, name);
    return { isRule: false, kind, name, rel: relOf(target.abs), rule: found ? { pattern: found.pattern, kind, global: found.global } : null };
  });
  const noun = init.kind === "folders" ? "folder" : "file";

  // con una regola esatta già esistente per questo nome, si apre su quella così la si vede e la si cambia
  let mode = $state<"path" | "rule">(init.rule ? "rule" : "path");
  let pattern = $state(init.rule?.pattern ?? init.name);
  let global = $state(init.rule?.global ?? false);
  let key = $derived(pattern.trim());
  let current = $derived(mode === "path" ? categoriesOf({ kind: "paths", key: init.rel }) : categoriesOf({ kind: init.kind, key, global }));
  let cats = $derived(allCategories());
  let newName = $state("");

  function toggle(cat: string) {
    if (mode === "path") {
      if (current.includes(cat)) unshelvePathCategory(init.rel, cat);
      else shelvePath(("abs" in target ? target.abs : ""), cat);
    } else if (key) {
      if (current.includes(cat)) unshelveRuleCategory(init.kind, key, cat, global);
      else shelveRule(init.kind, key, cat, global);
    }
  }
  function create() {
    const n = newName.trim();
    if (!n || current.includes(n)) return;
    toggle(n);
    newName = "";
  }
  function setGlobal(on: boolean) {
    if (current.length && key) setRuleGlobal(init.kind, key, on);
    global = on;
  }
  function remove() {
    if (mode === "path") unshelvePath(init.rel);
    else if (key) unshelveRule(init.kind, key, global);
    onClose();
  }

  const W = 264;
  let measured = $state(0);
  let left = $derived(Math.max(6, Math.min(x, window.innerWidth - W - 6)));
  let top = $derived(Math.max(6, Math.min(y, window.innerHeight - (measured || 340) - 6)));
</script>

<Backdrop {onClose} z={92} />

<div class="picker" style="left:{left}px; top:{top}px; width:{W}px" role="menu" bind:offsetHeight={measured} transition:scale={{ duration: 90, start: 0.97, opacity: 0.3 }}>
  <div class="head">
    <Icon name="archive" size={13} strokeWidth={1.7} />
    <span class="ttl">Shelf · {init.name}</span>
  </div>

  {#if !init.isRule}
    <button class="opt" class:on={mode === "path"} onclick={() => (mode = "path")}>
      <span class="radio"></span>
      <span class="ol">This {noun}</span>
      <span class="od" title={init.rel}>{init.rel}</span>
    </button>
  {/if}
  <div class="opt rule" class:on={mode === "rule"}>
    {#if !init.isRule}
      <button class="pick" onclick={() => (mode = "rule")} aria-label="All {noun}s matching">
        <span class="radio"></span>
        <span class="ol">All {noun}s matching</span>
      </button>
    {:else}
      <span class="ol solo">Every {noun} matching</span>
    {/if}
    <input
      class="pattern"
      bind:value={pattern}
      readonly={init.isRule}
      onfocus={() => (mode = "rule")}
      title="A name, or a pattern with * and ? (e.g. *.Tests, .*)"
      spellcheck="false"
    />
  </div>
  {#if mode === "rule"}
    <button class="opt sub" class:on={global} onclick={() => setGlobal(!global)} title="The rule applies to every repository you open in Orbit, on this PC">
      <span class="box">{#if global}<Icon name="check" size={12} strokeWidth={2.4} />{/if}</span>
      <Icon name="globe" size={12} strokeWidth={1.8} />
      <span class="ol">In every repository</span>
    </button>
  {/if}

  <div class="divider"></div>
  {#if cats.length}
    <div class="list">
      {#each cats as c (c)}
        {@const color = categoryMeta(c).color}
        <button class="cat" class:on={current.includes(c)} onclick={() => toggle(c)}>
          <span class="box">{#if current.includes(c)}<Icon name="check" size={12} strokeWidth={2.4} />{/if}</span>
          {#if color}<span class="dot" style="background:{color}"></span>{/if}
          <span class="cn">{c}</span>
        </button>
      {/each}
    </div>
  {/if}

  <input
    class="newcat"
    bind:value={newName}
    placeholder="New category…"
    onkeydown={(e) => {
      if (e.key === "Enter") create();
    }}
  />

  {#if current.length}
    <div class="divider"></div>
    <button class="remove" onclick={remove}>
      <Icon name="trash" size={13} strokeWidth={1.8} />
      <span>{mode === "path" ? "Remove from shelf" : `Remove the rule “${key}”`}</span>
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
  .opt,
  .pick,
  .cat,
  .remove {
    display: flex;
    align-items: center;
    gap: 8px;
    width: 100%;
    padding: 5px 6px;
    border: 0;
    border-radius: var(--r-md);
    background: transparent;
    color: var(--color-ink-muted);
    font-size: 12.5px;
    text-align: left;
    cursor: pointer;
  }
  .opt:hover,
  .pick:hover,
  .cat:hover {
    background: var(--color-surface-3);
  }
  .opt.on,
  .opt.on .pick {
    color: var(--color-ink);
  }
  .opt.rule {
    flex-wrap: wrap;
    gap: 4px;
    cursor: default;
  }
  .opt.rule:hover {
    background: transparent;
  }
  .pick {
    width: auto;
    padding: 0;
    flex: 1;
  }
  .pick:hover {
    background: transparent;
  }
  .opt.sub {
    padding-left: 26px;
    font-size: 12px;
  }
  .ol {
    flex: 0 0 auto;
  }
  .ol.solo {
    padding-left: 2px;
  }
  .od {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    color: var(--color-ink-subtle);
    font-size: 11px;
    text-align: right;
  }
  .radio {
    flex: 0 0 12px;
    height: 12px;
    border: 1px solid var(--color-line-strong);
    border-radius: 50%;
  }
  .on > .radio,
  .on .radio {
    border: 4px solid var(--color-accent);
  }
  .pattern {
    flex: 1 1 100%;
    margin-left: 20px;
    padding: 4px 7px;
    border: 1px solid var(--color-line-strong);
    border-radius: var(--r-md);
    background: var(--color-surface-1);
    color: var(--color-ink);
    font-family: var(--font-mono);
    font-size: 12px;
    outline: none;
  }
  .pattern:focus {
    border-color: var(--color-accent);
  }
  .pattern[readonly] {
    margin-left: 2px;
    color: var(--color-ink-muted);
  }
  .divider {
    height: 1px;
    margin: 6px 4px;
    background: var(--color-line);
  }
  .list {
    max-height: 180px;
    overflow: auto;
    display: flex;
    flex-direction: column;
    gap: 1px;
  }
  .cat {
    color: var(--color-ink);
  }
  .box {
    flex: 0 0 14px;
    height: 14px;
    display: grid;
    place-items: center;
    border: 1px solid var(--color-line-strong);
    border-radius: var(--r-xs);
    color: var(--color-accent);
  }
  .on > .box,
  .cat.on .box {
    border-color: var(--color-accent);
  }
  .dot {
    flex: 0 0 8px;
    height: 8px;
    border-radius: 50%;
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
    border-radius: var(--r-md);
    background: var(--color-surface-1);
    color: var(--color-ink);
    font-family: var(--font-sans);
    font-size: 12.5px;
    outline: none;
  }
  .newcat:focus {
    border-color: var(--color-accent);
  }
  .remove:hover {
    background: rgba(241, 76, 76, 0.16);
    color: #ff9b9b;
  }
</style>
