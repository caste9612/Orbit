<script lang="ts">
  import Icon from "./Icon.svelte";
  import { search, setQuery, openResult } from "../state/search.svelte";
  import { fileIcon, basename } from "../util";

  // spezza il testo evidenziando le occorrenze della query (case-insensitive)
  function parts(text: string, q: string): { t: string; m: boolean }[] {
    if (!q) return [{ t: text, m: false }];
    const out: { t: string; m: boolean }[] = [];
    const lower = text.toLowerCase();
    const lq = q.toLowerCase();
    let i = 0;
    while (i <= text.length) {
      const idx = lower.indexOf(lq, i);
      if (idx === -1) {
        out.push({ t: text.slice(i), m: false });
        break;
      }
      if (idx > i) out.push({ t: text.slice(i, idx), m: false });
      out.push({ t: text.slice(idx, idx + q.length), m: true });
      i = idx + q.length;
    }
    return out;
  }
</script>

<div class="search">
  <div class="box">
    <Icon name="search" size={14} strokeWidth={1.8} />
    <input
      placeholder="Search in project"
      value={search.query}
      oninput={(e) => setQuery(e.currentTarget.value)}
      spellcheck="false"
    />
  </div>

  {#if search.running}
    <div class="info">searching…</div>
  {:else if search.done}
    <div class="info">
      {search.count} results · {search.results.length} files
    </div>
  {/if}

  <div class="results">
    {#each search.results as f (f.path)}
      {@const fi = fileIcon(f.rel)}
      <div class="fhead" title={f.rel}>
        <span class="ic" style="color:{fi.color}"><Icon name={fi.glyph} size={14} strokeWidth={1.7} /></span>
        <span class="fname">{basename(f.rel)}</span>
        <span class="fpath">{f.rel}</span>
        <span class="fcount">{f.matches.length}</span>
      </div>
      {#each f.matches as m (m.line)}
        <button class="match" onclick={() => openResult(f.path, m.line)} title="Line {m.line}">
          <span class="ln">{m.line}</span>
          <span class="mt"
            >{#each parts(m.text, search.query) as p}{#if p.m}<mark>{p.t}</mark>{:else}{p.t}{/if}{/each}</span
          >
        </button>
      {/each}
    {/each}
  </div>
</div>

<style>
  .search {
    display: flex;
    flex-direction: column;
    height: 100%;
    min-height: 0;
  }
  .box {
    display: flex;
    align-items: center;
    gap: 7px;
    margin: 6px 10px 8px;
    padding: 0 9px;
    height: 30px;
    background: var(--color-surface-1);
    border: 1px solid var(--color-line);
    border-radius: var(--radius-sm);
    color: var(--color-ink-subtle);
  }
  .box:focus-within {
    border-color: var(--color-accent);
  }
  input {
    flex: 1;
    min-width: 0;
    background: transparent;
    border: 0;
    outline: none;
    color: var(--color-ink);
    font-family: var(--font-sans);
    font-size: 12.5px;
  }
  .info {
    padding: 0 12px 6px;
    font-size: 11.5px;
    color: var(--color-ink-subtle);
  }
  .results {
    flex: 1;
    overflow: auto;
    min-height: 0;
  }
  .fhead {
    display: flex;
    align-items: center;
    gap: 7px;
    padding: 4px 12px;
    font-size: 12.5px;
    color: var(--color-ink);
    position: sticky;
    top: 0;
    background: var(--color-surface-2);
  }
  .fname {
    font-weight: 600;
    flex: 0 0 auto;
  }
  .fpath {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    color: var(--color-ink-subtle);
    font-size: 11px;
  }
  .fcount {
    flex: 0 0 auto;
    color: var(--color-ink-subtle);
    font-size: 11px;
  }
  .match {
    display: flex;
    align-items: baseline;
    gap: 9px;
    width: 100%;
    background: transparent;
    border: 0;
    text-align: left;
    padding: 2px 12px 2px 28px;
    color: var(--color-ink-muted);
    font-family: var(--font-mono);
    font-size: 12px;
    cursor: pointer;
    white-space: pre;
    overflow: hidden;
  }
  .match:hover {
    background: var(--color-surface-3);
    color: var(--color-ink);
  }
  .ln {
    flex: 0 0 auto;
    min-width: 28px;
    text-align: right;
    color: var(--color-ink-subtle);
    font-size: 11px;
  }
  .mt {
    overflow: hidden;
    text-overflow: ellipsis;
  }
  mark {
    background: rgba(var(--accent-rgb), 0.32);
    color: #eaf2ff;
    border-radius: 2px;
  }
</style>
