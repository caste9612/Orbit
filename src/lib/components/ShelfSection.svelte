<script lang="ts">
  // Sezione «Shelf» in fondo all'Explorer: le cartelle messe nello scaffale, per categoria, e le regole per
  // nome. Condivisa dalla vista a cartelle e dalla vista Solution (M72: nella Solution le cartelle sparivano
  // da «Other files» senza un posto dove ritrovarle).
  import Icon from "./Icon.svelte";
  import MiniTree from "./MiniTree.svelte";
  import ShelfPicker from "./ShelfPicker.svelte";
  import { shelfUi, byCategory, shelfCount, unshelveName } from "../state/shelf.svelte";
  import { workspace } from "../state/workspace.svelte";
  import { joinPath, pathKey } from "../util";

  let items = $derived(byCategory());
  let count = $derived(shelfCount());
  let picker = $state<{ x: number; y: number; absPath: string } | null>(null);

  function baseRel(rel: string): string {
    const i = rel.lastIndexOf("/");
    return i < 0 ? rel : rel.slice(i + 1);
  }

  function openPicker(e: MouseEvent, absPath: string) {
    e.preventDefault();
    e.stopPropagation();
    picker = { x: e.clientX, y: e.clientY, absPath };
  }
</script>

{#if items.length}
  <div class="shelf">
    <button class="shelf-head" onclick={() => (shelfUi.collapsed = !shelfUi.collapsed)}>
      <span class="chev" class:open={!shelfUi.collapsed}><Icon name="chevron-right" size={13} strokeWidth={2} /></span>
      <Icon name="archive" size={13} strokeWidth={1.7} />
      <span class="shelf-ttl">Shelf</span>
      <span class="shelf-count">{count}</span>
    </button>
    {#if !shelfUi.collapsed}
      <div class="shelf-body">
        {#each items as cat (cat.category)}
          <button class="cat-head" onclick={() => (shelfUi.cats[cat.category] = !shelfUi.cats[cat.category])}>
            <span class="chev" class:open={shelfUi.cats[cat.category]}><Icon name="chevron-right" size={12} strokeWidth={2} /></span>
            <span class="cat-name">{cat.category}</span>
            <span class="cat-count">{cat.folders.length + cat.names.length}</span>
          </button>
          {#if shelfUi.cats[cat.category]}
            {#each cat.names as nm (nm)}
              <div class="srule" title="Rule: hides every folder named “{nm}”">
                <span class="ic"><Icon name="archive" size={13} strokeWidth={1.6} /></span>
                <span class="sfname">{nm}</span>
                <span class="spath">all folders</span>
                <button class="rule-x" title="Remove the rule for “{nm}”" aria-label="Remove rule" onclick={() => unshelveName(nm)}>
                  <Icon name="x" size={12} strokeWidth={2} />
                </button>
              </div>
            {/each}
            {#each cat.folders as rel (rel)}
              {@const abs = joinPath(workspace.rootPath ?? "", rel)}
              {@const key = pathKey(abs)}
              <button class="sfolder" onclick={() => (shelfUi.folders[key] = !shelfUi.folders[key])} oncontextmenu={(e) => openPicker(e, abs)} title={rel}>
                <span class="chev" class:open={shelfUi.folders[key]}><Icon name="chevron-right" size={12} strokeWidth={2} /></span>
                <span class="ic dir"><Icon name="folder" size={14} strokeWidth={1.6} /></span>
                <span class="sfname">{baseRel(rel)}</span>
                <span class="spath">{rel}</span>
              </button>
              {#if shelfUi.folders[key]}
                <MiniTree path={abs} depth={2} />
              {/if}
            {/each}
          {/if}
        {/each}
      </div>
    {/if}
  </div>
{/if}

{#if picker}
  <ShelfPicker x={picker.x} y={picker.y} absPath={picker.absPath} onClose={() => (picker = null)} />
{/if}

<style>
  .shelf {
    flex: 0 0 auto;
    max-height: 45%;
    display: flex;
    flex-direction: column;
    border-top: 1px solid var(--color-line);
    background: var(--color-surface-2);
  }
  .shelf-head {
    display: flex;
    align-items: center;
    gap: 6px;
    height: 26px;
    flex: 0 0 26px;
    padding: 0 8px;
    background: transparent;
    border: 0;
    color: var(--color-ink-muted);
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.05em;
    text-transform: uppercase;
    cursor: pointer;
  }
  .shelf-head:hover {
    color: var(--color-ink);
  }
  .shelf-ttl {
    flex: 1;
    text-align: left;
  }
  .shelf-count {
    font-weight: 700;
    color: var(--color-ink-subtle);
  }
  .shelf-body {
    overflow: auto;
    padding-bottom: 4px;
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
  .cat-head {
    display: flex;
    align-items: center;
    gap: 4px;
    width: 100%;
    height: 22px;
    padding: 0 8px;
    background: transparent;
    border: 0;
    color: var(--color-ink);
    font-size: 12px;
    text-align: left;
    cursor: pointer;
  }
  .cat-head:hover {
    background: var(--color-surface-3);
  }
  .cat-name {
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .cat-count {
    color: var(--color-ink-subtle);
    font-size: 11px;
  }
  .sfolder {
    display: flex;
    align-items: center;
    gap: 3px;
    width: 100%;
    height: 21px;
    padding: 0 8px 0 16px;
    background: transparent;
    border: 0;
    color: var(--color-ink-muted);
    font-size: 12.5px;
    text-align: left;
    white-space: nowrap;
    cursor: pointer;
  }
  .sfolder:hover {
    background: var(--color-surface-3);
    color: var(--color-ink);
  }
  .sfname {
    flex: 0 0 auto;
  }
  .spath {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    color: var(--color-ink-subtle);
    font-size: 11px;
  }
  /* regola-per-nome: come una .sfolder ma senza chevron, con × per rimuoverla */
  .srule {
    display: flex;
    align-items: center;
    gap: 4px;
    width: 100%;
    height: 21px;
    padding: 0 6px 0 16px;
    color: var(--color-ink-muted);
    font-size: 12.5px;
    white-space: nowrap;
  }
  .srule:hover {
    background: var(--color-surface-3);
    color: var(--color-ink);
  }
  .rule-x {
    flex: 0 0 auto;
    display: grid;
    place-items: center;
    width: 18px;
    height: 18px;
    padding: 0;
    border: 0;
    border-radius: var(--r-sm);
    background: transparent;
    color: var(--color-ink-subtle);
    cursor: pointer;
    opacity: 0;
  }
  .srule:hover .rule-x {
    opacity: 1;
  }
  .rule-x:hover {
    background: rgba(241, 76, 76, 0.16);
    color: #ff9b9b;
  }
</style>
