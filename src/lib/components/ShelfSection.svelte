<script lang="ts">
  // Sezione «Shelf» in fondo all'Explorer, condivisa dalla vista a cartelle e dalla vista Solution (M72).
  // M73: sempre visibile, anche vuota, così la funzione si fa scoprire; nella testata l'occhio (le voci al
  // loro posto nell'albero, in grigio), la ⚙ verso la pagina Shelf delle Impostazioni e il pallino git a
  // sezione chiusa; un separatore per l'altezza; il bersaglio del trascinamento dall'albero. Il contenuto
  // (categorie, voci, regole, menu: ShelfBody) e il picker arrivano su richiesta, fuori dal chunk d'avvio.
  import { untrack } from "svelte";
  import Icon from "./Icon.svelte";
  import Lazy from "./Lazy.svelte";
  import type { PickerTarget } from "./ShelfPicker.svelte";
  import { workspace } from "../state/workspace.svelte";
  import { decorations } from "../state/git.svelte";
  import { openSettings } from "../state/settings.svelte";
  import { shelfUi, shelfMatches, matchKey, byCategory, shelfCount, setShelfCollapsed, setShelfHeight, setShelfPeek } from "../state/shelf.svelte";
  import { shelfDrag } from "../state/shelfDrag.svelte";
  import { joinPath, normSlash } from "../util";

  let count = $derived(shelfCount());

  // a sezione chiusa, un pallino se dentro lo scaffale c'è qualcosa di modificato
  let anyDirty = $derived.by(() => {
    const root = workspace.rootPath;
    if (!shelfUi.collapsed || !root || !count) return false;
    const deco = decorations();
    const dirty = (rel: string) => {
      const p = normSlash(joinPath(root, rel));
      return deco.dirs.has(p) || deco.files.has(p);
    };
    return byCategory().some(
      (c) => c.paths.some(dirty) || c.rules.some((r) => (shelfMatches.byRule[matchKey(r.kind, r.pattern)]?.rels ?? []).some(dirty)),
    );
  });

  // ---- rilascio dal trascinamento sulla testata: si sceglie la categoria nel picker ----
  let picker = $state<{ x: number; y: number; target: PickerTarget } | null>(null);
  $effect(() => {
    const p = shelfDrag.pick;
    if (!p) return;
    untrack(() => {
      picker = { x: p.x, y: p.y, target: { abs: p.abs, isDir: p.isDir } };
      shelfDrag.pick = null;
      if (shelfUi.collapsed) setShelfCollapsed(false);
    });
  });

  // ---- separatore: altezza della sezione ----
  let sectionEl: HTMLDivElement;
  let sizing: { y: number; h: number; max: number } | null = null;
  function gripDown(e: PointerEvent) {
    if (e.button !== 0) return;
    const parent = sectionEl.parentElement?.clientHeight ?? 600;
    sizing = { y: e.clientY, h: sectionEl.offsetHeight, max: Math.max(80, parent - 60) };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    e.preventDefault();
  }
  function gripMove(e: PointerEvent) {
    if (!sizing) return;
    shelfUi.height = Math.round(Math.max(52, Math.min(sizing.max, sizing.h - (e.clientY - sizing.y))));
  }
  function gripUp() {
    if (!sizing) return;
    sizing = null;
    setShelfHeight(shelfUi.height);
  }
</script>

<div
  class="shelf"
  class:sized={!shelfUi.collapsed && shelfUi.height !== null}
  class:dragging={!!shelfDrag.item}
  style={!shelfUi.collapsed && shelfUi.height !== null ? `height:${shelfUi.height}px` : ""}
  bind:this={sectionEl}
