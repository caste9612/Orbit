<script lang="ts">
  // Lo storico delle notifiche (M74): si apre dalla 🔔 nella barra di stato. Le ultime 50, dalla più recente,
  // per giorno, sulla stessa griglia degli avvisi: | 12 | icona 24 | 10 | messaggio e dettaglio | ora e Copy | 12 |.
  // L'ora è relativa («2 min ago») per l'ultima ora; le notifiche nuove hanno un pallino sul bordo dell'icona
  // finché non apri l'elenco, quelle già viste sono più tenui. Quelle che portano da qualche parte (una chat in
  // attesa, un aggiornamento) restano cliccabili; gli errori si copiano. In testa Do not disturb e «Clear».
  import { onMount, onDestroy } from "svelte";
  import { scale } from "svelte/transition";
  import Icon from "./Icon.svelte";
  import Backdrop from "./Backdrop.svelte";
  import { notices, markNoticesRead, clearNotices, type Notice, type ToastKind } from "../state/toast.svelte";
  import { settings } from "../state/settings.svelte";
  import { writeClipboard } from "../clipboard";

  let { onClose }: { onClose: () => void } = $props();

  const icon: Record<ToastKind, string> = { info: "info", success: "check", error: "alert", attention: "sparkles" };

  // le nuove si vedono come nuove finché l'elenco è aperto, poi diventano lette
  let fresh = $state(new Set<number>());
  // l'ora relativa si aggiorna da sola mentre l'elenco è aperto
  let now = $state(Date.now());
  let tick: ReturnType<typeof setInterval> | undefined;
  onMount(() => {
    fresh = new Set(notices.list.filter((n) => !n.seen).map((n) => n.id));
    markNoticesRead();
    tick = setInterval(() => (now = Date.now()), 30_000);
  });
  onDestroy(() => clearInterval(tick));

  const dayKey = (at: number) => new Date(at).toDateString();
  function dayLabel(at: number): string {
    const d = new Date(at);
    const today = new Date(now);
    if (d.toDateString() === today.toDateString()) return "Today";
    const y = new Date(now - 86_400_000);
    if (d.toDateString() === y.toDateString()) return "Yesterday";
    return d.toLocaleDateString([], { weekday: "long", day: "numeric", month: "short" });
  }
  function when(at: number): string {
    const min = Math.floor((now - at) / 60_000);
    if (min < 1) return "just now";
    if (min < 60) return `${min} min ago`;
    return new Date(at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }
  // gruppi per giorno, nell'ordine dell'elenco (dal più recente)
  let groups = $derived.by(() => {
    const out: { key: string; label: string; items: Notice[] }[] = [];
    for (const n of notices.list) {
      const k = dayKey(n.at);
      if (out.at(-1)?.key !== k) out.push({ key: k, label: dayLabel(n.at), items: [] });
      out.at(-1)!.items.push(n);
    }
    return out;
  });

  function open(n: Notice) {
    if (!n.onClick) return;
    n.onClick();
    onClose();
  }

  let copied = $state<number | null>(null);
  async function copy(n: Notice) {
    await writeClipboard(n.detail ? `${n.message}\n${n.detail}` : n.message);
    copied = n.id;
    setTimeout(() => copied === n.id && (copied = null), 1300);
  }
</script>

<Backdrop {onClose} z={60} />

<div class="center" role="dialog" aria-label="Notifications" transition:scale={{ duration: 90, start: 0.97, opacity: 0.3 }}>
  <header class="head">
    <span class="title">Notifications</span>
    <button
      class="hbtn"
      class:on={settings.dnd}
      title={settings.dnd ? "Do not disturb is on: only errors show up — click to turn it off" : "Do not disturb: only errors show up, no sound"}
      aria-pressed={settings.dnd}
      onclick={() => (settings.dnd = !settings.dnd)}
    >
      <Icon name={settings.dnd ? "bell-off" : "bell"} size={13} strokeWidth={1.8} />
      <span>Do not disturb</span>
    </button>
    <button class="hbtn" disabled={!notices.list.length} onclick={clearNotices}>Clear</button>
  </header>
  <div class="list">
    {#each groups as g (g.key)}
      <div class="day">{g.label}</div>
      {#each g.items as n (n.id)}
        <div class="row {n.kind}" class:fresh={fresh.has(n.id)}>
          {#if n.onClick}
            <button class="hit" title="Open" aria-label={n.message} onclick={() => open(n)}></button>
          {/if}
          <span class="pic"><Icon name={n.icon ?? icon[n.kind]} size={12} strokeWidth={2} /></span>
          <span class="msg">{n.message}</span>
          <span class="at">{when(n.at)}</span>
          {#if n.detail}<span class="det">{n.detail}</span>{/if}
          {#if n.kind === "error"}
            <button class="pill" onclick={() => void copy(n)}>{copied === n.id ? "Copied" : "Copy"}</button>
          {/if}
        </div>
      {/each}
    {:else}
      <div class="empty">
        <span class="epic"><Icon name="bell" size={16} strokeWidth={1.8} /></span>
        <span>No notifications yet</span>
      </div>
    {/each}
  </div>
</div>

<style>
  .center {
    position: fixed;
    right: 8px;
    bottom: 28px;
    z-index: 121; /* sopra gli avvisi (120): un avviso nuovo non copre l'elenco aperto */
    width: 380px;
    max-width: calc(100vw - 16px);
    max-height: min(60vh, 520px);
    display: flex;
    flex-direction: column;
    border: 1px solid var(--color-line-strong);
    border-radius: var(--radius);
    background: var(--color-surface-2);
    box-shadow: var(--shadow-pop);
    overflow: hidden;
  }
  .head {
    flex: 0 0 auto;
    display: flex;
    align-items: center;
    gap: 2px;
    height: 40px;
    padding: 0 8px 0 12px;
    border-bottom: 1px solid var(--color-line);
  }
  .title {
    flex: 1;
    color: var(--color-ink);
    font-size: 12.5px;
    font-weight: 600;
  }
  .hbtn {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    height: 26px;
    padding: 0 8px;
    border: 0;
    border-radius: var(--r-md);
    background: transparent;
    color: var(--color-ink-muted);
    font-size: 11.5px;
    cursor: pointer;
  }
  .hbtn:hover:not(:disabled) {
    background: var(--color-surface-3);
    color: var(--color-ink);
  }
  .hbtn:disabled {
    opacity: 0.45;
    cursor: default;
  }
  .hbtn.on {
    color: var(--color-accent);
  }
  .list {
    overflow: auto;
    padding: 2px 0 6px;
  }
  /* il giorno, sul filo delle icone */
  .day {
    padding: 10px 12px 4px;
    color: var(--color-ink-subtle);
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.07em;
    text-transform: uppercase;
  }
  /* la stessa griglia degli avvisi: icona | messaggio | ora (e sotto: dettaglio | Copy) */
  .row {
    --kind: var(--color-accent);
    --kind-rgb: var(--accent-rgb);
    position: relative;
    display: grid;
    grid-template-columns: 24px minmax(0, 1fr) auto;
    column-gap: 10px;
    row-gap: 2px;
    align-items: center;
    padding: 6px 12px;
    color: var(--color-ink);
    font-size: 12px;
  }
  .row.success {
    --kind: var(--color-success);
    --kind-rgb: 47, 191, 155;
  }
  .row.error {
    --kind: var(--color-danger);
    --kind-rgb: 241, 76, 76;
  }
  .row:hover {
    background: var(--color-surface-3);
  }
  .hit {
    position: absolute;
    inset: 0;
    z-index: 0;
    padding: 0;
    border: 0;
    background: transparent;
    cursor: pointer;
  }
  .row > :not(.hit) {
    position: relative;
    z-index: 1;
    pointer-events: none;
  }
  .row > .pill {
    pointer-events: auto;
  }
  .pic {
    grid-row: 1;
    grid-column: 1;
    width: 24px;
    height: 24px;
    display: grid;
    place-items: center;
    border-radius: 50%;
    background: rgba(var(--kind-rgb), 0.16);
    color: var(--kind);
  }
  /* nuova: un pallino sul bordo dell'icona, in alto a destra */
  .row.fresh .pic::after {
    content: "";
    position: absolute;
    top: -1px;
    right: -1px;
    width: 7px;
    height: 7px;
    border: 2px solid var(--color-surface-2);
    border-radius: 50%;
    background: var(--color-accent);
  }
  .msg {
    grid-row: 1;
    grid-column: 2;
    min-width: 0;
    line-height: 17px;
    overflow-wrap: anywhere;
  }
  /* già vista: più tenue; nuova: il messaggio in medio */
  .row:not(.fresh) .msg {
    color: var(--color-ink-muted);
  }
  .row.fresh .msg {
    font-weight: 500;
  }
  .at {
    grid-row: 1;
    grid-column: 3;
    justify-self: end;
    color: var(--color-ink-subtle);
    font-size: 11px;
    white-space: nowrap;
  }
  .det {
    grid-row: 2;
    grid-column: 2;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
    color: var(--color-ink-subtle);
    font-size: 11px;
    line-height: 15px;
    overflow-wrap: anywhere;
  }
  .pill {
    grid-row: 2;
    grid-column: 3;
    justify-self: end;
    height: 21px;
    padding: 0 9px;
    border: 0;
    border-radius: 11px;
    background: rgba(var(--accent-rgb), 0.16);
    color: var(--color-accent);
    font-size: 11px;
    font-weight: 600;
    cursor: pointer;
  }
  .pill:hover {
    background: rgba(var(--accent-rgb), 0.26);
  }
  .empty {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
    padding: 26px 12px;
    color: var(--color-ink-subtle);
    font-size: 12px;
  }
  .epic {
    width: 34px;
    height: 34px;
    display: grid;
    place-items: center;
    border-radius: 50%;
    background: var(--color-surface-3);
  }
</style>
