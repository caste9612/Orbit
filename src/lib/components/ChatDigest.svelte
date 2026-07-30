<script lang="ts">
  // Digest di una CHAT intera (sessione): tutti i prompt in ordine cronologico, raggruppati per
  // step (unità di lavoro) con l'esito di ciascuno (churn, commit). Complementare a UnitDigest:
  // qui l'atomo è la conversazione — coerente col resume, che riprende SOLO la sessione intera.
  import Icon from "./Icon.svelte";
  import {
    repoName,
    kindColor,
    sessionColor,
    sessionLabel,
    OP_COLOR,
    type WorkUnit,
  } from "../state/activity.svelte";
  import { workspace } from "../state/workspace.svelte";
  import { resumeClaude } from "../state/claude.svelte";
  import { addFolder, openFromList } from "../state/folders.svelte";
  import { relativeTime } from "../util";

  // unità della chat, dalla più recente (stesso ordine del feed); qui le mostriamo in ordine di lettura
  let { units }: { units: WorkUnit[] } = $props();

  const newest = $derived(units[0]);
  const ordered = $derived([...units].reverse()); // cronologico: dal primo prompt all'ultimo
  const live = $derived(units.some((u) => u.live));
  const totals = $derived.by(() => {
    let add = 0,
      del = 0,
      prompts = 0,
      commits = 0;
    for (const u of units) {
      add += u.add;
      del += u.del;
      prompts += u.prompts.length;
      if (u.commit) commits++;
    }
    return { add, del, prompts, commits };
  });
  const pct = $derived.by(() => {
    const tot = totals.add + totals.del || 1;
    return { a: (totals.add / tot) * 100, d: (totals.del / tot) * 100 };
  });

  function when(end: string): string {
    const ms = Date.parse(end);
    return isNaN(ms) ? end : relativeTime(Math.floor(ms / 1000));
  }
  function hhmm(end: string): string {
    const d = new Date(end);
    if (isNaN(+d)) return "";
    const p = (n: number) => String(n).padStart(2, "0");
    return `${p(d.getHours())}:${p(d.getMinutes())}`;
  }
  // "quando è iniziata": giorno+ora compatti (distingue due chat con lo stesso titolo).
  function startLabel(start: string | undefined): string {
    if (!start) return "?";
    const d = new Date(start);
    if (isNaN(+d)) return start;
    return d.toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
  }

  async function resume() {
    const u = newest;
    if (!u?.sessionId) return;
    if (u.repo && u.repo !== workspace.rootPath) {
      addFolder(u.repo);
      await openFromList(u.repo); // porta sul repo della chat (drop se sparito)
      if (workspace.rootPath !== u.repo) return; // switch fallito
    }
    await resumeClaude(u.sessionId);
  }
</script>

