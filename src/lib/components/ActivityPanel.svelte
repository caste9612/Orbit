<script lang="ts">
  // Pannello di controllo dell'Attività (sidebar piccola): elenco dei progetti visti nell'attività,
  // con interruttore on/off (toglie il rumore, scelta persistita) e mini-statistiche (oggi, live,
  // pallino "aspetta input"). La board grande (timeline) vive nell'area editor.
  import Icon from "./Icon.svelte";
  import { activity, loadActivity, repoName, isRepoEnabled, toggleRepo, repoStats, isDismissed, dismissProject } from "../state/activity.svelte";
  import { repoNeedsAttention } from "../state/terminals.svelte";

  $effect(() => {
    void loadActivity();
  });

  // tutti i repo presenti nell'attività, ordinati per attività più recente
  const repos = $derived.by(() => {
    const last = new Map<string, string>();
    for (const u of activity.units) {
      const cur = last.get(u.repo);
      if (!cur || u.end > cur) last.set(u.repo, u.end);
    }
    return [...last.entries()].sort((a, b) => b[1].localeCompare(a[1])).map(([r]) => r).filter((r) => !isDismissed(r));
  });
</script>

<div class="panel">
  <p class="hint">Toggle a project off to remove its noise from Activity.</p>
  <div class="list">
    {#each repos as r (r)}
      {@const st = repoStats(r)}
      {@const on = isRepoEnabled(r)}
      <div class="row" class:off={!on}>
        <button
          class="tg"
          class:on
          role="switch"
          aria-checked={on}
          title={on ? "Hide from Activity" : "Show in Activity"}
          onclick={() => toggleRepo(r)}
        >
          <span class="knob"></span>
        </button>
        <button class="name" title={r} onclick={() => toggleRepo(r)}>{repoName(r)}</button>
        <span class="meta">
          {#if repoNeedsAttention(r)}<span class="attn" title="A terminal here is waiting for you"></span>{/if}
          {#if st.live}<span class="live" title="{st.live} active now">●{st.live}</span>{/if}
          <span class="today" title="{st.today} work units today">{st.today}</span>
        </span>
        <button class="rm" title="Remove from list (keeps the files on disk)" aria-label="Remove from Activity" onclick={() => dismissProject(r)}>
          <Icon name="x" size={12} strokeWidth={2} />
        </button>
      </div>
    {/each}
    {#if repos.length === 0}
      <div class="empty">
        <Icon name="activity" size={20} strokeWidth={1.5} />
        <p>No activity yet.</p>
      </div>
    {/if}
  </div>
</div>

<style>
  .panel {
    height: 100%;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }
  .hint {
    flex: 0 0 auto;
    margin: 0;
    padding: 8px 10px 6px;
    font-size: 11px;
    color: var(--color-ink-subtle);
    line-height: 1.4;
  }
  .list {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    padding: 0 6px 12px;
    display: flex;
    flex-direction: column;
    gap: 1px;
  }
  .row {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 5px 6px;
    border-radius: 6px;
  }
  .row:hover {
    background: var(--color-surface-3);
  }
  .row.off {
    opacity: 0.5;
  }
  .tg {
    flex: 0 0 auto;
    width: 26px;
    height: 16px;
    border-radius: 9px;
    border: 0;
    background: var(--color-surface-4, #3a3d44);
    cursor: pointer;
    position: relative;
    transition: background 120ms ease;
    padding: 0;
  }
  .tg.on {
    background: var(--color-accent);
  }
  .knob {
    position: absolute;
    top: 2px;
    left: 2px;
    width: 12px;
    height: 12px;
    border-radius: 50%;
    background: #fff;
    transition: transform 120ms ease;
  }
  .tg.on .knob {
    transform: translateX(10px);
  }
  .name {
    flex: 1;
    min-width: 0;
    text-align: left;
    background: transparent;
    border: 0;
    color: var(--color-ink);
    font-size: 12.5px;
    cursor: pointer;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    padding: 0;
  }
  .meta {
    flex: 0 0 auto;
    display: inline-flex;
    align-items: center;
    gap: 8px;
    font-family: var(--font-mono);
    font-size: 11px;
    color: var(--color-ink-subtle);
  }
  .attn {
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: #e0a45e;
  }
  .live {
    color: #5bc88a;
  }
  .today {
    min-width: 14px;
    text-align: right;
    color: var(--color-ink-muted);
  }
  .rm {
    flex: 0 0 auto;
    width: 20px;
    height: 20px;
    display: grid;
    place-items: center;
    background: transparent;
    border: 0;
    border-radius: 5px;
    color: var(--color-ink-subtle);
    cursor: pointer;
    opacity: 0;
    transition: opacity 90ms ease;
  }
  .row:hover .rm,
  .rm:focus-visible {
    opacity: 1;
  }
  .rm:hover {
    color: var(--color-ink);
    background: var(--color-surface-4, #3a3d44);
  }
  .empty {
    padding: 24px 12px;
    display: flex;
    flex-direction: column;
    gap: 8px;
    align-items: center;
    color: var(--color-ink-muted);
    font-size: 12.5px;
  }
  .empty p {
    margin: 0;
  }
</style>
