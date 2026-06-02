<script lang="ts">
  import Icon from "./Icon.svelte";
  import { layout, selectView, toggleTerminal } from "../state/layout.svelte";

  const views = [
    { id: "explorer", icon: "explorer", label: "Esplora risorse" },
    { id: "git", icon: "git-branch", label: "Controllo sorgente" },
    { id: "search", icon: "search", label: "Cerca" },
  ] as const;
</script>

<nav class="activitybar">
  <div class="group">
    {#each views as v (v.id)}
      <button
        class="item"
        class:active={layout.sidebarVisible && layout.sidebarView === v.id}
        title={v.label}
        aria-label={v.label}
        aria-pressed={layout.sidebarVisible && layout.sidebarView === v.id}
        onclick={() => selectView(v.id)}
      >
        <Icon name={v.icon} size={23} strokeWidth={1.6} />
      </button>
    {/each}
  </div>

  <div class="group">
    <button
      class="item"
      class:active={layout.terminalVisible}
      title="Mostra/nascondi terminale"
      aria-label="Mostra/nascondi terminale"
      onclick={toggleTerminal}
    >
      <Icon name="panel-bottom" size={22} strokeWidth={1.6} />
    </button>
    <button class="item" title="Impostazioni" aria-label="Impostazioni">
      <Icon name="settings" size={22} strokeWidth={1.6} />
    </button>
  </div>
</nav>

<style>
  .activitybar {
    width: 48px;
    flex: 0 0 48px;
    background: var(--color-surface-0);
    border-right: 1px solid var(--color-line);
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    user-select: none;
  }
  .group {
    display: flex;
    flex-direction: column;
  }
  .item {
    position: relative;
    width: 48px;
    height: 48px;
    display: grid;
    place-items: center;
    color: var(--color-ink-subtle);
    background: transparent;
    border: 0;
    cursor: pointer;
    transition: color 90ms ease;
  }
  .item:hover {
    color: var(--color-ink);
  }
  .item.active {
    color: var(--color-ink);
  }
  /* indicatore accento a sinistra dell'elemento attivo */
  .item.active::before {
    content: "";
    position: absolute;
    left: 0;
    top: 8px;
    bottom: 8px;
    width: 2px;
    border-radius: 0 2px 2px 0;
    background: var(--color-accent);
  }
  .item:focus-visible {
    outline: none;
    color: var(--color-ink);
  }
</style>
