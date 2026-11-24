<script lang="ts">
  // Ispettore dell'editor dei documenti HTML (M77): sezioni, sezione scelta (layout, voce, dati), stile,
  // problemi. Legge la mappa del sorgente e chiama le azioni di HtmlDocEditor; non tocca il testo da sé.
  import Icon from "./Icon.svelte";
  import { LAYOUTS, PROFILE_VERSION, itemPosition, parseCell, type Cell, type Dataset, type DocActions, type DocMap, type Item, type TableData, type Token } from "../htmldoc/htmlDoc";

  interface Props {
    map: DocMap;
    selBlock: string | null;
    item: Item | null;
    readonly: boolean;
    scheme: "light" | "dark";
    canUndo: boolean;
    canRedo: boolean;
    runtimeCurrent: boolean; // il runtime nel documento è identico a quello di Orbit
    act: DocActions;
  }
  let { map, selBlock, item, readonly, scheme, canUndo, canRedo, runtimeCurrent, act }: Props = $props();

  let open = $state({ sections: true, block: true, style: false, problems: true });
  let bi = $derived(map.blocks.findIndex((b) => b.id === selBlock));
  let block = $derived(bi >= 0 ? map.blocks[bi] : null);
  let blockData = $derived(block ? map.datasets.filter((d) => d.block === block.id) : []);
  let light = $derived(map.tokens.filter((t) => t.scheme === "light"));
  let dark = $derived(map.tokens.filter((t) => t.scheme === "dark"));
  let issues = $derived(map.problems.filter((p) => p.level !== "info"));
  // manca, è di un'altra versione, o è della stessa ma diverso da quello di Orbit (corretto dopo)
  let runtimeStale = $derived(map.runtime !== null ? !runtimeCurrent : map.runtimeMarker || map.charts.length > 0);

  const LAYOUT_LABEL: Record<string, string> = { stack: "Stack", split: "Split", "grid-2": "2 col", "grid-3": "3 col" };
  const ITEM_LABEL = { row: "Table row", list: "List item", item: "Item" };

  // ---- sezioni: trascina per riordinare (pointer, come le schede: l'HTML5 DnD in Orbit è spento) ----
  let drag = $state<{ from: number; slot: number } | null>(null);
  let listEl = $state<HTMLElement>();
  function gripDown(e: PointerEvent, i: number) {
    if (readonly || e.button !== 0) return;
    drag = { from: i, slot: i };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    e.preventDefault();
  }
  function gripMove(e: PointerEvent) {
    if (!drag || !listEl) return;
    const rows = [...listEl.querySelectorAll<HTMLElement>(".srow")];
    let slot = rows.length;
    for (let k = 0; k < rows.length; k++) {
      const r = rows[k].getBoundingClientRect();
      if (e.clientY < r.top + r.height / 2) {
        slot = k;
        break;
      }
    }
    drag.slot = slot;
  }
  function gripUp() {
    if (!drag) return;
    const to = drag.slot > drag.from ? drag.slot - 1 : drag.slot;
    const from = drag.from;
    drag = null;
    if (to !== from) act.moveBlock(from, to);
  }

  // ---- dati ----
  const clone = (d: TableData): TableData => ({ columns: [...d.columns], rows: d.rows.map((r) => [...r]) });
  const show = (v: Cell | undefined) => (v === null || v === undefined ? "" : String(v));
  function setCell(ds: Dataset, ri: number, ci: number, text: string) {
    const d = clone(ds.data!);
    while (d.rows[ri].length < d.columns.length) d.rows[ri].push("");
    d.rows[ri][ci] = parseCell(text);
    act.setData(ds, d);
  }
  function addRow(ds: Dataset) {
    const d = clone(ds.data!);
    const last = d.rows[d.rows.length - 1] ?? [];
    d.rows.push(d.columns.map((_, ci) => (typeof last[ci] === "number" ? 0 : "")));
    act.setData(ds, d);
  }
  function delRow(ds: Dataset, ri: number) {
    const d = clone(ds.data!);
    d.rows.splice(ri, 1);
    act.setData(ds, d);
  }
  function addCol(ds: Dataset) {
    const d = clone(ds.data!);
    d.columns.push(`Column ${d.columns.length + 1}`);
    for (const r of d.rows) r.push(0);
    act.setData(ds, d);
  }
  function delCol(ds: Dataset, ci: number) {
    const d = clone(ds.data!);
    d.columns.splice(ci, 1);
    for (const r of d.rows) r.splice(ci, 1);
    act.setData(ds, d);
  }

  // ---- stile ----
  const HEX = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i;
  const hex6 = (v: string) => (v.length === 4 ? "#" + [...v.slice(1)].map((c) => c + c).join("") : v).toLowerCase();
