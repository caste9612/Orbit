<script lang="ts">
  import { fly } from "svelte/transition";
  import Icon from "./Icon.svelte";
  import { toasts, dismiss } from "../state/toast.svelte";

  const icon: Record<string, string> = {
    info: "git-commit",
    success: "check",
    error: "x",
    attention: "sparkles",
  };
</script>

<div class="toaster">
  {#each toasts.list as t (t.id)}
    <div class="toast {t.kind}" transition:fly={{ x: 16, duration: 160 }}>
      <button
        class="body"
        title={t.onClick ? "Open" : "Dismiss"}
        onclick={() => {
          t.onClick?.();
          dismiss(t.id);
        }}
      >
        <span class="ti"><Icon name={icon[t.kind] ?? "git-commit"} size={14} strokeWidth={2} /></span>
        <span class="msg">{t.message}</span>
      </button>
      {#if t.sticky}
        <button class="x" aria-label="Dismiss" title="Dismiss" onclick={() => dismiss(t.id)}>
          <Icon name="x" size={12} strokeWidth={2} />
        </button>
      {/if}
    </div>
  {/each}
</div>

<style>
  .toaster {
    position: fixed;
    right: 14px;
    bottom: 32px;
    z-index: 120;
    display: flex;
    flex-direction: column;
    gap: 8px;
    align-items: flex-end;
    pointer-events: none;
  }
  .toast {
    pointer-events: auto;
    display: flex;
    align-items: stretch;
    max-width: 360px;
    border: 1px solid var(--color-line-strong);
    border-left-width: 3px;
    border-radius: var(--radius);
    background: var(--color-surface-2);
    box-shadow: var(--shadow-pop);
    color: var(--color-ink);
    font-size: 12.5px;
    overflow: hidden;
  }
  .toast.success {
    border-left-color: var(--color-success);
  }
  .toast.error {
    border-left-color: var(--color-danger);
  }
  .toast.info {
    border-left-color: var(--color-accent);
  }
  .toast.attention {
    border-left-color: var(--color-accent);
    background: rgba(var(--accent-rgb), 0.12); /* in accento, non invadente */
  }
  .body {
    flex: 1;
    min-width: 0;
    display: flex;
    align-items: center;
    gap: 9px;
    padding: 9px 13px;
    border: 0;
    background: transparent;
    color: inherit;
    font-size: inherit;
    text-align: left;
    cursor: pointer;
  }
  .body:hover {
    background: var(--color-surface-3);
  }
  .ti {
    flex: 0 0 auto;
    display: inline-flex;
  }
  .toast.success .ti {
    color: var(--color-success);
  }
  .toast.error .ti {
    color: var(--color-danger);
  }
  .toast.info .ti,
  .toast.attention .ti {
    color: var(--color-accent);
  }
  .msg {
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .x {
    flex: 0 0 auto;
    display: grid;
    place-items: center;
    width: 26px;
    border: 0;
    border-left: 1px solid var(--color-line);
    background: transparent;
    color: var(--color-ink-subtle);
    cursor: pointer;
  }
  .x:hover {
    background: var(--color-surface-3);
    color: var(--color-ink);
  }
</style>
