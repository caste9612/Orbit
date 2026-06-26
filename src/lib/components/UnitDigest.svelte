<script lang="ts">
  // Digest di un'UNITÀ DI LAVORO, mostrato come tab nell'area editor. Riceve l'unità serializzata
  // (JSON) nel `content` del documento (kind "unit"). File cliccabili → si aprono in una tab;
  // "resume" riprende la sessione Claude (passando prima sul repo giusto, dato che il feed è globale).
  import Icon from "./Icon.svelte";
  import { repoName, kindColor, OP_COLOR, type WorkUnit, type UnitFile } from "../state/activity.svelte";
  import { workspace, openFile } from "../state/workspace.svelte";
  import { resumeClaude } from "../state/claude.svelte";
  import { addFolder, openFromList } from "../state/folders.svelte";
  import { relativeTime } from "../util";

  let { unit }: { unit: WorkUnit } = $props();

  function when(end: string): string {
    const ms = Date.parse(end);
    return isNaN(ms) ? end : relativeTime(Math.floor(ms / 1000));
  }
  function counts(u: WorkUnit) {
    let a = 0,
      m = 0,
      d = 0;
    for (const f of u.files) {
      if (f.op === "A") a++;
      else if (f.op === "M") m++;
      else d++;
    }
    return { a, m, d };
  }
  function pct(u: WorkUnit) {
    const tot = u.add + u.del || 1;
    return { a: (u.add / tot) * 100, d: (u.del / tot) * 100 };
  }
  function fileName(p: string): string {
    return p.split(/[\\/]/).filter(Boolean).pop() ?? p;
  }

  async function resume(u: WorkUnit) {
    if (!u.sessionId) return;
    if (u.repo && u.repo !== workspace.rootPath) {
      addFolder(u.repo);
      await openFromList(u.repo); // porta sul repo dell'unità (drop se sparito)
      if (workspace.rootPath !== u.repo) return; // switch fallito
    }
    await resumeClaude(u.sessionId);
  }
</script>

