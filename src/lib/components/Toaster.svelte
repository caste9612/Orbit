<script lang="ts">
  import { fly } from "svelte/transition";
  import Icon from "./Icon.svelte";
  import { toasts, dismiss } from "../state/toast.svelte";

  const icon: Record<string, string> = { info: "git-commit", success: "check", error: "x" };
</script>

<div class="toaster">
  {#each toasts.list as t (t.id)}
    <button class="toast {t.kind}" onclick={() => dismiss(t.id)} transition:fly={{ x: 16, duration: 160 }}>
      <span class="ti"><Icon name={icon[t.kind] ?? "git-commit"} size={14} strokeWidth={2} /></span>
      <span class="msg">{t.message}</span>
    </button>
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
    align-items: center;
    gap: 9px;
    max-width: 360px;
    padding: 9px 13px;
    border: 1px solid var(--color-line-strong);
    border-left-width: 3px;
    border-radius: var(--radius);
    background: var(--color-surface-2);
    box-shadow: var(--shadow-pop);
    color: var(--color-ink);
    font-size: 12.5px;
    text-align: left;
    cursor: pointer;
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
  .toast.info .ti {
    color: var(--color-accent);
  }
  .msg {
    overflow: hidden;
    text-overflow: ellipsis;
  }
</style>