{#if !newest}
  <div class="pad">Can't render this chat.</div>
{:else}
  <div class="digest">
    <div class="chip" title="Chat">
      <span class="sdot" style="background:{sessionColor(newest.sessionId)}"></span>
      chat
    </div>
    <h2 class="title">{sessionLabel(newest)}</h2>
    <div class="meta">
      <span>{repoName(newest.repo)}</span>
      <span class="sep">·</span>
      <span class="branch"><Icon name="git-branch" size={11} strokeWidth={1.8} />{newest.branch}</span>
      <span class="sep">·</span>
      <span>started {startLabel(ordered[0]?.start)}</span>
      <span class="sep">·</span>
      <span>{live ? "active now" : `last activity ${when(newest.end)}`}</span>
      <span class="sep">·</span>
      <span>{totals.prompts} {totals.prompts === 1 ? "prompt" : "prompts"} in {units.length} {units.length === 1 ? "step" : "steps"}</span>
    </div>

    <div class="churn">
      <div class="bar"><div style="width:{pct.a}%;background:{OP_COLOR.A}"></div><div style="width:{pct.d}%;background:{OP_COLOR.D}"></div></div>
      <span class="nums"><span style="color:{OP_COLOR.A}">+{totals.add}</span> <span style="color:{OP_COLOR.D}">−{totals.del}</span></span>
      <span class="commits" class:none={!totals.commits}>
        <Icon name="git-commit" size={12} strokeWidth={1.7} />
        {totals.commits} {totals.commits === 1 ? "commit" : "commits"}
      </span>
      <button class="resume" onclick={resume}><Icon name="play" size={12} strokeWidth={2} />Resume this chat</button>
    </div>

    <section>
      <div class="sh">Conversation <span class="ct">{totals.prompts} prompts</span></div>
      <ol class="steps">
        {#each ordered as u (u.id)}
          <li class="step" style="--sc:{sessionColor(u.sessionId)}">
            <div class="stephead">
              <span class="st">{hhmm(u.end)}</span>
              <span class="sk" style="color:{kindColor(u.kind)}">{u.kind}</span>
              {#if u.commit}
                <span class="shash">{u.commit}</span>
              {:else if u.live}
                <span class="slive">live</span>
              {/if}
            </div>
            {#if u.prompts.length}
              <ul class="plist">
                {#each u.prompts as pr, i (i)}
                  <li>{pr}</li>
                {/each}
              </ul>
            {:else}
              <div class="noprompt">{u.label}</div>
            {/if}
            {#if u.files.length || u.add || u.del}
              <div class="stepft">
                <span>{u.files.length} {u.files.length === 1 ? "file" : "files"}</span>
                {#if u.add}<span style="color:{OP_COLOR.A}">+{u.add}</span>{/if}
                {#if u.del}<span style="color:{OP_COLOR.D}">−{u.del}</span>{/if}
              </div>
            {/if}
          </li>
        {/each}
      </ol>
    </section>
  </div>
{/if}

<style>
  .digest {
    height: 100%;
    overflow-y: auto;
    padding: 18px 20px 28px;
    max-width: 900px;
  }
  .pad {
    padding: 20px;
    color: var(--color-ink-muted);
  }
  .chip {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    padding: 2px 8px;
    border-radius: 5px;
    margin-bottom: 9px;
    color: var(--color-ink-muted);
    background: var(--color-surface-3);
  }
  .sdot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    flex: 0 0 auto;
  }
  .title {
    margin: 0 0 9px;
    font-size: 19px;
    font-weight: 680;
    line-height: 1.25;
    text-wrap: balance;
  }
  .meta {
    display: flex;
    align-items: center;
    gap: 9px;
    flex-wrap: wrap;
    color: var(--color-ink-muted);
    font-size: 12px;
  }
  .meta .sep {
    color: var(--color-ink-subtle);
  }
  .branch {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    font-family: var(--font-mono);
    font-size: 11.5px;
  }
  .churn {
    display: flex;
    align-items: center;
    gap: 11px;
    margin: 16px 0 4px;
  }
  .bar {
    flex: 0 1 230px;
    height: 7px;
    border-radius: 4px;
    overflow: hidden;
    display: flex;
    background: var(--color-surface-3);
  }
  .nums {
    font-family: var(--font-mono);
    font-size: 12px;
    color: var(--color-ink-muted);
  }
  .commits {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    font-family: var(--font-mono);
    font-size: 11.5px;
    color: #bcd;
  }
  .commits.none {
    color: var(--color-ink-subtle);
  }
  .resume {
    margin-left: auto;
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 4px 12px;
    background: var(--color-accent);
    border: 0;
    border-radius: 7px;
    color: #08111f;
    font-size: 12px;
    font-weight: 600;
    cursor: pointer;
  }
  .resume:hover {
    filter: brightness(1.08);
  }
  section {
    margin-top: 20px;
  }
  .sh {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 10px;
    font-weight: 600;
    letter-spacing: 0.09em;
    text-transform: uppercase;
    color: var(--color-ink-subtle);
    margin-bottom: 10px;
  }
  .sh .ct {
    font-family: var(--font-mono);
    letter-spacing: 0;
    text-transform: none;
    color: var(--color-ink-muted);
  }
  .steps {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 12px;
  }
  .step {
    position: relative;
    padding: 7px 10px 7px 14px;
    border-radius: 8px;
    background: var(--color-surface-2);
    border: 1px solid var(--color-line);
  }
  .step::before {
    content: "";
    position: absolute;
    left: 0;
    top: 8px;
    bottom: 8px;
    width: 3px;
    border-radius: 3px;
    background: var(--sc);
    opacity: 0.75;
  }
  .stephead {
    display: flex;
    align-items: center;
    gap: 9px;
    margin-bottom: 4px;
  }
  .st {
    font-family: var(--font-mono);
    font-size: 10px;
    font-variant-numeric: tabular-nums;
    color: var(--color-ink-subtle);
  }
  .sk {
    font-size: 9px;
    font-weight: 700;
    letter-spacing: 0.05em;
    text-transform: uppercase;
  }
  .shash {
    margin-left: auto;
    font-family: var(--font-mono);
    font-size: 10.5px;
    color: #9fc2e8;
  }
  .slive {
    margin-left: auto;
    font-size: 10px;
    color: #8fdcab;
  }
  .plist {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .plist li {
    font-size: 12.5px;
    color: var(--color-ink);
    line-height: 1.45;
    white-space: pre-wrap;
    overflow-wrap: anywhere;
  }
  .plist li + li {
    border-top: 1px dashed var(--color-line);
    padding-top: 6px;
  }
  .noprompt {
    font-size: 12px;
    color: var(--color-ink-muted);
    font-style: italic;
  }
  .stepft {
    display: flex;
    align-items: center;
    gap: 9px;
    margin-top: 6px;
    font-family: var(--font-mono);
    font-size: 10.5px;
    color: var(--color-ink-subtle);
  }
</style>