</script>

<aside class="panel">
  <header class="ph">
    <span class="ptitle" title={map.title}>{map.title || "Document"}</span>
    <button class="ib" title="Undo (Ctrl+Z)" aria-label="Undo" disabled={!canUndo || readonly} onclick={act.undo}>
      <Icon name="arrow-left" size={14} strokeWidth={2} />
    </button>
    <button class="ib" title="Redo (Ctrl+Y)" aria-label="Redo" disabled={!canRedo || readonly} onclick={act.redo}>
      <Icon name="arrow-right" size={14} strokeWidth={2} />
    </button>
    <button class="tb" title="Print or save as PDF" onclick={act.print}>
      <Icon name="download" size={13} strokeWidth={2} /> PDF
    </button>
    <button class="ib" title="Hide the panel" aria-label="Hide the panel" onclick={act.closePanel}>
      <Icon name="chevrons-right" size={14} strokeWidth={2} />
    </button>
  </header>

  <div class="pbody">
    <!-- sezioni -->
    <section class="card">
      <button class="ch" onclick={() => (open.sections = !open.sections)}>
        <Icon name={open.sections ? "chevron-down" : "chevron-right"} size={12} strokeWidth={2} />
        <span>Sections</span>
        <span class="count">{map.blocks.length}</span>
      </button>
      {#if open.sections}
        <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
        <ol class="slist" class:dragging={drag !== null} bind:this={listEl} onpointermove={gripMove} onpointerup={gripUp} onpointercancel={() => (drag = null)}>
          {#each map.blocks as b, i (b.id + ":" + i)}
            <li class="srow" class:sel={b.id === selBlock} class:before={drag?.slot === i && drag.from !== i && drag.from !== i - 1} class:moving={drag?.from === i}>
              <!-- svelte-ignore a11y_no_static_element_interactions -->
              <span class="grip" title="Drag to reorder" onpointerdown={(e) => gripDown(e, i)}></span>
              <button class="sname" title={b.id} onclick={() => act.reveal(b.id)}>{b.title}</button>
              {#if !readonly}
                <span class="sact">
                  <button class="ib s" title="Move up" aria-label="Move up" disabled={i === 0} onclick={() => act.moveBlock(i, i - 1)}><Icon name="arrow-up" size={12} strokeWidth={2} /></button>
                  <button class="ib s" title="Move down" aria-label="Move down" disabled={i === map.blocks.length - 1} onclick={() => act.moveBlock(i, i + 1)}><Icon name="arrow-down" size={12} strokeWidth={2} /></button>
                  <button class="ib s" title="Duplicate" aria-label="Duplicate" onclick={() => act.duplicateBlock(i)}><Icon name="copy" size={12} strokeWidth={2} /></button>
                  <button class="ib s danger" title="Delete" aria-label="Delete" onclick={() => act.deleteBlock(i)}><Icon name="trash" size={12} strokeWidth={2} /></button>
                </span>
              {/if}
            </li>
          {/each}
          {#if drag && drag.slot === map.blocks.length && drag.from !== map.blocks.length - 1}<li class="endmark" aria-hidden="true"></li>{/if}
        </ol>
        {#if !readonly && map.main}
          <button class="add" onclick={() => act.addBlock(bi >= 0 ? bi : null)}>
            <Icon name="plus" size={13} strokeWidth={2} />
            {bi >= 0 ? "Add section after the selected one" : "Add section"}
          </button>
        {/if}
      {/if}
    </section>

    <!-- sezione scelta -->
    {#if block}
      <section class="card">
        <button class="ch" onclick={() => (open.block = !open.block)}>
          <Icon name={open.block ? "chevron-down" : "chevron-right"} size={12} strokeWidth={2} />
          <span class="ell">{block.title}</span>
        </button>
        {#if open.block}
          <div class="field">
            <span class="lbl">Layout</span>
            <div class="seg" class:off={map.runtime === null || readonly} title={map.runtime === null ? "Insert the runtime to use layouts" : ""}>
              <button class:on={block.layout === null} disabled={map.runtime === null || readonly} onclick={() => act.setLayout(bi, null)}>Free</button>
              {#each LAYOUTS as l (l)}
                <button class:on={block.layout === l} disabled={map.runtime === null || readonly} onclick={() => act.setLayout(bi, l)}>{LAYOUT_LABEL[l]}</button>
              {/each}
            </div>
          </div>

          {#if item && !readonly}
            {@const pos = itemPosition(item)}
            <div class="field">
              <span class="lbl">{ITEM_LABEL[item.kind]} {pos.index + 1} of {pos.count}</span>
              <div class="row-act">
                <button class="ib" title="Move up" aria-label="Move up" disabled={pos.index === 0} onclick={() => act.moveItem(-1)}><Icon name="arrow-up" size={13} strokeWidth={2} /></button>
                <button class="ib" title="Move down" aria-label="Move down" disabled={pos.index === pos.count - 1} onclick={() => act.moveItem(1)}><Icon name="arrow-down" size={13} strokeWidth={2} /></button>
                <button class="ib" title="Duplicate" aria-label="Duplicate" onclick={act.duplicateItem}><Icon name="copy" size={13} strokeWidth={2} /></button>
                <button class="ib danger" title="Delete" aria-label="Delete" disabled={pos.count <= 1} onclick={act.deleteItem}><Icon name="trash" size={13} strokeWidth={2} /></button>
              </div>
            </div>
          {:else if !readonly}
            <p class="hint">Click a table row, a list item or a card in the page to move, duplicate or delete it.</p>
          {/if}

          {#each blockData as ds (ds.name)}
            <div class="ds">
              <div class="ds-h">
                <Icon name="database" size={12} strokeWidth={2} />
                <span class="ell">{ds.name}</span>
              </div>
              {#if ds.error}
                <p class="err">{ds.error}</p>
              {:else if ds.data}
                {@const d = ds.data}
                <div class="gridwrap">
                  <table class="grid">
                    <thead>
                      <tr>
                        {#each d.columns as c, ci (ci)}
                          <th>
                            <span class="hcell">
                              <input value={c} disabled={readonly} spellcheck="false" onchange={(e) => act.renameColumn(ds, ci, e.currentTarget.value)} />
                              {#if !readonly && d.columns.length > 1}<button class="x" title="Delete column" aria-label="Delete column" onclick={() => delCol(ds, ci)}><Icon name="x" size={10} strokeWidth={2.2} /></button>{/if}
                            </span>
                          </th>
                        {/each}
                        {#if !readonly}<th class="tool"><button class="x add-col" title="Add column" aria-label="Add column" onclick={() => addCol(ds)}><Icon name="plus" size={11} strokeWidth={2.2} /></button></th>{/if}
                      </tr>
                    </thead>
                    <tbody>
                      {#each d.rows as r, ri (ri)}
                        <tr>
                          {#each d.columns as _, ci (ci)}
                            <td><input value={show(r[ci])} class:num={typeof r[ci] === "number"} disabled={readonly} spellcheck="false" onchange={(e) => setCell(ds, ri, ci, e.currentTarget.value)} /></td>
                          {/each}
                          {#if !readonly}<td class="tool"><button class="x" title="Delete row" aria-label="Delete row" onclick={() => delRow(ds, ri)}><Icon name="x" size={10} strokeWidth={2.2} /></button></td>{/if}
                        </tr>
                      {/each}
                    </tbody>
                  </table>
                </div>
                {#if !readonly}
                  <button class="add" onclick={() => addRow(ds)}><Icon name="plus" size={13} strokeWidth={2} /> Add row</button>
                {/if}
              {/if}
            </div>
          {/each}
        {/if}
      </section>
    {:else}
      <p class="hint pad">Click a section in the page or in the list to edit its layout, items and data.</p>
    {/if}

    <!-- stile -->
    <section class="card">
      <button class="ch" onclick={() => (open.style = !open.style)}>
        <Icon name={open.style ? "chevron-down" : "chevron-right"} size={12} strokeWidth={2} />
        <span>Style</span>
        <span class="count">{light.length + dark.length}</span>
      </button>
      {#if open.style}
        {#if dark.length}
          <div class="field">
            <span class="lbl">Preview</span>
            <div class="seg">
              <button class:on={scheme === "light"} onclick={() => act.setScheme("light")}>Light</button>
              <button class:on={scheme === "dark"} onclick={() => act.setScheme("dark")}>Dark</button>
            </div>
          </div>
        {/if}
        {#each [{ label: "Light theme", list: light }, { label: "Dark theme", list: dark }] as g (g.label)}
          {#if g.list.length}
            {#if dark.length}<div class="sub">{g.label}</div>{/if}
            {#each g.list as t (t.scheme + t.name)}
              {@render tokenRow(t)}
            {/each}
          {/if}
        {/each}
        {#if !light.length && !dark.length}
          <p class="hint">No tokens on <code>:root</code>.</p>
        {/if}
      {/if}
    </section>

    <!-- problemi -->
    {#if map.problems.length || runtimeStale}
      <section class="card">
        <button class="ch" onclick={() => (open.problems = !open.problems)}>
          <Icon name={open.problems ? "chevron-down" : "chevron-right"} size={12} strokeWidth={2} />
          <span>Problems</span>
          {#if issues.length}<span class="count warn">{issues.length}</span>{/if}
        </button>
        {#if open.problems}
          <ul class="plist">
            {#each map.problems as p, i (i)}
              <li class={p.level}>
                <Icon name={p.level === "info" ? "info" : "alert"} size={12} strokeWidth={2} />
                <span class="rule">{p.rule}</span>
                <span class="msg">{p.message}</span>
              </li>
            {/each}
          </ul>
          <div class="pact">
            {#if runtimeStale && !readonly}
              <button class="tb" onclick={act.insertRuntime}><Icon name="download" size={12} strokeWidth={2} /> {map.runtime === null ? "Insert runtime" : map.runtime === PROFILE_VERSION ? "Update runtime" : `Update runtime to ${PROFILE_VERSION}`}</button>
            {/if}
            {#if issues.length}
              <button class="tb" title="Copy a prompt that asks Claude to fix these problems" onclick={act.copyFixPrompt}><Icon name="clipboard" size={12} strokeWidth={2} /> Copy prompt for Claude</button>
            {/if}
          </div>
        {/if}
      </section>
    {/if}
  </div>
</aside>

{#snippet tokenRow(t: Token)}
  <div class="tok">
    <span class="tname" title={t.name}>{t.name.replace(/^--/, "")}</span>
    {#if HEX.test(t.value)}
      <input
        class="swatch"
        type="color"
        value={hex6(t.value)}
        disabled={readonly}
        oninput={(e) => act.previewToken(t, e.currentTarget.value)}
        onchange={(e) => act.setToken(t, e.currentTarget.value)}
      />
    {/if}
    <input class="tval" value={t.value} disabled={readonly} spellcheck="false" onchange={(e) => act.setToken(t, e.currentTarget.value)} />
  </div>
{/snippet}

<style>
  .panel {
    /* in un riquadro stretto (editor diviso) la pagina conta più del pannello */
    flex: 0 0 auto;
    width: clamp(230px, 32%, 300px);
    display: flex;
    flex-direction: column;
    min-height: 0;
    background: var(--color-surface-2);
    border-left: 1px solid var(--color-line);
    color: var(--color-ink);
    font-family: var(--font-sans);
    font-size: 12px;
  }
  .ph {
    display: flex;
    align-items: center;
    gap: 2px;
    height: var(--h-head);
    flex: 0 0 auto;
    padding: 0 6px 0 12px;
    border-bottom: 1px solid var(--color-line);
  }
  .ptitle {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-weight: 600;
  }
  .pbody {
    flex: 1;
    min-height: 0;
    overflow: auto;
    padding: 8px;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .card {
    border: 1px solid var(--color-line);
    border-radius: var(--r-lg);
    background: var(--color-surface-1);
    padding: 4px 0 6px;
  }
  .ch {
    display: flex;
    align-items: center;
    gap: 6px;
    width: 100%;
    padding: 4px 10px;
    border: 0;
    background: none;
    color: var(--color-ink);
    font: inherit;
    font-weight: 600;
    text-align: left;
    cursor: pointer;
  }
  .count {
    margin-left: auto;
    color: var(--color-ink-subtle);
    font-weight: 500;
  }
  .count.warn {
    color: var(--color-warning);
  }
  .ell {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  button {
    font: inherit;
  }
  .ib {
    width: 24px;
    height: 24px;
    flex: 0 0 auto;
    display: grid;
    place-items: center;
    border: 0;
    border-radius: var(--r-sm);
    background: none;
    color: var(--color-ink-muted);
    cursor: pointer;
  }
  .ib.s {
    width: 20px;
    height: 20px;
  }
  .ib:hover:not(:disabled) {
    background: var(--color-surface-3);
    color: var(--color-ink);
  }
  .ib.danger:hover:not(:disabled) {
    color: var(--color-danger);
  }
  .ib:disabled {
    opacity: 0.35;
    cursor: default;
  }
  .tb {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    height: 24px;
    padding: 0 8px;
    border: 1px solid var(--color-line-strong);
    border-radius: var(--r-md);
    background: var(--color-surface-2);
    color: var(--color-ink);
    cursor: pointer;
    white-space: nowrap;
  }
  .tb:hover {
    border-color: var(--color-accent);
  }
  .ph .tb {
    margin: 0 4px;
  }

  /* sezioni */
  .slist {
    list-style: none;
    margin: 2px 0 0;
    padding: 0 4px;
  }
  .srow {
    position: relative;
    display: flex;
    align-items: center;
    gap: 2px;
    height: 26px;
    padding: 0 2px;
    border-radius: var(--r-sm);
  }
  .srow:hover {
    background: var(--color-surface-3);
  }
  .srow.sel {
    background: var(--color-accent-soft);
  }
  .srow.moving {
    opacity: 0.5;
  }
  .srow.before::before,
  .endmark {
    content: "";
    position: absolute;
    left: 4px;
    right: 4px;
    top: -1px;
    height: 2px;
    border-radius: 1px;
    background: var(--color-accent);
  }
  .endmark {
    position: relative;
    display: block;
    top: 0;
    height: 2px;
  }
  .grip {
    flex: 0 0 auto;
    width: 10px;
    height: 16px;
    margin: 0 2px;
    cursor: grab;
    opacity: 0.45;
    background-image: radial-gradient(circle, currentColor 1.1px, transparent 1.4px);
    background-size: 5px 5px;
    color: var(--color-ink-muted);
  }
  .slist.dragging .grip {
    cursor: grabbing;
  }
  .srow:hover .grip {
    opacity: 0.9;
  }
  .sname {
    flex: 1;
    min-width: 0;
    height: 100%;
    padding: 0 4px;
    border: 0;
    background: none;
    color: var(--color-ink);
    text-align: left;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    cursor: pointer;
  }
  .sact {
    display: none;
    gap: 0;
  }
  .srow:hover .sact,
  .srow.sel .sact {
    display: flex;
  }
  .add {
    display: flex;
    align-items: center;
    gap: 6px;
    margin: 4px 8px 0;
    padding: 4px 6px;
    border: 0;
    border-radius: var(--r-sm);
    background: none;
    color: var(--color-ink-muted);
    cursor: pointer;
  }
  .add:hover {
    color: var(--color-accent);
    background: var(--color-surface-3);
  }

  /* sezione scelta */
  .field {
    display: flex;
    flex-direction: column;
    gap: 5px;
    padding: 6px 10px;
  }
  .lbl,
  .sub {
    color: var(--color-ink-muted);
    font-size: 11px;
  }
  .sub {
    padding: 8px 10px 2px;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    font-size: 10px;
  }
  .seg {
    display: flex;
    border: 1px solid var(--color-line-strong);
    border-radius: var(--r-md);
    overflow: hidden;
  }
  .seg button {
    flex: 1;
    height: 24px;
    padding: 0 4px;
    border: 0;
    border-right: 1px solid var(--color-line-strong);
    background: var(--color-surface-2);
    color: var(--color-ink-muted);
    cursor: pointer;
    white-space: nowrap;
  }
  .seg button:last-child {
    border-right: 0;
  }
  .seg button.on {
    background: var(--color-accent-soft);
    color: var(--color-ink);
  }
  .seg button:disabled {
    cursor: default;
  }
  .seg.off {
    opacity: 0.5;
  }
  .row-act {
    display: flex;
    gap: 2px;
  }
  .hint {
    margin: 4px 10px;
    color: var(--color-ink-subtle);
    line-height: 1.45;
  }
  .hint.pad {
    margin: 0 4px;
  }
  .err {
    margin: 2px 10px;
    color: var(--color-danger);
  }

  /* dati */
  .ds {
    padding: 6px 0 2px;
    border-top: 1px solid var(--color-line);
    margin-top: 4px;
  }
  .ds-h {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 0 10px 4px;
    color: var(--color-ink-muted);
  }
  .gridwrap {
    overflow-x: auto;
    margin: 0 8px;
  }
  .grid {
    width: 100%;
    table-layout: fixed;
    border-collapse: collapse;
    font-size: 12px;
  }
  .grid .tool {
    width: 20px;
  }
  .grid th,
  .grid td {
    padding: 0;
    border: 1px solid var(--color-line);
  }
  .grid th {
    background: var(--color-surface-2);
  }
  .grid .tool {
    border: 0;
    background: none;
  }
  .hcell {
    display: flex;
    align-items: center;
  }
  .grid input {
    width: 100%;
    min-width: 0;
    height: 22px;
    padding: 0 5px;
    border: 0;
    background: none;
    color: var(--color-ink);
    font: inherit;
    outline: none;
  }
  .grid th input {
    font-weight: 600;
  }
  .grid input.num {
    text-align: right;
    font-variant-numeric: tabular-nums;
  }
  .grid input:focus {
    background: var(--color-accent-soft);
  }
  .x {
    width: 18px;
    height: 18px;
    display: grid;
    place-items: center;
    flex: 0 0 auto;
    border: 0;
    border-radius: var(--r-xs);
    background: none;
    color: var(--color-ink-subtle);
    cursor: pointer;
  }
  .x:hover {
    color: var(--color-danger);
    background: var(--color-surface-3);
  }
  .x.add-col:hover {
    color: var(--color-accent);
  }

  /* stile */
  .tok {
    display: flex;
    align-items: center;
    gap: 6px;
    height: 28px;
    padding: 0 10px;
  }
  .tname {
    flex: 0 0 92px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    color: var(--color-ink-muted);
    font-family: var(--font-mono);
    font-size: 11px;
  }
  .swatch {
    flex: 0 0 auto;
    width: 22px;
    height: 22px;
    padding: 0;
    border: 1px solid var(--color-line-strong);
    border-radius: var(--r-sm);
    background: none;
    cursor: pointer;
  }
  .swatch::-webkit-color-swatch-wrapper {
    padding: 2px;
  }
  .swatch::-webkit-color-swatch {
    border: 0;
    border-radius: 2px;
  }
  .tval {
    flex: 1;
    min-width: 0;
    height: 22px;
    padding: 0 6px;
    border: 1px solid var(--color-line);
    border-radius: var(--r-sm);
    background: var(--color-surface-2);
    color: var(--color-ink);
    font-family: var(--font-mono);
    font-size: 11px;
    outline: none;
  }
  .tval:focus {
    border-color: var(--color-accent);
  }

  /* problemi */
  .plist {
    list-style: none;
    margin: 0;
    padding: 2px 10px;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .plist li {
    display: grid;
    grid-template-columns: 14px auto 1fr;
    gap: 6px;
    align-items: start;
    line-height: 1.4;
  }
  .plist li :global(svg) {
    margin-top: 2px;
  }
  .plist li.error {
    color: var(--color-danger);
  }
  .plist li.warning {
    color: var(--color-warning);
  }
  .plist li.info {
    color: var(--color-ink-subtle);
  }
  .rule {
    font-family: var(--font-mono);
    font-size: 10px;
    padding: 1px 4px;
    border-radius: var(--r-xs);
    background: var(--color-surface-3);
    color: var(--color-ink-muted);
  }
  .msg {
    color: var(--color-ink);
  }
  .pact {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    padding: 8px 10px 2px;
  }
  code {
    font-family: var(--font-mono);
  }
</style>
