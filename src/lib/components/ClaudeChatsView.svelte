<script lang="ts">
  import Icon from "./Icon.svelte";
  import { claudeChats, loadClaudeChats } from "../state/claudeChats.svelte";
  import { resumeClaude } from "../state/claude.svelte";
  import { workspace } from "../state/workspace.svelte";
  import { relativeTime } from "../util";

  // (ri)carica quando cambia la cartella aperta (e al primo montaggio)
  $effect(() => {
    workspace.rootPath; // dipendenza
    void loadClaudeChats();
  });
</script>

<div class="chats">
  <div class="head">
    <span class="hint">Recent Claude sessions in this project</span>
    <button class="refresh" title="Refresh" aria-label="Refresh" onclick={() => loadClaudeChats()}>
      <Icon name="refresh" size={14} strokeWidth={1.8} />
    </button>
  </div>

  {#if claudeChats.loading && claudeChats.sessions.length === 0}
    <p class="msg">Loading…</p>
  {:else if claudeChats.sessions.length === 0}
    <div class="empty">
      <Icon name="message" size={22} strokeWidth={1.5} />
      <p class="msg">No Claude sessions yet.</p>
      <p class="sub">Start one from the ✨ menu, then it shows up here to resume.</p>
    </div>
  {:else}
    <div class="list">
      {#each claudeChats.sessions as s (s.id)}
        <button class="chat" title={s.preview || s.id} onclick={() => resumeClaude(s.id)}>
          <span class="ci"><Icon name="sparkles" size={14} strokeWidth={1.6} /></span>
          <span class="meta">
            <span class="title">{s.preview || "(empty session)"}</span>
            <span class="when">{s.modified ? relativeTime(s.modified) : ""}{s.messages ? ` · ${s.messages} msg` : ""}</span>
          </span>
          <span class="go" aria-hidden="true"><Icon name="play" size={12} strokeWidth={2} /></span>
        </button>
      {/each}
    </div>
  {/if}
</div>

<style>
  .chats {
    height: 100%;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }
  .head {
    flex: 0 0 auto;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    padding: 6px 6px 6px 10px;
  }
  .hint {
    font-size: 11px;
    color: var(--color-ink-subtle);
  }
  .refresh {
    flex: 0 0 auto;
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
  .refresh:hover {
    color: var(--color-ink);
    background: var(--color-surface-3);
  }
  .list {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    padding: 0 6px 10px;
    display: flex;
    flex-direction: column;
    gap: 1px;
  }
  .chat {
    display: flex;
    align-items: center;
    gap: 9px;
    width: 100%;
    text-align: left;
    padding: 7px 8px;
    background: transparent;
    border: 0;
    border-radius: 6px;
    color: var(--color-ink);
    cursor: pointer;
    transition: background 80ms ease;
  }
  .chat:hover {
    background: var(--color-surface-3);
  }
  .ci {
    flex: 0 0 auto;
    display: inline-flex;
    color: var(--color-accent);
  }
  .meta {
    min-width: 0;
    flex: 1;
    display: flex;
    flex-direction: column;
    line-height: 1.3;
  }
  .title {
    font-size: 12.5px;
    overflow: hidden;
    display: -webkit-box;
    -webkit-line-clamp: 2; /* fino a 2 righe: più contesto per distinguere le chat */
    line-clamp: 2;
    -webkit-box-orient: vertical;
    line-height: 1.35;
  }
  .when {
    font-size: 11px;
    color: var(--color-ink-subtle);
  }
  .go {
    flex: 0 0 auto;
    display: inline-flex;
    color: var(--color-ink-subtle);
    opacity: 0;
    transition: opacity 80ms ease;
  }
  .chat:hover .go {
    opacity: 1;
  }
  .empty {
    padding: 22px 16px;
    display: flex;
    flex-direction: column;
    gap: 8px;
    align-items: flex-start;
    color: var(--color-ink-muted);
  }
  .msg {
    margin: 0;
    color: var(--color-ink-muted);
    font-size: 12.5px;
    padding: 2px 4px;
  }
  .sub {
    margin: 0;
    color: var(--color-ink-subtle);
    font-size: 12px;
    line-height: 1.5;
  }
</style>
