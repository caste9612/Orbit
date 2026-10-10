<script lang="ts">
  import { scale } from "svelte/transition";
  import Icon from "./Icon.svelte";
  import Backdrop from "./Backdrop.svelte";

  export interface MenuItem {
    label: string;
    icon?: string;
    swatch?: string; // pallino colorato al posto dell'icona (scelta colore delle schede terminale)
    danger?: boolean;
    disabled?: boolean; // voce visibile ma spenta (es. "Close to the right" sull'ultima scheda)
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

  // Tiene il menu dentro la finestra: largo 210 px; l'altezza è quella MISURATA (M59: la stima contava
  // 5 px per separatore invece di 9 e ignorava le etichette su due righe → vicino al bordo usciva).
  const W = 210;
  const rowH = 28;
  let measured = $state(0);
  let height = $derived(measured || items.length * rowH + items.filter((i) => i.separatorBefore).length * 9 + 10);
  let left = $derived(Math.max(6, Math.min(x, window.innerWidth - W - 6)));
  let top = $derived(Math.max(6, Math.min(y, window.innerHeight - height - 6)));

  function pick(item: MenuItem) {
    onClose();
    item.onClick?.();
  }
</script>

<Backdrop {onClose} z={90} closeOnRightClick />

<div class="menu" style="left:{left}px; top:{top}px; width:{W}px" role="menu" bind:offsetHeight={measured} transition:scale={{ duration: 90, start: 0.97, opacity: 0.3 }}>
  {#each items as item, i (i)}
    {#if item.separatorBefore}<div class="sep"></div>{/if}
    {#if item.header}
      <div class="mhead">{item.label}</div>
    {:else}
      <button class="item" class:danger={item.danger} role="menuitem" disabled={item.disabled} onclick={() => pick(item)}>
        <span class="ic">
          {#if item.icon}<Icon name={item.icon} size={14} strokeWidth={1.7} />{:else if item.swatch}<span class="swatch" style="background:{item.swatch}"></span>{/if}
        </span>
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
  .item:disabled,
  .item:disabled:hover {
    color: var(--color-ink-subtle);
    background: transparent;
    cursor: default;
  }
  .ic {
    flex: 0 0 16px;
    display: grid;
    place-items: center;
    color: var(--color-ink-muted);
  }
  .swatch {
    width: 10px;
    height: 10px;
    border-radius: 50%;
    box-shadow: 0 0 0 1px rgba(255, 255, 255, 0.12);
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
