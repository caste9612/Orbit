<script lang="ts">
  // Git Graph (area editor, tab kind "gitgraph"): albero branch/commit stile IntelliJ/VS.
  // Colonna del grafo (corsie/merge colorati) + tabella commit (ref, messaggio, autore, data, hash).
  // Click su un commit → apre il diff (git_show) in una tab. Dati da git_graph (tutti i branch).
  import { onMount } from "svelte";
  import Icon from "./Icon.svelte";
  import { git, loadGraph, showCommit } from "../state/git.svelte";
  import { workspace } from "../state/workspace.svelte";
  import { basename } from "../util";
  import { layoutGraph, type Segment } from "../gitgraph";

  const ROW_H = 26;
  const LANE_GAP = 14;
  const LANE_X0 = 12;
  const NODE_R = 4;

  onMount(() => {
    void loadGraph();
  });

  const laid = $derived(layoutGraph(git.graph));
  const cellW = $derived(Math.max(1, laid.maxWidth) * LANE_GAP + 8);

  function xOf(lane: number): number {
    return LANE_X0 + lane * LANE_GAP;
  }
  function topPath(s: Segment): string {
    const xf = xOf(s.from);
    const xt = xOf(s.to);
    if (xf === xt) return `M${xf},0 L${xf},${ROW_H / 2}`;
    return `M${xf},0 C${xf},${ROW_H / 2} ${xt},0 ${xt},${ROW_H / 2}`;
  }
  function botPath(s: Segment): string {
    const xf = xOf(s.from);
    const xt = xOf(s.to);
    if (xf === xt) return `M${xf},${ROW_H / 2} L${xf},${ROW_H}`;
    return `M${xf},${ROW_H / 2} C${xf},${ROW_H} ${xt},${ROW_H / 2} ${xt},${ROW_H}`;
  }
  function relTime(sec: number): string {
    const diff = Date.now() / 1000 - sec;
    if (diff < 60) return "now";
    if (diff < 3600) return `${Math.floor(diff / 60)}m`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
    if (diff < 2592000) return `${Math.floor(diff / 86400)}d`;
    return new Date(sec * 1000).toISOString().slice(0, 10);
  }
  function isHead(refs: { kind: string }[]): boolean {
    return refs.some((r) => r.kind === "head");
  }
</script>

