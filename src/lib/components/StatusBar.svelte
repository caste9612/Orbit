<script lang="ts">
  import Icon from "./Icon.svelte";
  import { workspace } from "../state/workspace.svelte";
</script>

<footer class="statusbar">
  <div class="left">
    <button class="seg" title="Ramo git">
      <Icon name="git-branch" size={13} strokeWidth={1.8} />
      <span>{workspace.branch ?? "—"}</span>
    </button>
  </div>
  <div class="right">
    <span class="seg static">Spazi: 2</span>
    <span class="seg static">UTF-8</span>
    <span class="seg static">LF</span>
    <span class="seg static">Testo semplice</span>
  </div>
</footer>

<style>
  .statusbar {
    height: 24px;
    flex: 0 0 24px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    background: var(--color-surface-0);
    border-top: 1px solid var(--color-line);
    padding: 0 6px;
    font-size: 11.5px;
    color: var(--color-ink-muted);
    user-select: none;
  }
  .left,
  .right {
    display: flex;
    align-items: center;
    gap: 1px;
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
    cursor: pointer;
  }
  .seg:not(.static):hover {
    background: var(--color-surface-3);
    color: var(--color-ink);
  }
  .seg.static {
    cursor: default;
  }
</style>
