<script lang="ts">
  import { fade } from "svelte/transition";
  import Icon from "./Icon.svelte";
  import Backdrop from "./Backdrop.svelte";
  import { symbols, setSymQuery, moveSym, chooseSym, closeSymbols } from "../state/symbols.svelte";

  let list: HTMLDivElement | undefined;

  // tiene la riga selezionata visibile mentre ci si muove con le frecce
  $effect(() => {
    symbols.index;
    list?.querySelector(".row.sel")?.scrollIntoView({ block: "nearest" });
  });

  function onKey(e: KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      moveSym(1);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      moveSym(-1);
    } else if (e.key === "Enter") {
      e.preventDefault();
      chooseSym();
    } else if (e.key === "Escape") {
      e.preventDefault();
      closeSymbols();
    }
  }

  // glifo + colore per tipo di simbolo (riusa le icone esistenti)
  const KIND: Record<string, { glyph: string; color: string }> = {
    function: { glyph: "braces", color: "#b48ead" },
    method: { glyph: "braces", color: "#8fbcff" },
    class: { glyph: "code", color: "#e3b341" },
    interface: { glyph: "type", color: "#88c0d0" },
    type: { glyph: "type", color: "#88c0d0" },
    enum: { glyph: "hash", color: "#a3be8c" },
    struct: { glyph: "code", color: "#d08770" },
    impl: { glyph: "gear", color: "#9da0a8" },
    module: { glyph: "gear", color: "#9da0a8" },
    property: { glyph: "hash", color: "#9da0a8" },
  };
  const kindIcon = (k: string) => KIND[k] ?? { glyph: "file", color: "#8b929e" };
</script>

<Backdrop onClose={closeSymbols} dim z={100} />

<div class="palette" role="dialog" aria-label="Go to symbol" transition:fade={{ duration: 80 }}>
  <div class="field">
    <Icon name="search" size={15} strokeWidth={1.8} />
    <!-- svelte-ignore a11y_autofocus -->
    <input
      autofocus
      type="text"
      placeholder="Go to symbol…"
      value={symbols.query}
      oninput={(e) => setSymQuery(e.currentTarget.value)}
      onkeydown={onKey}
      spellcheck="false"
    />
  </div>

  <div class="results" bind:this={list}>
    {#if symbols.empty}
      <div class="msg">No symbols in this file</div>
    {:else if symbols.results.length === 0}
      <div class="msg">No match</div>
    {:else}
      {#each symbols.results as s, i (s.from)}
        {@const ic = kindIcon(s.kind)}
        <button
          class="row"
          class:sel={i === symbols.index}
          onclick={chooseSym}
          onmouseenter={() => (symbols.index = i)}
        >
          <span class="ic" style="color:{ic.color}; margin-left:{symbols.query ? 0 : s.depth * 13}px">
            <Icon name={ic.glyph} size={15} strokeWidth={1.7} />
          </span>
          <span class="base">{s.name}</span>
          <span class="kind">{s.kind}</span>
          <span class="ln">:{s.line}</span>
        </button>
      {/each}
    {/if}
  </div>
</div>

<style>
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
    max-width: 60%;
  }
  .kind {
    flex: 1;
    min-width: 0;
    color: var(--color-ink-subtle);
    font-size: 11px;
  }
  .ln {
    flex: 0 0 auto;
    color: var(--color-ink-subtle);
    font-size: 11.5px;
    font-variant-numeric: tabular-nums;
  }
</style>