<div class="board">
  <header class="head">
    <div class="title">
      <Icon name="git-branch" size={15} strokeWidth={1.8} />
      <span>Git Graph</span>
      {#if workspace.rootName}<span class="repo">{workspace.rootName}</span>{/if}
      {#if git.branch}<span class="branch">{git.branch}</span>{/if}
    </div>
    <div class="tools">
      <span class="count">{git.graph.length} commits</span>
      <button class="ic" class:spin={git.graphLoading} title="Refresh" aria-label="Refresh" onclick={() => loadGraph()}>
        <Icon name="refresh" size={14} strokeWidth={1.8} />
      </button>
    </div>
  </header>

  {#if git.graph.length === 0}
    <div class="empty">
      {#if git.graphLoading}Loading…{:else if !git.isRepo}Not a git repository.{:else}No commits yet.{/if}
    </div>
  {:else}
    <div class="rows" style="--cellw:{cellW}px">
      {#each laid.rows as r (r.commit.id)}
        <button class="row" onclick={() => showCommit(r.commit)} title={r.commit.summary}>
          <span class="gcell">
            <svg width={cellW} height={ROW_H} viewBox="0 0 {cellW} {ROW_H}" aria-hidden="true">
              {#each r.top as s}<path d={topPath(s)} stroke={s.color} fill="none" stroke-width="1.6" />{/each}
              {#each r.bottom as s}<path d={botPath(s)} stroke={s.color} fill="none" stroke-width="1.6" />{/each}
              {#if isHead(r.commit.refs)}
                <circle cx={xOf(r.col)} cy={ROW_H / 2} r={NODE_R + 2} fill="none" stroke={r.color} stroke-width="1.5" />
              {/if}
              <circle
                cx={xOf(r.col)}
                cy={ROW_H / 2}
                r={NODE_R}
                fill={r.merge ? "var(--color-surface-1)" : r.color}
                stroke={r.color}
                stroke-width="1.6"
              />
            </svg>
          </span>

          <span class="main">
            {#each r.commit.refs as ref}
              <span class="ref {ref.kind}">{ref.name}</span>
            {/each}
            <span class="summary">{r.commit.summary || "(no message)"}</span>
          </span>
          <span class="author">{r.commit.author}</span>
          <span class="date">{relTime(r.commit.time)}</span>
          <span class="hash">{r.commit.short}</span>
        </button>
      {/each}
    </div>
  {/if}
</div>

<style>
  .board {
    display: flex;
    flex-direction: column;
    height: 100%;
    background: var(--color-surface-1);
    color: var(--color-ink);
    overflow: hidden;
  }
  .head {
    flex: 0 0 auto;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    padding: 8px 12px;
    border-bottom: 1px solid var(--color-line);
  }
  .title {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 13px;
    font-weight: 600;
  }
  .repo {
    color: var(--color-ink-muted);
    font-weight: 500;
  }
  .branch {
    font-size: 11px;
    font-weight: 500;
    color: var(--color-accent);
    background: color-mix(in srgb, var(--color-accent) 14%, transparent);
    padding: 1px 7px;
    border-radius: 999px;
  }
  .tools {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .count {
    font-size: 11px;
    color: var(--color-ink-subtle);
    font-variant-numeric: tabular-nums;
  }
  .ic {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 26px;
    height: 24px;
    background: transparent;
    border: 0;
    border-radius: 5px;
    color: var(--color-ink-muted);
    cursor: pointer;
  }
  .ic:hover {
    background: var(--color-surface-3);
    color: var(--color-ink);
  }
  .ic.spin {
    color: var(--color-accent);
    animation: sp 0.9s linear infinite;
  }
  @keyframes sp {
    to {
      transform: rotate(360deg);
    }
  }

  .empty {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--color-ink-subtle);
    font-size: 12.5px;
  }

  .rows {
    flex: 1;
    overflow: auto;
    padding: 4px 0;
  }
  .row {
    display: grid;
    grid-template-columns: var(--cellw) minmax(120px, 1fr) auto auto auto;
    align-items: center;
    gap: 10px;
    width: 100%;
    height: 26px;
    padding: 0 12px 0 0;
    background: transparent;
    border: 0;
    text-align: left;
    color: inherit;
    cursor: pointer;
  }
  .row:hover {
    background: var(--color-surface-3);
  }
  .gcell {
    display: block;
    height: 26px;
  }
  .gcell svg {
    display: block;
  }
  .main {
    display: flex;
    align-items: center;
    gap: 6px;
    min-width: 0;
  }
  .summary {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 12.5px;
  }
  .ref {
    flex: 0 0 auto;
    font-size: 10.5px;
    line-height: 1.4;
    padding: 0 6px;
    border-radius: 999px;
    max-width: 160px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .ref.head {
    color: #fff;
    background: var(--color-accent);
    font-weight: 600;
  }
  .ref.branch {
    color: var(--color-accent);
    border: 1px solid color-mix(in srgb, var(--color-accent) 45%, transparent);
  }
  .ref.remote {
    color: var(--color-ink-muted);
    border: 1px solid var(--color-line-strong);
  }
  .ref.tag {
    color: #e3b341;
    border: 1px solid color-mix(in srgb, #e3b341 45%, transparent);
  }
  .author {
    font-size: 11.5px;
    color: var(--color-ink-muted);
    max-width: 140px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    text-align: right;
  }
  .date {
    font-size: 11px;
    color: var(--color-ink-subtle);
    font-variant-numeric: tabular-nums;
    min-width: 40px;
    text-align: right;
  }
  .hash {
    font-family: var(--font-mono);
    font-size: 11px;
    color: var(--color-ink-subtle);
    min-width: 56px;
    text-align: right;
  }
</style>
