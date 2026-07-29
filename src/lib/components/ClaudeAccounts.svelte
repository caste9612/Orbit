<script lang="ts">
  // Gestione degli account Claude preconfigurati (solo EMAIL, nessuna credenziale): lista con
  // rimozione, aggiunta manuale e aggiunta rapida dell'account CLI corrente. Le email si copiano
  // poi dal menu del bottone Usage, per incollarle nel form di login del pannello.
  import Icon from "./Icon.svelte";
  import Backdrop from "./Backdrop.svelte";
  import { settings } from "../state/settings.svelte";

  interface Props {
    current: string | null; // account CLI corrente (da ~/.claude.json), per l'aggiunta rapida
    onClose: () => void;
  }
  let { current, onClose }: Props = $props();

  let input = $state("");
  const valid = $derived(/^\S+@\S+\.\S+$/.test(input.trim()));
  const canAddCurrent = $derived(!!current && !settings.claudeAccounts.includes(current));

  function add(email: string): void {
    const e = email.trim();
    if (!e || settings.claudeAccounts.includes(e)) return;
    settings.claudeAccounts.push(e); // l'autosave delle settings persiste da sé
    input = "";
  }
  function remove(email: string): void {
    settings.claudeAccounts = settings.claudeAccounts.filter((a) => a !== email);
  }
</script>

<svelte:window
  onkeydown={(e) => {
    if (e.key === "Escape") {
      e.stopPropagation();
      onClose();
    }
  }}
/>

<Backdrop {onClose} z={95} />
<div class="box" role="dialog" aria-label="Claude accounts">
  <div class="head">
    <span class="title">Claude accounts</span>
    <button class="hic" title="Close" onclick={onClose} aria-label="Close">
      <Icon name="x" size={13} strokeWidth={1.8} />
    </button>
  </div>
  <div class="hint">
    Saved <b>emails only</b> — no credentials. Copy one from the Usage menu and paste it into the
    panel's login form.
  </div>

  {#each settings.claudeAccounts as email (email)}
    <div class="row">
      <span class="mail" title={email}>{email}</span>
      <button class="hic" title="Remove" onclick={() => remove(email)} aria-label="Remove {email}">
        <Icon name="trash" size={12} strokeWidth={1.7} />
      </button>
    </div>
  {:else}
    <div class="empty">No accounts saved yet.</div>
  {/each}

  {#if canAddCurrent}
    <button class="addcur" onclick={() => add(current!)}>
      <Icon name="plus" size={12} strokeWidth={2} />
      <span>Add current CLI account ({current})</span>
    </button>
  {/if}

  <div class="addrow">
    <input
      type="email"
      placeholder="name@example.com"
      bind:value={input}
      onkeydown={(e) => {
        if (e.key === "Enter" && valid) add(input);
      }}
    />
    <button class="addbtn" disabled={!valid} onclick={() => add(input)}>Add</button>
  </div>
</div>

<style>
  .box {
    position: fixed;
    z-index: 96;
    left: 50%;
    top: 50%;
    transform: translate(-50%, -50%);
    width: 340px;
    max-width: calc(100vw - 24px);
    padding: 12px;
    background: var(--color-surface-2);
    border: 1px solid var(--color-line-strong);
    border-radius: var(--radius);
    box-shadow: var(--shadow-pop);
    color: var(--color-ink);
  }
  .head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 6px;
  }
  .title {
    font-size: 12.5px;
    font-weight: 600;
    letter-spacing: 0.02em;
  }
  .hint {
    font-size: 11px;
    color: var(--color-ink-subtle);
    margin-bottom: 10px;
  }
  .row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    padding: 5px 8px;
    margin-bottom: 4px;
    background: var(--color-surface-1);
    border: 1px solid var(--color-line);
    border-radius: 6px;
  }
  .mail {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 11.5px;
  }
  .empty {
    padding: 8px 2px;
    font-size: 11.5px;
    color: var(--color-ink-subtle);
    text-align: center;
  }
  .addcur {
    display: flex;
    align-items: center;
    gap: 6px;
    width: 100%;
    margin: 8px 0 0;
    padding: 5px 8px;
    background: transparent;
    border: 1px dashed var(--color-line-strong);
    border-radius: 6px;
    color: var(--color-ink-muted);
    font-size: 11px;
    cursor: pointer;
    text-align: left;
  }
  .addcur:hover {
    border-color: var(--color-accent);
    color: var(--color-ink);
  }
  .addcur span {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .addrow {
    display: flex;
    gap: 6px;
    margin-top: 8px;
  }
  .addrow input {
    flex: 1;
    min-width: 0;
    box-sizing: border-box;
    padding: 4px 8px;
    background: var(--color-surface-1);
    border: 1px solid var(--color-line-strong);
    border-radius: 6px;
    color: var(--color-ink);
    font-family: var(--font-sans);
    font-size: 11.5px;
  }
  .addrow input:focus {
    outline: none;
    border-color: var(--color-accent);
  }
  .addbtn {
    padding: 4px 12px;
    background: var(--color-accent);
    border: 0;
    border-radius: 6px;
    color: #fff;
    font-size: 11.5px;
    cursor: pointer;
  }
  .addbtn:disabled {
    opacity: 0.45;
    cursor: default;
  }
  .hic {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 22px;
    height: 20px;
    flex-shrink: 0;
    background: transparent;
    border: 0;
    border-radius: 5px;
    color: var(--color-ink-muted);
    cursor: pointer;
  }
  .hic:hover {
    background: var(--color-surface-4);
    color: var(--color-ink);
  }
</style>
