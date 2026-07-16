<script lang="ts">
  // Indicatore d'uso nella status bar: mostra il valore di OGGI (token o $ secondo il toggle) e apre
  // un popover con oggi / 7g / 30g, ripartizione per modello e progetto, efficienza cache e sparkline.
  import { onMount } from "svelte";
  import { fade } from "svelte/transition";
  import Icon from "./Icon.svelte";
  import Backdrop from "./Backdrop.svelte";
  import {
    usage,
    loadUsage,
    startUsageLive,
    setShowCost,
    setBudget,
    setPlanCost,
    planValue,
    windowTotals,
    windowTotal,
    rowsSince,
    byModel,
    byProject,
    daily,
    cacheHitRate,
    fmtTokens,
    fmtCost,
    fmtValue,
    type Slice,
    type Totals,
    type BudgetWindow,
  } from "../state/usage.svelte";

  let open = $state(false);

  onMount(() => {
    void loadUsage(); // scansione iniziale (tutto lo storico; aggregato → payload compatto)
    startUsageLive(); // refresh su activity-changed
  });

  const today = $derived(windowTotals(1));
  const week = $derived(windowTotals(7));
  const month = $derived(windowTotals(30));
  // ripartizioni sulla finestra 30g
  const rows30 = $derived(rowsSince(iso30()));
  const models = $derived(byModel(rows30));
  const projects = $derived(byProject(rows30).slice(0, 6));
  const spark = $derived(daily(14));
  const hit = $derived(cacheHitRate(month));

  // finestre mobili 5h / 7g (stima "quanto sono vicino al limite")
  const w5 = $derived(usage.windows ? windowTotal(usage.windows.window5h) : null);
  const w7 = $derived(usage.windows ? windowTotal(usage.windows.window7d) : null);
  const winRows = $derived([
    { k: "h5" as BudgetWindow, l: "Last 5h", t: w5 },
    { k: "d7" as BudgetWindow, l: "Last 7 days", t: w7 },
  ]);
  function usedOf(t: Totals | null): number {
    return t ? (usage.showCost ? t.cost : t.tokens) : 0;
  }
  function budOf(win: BudgetWindow): number {
    return usage.budgets[usage.showCost ? "cost" : "tokens"][win];
  }
  function fmtVal(v: number): string {
    return usage.showCost ? fmtCost(v) : fmtTokens(v);
  }
  function onBudget(win: BudgetWindow, e: Event): void {
    setBudget(usage.showCost ? "cost" : "tokens", win, Number((e.target as HTMLInputElement).value));
  }

  const pv = $derived(planValue());
  function onPlan(e: Event): void {
    setPlanCost(Number((e.target as HTMLInputElement).value));
  }

  function iso30(): string {
    const d = new Date();
    d.setUTCDate(d.getUTCDate() - 29);
    return d.toISOString().slice(0, 10);
  }

  // valore/etichetta di una slice secondo il toggle attivo
  function sliceVal(s: Slice): string {
    return usage.showCost ? fmtCost(s.cost) : fmtTokens(s.tokens);
  }
  function metric(s: Slice): number {
    return usage.showCost ? s.cost : s.tokens;
  }
  function secondary(t: Totals): string {
    return usage.showCost ? `${fmtTokens(t.tokens)} tok` : fmtCost(t.cost);
  }

  // sparkline: polyline normalizzata su min/max della finestra
  const sparkPath = $derived.by(() => {
    const vals = spark.map((d) => (usage.showCost ? d.cost : d.tokens));
    const max = Math.max(1e-9, ...vals);
    const w = 180;
    const h = 34;
    const n = vals.length;
    if (n <= 1) return "";
    return vals
      .map((v, i) => {
        const x = (i / (n - 1)) * w;
        const y = h - (v / max) * h;
        return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(" ");
  });

  const maxModel = $derived(Math.max(1e-9, ...models.map(metric)));
  const maxProj = $derived(Math.max(1e-9, ...projects.map(metric)));
</script>

<div class="wrap">
  <button
    class="seg"
    class:live={usage.loading}
    title="Claude Code usage — tokens & estimated cost"
    onclick={() => (open = !open)}
  >
    <Icon name="gauge" size={13} strokeWidth={1.8} />
    <span>{usage.loaded ? fmtValue(today) : "—"}</span>
  </button>

  {#if open}
    <Backdrop onClose={() => (open = false)} z={60} />
    <div class="pop" role="dialog" aria-label="Usage" transition:fade={{ duration: 80 }}>
      <div class="head">
        <span class="title">Usage</span>
        <div class="tools">
          <div class="toggle" role="group" aria-label="Show tokens or cost">
            <button class:on={!usage.showCost} onclick={() => setShowCost(false)}>Tokens</button>
            <button class:on={usage.showCost} onclick={() => setShowCost(true)}>$</button>
          </div>
          <button
            class="ic"
            title="Refresh"
            class:spin={usage.loading}
            onclick={() => loadUsage()}
            aria-label="Refresh"
          >
            <Icon name="refresh" size={13} strokeWidth={1.8} />
          </button>
        </div>
      </div>

      <div class="cards">
        {#each [{ l: "Today", t: today }, { l: "7 days", t: week }, { l: "30 days", t: month }] as c (c.l)}
          <div class="card">
            <div class="clabel">{c.l}</div>
            <div class="cval">{usage.showCost ? fmtCost(c.t.cost) : fmtTokens(c.t.tokens)}</div>
            <div class="csub">{secondary(c.t)}</div>
          </div>
        {/each}
      </div>

      <div class="sec plan">
        <div class="planhead">
          <span class="shead">Plan value · 30d</span>
          <input
            class="binput"
            type="number"
            min="0"
            step="any"
            placeholder="$/mo"
            value={usage.planCost || ""}
            oninput={onPlan}
          />
        </div>
        {#if pv}
          <div class="pverdict" class:good={pv.ratio >= 1}>
            {fmtCost(pv.apiEq)} used vs {fmtCost(pv.plan)} plan —
            {#if pv.ratio >= 1}<b>{pv.ratio.toFixed(1)}× value</b>{:else}<b>{Math.round(pv.ratio * 100)}%</b> used{/if}
          </div>
        {:else}
          <div class="phint">Set your plan price to see if it pays off.</div>
        {/if}
      </div>

      {#if usage.windows}
        <div class="sec limits">
          <div class="shead">Limits · estimate</div>
          {#each winRows as w (w.k)}
            {@const used = usedOf(w.t)}
            {@const bud = budOf(w.k)}
            {@const pct = bud > 0 ? used / bud : 0}
            <div class="lim">
              <span class="lname">{w.l}</span>
              <span class="ltrack">
                {#if bud > 0}
                  <span class="lfill" class:warn={pct >= 0.75} class:hot={pct >= 1} style="width:{Math.min(100, pct * 100)}%"></span>
                {/if}
              </span>
              <span class="lused">{fmtVal(used)}{#if bud > 0}<span class="lpct">{Math.round(pct * 100)}%</span>{/if}</span>
              <input
                class="binput"
                type="number"
                min="0"
                step="any"
                placeholder={usage.showCost ? "budget $" : "budget tok"}
                value={bud || ""}
                oninput={(e) => onBudget(w.k, e)}
              />
            </div>
          {/each}
          <div class="note limnote">Estimate from transcripts — not Anthropic's official limits.</div>
        </div>
      {/if}

      {#if spark.some((d) => (usage.showCost ? d.cost : d.tokens) > 0)}
        <div class="spark">
          <div class="srow">
            <span class="shead">Last 14 days</span>
            <span class="ssub">{usage.showCost ? "cost" : "tokens"}/day</span>
          </div>
          <svg viewBox="0 0 180 34" preserveAspectRatio="none" class="schart" aria-hidden="true">
            <path d={sparkPath} fill="none" stroke="var(--color-accent)" stroke-width="1.5" />
          </svg>
        </div>
      {/if}

      {#if models.length}
        <div class="sec">
          <div class="shead">By model · 30d</div>
          {#each models as m (m.key)}
            <div class="bar">
              <span class="bname" title={m.key}>{m.label}</span>
              <span class="btrack"><span class="bfill" style="width:{(metric(m) / maxModel) * 100}%"></span></span>
              <span class="bval">{sliceVal(m)}</span>
            </div>
          {/each}
        </div>
      {/if}

      {#if projects.length}
        <div class="sec">
          <div class="shead">By project · 30d</div>
          {#each projects as p (p.key)}
            <div class="bar">
              <span class="bname" title={p.key}>{p.label}</span>
              <span class="btrack"><span class="bfill alt" style="width:{(metric(p) / maxProj) * 100}%"></span></span>
              <span class="bval">{sliceVal(p)}</span>
            </div>
          {/each}
        </div>
      {/if}

      <div class="foot">
        <span class="cache" title="Share of input tokens served from prompt cache (last 30 days)">
          Cache hit {Math.round(hit * 100)}%
        </span>
        <span class="note">est. API-equivalent · UTC</span>
      </div>

      {#if usage.loaded && usage.rows.length === 0}
        <div class="empty">No Claude Code usage found yet.</div>
      {/if}
    </div>
  {/if}
</div>

<style>
  .wrap {
    position: relative;
    display: inline-flex;
  }
  .seg {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    height: 22px;
    padding: 0 8px;
    background: transparent;
    border: 0;
    border-radius: 4px;
    color: inherit;
    font-size: inherit;
    font-variant-numeric: tabular-nums;
    cursor: pointer;
  }
  .seg:hover {
    background: var(--color-surface-3);
    color: var(--color-ink);
  }
  .seg.live {
    color: var(--color-accent);
  }

  .pop {
    position: absolute;
    bottom: calc(100% + 4px);
    right: 0;
    z-index: 61;
    width: 320px;
    max-height: 74vh;
    overflow: auto;
    padding: 10px;
    background: var(--color-surface-2);
    border: 1px solid var(--color-line-strong);
    border-radius: var(--radius);
    box-shadow: var(--shadow-pop);
    color: var(--color-ink);
    cursor: default;
  }
  .head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 8px;
  }
  .title {
    font-size: 12.5px;
    font-weight: 600;
    letter-spacing: 0.02em;
  }
  .tools {
    display: flex;
    align-items: center;
    gap: 6px;
  }
  .toggle {
    display: inline-flex;
    border: 1px solid var(--color-line-strong);
    border-radius: 5px;
    overflow: hidden;
  }
  .toggle button {
    background: transparent;
    border: 0;
    color: var(--color-ink-muted);
    font-size: 11px;
    padding: 2px 7px;
    cursor: pointer;
  }
  .toggle button.on {
    background: var(--color-accent);
    color: #fff;
  }
  .ic {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 22px;
    height: 20px;
    background: transparent;
    border: 0;
    border-radius: 5px;
    color: var(--color-ink-muted);
    cursor: pointer;
  }
  .ic:hover {
    background: var(--color-surface-4);
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

  .cards {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 6px;
    margin-bottom: 10px;
  }
  .card {
    background: var(--color-surface-1);
    border: 1px solid var(--color-line);
    border-radius: 7px;
    padding: 7px 8px;
  }
  .clabel {
    font-size: 10px;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--color-ink-subtle);
  }
  .cval {
    font-size: 15px;
    font-weight: 650;
    font-variant-numeric: tabular-nums;
    margin-top: 3px;
  }
  .csub {
    font-size: 10.5px;
    color: var(--color-ink-muted);
    font-variant-numeric: tabular-nums;
    margin-top: 1px;
  }

  .spark {
    margin-bottom: 10px;
  }
  .srow {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
  }
  .ssub {
    font-size: 10px;
    color: var(--color-ink-subtle);
  }
  .schart {
    width: 100%;
    height: 34px;
    margin-top: 4px;
    display: block;
  }

  .sec {
    margin-bottom: 10px;
  }
  .shead {
    font-size: 10.5px;
    font-weight: 600;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: var(--color-ink-subtle);
    margin-bottom: 5px;
  }
  .bar {
    display: grid;
    grid-template-columns: 84px 1fr auto;
    align-items: center;
    gap: 7px;
    margin-bottom: 4px;
  }
  .bname {
    font-size: 11.5px;
    color: var(--color-ink-muted);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .btrack {
    height: 6px;
    background: var(--color-surface-4);
    border-radius: 3px;
    overflow: hidden;
  }
  .bfill {
    display: block;
    height: 100%;
    background: var(--color-accent);
    border-radius: 3px;
  }
  .bfill.alt {
    background: var(--color-accent-2);
  }
  .bval {
    font-size: 11px;
    font-variant-numeric: tabular-nums;
    color: var(--color-ink);
    min-width: 44px;
    text-align: right;
  }

  .limits .lim {
    display: grid;
    grid-template-columns: 56px 1fr auto 82px;
    align-items: center;
    gap: 7px;
    margin-bottom: 5px;
  }
  .ltrack {
    height: 6px;
    background: var(--color-surface-4);
    border-radius: 3px;
    overflow: hidden;
  }
  .lfill {
    display: block;
    height: 100%;
    background: var(--color-accent);
    border-radius: 3px;
  }
  .lfill.warn {
    background: #e3b341;
  }
  .lfill.hot {
    background: var(--color-danger);
  }
  .lused {
    font-size: 11px;
    font-variant-numeric: tabular-nums;
    color: var(--color-ink);
    text-align: right;
    white-space: nowrap;
  }
  .lpct {
    margin-left: 4px;
    font-size: 10px;
    color: var(--color-ink-subtle);
  }
  .binput {
    width: 82px;
    box-sizing: border-box;
    padding: 2px 6px;
    background: var(--color-surface-1);
    border: 1px solid var(--color-line-strong);
    border-radius: 5px;
    color: var(--color-ink);
    font-family: var(--font-sans);
    font-size: 11px;
  }
  .binput:focus {
    outline: none;
    border-color: var(--color-accent);
  }
  .limnote {
    margin-top: 4px;
  }

  .planhead {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    margin-bottom: 5px;
  }
  .planhead .shead {
    margin-bottom: 0;
  }
  .planhead .binput {
    width: 88px;
  }
  .pverdict {
    font-size: 11.5px;
    color: var(--color-ink-muted);
  }
  .pverdict.good {
    color: var(--color-ink);
  }
  .pverdict b {
    color: var(--color-accent);
  }
  .pverdict.good b {
    color: #3fb950;
  }
  .phint {
    font-size: 11px;
    color: var(--color-ink-subtle);
  }

  .foot {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding-top: 8px;
    border-top: 1px solid var(--color-line);
  }
  .cache {
    font-size: 11px;
    color: var(--color-ink-muted);
  }
  .note {
    font-size: 10px;
    color: var(--color-ink-subtle);
  }
  .empty {
    padding: 10px 2px 2px;
    font-size: 11.5px;
    color: var(--color-ink-subtle);
    text-align: center;
  }
</style>
