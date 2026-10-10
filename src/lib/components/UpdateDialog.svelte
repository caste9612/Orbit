<script lang="ts">
  // Dialog dell'aggiornamento (M59): versione nuova e novità della release, poi download, uscita delle
  // altre finestre e installazione. Si apre dall'avviso, dal pulsante "Update" in alto o dalle Impostazioni.
  import { scale } from "svelte/transition";
  import { invoke } from "@tauri-apps/api/core";
  import Icon from "./Icon.svelte";
  import Backdrop from "./Backdrop.svelte";
  import { updates, installUpdate, closeUpdateDialog, openReleaseNotes } from "../state/updater.svelte";
  import { renderMarkdown } from "../markdown";

  let info = $derived(updates.available);
  let busy = $derived(updates.phase === "downloading" || updates.phase === "closing" || updates.phase === "installing");
  let notesHtml = $state("");
  $effect(() => {
    const src = info?.notes;
    notesHtml = "";
    if (src) void renderMarkdown(src).then((h) => (notesHtml = h));
  });

  const mb = (n: number) => (n / 1048576).toFixed(1);
  let pct = $derived(updates.total ? Math.min(100, (updates.received / updates.total) * 100) : 0);
  let released = $derived.by(() => {
    const d = info?.date ? new Date(info.date) : null;
    // in inglese come il resto dell'interfaccia, con il giorno davanti (10 Oct 2026)
    return d && !isNaN(d.getTime()) ? d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "";
  });

  // i link delle note si aprono nel browser, non dentro la finestra di Orbit
  function onNotesClick(e: MouseEvent) {
    const a = (e.target as HTMLElement | null)?.closest("a");
    if (!a) return;
    e.preventDefault();
    const href = a.getAttribute("href") ?? "";
    if (/^https?:\/\//.test(href)) void invoke("open_url", { url: href });
  }
</script>

{#if updates.open && info}
  <Backdrop onClose={closeUpdateDialog} dim z={110} />
  <div class="dlg" role="dialog" aria-modal="true" aria-label="Update Orbit" transition:scale={{ duration: 110, start: 0.97, opacity: 0.3 }}>
    <header class="head">
      <span class="badge"><Icon name="download" size={16} strokeWidth={1.8} /></span>
      <div class="titles">
        <div class="title">Orbit {info.version} is available</div>
        <div class="sub">You have {info.current}{released ? ` · released ${released}` : ""}</div>
      </div>
      <button class="x" aria-label="Close" title="Later" disabled={busy && updates.phase !== "closing"} onclick={closeUpdateDialog}>
        <Icon name="x" size={14} strokeWidth={1.8} />
      </button>
    </header>

    {#if notesHtml}
      <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_noninteractive_element_interactions -->
      <article class="notes" onclick={onNotesClick}>{@html notesHtml}</article>
    {/if}

    <div class="status">
      {#if updates.phase === "downloading"}
        <div class="bar"><span style="width:{pct}%"></span></div>
        <span class="line">Downloading… {mb(updates.received)}{updates.total ? ` / ${mb(updates.total)}` : ""} MB</span>
      {:else if updates.phase === "closing"}
        <span class="line">
          Closing the other Orbit windows ({updates.others} left)… A window with unsaved changes asks before closing.
        </span>
      {:else if updates.phase === "installing"}
        <span class="line">Installing — Orbit reopens in a moment.</span>
      {:else if updates.phase === "error"}
        <span class="line err">{updates.error}</span>
      {:else}
        <span class="line">
          Orbit restarts to install it: windows and tabs reopen; open terminals and Claude chats are closed
          (resume chats from Activity).
        </span>
      {/if}
    </div>

    <footer class="btns">
      <button class="link" onclick={() => openReleaseNotes(info.version)}>
        Release notes <Icon name="external-link" size={12} strokeWidth={1.8} />
      </button>
      <span class="grow"></span>
      {#if updates.phase === "closing"}
        <button class="btn ghost" onclick={closeUpdateDialog}>Cancel</button>
      {:else}
        <button class="btn ghost" disabled={busy} onclick={closeUpdateDialog}>Later</button>
      {/if}
      <!-- svelte-ignore a11y_autofocus -->
      <button class="btn primary" autofocus disabled={busy} onclick={() => void installUpdate()}>
        {updates.phase === "error" ? "Retry" : "Update and restart"}
      </button>
    </footer>
  </div>
{/if}

<style>
  .dlg {
    position: fixed;
    z-index: 111;
    top: 64px;
    left: 50%;
    transform: translateX(-50%);
    width: min(480px, 92vw);
    max-height: calc(100vh - 128px);
    display: flex;
    flex-direction: column;
    background: var(--color-surface-2);
    border: 1px solid var(--color-line-strong);
    border-radius: var(--radius-lg);
    box-shadow: var(--shadow-pop);
    overflow: hidden;
  }
  .head {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 14px 12px 12px 16px;
    border-bottom: 1px solid var(--color-line);
  }
  .badge {
    flex: 0 0 auto;
    width: 32px;
    height: 32px;
    display: grid;
    place-items: center;
    border-radius: var(--r-md);
    background: rgba(var(--accent-rgb), 0.16);
    color: var(--color-accent);
  }
  .titles {
    flex: 1;
    min-width: 0;
  }
  .title {
    font-size: 14px;
    font-weight: 650;
    color: var(--color-ink);
  }
  .sub {
    margin-top: 2px;
    font-size: 11.5px;
    color: var(--color-ink-subtle);
  }
  .x {
    flex: 0 0 auto;
    align-self: flex-start;
    width: 24px;
    height: 24px;
    display: grid;
    place-items: center;
    border: 0;
    border-radius: var(--r-sm);
    background: transparent;
    color: var(--color-ink-subtle);
    cursor: pointer;
  }
  .x:hover:not(:disabled) {
    background: var(--color-surface-3);
    color: var(--color-ink);
  }
  .notes {
    min-height: 0;
    max-height: 260px;
    overflow-y: auto;
    padding: 10px 16px 4px;
    border-bottom: 1px solid var(--color-line);
    font-size: 12.5px;
    line-height: 1.5;
    color: var(--color-ink-muted);
  }
  .notes :global(h1),
  .notes :global(h2),
  .notes :global(h3),
  .notes :global(h4) {
    margin: 10px 0 4px;
    font-size: 12.5px;
    font-weight: 650;
    color: var(--color-ink);
  }
  .notes :global(p),
  .notes :global(ul),
  .notes :global(ol) {
    margin: 0 0 8px;
  }
  .notes :global(ul),
  .notes :global(ol) {
    padding-left: 18px;
  }
  .notes :global(ul) {
    list-style: disc;
  }
  .notes :global(ol) {
    list-style: decimal;
  }
  .notes :global(li) {
    margin: 2px 0;
  }
  .notes :global(strong) {
    color: var(--color-ink);
    font-weight: 600;
  }
  .notes :global(code) {
    font-family: var(--font-mono);
    font-size: 11.5px;
    padding: 0 4px;
    border-radius: var(--r-xs);
    background: var(--color-surface-3);
  }
  .notes :global(a) {
    color: var(--color-accent);
  }
  .status {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 12px 16px;
  }
  .line {
    font-size: 12px;
    line-height: 1.45;
    color: var(--color-ink-muted);
  }
  .line.err {
    color: #ff9b9b;
  }
  .bar {
    height: 4px;
    border-radius: 2px;
    background: var(--color-surface-4);
    overflow: hidden;
  }
  .bar span {
    display: block;
    height: 100%;
    background: var(--color-accent);
    transition: width 120ms linear;
  }
  .btns {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 0 16px 14px;
  }
  .grow {
    flex: 1;
  }
  .link {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    padding: 0;
    border: 0;
    background: transparent;
    color: var(--color-ink-subtle);
    font-size: 12px;
    cursor: pointer;
  }
  .link:hover {
    color: var(--color-accent);
  }
  .btn {
    height: 30px;
    padding: 0 14px;
    border-radius: var(--r-md);
    border: 1px solid var(--color-line-strong);
    background: var(--color-surface-3);
    color: var(--color-ink);
    font-size: 12.5px;
    cursor: pointer;
  }
  .btn:hover:not(:disabled) {
    background: var(--color-surface-4);
  }
  .btn:disabled {
    opacity: 0.5;
    cursor: default;
  }
  .btn.ghost {
    background: transparent;
  }
  .btn.primary {
    background: var(--color-accent);
    border-color: var(--color-accent);
    color: #08111f;
    font-weight: 600;
  }
  .btn.primary:hover:not(:disabled) {
    filter: brightness(1.08);
  }
</style>
