<script lang="ts">
  // Divisore trascinabile tra pannelli. Nessuna dipendenza: usa i pointer events.
  interface Props {
    orientation: "vertical" | "horizontal";
    onResize: (delta: number) => void;
  }
  let { orientation, onResize }: Props = $props();

  let dragging = $state(false);
  let last = 0;

  function down(e: PointerEvent) {
    dragging = true;
    last = orientation === "vertical" ? e.clientX : e.clientY;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }
  function move(e: PointerEvent) {
    if (!dragging) return;
    const cur = orientation === "vertical" ? e.clientX : e.clientY;
    onResize(cur - last);
    last = cur;
  }
  function up(e: PointerEvent) {
    dragging = false;
    try {
      (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {
      /* no-op */
    }
  }
</script>

<div
  role="separator"
  aria-orientation={orientation === "vertical" ? "vertical" : "horizontal"}
  tabindex="-1"
  class="splitter {orientation}"
  class:dragging
  onpointerdown={down}
  onpointermove={move}
  onpointerup={up}
  onpointercancel={up}
></div>

<style>
  .splitter {
    position: relative;
    flex: 0 0 auto;
    background: transparent;
    z-index: 5;
  }
  .splitter.vertical {
    width: 4px;
    cursor: col-resize;
  }
  .splitter.horizontal {
    height: 4px;
    cursor: row-resize;
  }
  /* grip centrale: invisibile a riposo (mostra lo sfondo come gap), accento all'hover */
  .splitter::after {
    content: "";
    position: absolute;
    border-radius: 2px;
    background: transparent;
    transition: background 80ms ease;
  }
  .splitter.vertical::after {
    inset: 6px 1px;
  }
  .splitter.horizontal::after {
    inset: 1px 6px;
  }
  .splitter:hover::after,
  .splitter.dragging::after {
    background: var(--color-accent);
  }
</style>
