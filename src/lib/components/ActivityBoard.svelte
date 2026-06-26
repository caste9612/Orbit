<script lang="ts">
  // Board ATTIVITÀ (area editor, tab kind "activity"). Due lenti sulle stesse UNITÀ DI LAVORO:
  //  • Timeline: ASSE DEL TEMPO CONDIVISO e VERTICALE (più recente in alto) → mostra la sequenzialità,
  //    allineata tra i repo. Righe = GIORNI (Oggi/Ieri/…); colonne = repo. Si comprimono SOLO le righe
  //    (giorni) senza nulla, in base ai progetti accesi; gli spazi orizzontali vuoti restano (è il
  //    prezzo dell'asse condiviso). Dentro la cella le unità sono in ordine di tempo.
  //  • List: feed cronologico a colonna unica.
  // Clic su un'unità → digest nel PANNELLO IN BASSO. I progetti spenti (activityPrefs) sono esclusi.
  import Icon from "./Icon.svelte";
  import UnitDigest from "./UnitDigest.svelte";
  import { invoke } from "@tauri-apps/api/core";
  import { listen, type UnlistenFn } from "@tauri-apps/api/event";
  import {
    activity,
    loadActivity,
    repoName,
    kindColor,
    OP_COLOR,
    isRepoEnabled,
    isDismissed,
    type WorkUnit,
  } from "../state/activity.svelte";
  import { relativeTime } from "../util";
  import { workspace } from "../state/workspace.svelte";
  import { resumeClaude } from "../state/claude.svelte";
  import { addFolder, openFromList } from "../state/folders.svelte";

  let lens = $state<"timeline" | "list">("timeline");
  let q = $state("");
  let selectedId = $state<string | null>(null);

  $effect(() => {
    void loadActivity();
    void invoke("watch_activity").catch(() => {});
    let alive = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let un: UnlistenFn | undefined;
    void listen("activity-changed", () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => void loadActivity(), 400);
    }).then((f) => (alive ? (un = f) : f()));
    return () => {
      alive = false;
      if (timer) clearTimeout(timer);
      un?.();
    };
  });

  const filtered = $derived(
    activity.units.filter((u) => {
      if (!isRepoEnabled(u.repo) || isDismissed(u.repo)) return false;
      if (!q.trim()) return true;
      const s = q.toLowerCase();
      return (
        u.label.toLowerCase().includes(s) ||
        repoName(u.repo).toLowerCase().includes(s) ||
        u.branch.toLowerCase().includes(s) ||
        u.files.some((f) => f.path.toLowerCase().includes(s))
      );
    }),
  );

  const selected = $derived(filtered.find((u) => u.id === selectedId) ?? null);

  const stats = $derived.by(() => {
    const t0 = startOfToday();
    let units = 0,
      live = 0;
    for (const u of filtered) {
      const ms = Date.parse(u.end);
      if (u.live || (!isNaN(ms) && ms >= t0)) units++;
      if (u.live) live++;
    }
    return { units, live };
  });

  // colonne = repo, ordinate per attività più recente
  const cols = $derived.by<string[]>(() => {
    const last = new Map<string, string>();
    for (const u of filtered) {
      const c = last.get(u.repo);
      if (!c || u.end > c) last.set(u.repo, u.end);
    }
    return [...last.entries()].sort((a, b) => b[1].localeCompare(a[1])).map(([r]) => r);
  });

  // sequenza VERTICALE per tempo (asse condiviso, più recente in alto): UNA RIGA PER UNITÀ, messa nella
  // colonna del suo repo → scendendo si legge l'ordine temporale reale tra i repo. Divisori per giorno.
  type Row = { t: "day"; label: string; live: boolean } | { t: "u"; u: WorkUnit };
  const timeline = $derived.by<Row[]>(() => {
    const out: Row[] = [];
    let lastDay = "";
    for (const u of filtered) {
      const dl = u.live ? "Active now" : dayLabel(u.end);
      if (dl !== lastDay) {
        out.push({ t: "day", label: dl, live: u.live });
        lastDay = dl;
      }
      out.push({ t: "u", u });
    }
    return out;
  });

  // List: gruppi per Attive ora / giorno
  interface Group {
    label: string;
    live: boolean;
    units: WorkUnit[];
  }
  const groups = $derived.by<Group[]>(() => {
    const out: Group[] = [];
    let cur: Group | null = null;
    for (const u of filtered) {
      const label = u.live ? "Active now" : dayLabel(u.end);
      if (!cur || cur.label !== label) {
        cur = { label, live: u.live, units: [] };
        out.push(cur);
      }
      cur.units.push(u);
    }
    return out;
  });

  function startOfToday(): number {
    const n = new Date();
    return new Date(n.getFullYear(), n.getMonth(), n.getDate()).getTime();
  }
  function dayLabel(end: string): string {
    const d = new Date(end);
    if (isNaN(+d)) return "Earlier";
    const dd = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
    const diff = Math.round((startOfToday() - dd) / 86_400_000);
    if (diff <= 0) return "Today";
    if (diff === 1) return "Yesterday";
    if (diff < 7) return d.toLocaleDateString(undefined, { weekday: "long" });
    return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  }
  function hhmm(end: string): string {
    const d = new Date(end);
    if (isNaN(+d)) return "";
    const p = (n: number) => String(n).padStart(2, "0");
    return `${p(d.getHours())}:${p(d.getMinutes())}`;
  }
  function ago(end: string): string {
    const ms = Date.parse(end);
    return isNaN(ms) ? "" : relativeTime(Math.floor(ms / 1000));
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

  // Riprende la sessione dell'unità (1 clic da card/blocco). Se l'unità è di un altro repo,
  // ci passa prima sopra (resumeClaude gira nel repo attivo).
  async function resume(u: WorkUnit) {
    if (!u.sessionId) return;
    if (u.repo && u.repo !== workspace.rootPath) {
      addFolder(u.repo);
      await openFromList(u.repo);
      if (workspace.rootPath !== u.repo) return; // switch fallito (repo sparito)
    }
    await resumeClaude(u.sessionId);
  }
</script>

<div class="board">
  <header class="bhead">
    <h1 class="h">Activity</h1>
    <span class="sub">{stats.units} today{stats.live ? ` · ${stats.live} live` : ""} · {cols.length} {cols.length === 1 ? "repo" : "repos"}</span>
    <div class="spacer"></div>
    <div class="lensbar" role="tablist">
      <button role="tab" class:on={lens === "timeline"} aria-selected={lens === "timeline"} onclick={() => (lens = "timeline")}>
        <Icon name="activity" size={13} strokeWidth={1.8} /> Timeline
      </button>
      <button role="tab" class:on={lens === "list"} aria-selected={lens === "list"} onclick={() => (lens = "list")}>
        <Icon name="more" size={13} strokeWidth={1.8} /> List
      </button>
    </div>
    <label class="search">
      <Icon name="search" size={13} strokeWidth={1.8} />
      <input type="text" placeholder="Filter…" bind:value={q} spellcheck="false" />
    </label>
    <button class="refresh" title="Refresh" aria-label="Refresh" onclick={() => loadActivity()}>
      <Icon name="refresh" size={14} strokeWidth={1.8} />
    </button>
  </header>

  <div class="lensbody">
    {#if filtered.length === 0}
      <div class="empty">
        <Icon name="activity" size={28} strokeWidth={1.4} />
        <p>{activity.units.length === 0 ? "No work yet." : "Nothing matches — check the project toggles on the left or the filter."}</p>
      </div>
    {:else if lens === "timeline"}
      <div class="tlscroll">
        <div class="tlgrid" style="grid-template-columns: 64px repeat({cols.length}, minmax(190px, 220px));">
          <div class="corner"></div>
          {#each cols as repo (repo)}
            <div class="colhead" title={repo}><span class="cd"></span>{repoName(repo)}</div>
          {/each}
          {#each timeline as e, i (i)}
            {#if e.t === "day"}
              <div class="dayband" class:now={e.live}>{e.label}</div>
            {:else}
              {@const u = e.u}
              {@const c = counts(u)}
              <div class="rowhead">{u.live ? "now" : hhmm(u.end)}</div>
              {#each cols as repo (repo)}
                {#if repo === u.repo}
                  <div class="cell">
                    <div class="blkwrap">
                      <button
                        class="blk"
                        class:sel={selected?.id === u.id}
                        class:live={u.live}
                        style="--rc:{kindColor(u.kind)}"
                        title={u.label}
                        onclick={() => (selectedId = u.id)}
                      >
                        <div class="bhd">
                          <span class="bkind" style="color:{kindColor(u.kind)}">{u.kind}</span>
                          <span class="bt">{u.live ? "live" : hhmm(u.end)}</span>
                        </div>
                        <div class="bl">{u.label}</div>
                        {#if c.a || c.m || c.d || u.commit}
                          <div class="bft">
                            <span class="bfiles">
                              {#if c.a}<span style="color:{OP_COLOR.A}">+{c.a}</span>{/if}
                              {#if c.m}<span style="color:{OP_COLOR.M}">~{c.m}</span>{/if}
                              {#if c.d}<span style="color:{OP_COLOR.D}">−{c.d}</span>{/if}
                            </span>
                            {#if u.commit}<span class="bhash">{u.commit}</span>{/if}
                          </div>
                        {/if}
                      </button>
                      <button class="resume blkresume" title="Resume this session" aria-label="Resume session" onclick={() => resume(u)}>
                        <Icon name="play" size={12} strokeWidth={2} />
                      </button>
                    </div>
                  </div>
                {:else}
                  <div class="cell"></div>
                {/if}
              {/each}
            {/if}
          {/each}
        </div>
      </div>
    {:else}
      <div class="listcol">
        {#each groups as grp (grp.label)}
          <div class="gh" class:now={grp.live}>
            {#if grp.live}<span class="livedot"></span>{/if}{grp.label}{grp.live ? ` · ${grp.units.length}` : ""}
          </div>
          {#each grp.units as u (u.id)}
            {@const c = counts(u)}
            <div class="cardwrap">
              <button class="card" class:sel={selected?.id === u.id} style="--rc:{kindColor(u.kind)}" onclick={() => (selectedId = u.id)}>
                <div class="r1">
                  <span class="kind2" style="color:{kindColor(u.kind)};background:{kindColor(u.kind)}1f">{u.kind}</span>
                  <span class="repo">{repoName(u.repo)}</span>
                  <span class="branch"><Icon name="git-branch" size={10} strokeWidth={1.8} />{u.branch}</span>
                  <span class="when">{u.live ? "live" : ago(u.end)}</span>
                </div>
                <div class="label">{u.label}</div>
                <div class="r3">
                  <span class="files">
                    {#if c.a}<span style="color:{OP_COLOR.A}">+{c.a}</span>{/if}
                    {#if c.m}<span style="color:{OP_COLOR.M}">~{c.m}</span>{/if}
                    {#if c.d}<span style="color:{OP_COLOR.D}">−{c.d}</span>{/if}
                  </span>
                  {#if u.cmds.length}<span>{u.cmds.length} cmd</span>{/if}
                  {#if u.commit}<span class="hash">{u.commit}</span>{:else if !u.live}<span class="wip">uncommitted</span>{/if}
                </div>
              </button>
              <button class="resume cardresume" title="Resume this session" aria-label="Resume session" onclick={() => resume(u)}>
                <Icon name="play" size={12} strokeWidth={2} />
              </button>
            </div>
          {/each}
        {/each}
      </div>
    {/if}
  </div>

  {#if selected}
    <div class="digestwrap">
      <div class="dbar">
        <span class="dk" style="color:{kindColor(selected.kind)};background:{kindColor(selected.kind)}1f">{selected.kind}</span>
        <span class="dt">{selected.label}</span>
        <button class="dclose" title="Close" aria-label="Close digest" onclick={() => (selectedId = null)}>
          <Icon name="x" size={14} strokeWidth={2} />
        </button>
      </div>
      <div class="dbody">
        {#key selected.id}
          <UnitDigest unit={selected} />
        {/key}
      </div>
    </div>
  {/if}
</div>

<style>
  .board {
    height: 100%;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    background: var(--color-surface-1);
  }
  .bhead {
    flex: 0 0 auto;
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 10px 16px;
    border-bottom: 1px solid var(--color-line);
  }
  .h {
    margin: 0;
    font-size: 16px;
    font-weight: 680;
    letter-spacing: 0.2px;
  }
  .sub {
    color: var(--color-ink-subtle);
    font-size: 11.5px;
    font-family: var(--font-mono);
  }
  .spacer {
    flex: 1;
  }
  .lensbar {
    display: inline-flex;
    border: 1px solid var(--color-line);
    border-radius: 7px;
    overflow: hidden;
  }
  .lensbar button {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    height: 28px;
    padding: 0 11px;
    background: var(--color-surface-1);
    border: 0;
    color: var(--color-ink-muted);
    font-size: 12px;
    cursor: pointer;
  }
  .lensbar button + button {
    border-left: 1px solid var(--color-line);
  }
  .lensbar button.on {
    background: color-mix(in srgb, var(--color-accent) 18%, transparent);
    color: var(--color-ink);
  }
  .search {
    display: flex;
    align-items: center;
    gap: 7px;
    height: 28px;
    padding: 0 10px;
    width: 200px;
    border: 1px solid var(--color-line);
    border-radius: 7px;
    background: var(--color-surface-1);
    color: var(--color-ink-subtle);
  }
  .search input {
    flex: 1;
    min-width: 0;
    background: transparent;
    border: 0;
    outline: none;
    color: var(--color-ink);
    font-size: 12px;
    font-family: var(--font-mono);
  }
  .refresh {
    width: 28px;
    height: 28px;
    flex: 0 0 auto;
    display: grid;
    place-items: center;
    background: transparent;
    border: 1px solid var(--color-line);
    border-radius: 7px;
    color: var(--color-ink-muted);
    cursor: pointer;
  }
  .refresh:hover {
    color: var(--color-ink);
    background: var(--color-surface-3);
  }
  .lensbody {
    flex: 1;
    min-height: 0;
    overflow: hidden;
    display: flex;
  }

  /* ---- Timeline: matrice giorno × repo (asse del tempo condiviso) ---- */
  .tlscroll {
    flex: 1;
    min-width: 0;
    overflow: auto;
  }
  .tlgrid {
    display: grid;
    align-content: start;
    min-width: max-content;
  }
  .corner {
    position: sticky;
    top: 0;
    left: 0;
    z-index: 3;
    background: var(--color-surface-1);
    border-bottom: 1px solid var(--color-line);
    border-right: 1px solid var(--color-line);
  }
  .colhead {
    position: sticky;
    top: 0;
    z-index: 2;
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 7px 10px;
    font-size: 11.5px;
    font-weight: 600;
    color: var(--color-ink-muted);
    background: var(--color-surface-1);
    border-bottom: 1px solid var(--color-line);
    border-right: 1px solid var(--color-line-soft, #26282d);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .colhead .cd {
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: var(--color-accent);
    flex: 0 0 auto;
  }
  .rowhead {
    position: sticky;
    left: 0;
    z-index: 1;
    align-self: stretch;
    padding: 9px 8px 0 12px;
    font-family: var(--font-mono);
    font-size: 10px;
    font-variant-numeric: tabular-nums;
    color: var(--color-ink-subtle);
    background: var(--color-surface-1);
    border-right: 1px solid var(--color-line);
    border-bottom: 1px solid var(--color-line-soft, #26282d);
    white-space: nowrap;
  }
  .dayband {
    grid-column: 1 / -1;
    position: sticky;
    left: 0;
    z-index: 2;
    padding: 11px 12px 5px;
    font-size: 10px;
    font-weight: 600;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--color-ink-subtle);
    background: var(--color-surface-1);
    border-bottom: 1px solid var(--color-line);
  }
  .dayband.now {
    color: #8fdcab;
  }
  .cell {
    padding: 5px;
    border-bottom: 1px solid var(--color-line-soft, #26282d);
    border-right: 1px solid var(--color-line-soft, #26282d);
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .blk {
    display: block;
    width: 100%;
    text-align: left;
    background: var(--color-surface-2);
    border: 1px solid var(--color-line);
    border-left: 3px solid var(--rc);
    border-radius: 7px;
    padding: 6px 9px;
    cursor: pointer;
    color: var(--color-ink);
  }
  .blk:hover {
    background: var(--color-surface-3);
  }
  .blk.sel {
    border-color: var(--color-accent);
    border-left-color: var(--rc);
    background: color-mix(in srgb, var(--color-accent) 12%, var(--color-surface-2));
  }
  .blk.live {
    box-shadow: 0 0 0 1px color-mix(in srgb, #5bc88a 55%, transparent) inset;
  }
  .blk .bhd {
    display: flex;
    align-items: center;
    gap: 6px;
  }
  .blk .bkind {
    font-size: 9px;
    font-weight: 700;
    letter-spacing: 0.05em;
    text-transform: uppercase;
  }
  .blk .bt {
    margin-left: auto;
    font-family: var(--font-mono);
    font-size: 9.5px;
    color: var(--color-ink-subtle);
  }
  .blk .bl {
    margin: 3px 0 0;
    font-size: 11.5px;
    font-weight: 550;
    line-height: 1.3;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }
  .blk .bft {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-top: 4px;
    font-family: var(--font-mono);
    font-size: 10px;
    color: var(--color-ink-subtle);
  }
  .blk .bfiles {
    display: inline-flex;
    gap: 4px;
  }
  .blk .bhash {
    margin-left: auto;
    color: #9fc2e8;
  }
  .blkwrap {
    position: relative;
    width: 100%;
  }
  .cardwrap {
    position: relative;
    max-width: 720px;
  }
  .resume {
    position: absolute;
    display: grid;
    place-items: center;
    background: var(--color-accent);
    color: #08111f;
    border: 0;
    border-radius: 6px;
    cursor: pointer;
    opacity: 0;
    transition: opacity 90ms ease;
    z-index: 2;
  }
  .resume:hover {
    filter: brightness(1.08);
  }
  .blkwrap:hover .resume,
  .cardwrap:hover .resume,
  .resume:focus-visible {
    opacity: 1;
  }
  .blkresume {
    top: 6px;
    right: 6px;
    width: 22px;
    height: 22px;
  }
  .cardresume {
    top: 9px;
    right: 9px;
    width: 24px;
    height: 24px;
  }

  /* ---- List ---- */
  .listcol {
    flex: 1;
    min-width: 0;
    overflow-y: auto;
    padding: 8px 12px 18px;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .gh {
    display: flex;
    align-items: center;
    gap: 7px;
    padding: 12px 4px 5px;
    font-size: 10px;
    font-weight: 600;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--color-ink-subtle);
  }
  .gh.now {
    color: #8fdcab;
  }
  .livedot {
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: #5bc88a;
  }
  .card {
    position: relative;
    display: block;
    width: 100%;
    max-width: 720px;
    text-align: left;
    border: 1px solid transparent;
    background: transparent;
    border-radius: 8px;
    padding: 8px 11px 8px 13px;
    cursor: pointer;
    color: var(--color-ink);
  }
  .card::before {
    content: "";
    position: absolute;
    left: 3px;
    top: 9px;
    bottom: 9px;
    width: 2.5px;
    border-radius: 3px;
    background: var(--rc);
    opacity: 0.5;
  }
  .card:hover {
    background: var(--color-surface-2);
  }
  .card.sel {
    background: color-mix(in srgb, var(--color-accent) 12%, var(--color-surface-2));
  }
  .card.sel::before {
    opacity: 1;
  }
  .r1 {
    display: flex;
    align-items: center;
    gap: 7px;
  }
  .kind2 {
    flex: 0 0 auto;
    font-size: 9.5px;
    font-weight: 700;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    padding: 1px 5px;
    border-radius: 4px;
  }
  .repo {
    font-size: 11.5px;
    color: var(--color-ink-muted);
  }
  .branch {
    display: inline-flex;
    align-items: center;
    gap: 3px;
    font-family: var(--font-mono);
    font-size: 10px;
    color: var(--color-ink-subtle);
  }
  .when {
    margin-left: auto;
    font-family: var(--font-mono);
    font-size: 10px;
    color: var(--color-ink-subtle);
  }
  .label {
    margin: 4px 0 5px;
    font-size: 13px;
    font-weight: 600;
    line-height: 1.3;
  }
  .r3 {
    display: flex;
    align-items: center;
    gap: 10px;
    font-family: var(--font-mono);
    font-size: 10.5px;
    color: var(--color-ink-subtle);
  }
  .r3 .files {
    display: inline-flex;
    gap: 4px;
  }
  .hash {
    color: #9fc2e8;
  }
  .wip {
    color: #e0a45e;
  }

  /* ---- bottom digest ---- */
  .digestwrap {
    flex: 0 0 44%;
    min-height: 140px;
    display: flex;
    flex-direction: column;
    border-top: 1px solid var(--color-line);
    background: var(--color-surface-1);
  }
  .dbar {
    flex: 0 0 auto;
    display: flex;
    align-items: center;
    gap: 9px;
    padding: 7px 12px;
    border-bottom: 1px solid var(--color-line-soft, #26282d);
  }
  .dk {
    font-size: 9.5px;
    font-weight: 700;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    padding: 1px 6px;
    border-radius: 4px;
  }
  .dt {
    font-size: 12.5px;
    font-weight: 600;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .dclose {
    margin-left: auto;
    width: 24px;
    height: 24px;
    display: grid;
    place-items: center;
    background: transparent;
    border: 0;
    border-radius: 5px;
    color: var(--color-ink-muted);
    cursor: pointer;
  }
  .dclose:hover {
    color: var(--color-ink);
    background: var(--color-surface-3);
  }
  .dbody {
    flex: 1;
    min-height: 0;
    overflow: hidden;
  }
  .empty {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 10px;
    align-items: center;
    justify-content: center;
    color: var(--color-ink-muted);
    text-align: center;
    padding: 20px;
  }
  .empty p {
    margin: 0;
    max-width: 360px;
    font-size: 12.5px;
  }
</style>
