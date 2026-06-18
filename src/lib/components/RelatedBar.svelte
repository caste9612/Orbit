<script lang="ts">
  // Barra dei "correlati" sotto la breadcrumb (Fase 2): mostra il simbolo che contiene il cursore
  // (Tipo › Metodo, cliccabili) e i chip di relazione (implementa/estende + N implementatori).
  // Reattiva al cursore (editorStatus.line) e all'indice. Si nasconde se non c'è contesto.
  import Icon from "./Icon.svelte";
  import KindBadge from "./KindBadge.svelte";
  import { workspace, editorStatus } from "../state/workspace.svelte";
  import { codeIndex, contextAt, jumpTo, showImplementers } from "../state/codeIndex.svelte";
  import { relTo } from "../util";

  let { path }: { path: string } = $props();

  const rel = $derived(relTo(path, workspace.rootPath));
  // la barra esiste (riserva l'altezza) finché il file ha simboli → niente salto di layout;
  // il CONTENUTO appare/scompare col cursore (ctx).
  const hasSymbols = $derived(codeIndex.symbols.some((s) => s.file === rel));
  const ctx = $derived(contextAt(rel, editorStatus.line));
</script>

{#if hasSymbols}
  <div class="relbar">
    {#if ctx}
    <span class="loc">
      {#each ctx.path as seg, i (i)}
        {#if i > 0}<span class="psep"><Icon name="chevron-right" size={11} strokeWidth={2} /></span>{/if}
        <button class="pseg" class:abstract={seg.sym.isAbstract} onclick={() => jumpTo(seg.sym)} title="Go to {seg.name}">
          <KindBadge kind={seg.sym.kind} isAbstract={seg.sym.isAbstract} size={14} />
          <span class="pname">{seg.name}</span>
        </button>
      {/each}
    </span>
    {#if ctx.bases.length || ctx.implementers.length}
      <span class="chips">
        {#each ctx.bases as b (b.name)}
          <button
            class="chip"
            class:dead={!b.def}
            title={b.def ? `Go to ${b.name}` : `${b.name} (not in index)`}
            onclick={() => b.def && jumpTo(b.def)}
          >
            {#if b.def}
              <KindBadge kind={b.def.kind} isAbstract={b.def.isAbstract} size={13} />
            {:else}
              <Icon name="arrow-up" size={11} strokeWidth={2} />
            {/if}
            <span>{b.name}</span>
          </button>
        {/each}
        {#if ctx.implementers.length}
          <button class="chip" title="Show implementers" onclick={() => showImplementers(ctx.path[0].name, ctx.implementers)}>
            <Icon name="git-branch" size={11} strokeWidth={2} />
            <span>{ctx.implementers.length} impl.</span>
          </button>
        {/if}
      </span>
    {/if}
    {/if}
  </div>
{/if}

<style>
  .relbar {
    flex: 0 0 auto;
    height: 24px;
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 0 12px;
    background: var(--color-surface-1);
    border-bottom: 1px solid var(--color-line);
    font-size: 11.5px;
    overflow: hidden;
    white-space: nowrap;
    user-select: none;
  }
  .loc {
    display: inline-flex;
    align-items: center;
    gap: 3px;
    min-width: 0;
    overflow: hidden;
  }
  .pseg {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    background: transparent;
    border: 0;
    color: var(--color-ink-muted);
    font-size: 11.5px;
    cursor: pointer;
    padding: 0 2px;
    white-space: nowrap;
  }
  .pseg:hover {
    color: var(--color-accent);
  }
  .pseg.abstract .pname {
    font-style: italic;
  }
  .psep {
    display: inline-flex;
    color: var(--color-ink-subtle);
    opacity: 0.6;
  }
  .chips {
    margin-left: auto;
    display: inline-flex;
    align-items: center;
    gap: 6px;
    flex: 0 0 auto;
  }
  .chip {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    height: 18px;
    padding: 0 8px;
    background: var(--color-surface-2);
    border: 1px solid var(--color-line);
    border-radius: 9px;
    color: var(--color-ink-muted);
    font-size: 11px;
    cursor: pointer;
    transition:
      color 90ms ease,
      border-color 90ms ease,
      background 90ms ease;
  }
  .chip:hover {
    color: var(--color-accent);
    border-color: color-mix(in srgb, var(--color-accent) 45%, var(--color-line));
    background: var(--color-surface-3);
  }
  .chip.dead {
    cursor: default;
    opacity: 0.55;
  }
  .chip.dead:hover {
    color: var(--color-ink-muted);
    border-color: var(--color-line);
    background: var(--color-surface-2);
  }
</style>
