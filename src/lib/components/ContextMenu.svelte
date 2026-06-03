<script lang="ts">
  import Icon from "./Icon.svelte";

  export interface MenuItem {
    label: string;
    icon?: string;
    danger?: boolean;
    separatorBefore?: boolean;
    onClick: () => void;
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
    item.onClick();
  }
</script>

<svelte:window
  onkeydown={(e) => e.key === "Escape" && onClose()}
  onresize={onClose}
/>

<!-- backdrop trasparente: un click fuori chiude il menu -->
<button class="backdrop" aria-label="Chiudi menu" onpointerdown={onClose} oncontextmenu={(e) => { e.preventDefault(); onClose(); }}></button>

<div class="menu" style="left:{left}px; top:{top}px; width:{W}px" role="menu">
  {#each items as item (item.label)}
    {#if item.separatorBefore}<div class="sep"></div>{/if}
    <button class="item" class:danger={item.danger} role="menuitem" onclick={() => pick(item)}>
      <span class="ic">{#if item.icon}<Icon name={item.icon} size={14} strokeWidth={1.7} />{/if}</span>
      <span class="lbl">{item.label}</span>
    </button>
  {/each}
</div>

<style>
  .backdrop {
    position: fixed;
    inset: 0;
    z-index: 90;
    background: transparent;
    border: 0;
    padding: 0;
    cursor: default;
  }
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
    height: 28px;
    padding: 0 9px;
    border: 0;
    border-radius: var(--radius-sm);
    background: transparent;
    color: var(--color-ink);
    font-size: 12.5px;
    text-align: left;
    cursor: pointer;
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
</style>
