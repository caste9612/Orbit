<script lang="ts">
  // Sfondo a tutto schermo che chiude il popup al click fuori e con Esc.
  // Usato da menu contestuale, quick-open, impostazioni, scaffale, popup branch.
  interface Props {
    onClose: () => void;
    dim?: boolean; // sfondo scurito (per i modali centrati)
    z?: number; // sotto il box del popup (che deve avere z maggiore)
    closeOnRightClick?: boolean; // per il menu contestuale
  }
  let { onClose, dim = false, z = 90, closeOnRightClick = false }: Props = $props();
</script>

<svelte:window onkeydown={(e) => e.key === "Escape" && onClose()} />
<button
  class="backdrop"
  class:dim
  style="z-index:{z}"
  aria-label="Close"
  onpointerdown={onClose}
  oncontextmenu={(e) => {
    if (closeOnRightClick) {
      e.preventDefault();
      onClose();
    }
  }}
></button>

<style>
  .backdrop {
    position: fixed;
    inset: 0;
    background: transparent;
    border: 0;
    padding: 0;
    cursor: default;
  }
  .backdrop.dim {
    background: rgba(0, 0, 0, 0.32);
  }
</style>
