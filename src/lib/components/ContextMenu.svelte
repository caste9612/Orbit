<script lang="ts">
  import { scale } from "svelte/transition";
  import Icon from "./Icon.svelte";
  import Backdrop from "./Backdrop.svelte";

  export interface MenuItem {
    label: string;
    icon?: string;
    danger?: boolean;
    separatorBefore?: boolean;
    header?: boolean; // riga-titolo di sezione (non cliccabile)
    onClick?: () => void;
  }

  interface Props {
    x: number;
    y: number;
    items: MenuItem[];
    onClose: () => void;
  }
  let { x, y, items, onClose }: Props = $props();

  // Tiene il menu dentro la finestra (stima compatta: ~210px largo, righe da 28px).
  const W = 210;
  const rowH = 28;
  let height = $derived(items.length * rowH + items.filter((i) => i.separatorBefore).length * 5 + 8);
  let left = $derived(Math.min(x, window.innerWidth - W - 6));
  let top = $derived(Math.min(y, window.innerHeight - height - 6));

  function pick(item: MenuItem) {
    onClose();
    item.onClick?.();
  }
</script>

<Backdrop {onClose} z={90} closeOnRightClick />

<div class="menu" style="left:{left}px; top:{top}px; width:{W}px" role="menu" transition:scale={{ duration: 90, start: 0.97, opacity: 0.3 }}>
  {#each items as item, i (i)}
    {#if item.separatorBefore}<div class="sep"></div>{/if}
    {#if item.header}
      <div class="mhead">{item.label}</div>
    {:else}
      <button class="item" class:danger={item.danger} role="menuitem" onclick={() => pick(item)}>
        <span class="ic">{#if item.icon}<Icon name={item.icon} size={14} strokeWidth={1.7} />{/if}</span>
        <span class="lbl">{item.label}</span>
      </button>
    {/if}
  {/each}
</div>

<style>
  .menu {
    position: fixed;
    z-index: 91;
    padding: 4px;
    background: var(--color-surface-2);
    border: 1px solid var(--color-line-strong);
    border-radius: var(--radius);
    box-shadow: var(--shadow-pop);
    user-select: none;
  }
  .item {
    display: flex;
    align-items: center;
    gap: 9px;
    width: 100%;
    min-height: 28px;
    padding: 5px 9px;
    border: 0;
    border-radius: var(--radius-sm);
    background: transparent;
    color: var(--color-ink);
    font-size: 12.5px;
    line-height: 1.3;
    text-align: left;
    cursor: pointer;
  }
  .lbl {
    flex: 1;
    min-width: 0;
    overflow-wrap: anywhere; /* etichette lunghe vanno a capo invece di essere tagliate */
  }
  .item:hover {
    background: rgba(var(--accent-rgb), 0.18);
    color: #cfe5ff;
  }
  .item.danger:hover {
    background: rgba(241, 76, 76, 0.16);
    color: #ff9b9b;
  }
  .ic {
    flex: 0 0 16px;
    display: grid;
    place-items: center;
    color: var(--color-ink-muted);
  }
  .item:hover .ic {
    color: inherit;
  }
  .sep {
    height: 1px;
    margin: 4px 6px;
    background: var(--color-line);
  }
  .mhead {
    padding: 4px 9px 2px;
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.07em;
    text-transform: uppercase;
    color: var(--color-ink-subtle);
    user-select: none;
  }
</style>
