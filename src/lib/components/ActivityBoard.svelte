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
  import ChatDigest from "./ChatDigest.svelte";
  import { invoke } from "@tauri-apps/api/core";
  import { listen, type UnlistenFn } from "@tauri-apps/api/event";
  import {
    activity,
    loadActivity,
    repoName,
    kindColor,
    sessionColor,
    sessionLabel,
    OP_COLOR,
    isRepoEnabled,
    isDismissed,
    type WorkUnit,
  } from "../state/activity.svelte";
  import { relativeTime } from "../util";
  import { workspace } from "../state/workspace.svelte";
  import { resumeClaude } from "../state/claude.svelte";
  import { addFolder, openFromList } from "../state/folders.svelte";

  let lens = $state<"timeline" | "chats">("timeline");
  let q = $state("");
  let selectedId = $state<string | null>(null); // unità selezionata (Timeline)
  let selectedSid = $state<string | null>(null); // chat selezionata (lente Chats)

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
        u.sessionTitle.toLowerCase().includes(s) ||
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

  // Prima unità di una "corsa" di sessione nella SUA colonna (scendendo = andando indietro nel
  // tempo): lì mostriamo l'intestazione della chat, così le chat diverse dello stesso repo si
  // distinguono anche quando si alternano. Vale anche per la prima unità in alto di ogni repo.
  const sessStart = $derived.by<Set<string>>(() => {
    const prev = new Map<string, string>(); // repo → sessionId dell'unità sopra
    const out = new Set<string>();
    for (const u of filtered) {
      if (prev.get(u.repo) !== u.sessionId) out.add(u.id);
      prev.set(u.repo, u.sessionId);
    }
    return out;
  });

  // Chats: una card per SESSIONE — l'atomo del resume (non si può riprendere da un messaggio
  // specifico, solo la chat intera) — ordinate per attività più recente e raggruppate per giorno.
  interface Chat {
    sid: string;
    units: WorkUnit[]; // dalla più recente (stesso ordine del feed)
    end: string;
    live: boolean;
  }
  const chats = $derived.by<Chat[]>(() => {
    const bySid = new Map<string, Chat>();
    for (const u of filtered) {
      let c = bySid.get(u.sessionId);
      if (!c) {
        c = { sid: u.sessionId, units: [], end: u.end, live: false };
        bySid.set(u.sessionId, c);
      }
      c.units.push(u);
      if (u.live) c.live = true;
      if (u.end > c.end) c.end = u.end;
    }
    return [...bySid.values()].sort((a, b) => Number(b.live) - Number(a.live) || b.end.localeCompare(a.end));
  });
  const selectedChat = $derived(chats.find((c) => c.sid === selectedSid) ?? null);

  interface ChatGroup {
    label: string;
    live: boolean;
    chats: Chat[];
  }
  const chatGroups = $derived.by<ChatGroup[]>(() => {
    const out: ChatGroup[] = [];
    let cur: ChatGroup | null = null;
    for (const c of chats) {
      const label = c.live ? "Active now" : dayLabel(c.end);
      if (!cur || cur.label !== label) {
        cur = { label, live: c.live, chats: [] };
        out.push(cur);
      }
      cur.chats.push(c);
    }
    return out;
  });

  // L'unità PIÙ SIGNIFICATIVA della chat (l'ultimo commit, altrimenti la più grossa per churn):
  // molte chat iniziano con lo stesso prompt (es. la scorciatoia "recupera contesto") e l'aiTitle
  // esce quasi identico — è quello che la chat ha FATTO a distinguerle, non come sono iniziate.
  function significant(c: Chat): string | null {
    let pick: WorkUnit | null = c.units.find((u) => u.commit) ?? null;
    if (!pick) for (const u of c.units) if (!pick || u.add + u.del > pick.add + pick.del) pick = u;
    const label = pick?.label ?? "";
    return label && label !== sessionLabel(c.units[0]) ? label : null;
  }

  function chatTotals(c: Chat) {
    let add = 0,
      del = 0,
      prompts = 0,
      commits = 0;
    for (const u of c.units) {
      add += u.add;
      del += u.del;
      prompts += u.prompts.length;
      if (u.commit) commits++;
    }
    return { add, del, prompts, commits };
  }

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
      <button role="tab" class:on={lens === "chats"} aria-selected={lens === "chats"} onclick={() => (lens = "chats")}>
        <Icon name="message" size={13} strokeWidth={1.8} /> Chats
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
                    {#if sessStart.has(u.id)}
                      <div class="sess" title="Chat: {sessionLabel(u)}">
                        <span class="sdot" style="background:{sessionColor(u.sessionId)}"></span>
                        <span class="sname">{sessionLabel(u)}</span>
                      </div>
                    {/if}
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
                          <span class="sdot" style="background:{sessionColor(u.sessionId)}" title="Chat: {sessionLabel(u)}"></span>
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
        {#each chatGroups as grp (grp.label)}
          <div class="gh" class:now={grp.live}>
            {#if grp.live}<span class="livedot"></span>{/if}{grp.label}{grp.live ? ` · ${grp.chats.length}` : ""}
          </div>
          {#each grp.chats as c (c.sid)}
            {@const t = chatTotals(c)}
            {@const first = c.units[0]}
            <div class="cardwrap">
              <button class="card" class:sel={selectedSid === c.sid} style="--rc:{sessionColor(c.sid)}" onclick={() => (selectedSid = selectedSid === c.sid ? null : c.sid)}>
                <div class="r1">
                  <span class="sdot" style="background:{sessionColor(c.sid)}"></span>
                  <span class="repo">{repoName(first.repo)}</span>
                  <span class="branch"><Icon name="git-branch" size={10} strokeWidth={1.8} />{first.branch}</span>
                  <span class="when">{c.live ? "live" : ago(c.end)}</span>
                </div>
                <div class="label">{sessionLabel(first)}</div>
                {#if significant(c)}
                  <div class="sub" title={significant(c)}>{significant(c)}</div>
                {/if}
                <div class="r3">
                  <span>{t.prompts} {t.prompts === 1 ? "prompt" : "prompts"}</span>
                  <span>{c.units.length} {c.units.length === 1 ? "step" : "steps"}</span>
                  <span class="files">
                    {#if t.add}<span style="color:{OP_COLOR.A}">+{t.add}</span>{/if}
                    {#if t.del}<span style="color:{OP_COLOR.D}">−{t.del}</span>{/if}
                  </span>
                  {#if t.commits}<span class="hash">{t.commits} {t.commits === 1 ? "commit" : "commits"}</span>{:else if !c.live}<span class="wip">uncommitted</span>{/if}
                </div>
              </button>
              <button class="resume cardresume" title="Resume this chat" aria-label="Resume chat" onclick={() => resume(first)}>
                <Icon name="play" size={12} strokeWidth={2} />
              </button>
            </div>
          {/each}
        {/each}
      </div>
    {/if}
  </div>

  {#if lens === "chats" && selectedChat}
    <div class="digestwrap">
      <div class="dbar">
        <span class="dsess" title="Chat">
          <span class="sdot" style="background:{sessionColor(selectedChat.sid)}"></span>
        </span>
        <span class="dt">{sessionLabel(selectedChat.units[0])}</span>
        <button class="dclose" title="Close" aria-label="Close digest" onclick={() => (selectedSid = null)}>
          <Icon name="x" size={14} strokeWidth={2} />
        </button>
      </div>
      <div class="dbody">
        {#key selectedChat.sid}
          <ChatDigest units={selectedChat.units} />
        {/key}
      </div>
    </div>
  {:else if lens === "timeline" && selected}
    <div class="digestwrap">
      <div class="dbar">
        <span class="dk" style="color:{kindColor(selected.kind)};background:{kindColor(selected.kind)}1f">{selected.kind}</span>
        <span class="dt">{selected.label}</span>
        <span class="dsess" title="Chat: {sessionLabel(selected)}">
          <span class="sdot" style="background:{sessionColor(selected.sessionId)}"></span>
          <span class="dsname">{sessionLabel(selected)}</span>
        </span>
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

  /* ---- distinzione per SESSIONE (chat): pallino colorato + intestazione a cambio chat ---- */
  .sdot {
    width: 7px;
    height: 7px;
    border-radius: 50%;
    flex: 0 0 auto;
  }
  .bhd .sdot {
    width: 6px;
    height: 6px;
  }
  .sess {
    display: flex;
    align-items: center;
    gap: 5px;
    min-width: 0;
    padding: 2px 3px 0;
    font-size: 9.5px;
    color: var(--color-ink-subtle);
  }
  .sess .sname {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .dsess {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    min-width: 0;
    max-width: 260px;
    margin-left: 6px;
    font-size: 10.5px;
    color: var(--color-ink-muted);
    flex: 0 1 auto;
  }
  .dsess .dsname {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
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
  .sub {
    margin: -3px 0 5px;
    font-size: 11.5px;
    color: var(--color-ink-muted);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
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
