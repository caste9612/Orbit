<script lang="ts">
  // Palette "Simboli del progetto" (Ctrl+T): ricerca fuzzy su tutta la rubrica e salto alla
  // definizione. In modalità "scegli definizione" (pickLabel) elenca le definizioni omonime per F12.
  import { fade } from "svelte/transition";
  import Icon from "./Icon.svelte";
  import Backdrop from "./Backdrop.svelte";
  import KindBadge from "./KindBadge.svelte";
  import { wsPalette, setWsQuery, moveWs, chooseWs, closeWsPalette, codeIndex } from "../state/codeIndex.svelte";

  let list: HTMLDivElement | undefined;

  $effect(() => {
    wsPalette.index;
    list?.querySelector(".row.sel")?.scrollIntoView({ block: "nearest" });
  });

  function onKey(e: KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      moveWs(1);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      moveWs(-1);
    } else if (e.key === "Enter") {
      e.preventDefault();
      chooseWs();
    } else if (e.key === "Escape") {
      e.preventDefault();
      closeWsPalette();
    }
  }

</script>

<Backdrop onClose={closeWsPalette} dim z={100} />

<div class="palette" role="dialog" aria-label="Project symbols" transition:fade={{ duration: 80 }}>
  <div class="field">
    <Icon name="search" size={15} strokeWidth={1.8} />
    <!-- svelte-ignore a11y_autofocus -->
    <input
      autofocus
      type="text"
      placeholder={wsPalette.pickLabel ? `Definitions of "${wsPalette.pickLabel}"…` : "Project symbols…"}
      value={wsPalette.query}
      oninput={(e) => setWsQuery(e.currentTarget.value)}
      onkeydown={onKey}
      spellcheck="false"
    />
    {#if codeIndex.scanning}<span class="scan"><Icon name="refresh" size={13} strokeWidth={1.9} /></span>{/if}
  </div>

  <div class="results" bind:this={list}>
    {#if !codeIndex.loaded && codeIndex.scanning}
      <div class="msg">Indexing project…</div>
    {:else if wsPalette.results.length === 0}
      <div class="msg">{wsPalette.query || wsPalette.pickLabel ? "No match" : "No symbols"}</div>
    {:else}
      {#each wsPalette.results as s, i (s.file + ":" + s.line + ":" + s.name)}
        <button class="row" class:sel={i === wsPalette.index} onclick={chooseWs} onmouseenter={() => (wsPalette.index = i)}>
          <span class="ic"><KindBadge kind={s.kind} isAbstract={s.isAbstract} size={16} /></span>
          <span class="base">{s.name}</span>
          <span class="cont">{s.container}</span>
          <span class="loc">{s.file}:{s.line}</span>
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
    width: min(680px, 92vw);
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
  .scan {
    display: inline-flex;
    color: var(--color-ink-subtle);
    animation: spin 0.9s linear infinite;
  }
  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
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
    max-width: 40%;
  }
  .cont {
    flex: 0 0 auto;
    color: var(--color-ink-subtle);
    font-size: 11px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    max-width: 24%;
  }
  .loc {
    flex: 1;
    min-width: 0;
    text-align: right;
    color: var(--color-ink-subtle);
    font-size: 11.5px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-variant-numeric: tabular-nums;
  }
</style>