>
  {#if !shelfUi.collapsed}
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div
      class="grip"
      title="Drag to resize · double-click for the automatic height"
      onpointerdown={gripDown}
      onpointermove={gripMove}
      onpointerup={gripUp}
      onpointercancel={gripUp}
      ondblclick={() => setShelfHeight(null)}
    ></div>
  {/if}
  <div class="shelf-head" class:drop={shelfDrag.over === "*"} data-shelf-drop="*">
    <button class="head-toggle" onclick={() => setShelfCollapsed(!shelfUi.collapsed)} title={shelfUi.collapsed ? "Show the shelf" : "Hide the shelf"}>
      <span class="chev" class:open={!shelfUi.collapsed}><Icon name="chevron-right" size={13} strokeWidth={2} /></span>
      <Icon name="archive" size={13} strokeWidth={1.7} />
      <span class="shelf-ttl">Shelf</span>
      {#if anyDirty}<span class="gdot" title="Changes inside shelved items"></span>{/if}
    </button>
    <button
      class="hbtn"
      class:on={shelfUi.peek}
      title={shelfUi.peek ? "Shelved items are shown in the tree, dimmed — click to hide them" : "Show shelved items in the tree, dimmed"}
      aria-pressed={shelfUi.peek}
      onclick={() => setShelfPeek(!shelfUi.peek)}
    >
      <Icon name="eye" size={13} strokeWidth={1.8} />
    </button>
    <button class="hbtn" title="Shelf settings" aria-label="Shelf settings" onclick={() => openSettings("shelf")}>
      <Icon name="settings" size={13} strokeWidth={1.8} />
    </button>
    {#if count}<span class="shelf-count">{count}</span>{/if}
  </div>

  {#if !shelfUi.collapsed}
    {#if count}
      <Lazy load={() => import("./ShelfBody.svelte")} />
    {:else}
      <div class="help">Right-click a folder or a file → <b>Add to shelf…</b>, or drag it here.</div>
    {/if}
  {/if}
</div>

{#if shelfDrag.item}
  <div class="ghost" style="left:{shelfDrag.x + 14}px; top:{shelfDrag.y + 10}px">
    <Icon name={shelfDrag.item.isDir ? "folder" : "file"} size={13} strokeWidth={1.7} />
    <span>{shelfDrag.item.name}</span>
    {#if shelfDrag.over}<span class="to">→ {shelfDrag.over === "*" ? "Shelf…" : shelfDrag.over}</span>{/if}
  </div>
{/if}

{#if picker}
  <Lazy load={() => import("./ShelfPicker.svelte")} x={picker.x} y={picker.y} target={picker.target} onClose={() => (picker = null)} />
{/if}

<style>
  .shelf {
    position: relative;
    flex: 0 0 auto;
    max-height: 45%;
    display: flex;
    flex-direction: column;
    border-top: 1px solid var(--color-line);
    background: var(--color-surface-2);
  }
  /* altezza scelta col separatore: vale quella, ma l'albero resta sempre visibile */
  .shelf.sized {
    max-height: calc(100% - 60px);
  }
  .grip {
    position: absolute;
    left: 0;
    right: 0;
    top: -3px;
    height: 6px;
    z-index: 2;
    cursor: row-resize;
  }
  .grip:hover,
  .grip:active {
    background: rgba(var(--accent-rgb), 0.5);
  }
  .shelf-head {
    display: flex;
    align-items: center;
    gap: 2px;
    height: 26px;
    flex: 0 0 26px;
    padding: 0 6px 0 0;
  }
  .head-toggle {
    flex: 1;
    min-width: 0;
    height: 100%;
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 0 0 0 8px;
    background: transparent;
    border: 0;
    color: var(--color-ink-muted);
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.05em;
    text-transform: uppercase;
    cursor: pointer;
  }
  .head-toggle:hover {
    color: var(--color-ink);
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
  .gdot {
    flex: 0 0 auto;
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: var(--color-warning);
  }
  .hbtn {
    flex: 0 0 auto;
    display: grid;
    place-items: center;
    width: 22px;
    height: 20px;
    padding: 0;
    border: 0;
    border-radius: var(--r-sm);
    background: transparent;
    color: var(--color-ink-subtle);
    cursor: pointer;
  }
  .hbtn:hover {
    background: var(--color-surface-3);
    color: var(--color-ink);
  }
  .hbtn.on {
    color: var(--color-accent);
  }
  .shelf-count {
    min-width: 14px;
    padding-left: 3px;
    color: var(--color-ink-subtle);
    font-size: 11px;
    font-weight: 700;
    text-align: right;
  }
  /* bersaglio del trascinamento dall'albero */
  .shelf.dragging .shelf-head {
    outline: 1px dashed var(--color-line-strong);
    outline-offset: -2px;
  }
  .shelf-head.drop {
    background: rgba(var(--accent-rgb), 0.18);
    outline: 1px solid var(--color-accent) !important;
  }
  .help {
    padding: 4px 12px 8px 30px;
    color: var(--color-ink-subtle);
    font-size: 11.5px;
    line-height: 1.45;
  }
  .help b {
    font-weight: 600;
    color: var(--color-ink-muted);
  }
  /* la voce trascinata segue il puntatore */
  .ghost {
    position: fixed;
    z-index: 95;
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 4px 9px;
    border: 1px solid var(--color-line-strong);
    border-radius: var(--r-md);
    background: var(--color-surface-2);
    box-shadow: var(--shadow-pop);
    color: var(--color-ink);
    font-size: 12px;
    pointer-events: none;
  }
  .ghost .to {
    color: var(--color-accent);
  }
</style>