{#if !unit}
  <div class="pad">Can't render this work unit.</div>
{:else}
  {@const c = counts(unit)}
  {@const p = pct(unit)}
  <div class="digest">
    <span class="kind" style="color:{kindColor(unit.kind)};background:{kindColor(unit.kind)}1f">{unit.kind}</span>
    <h2 class="title">{unit.label}</h2>
    <div class="meta">
      <span class="dot" style="background:{kindColor(unit.kind)}"></span>
      <span>{repoName(unit.repo)}</span>
      <span class="sep">·</span>
      <span class="branch"><Icon name="git-branch" size={11} strokeWidth={1.8} />{unit.branch}</span>
      <span class="sep">·</span>
      <span>{when(unit.end)}</span>
      <span class="sep">·</span>
      <span>{unit.prompts.length} {unit.prompts.length === 1 ? "step" : "steps"}</span>
    </div>

    <div class="churn">
      <div class="bar"><div style="width:{p.a}%;background:{OP_COLOR.A}"></div><div style="width:{p.d}%;background:{OP_COLOR.D}"></div></div>
      <span class="nums"><span style="color:{OP_COLOR.A}">+{unit.add}</span> <span style="color:{OP_COLOR.D}">−{unit.del}</span></span>
      {#if unit.commit}
        <span class="commit"><Icon name="git-commit" size={12} strokeWidth={1.7} />committed · {unit.commit}</span>
      {:else if unit.live}
        <span class="commit wip">in progress</span>
      {:else}
        <span class="commit wip">uncommitted</span>
      {/if}
    </div>

    <div class="ctx">
      <span class="dot" style="background:{kindColor(unit.kind)}"></span>
      <span class="ttl">part of session “{unit.sessionTitle || unit.sessionId.slice(0, 8)}”</span>
      <button class="lnk" onclick={() => resume(unit)}>resume</button>
    </div>

    {#if unit.prompts.length}
      <section>
        <div class="sh">Prompts <span class="ct">{unit.prompts.length}</span></div>
        <ol class="plist">
          {#each unit.prompts as pr, i (i)}
            <li>{pr}</li>
          {/each}
        </ol>
      </section>
    {/if}

    <section>
      <div class="sh">Files <span class="ct">{[c.a && `${c.a} new`, c.m && `${c.m} modified`, c.d && `${c.d} deleted`].filter(Boolean).join(" · ")}</span></div>
      {#if unit.files.length === 0}
        <div class="none">No files changed.</div>
      {:else}
        {#each unit.files as f (f.path)}
          <button class="frow" title={f.path} onclick={() => openFile(f.path)}>
            <span class="op" style="color:{OP_COLOR[f.op]};background:{OP_COLOR[f.op]}1f">{f.op}</span>
            <span class="fp">{fileName(f.path)}{#if f.userModified}<span class="um">edited by hand</span>{/if}</span>
            <span class="delta">
              {#if f.add}<span style="color:{OP_COLOR.A}">+{f.add}</span>{/if}
              {#if f.del}<span style="color:{OP_COLOR.D}">−{f.del}</span>{/if}
            </span>
          </button>
        {/each}
      {/if}
    </section>

    {#if unit.cmds.length}
      <section>
        <div class="sh">Commands <span class="ct">{unit.cmds.length}</span></div>
        {#each unit.cmds as cmd, i (i)}
          <div class="crow"><span class="pr">$</span><span class="cmd">{cmd}</span></div>
        {/each}
      </section>
    {/if}

    <div class="foot">
      <Icon name="history" size={15} strokeWidth={1.6} />
      <span>File history is available: Claude keeps a backup of every version it touched (<code>~/.claude/file-history/</code>) — a diff or restore per version can be added here.</span>
    </div>
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
  .kind {
    display: inline-block;
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    padding: 2px 7px;
    border-radius: 5px;
    margin-bottom: 9px;
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
  .meta .dot {
    width: 9px;
    height: 9px;
    border-radius: 50%;
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
  .commit {
    margin-left: auto;
    display: inline-flex;
    align-items: center;
    gap: 6px;
    font-family: var(--font-mono);
    font-size: 11.5px;
    color: #bcd;
    background: #1d2733;
    border: 1px solid #2e4258;
    padding: 3px 9px;
    border-radius: 7px;
  }
  .commit.wip {
    color: #e0a45e;
    background: #2c2310;
    border-color: #4a3a1c;
  }
  .ctx {
    display: flex;
    align-items: center;
    gap: 8px;
    margin: 14px 0 2px;
    padding: 8px 11px;
    border-radius: 8px;
    background: var(--color-surface-2);
    border: 1px solid var(--color-line);
    color: var(--color-ink-muted);
    font-size: 12px;
  }
  .ctx .dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    flex: 0 0 auto;
  }
  .ctx .ttl {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .ctx .lnk {
    margin-left: auto;
    flex: 0 0 auto;
    background: transparent;
    border: 0;
    color: var(--color-accent);
    cursor: pointer;
    font-size: 12px;
    padding: 2px 4px;
  }
  .ctx .lnk:hover {
    text-decoration: underline;
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
    margin-bottom: 8px;
  }
  .sh .ct {
    font-family: var(--font-mono);
    letter-spacing: 0;
    text-transform: none;
    color: var(--color-ink-muted);
  }
  .none {
    color: var(--color-ink-subtle);
    font-size: 12px;
    padding: 2px 8px;
  }
  .frow {
    display: grid;
    grid-template-columns: 20px 1fr auto;
    align-items: center;
    gap: 10px;
    width: 100%;
    text-align: left;
    background: transparent;
    border: 0;
    border-radius: 7px;
    padding: 6px 8px;
    cursor: pointer;
    color: var(--color-ink);
  }
  .frow:hover {
    background: var(--color-surface-3);
  }
  .op {
    width: 20px;
    height: 19px;
    display: grid;
    place-items: center;
    border-radius: 5px;
    font-family: var(--font-mono);
    font-size: 11px;
    font-weight: 700;
  }
  .fp {
    font-family: var(--font-mono);
    font-size: 12px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    min-width: 0;
  }
  .um {
    margin-left: 8px;
    font-family: var(--font-sans);
    font-size: 10px;
    color: #e0a45e;
    border: 1px solid #4a3a1c;
    border-radius: 5px;
    padding: 0 5px;
  }
  .delta {
    font-family: var(--font-mono);
    font-size: 11.5px;
    display: inline-flex;
    gap: 9px;
  }
  .crow {
    display: flex;
    gap: 10px;
    padding: 6px 8px;
    border-radius: 7px;
    font-family: var(--font-mono);
    font-size: 12px;
  }
  .crow:hover {
    background: var(--color-surface-3);
  }
  .crow .pr {
    color: var(--color-accent-2, #8b6cff);
    flex: 0 0 auto;
  }
  .crow .cmd {
    color: var(--color-ink);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    min-width: 0;
  }
  .plist {
    margin: 0;
    padding-left: 22px;
    display: flex;
    flex-direction: column;
    gap: 7px;
  }
  .plist li {
    font-size: 12.5px;
    color: var(--color-ink);
    line-height: 1.4;
  }
  .foot {
    margin-top: 22px;
    padding: 11px 12px;
    border: 1px dashed var(--color-line);
    border-radius: 9px;
    display: flex;
    gap: 10px;
    align-items: flex-start;
    color: var(--color-ink-subtle);
    font-size: 11.5px;
    line-height: 1.5;
  }
  .foot :global(svg) {
    color: var(--color-accent);
    flex: 0 0 auto;
    margin-top: 1px;
  }
  .foot code {
    font-family: var(--font-mono);
    color: var(--color-ink-muted);
  }
</style>
