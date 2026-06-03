<script lang="ts">
  import { fade } from "svelte/transition";
  import Icon from "./Icon.svelte";
  import { quickopen, setQuery, move, choose, closePalette } from "../state/quickopen.svelte";
  import { fileIcon } from "../util";

  let list: HTMLDivElement | undefined;

  // tiene la riga selezionata visibile mentre ci si muove con le frecce
  $effect(() => {
    quickopen.index;
    list?.querySelector(".row.sel")?.scrollIntoView({ block: "nearest" });
  });

  function onKey(e: KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      move(1);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      move(-1);
    } else if (e.key === "Enter") {
      e.preventDefault();
      choose();
    } else if (e.key === "Escape") {
      e.preventDefault();
      closePalette();
    }
  }

  function dirOf(rel: string): string {
    const i = rel.lastIndexOf("/");
    return i < 0 ? "" : rel.slice(0, i);
  }
  function baseOf(rel: string): string {
    const i = rel.lastIndexOf("/");
    return i < 0 ? rel : rel.slice(i + 1);
  }
</script>

<!-- backdrop: click fuori chiude -->
<button class="backdrop" aria-label="Chiudi" onclick={closePalette}></button>

<div class="palette" role="dialog" aria-label="Apri file" transition:fade={{ duration: 80 }}>
  <div class="field">
    <Icon name="search" size={15} strokeWidth={1.8} />
    <!-- svelte-ignore a11y_autofocus -->
    <input
      autofocus
      type="text"
      placeholder="Apri file per nome…"
      value={quickopen.query}
      oninput={(e) => setQuery(e.currentTarget.value)}
      onkeydown={onKey}
      spellcheck="false"
    />
  </div>

  <div class="results" bind:this={list}>
    {#if quickopen.loading}
      <div class="msg">Indicizzazione…</div>
    {:else if quickopen.results.length === 0}
      <div class="msg">Nessun file</div>
    {:else}
      {#each quickopen.results as f, i (f.path)}
        {@const fi = fileIcon(baseOf(f.rel))}
        <button
          class="row"
          class:sel={i === quickopen.index}
          onclick={choose}
          onmouseenter={() => (quickopen.index = i)}
        >
          <span class="ic" style="color:{fi.color}"><Icon name={fi.glyph} size={15} strokeWidth={1.7} /></span>
          <span class="base">{baseOf(f.rel)}</span>
          <span class="dir">{dirOf(f.rel)}</span>
        </button>
      {/each}
    {/if}
  </div>
</div>

<style>
  .backdrop {
    position: fixed;
    inset: 0;
    z-index: 100;
    background: rgba(0, 0, 0, 0.32);
    border: 0;
    padding: 0;
    cursor: default;
  }
  .palette {
    position: fixed;
    z-index: 101;
    top: 64px;
    left: 50%;
    transform: translateX(-50%);
    width: min(620px, 90vw);
    max-height: min(60vh, 520px);
    display: flex;
    flex-direction: column;
    background: var(--color-surface-2);
    border: 1px solid var(--color-line-strong);
    border-radius: var(--radius-lg);
    box-shadow: var(--shadow-pop);
    overflow: hidden;
  }
  .field {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 10px 12px;
    border-bottom: 1px solid var(--color-line);
    color: var(--color-ink-subtle);
  }
  .field input {
    flex: 1;
    min-width: 0;
    border: 0;
    background: transparent;
    color: var(--color-ink);
    font-family: var(--font-sans);
    font-size: 14px;
    outline: none;
  }
  .results {
    overflow-y: auto;
    padding: 4px;
  }
  .msg {
    padding: 14px 12px;
    color: var(--color-ink-subtle);
    font-size: 13px;
  }
  .row {
    display: flex;
    align-items: center;
    gap: 8px;
    width: 100%;
    height: 30px;
    padding: 0 9px;
    border: 0;
    border-radius: var(--radius-sm);
    background: transparent;
    color: var(--color-ink);
    text-align: left;
    cursor: pointer;
  }
  .row.sel {
    background: rgba(var(--accent-rgb), 0.18);
  }
  .ic {
    flex: 0 0 auto;
    display: grid;
    place-items: center;
  }
  .base {
    flex: 0 0 auto;
    font-size: 13px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    max-width: 50%;
  }
  .dir {
    flex: 1;
    min-width: 0;
    color: var(--color-ink-subtle);
    font-size: 11.5px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
</style>
