<script lang="ts">
  // Badge monogramma per tipo di simbolo (C/I/S/E/R/M/ƒ/P…), colorato. Le classi astratte hanno
  // bordo tratteggiato. Usato dalla barra dei correlati e dalla palette dei simboli di progetto.
  let { kind, isAbstract = false, size = 15 }: { kind: string; isAbstract?: boolean; size?: number } = $props();

  const MAP: Record<string, { ch: string; color: string }> = {
    class: { ch: "C", color: "#e3b341" },
    interface: { ch: "I", color: "#56b6c2" },
    struct: { ch: "S", color: "#d19a66" },
    enum: { ch: "E", color: "#98c379" },
    record: { ch: "R", color: "#5bb3a0" },
    trait: { ch: "T", color: "#56b6c2" },
    type: { ch: "T", color: "#56b6c2" },
    method: { ch: "M", color: "#c678dd" },
    function: { ch: "ƒ", color: "#c678dd" },
    property: { ch: "P", color: "#9da5b4" },
  };
  const b = $derived(MAP[kind] ?? { ch: "•", color: "#8b929e" });
</script>

<span
  class="kb"
  class:abstract={isAbstract}
  title={isAbstract ? `abstract ${kind}` : kind}
  style="--c:{b.color}; width:{size}px; height:{size}px; font-size:{Math.round(size * 0.62)}px"
>{b.ch}</span>

<style>
  .kb {
    display: inline-grid;
    place-items: center;
    flex: 0 0 auto;
    border-radius: 4px;
    background: color-mix(in srgb, var(--c) 20%, transparent);
    color: var(--c);
    font-family: var(--font-sans);
    font-weight: 700;
    line-height: 1;
    border: 1px solid transparent;
  }
  .kb.abstract {
    background: transparent;
    border: 1px dashed var(--c);
  }
</style>
