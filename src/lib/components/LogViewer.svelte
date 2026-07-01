<script lang="ts">
  import { fade } from "svelte/transition";
  import Backdrop from "./Backdrop.svelte";
  import Icon from "./Icon.svelte";
  import { logs, copyLogs, revealLogFile, clearLogs, closeLogs } from "../state/logs.svelte";
  import { settings } from "../state/settings.svelte";
  import { notify } from "../state/toast.svelte";

  let filter = $state("");
  let level = $state<"all" | "warn" | "error">("all");

  // filtro per livello (warn = warn+error) e testo (categoria/messaggio/dati)
  const shown = $derived(
    logs.entries.filter((e) => {
      if (level === "warn" && e.level !== "warn" && e.level !== "error") return false;
      if (level === "error" && e.level !== "error") return false;
      if (filter) {
        const q = filter.toLowerCase();
        if (!(e.cat.toLowerCase().includes(q) || e.msg.toLowerCase().includes(q) || (e.data ?? "").toLowerCase().includes(q)))
          return false;
      }
      return true;
    }),
  );

  async function copy() {
    const ok = await copyLogs();
    notify(ok ? "Logs copied to clipboard" : "Copy failed", ok ? "success" : "error", 1500);
  }
</script>

<Backdrop onClose={closeLogs} dim z={130} />
<div class="lv" role="dialog" aria-modal="true" aria-label="Diagnostic logs" transition:fade={{ duration: 90 }}>
  <header class="head">
    <div class="title"><Icon name="activity" size={15} strokeWidth={1.8} /><span>Diagnostic logs</span></div>
    <div class="grow"></div>
    <button
      class="pill"
      class:on={settings.logging}
      title="Collect diagnostic logs"
      onclick={() => (settings.logging = !settings.logging)}
    >
      <span class="dot"></span>{settings.logging ? "Collecting" : "Paused"}
    </button>
    <button class="hbtn" title="Close" aria-label="Close" onclick={closeLogs}><Icon name="x" size={15} strokeWidth={2} /></button>
  </header>

  <div class="tools">
    <input class="filter" placeholder="Filter…" bind:value={filter} spellcheck={false} />
    <div class="levels">
      {#each ["all", "warn", "error"] as l}
        <button class="lvl" class:sel={level === l} onclick={() => (level = l as typeof level)}>{l}</button>
      {/each}
    </div>
    <div class="grow"></div>
    <span class="count">{shown.length}/{logs.entries.length}</span>
    <button class="hbtn" title="Copy all logs to clipboard" aria-label="Copy" onclick={copy}><Icon name="copy" size={14} strokeWidth={1.8} /></button>
    <button class="hbtn" title="Reveal log file" aria-label="Open log file" onclick={revealLogFile}><Icon name="folder" size={14} strokeWidth={1.8} /></button>
    <button class="hbtn" title="Clear" aria-label="Clear" onclick={clearLogs}><Icon name="trash" size={14} strokeWidth={1.8} /></button>
  </div>

  <div class="list">
    {#if shown.length === 0}
      <div class="empty">
        {#if !settings.logging && logs.entries.length === 0}
          Collection is paused. Turn it on, reproduce the issue, then Copy or reveal the log file.
        {:else}
          No matching entries.
        {/if}
      </div>
    {:else}
      {#each shown as e (e.seq)}
        <div class="row {e.level}">
          <span class="t">{e.time}</span>
          <span class="cat">{e.cat}</span>
          <span class="msg">{e.msg}</span>
          {#if e.data}<span class="data">{e.data}</span>{/if}
        </div>
      {/each}
    {/if}
  </div>
</div>

<style>
  .lv {
    position: fixed;
    inset: 6% 8%;
    z-index: 131;
    display: flex;
    flex-direction: column;
    background: var(--color-surface-1);
    border: 1px solid var(--color-line-strong);
    border-radius: 10px;
    box-shadow: var(--shadow-pop);
    overflow: hidden;
  }
  .head,
  .tools {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 10px;
    border-bottom: 1px solid var(--color-line);
    flex: 0 0 auto;
  }
  .title {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    font-size: 13px;
    font-weight: 600;
    color: var(--color-ink);
  }
  .grow {
    flex: 1;
  }
  .pill {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    height: 24px;
    padding: 0 10px;
    border: 1px solid var(--color-line-strong);
    border-radius: 12px;
    background: transparent;
    color: var(--color-ink-muted);
    font-size: 12px;
    cursor: pointer;
  }
  .pill.on {
    color: var(--color-accent);
    border-color: rgba(var(--accent-rgb), 0.5);
    background: rgba(var(--accent-rgb), 0.12);
  }
  .pill .dot {
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: currentColor;
  }
  .hbtn {
    display: grid;
    place-items: center;
    width: 28px;
    height: 26px;
    border: 0;
    border-radius: 6px;
    background: transparent;
    color: var(--color-ink-muted);
    cursor: pointer;
  }
  .hbtn:hover {
    background: var(--color-surface-3);
    color: var(--color-ink);
  }
  .filter {
    flex: 0 1 260px;
    height: 26px;
    padding: 0 9px;
    border: 1px solid var(--color-line-strong);
    border-radius: 6px;
    background: var(--color-surface-2);
    color: var(--color-ink);
    font-size: 12.5px;
    outline: none;
  }
  .filter:focus {
    border-color: var(--color-accent);
  }
  .levels {
    display: inline-flex;
    gap: 2px;
  }
  .lvl {
    height: 24px;
    padding: 0 9px;
    border: 1px solid var(--color-line);
    border-radius: 6px;
    background: transparent;
    color: var(--color-ink-muted);
    font-size: 11.5px;
    cursor: pointer;
  }
  .lvl.sel {
    color: var(--color-ink);
    border-color: var(--color-accent);
    background: rgba(var(--accent-rgb), 0.14);
  }
  .count {
    font-size: 11.5px;
    color: var(--color-ink-subtle);
    font-variant-numeric: tabular-nums;
  }
  .list {
    flex: 1;
    min-height: 0;
    overflow: auto;
    padding: 4px 0;
    font-family: var(--font-mono);
    font-size: 12px;
    line-height: 1.55;
  }
  .empty {
    padding: 24px;
    text-align: center;
    color: var(--color-ink-subtle);
    font-family: var(--font-ui, inherit);
    font-size: 13px;
  }
  .row {
    display: flex;
    gap: 8px;
    padding: 1px 12px;
    white-space: nowrap;
  }
  .row:hover {
    background: var(--color-surface-2);
  }
  .row .t {
    color: var(--color-ink-subtle);
    flex: 0 0 auto;
  }
  .row .cat {
    color: var(--color-accent);
    flex: 0 0 auto;
  }
  .row .msg {
    color: var(--color-ink);
    flex: 0 0 auto;
  }
  .row .data {
    color: var(--color-ink-muted);
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .row.warn .msg {
    color: #e3b341;
  }
  .row.error .cat,
  .row.error .msg {
    color: var(--color-danger);
  }
</style>
