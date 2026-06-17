<script lang="ts">
  // Renderer dei glifi di file colorati (approccio IBRIDO). Riceve {glyph,color} da `fileIcon()`:
  //  - `lang:<id>`  → SIMBOLO SVG dedicato (identità forte): mono-colore via currentColor (tinta =
  //                   `color`), tranne Python che ha due colori fissi.
  //  - `tile:<XX>`  → TILE MONOGRAMMA (≤2 caratteri) per i linguaggi senza simbolo. Fondo e testo
  //                   sono RICAVATI dal colore-linguaggio con una ricetta a UN SOLO punto di switch
  //                   (tenue ↔ pieno), così cambiare stile è una riga.
  //  - altro        → fallback line-art monocroma/tinta (Icon.svelte) per i tipi non-codice.
  import Icon from "./Icon.svelte";

  interface Props {
    glyph: string;
    color: string;
    size?: number;
    strokeWidth?: number; // solo per il fallback line-art (Icon)
  }
  let { glyph, color, size = 16, strokeWidth = 1.7 }: Props = $props();

  // --- Simboli dedicati per linguaggio (viewBox 0 0 24 24, stroke/fill = currentColor) ----------
  const LANG_SYMBOLS: Record<string, string> = {
    // esagono + punto centrale
    rust: `<polygon points="12,3.5 19.36,7.75 19.36,16.25 12,20.5 4.64,16.25 4.64,7.75" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="12" cy="12" r="2.2" fill="currentColor" stroke="none"/>`,
    // swoosh a S
    svelte: `<path d="M17 6 C 5 6 5 11 12 12 C 19 13 19 18 7 18" fill="none" stroke="currentColor" stroke-width="2.4"/>`,
    // due dischi che si incastrano (colori fissi Python)
    python: `<circle cx="9.8" cy="9.8" r="5.2" fill="#4b8bbe" stroke="none"/><circle cx="14.2" cy="14.2" r="5.2" fill="#ffd43b" stroke="none"/>`,
    // doppio chevron
    go: `<path d="M6 7 L10.5 12 L6 17" fill="none" stroke="currentColor" stroke-width="2.2"/><path d="M12 7 L16.5 12 L12 17" fill="none" stroke="currentColor" stroke-width="2.2"/>`,
    // doppia V
    vue: `<path d="M4 6 L12 19 L20 6" fill="none" stroke="currentColor" stroke-width="2"/><path d="M8.5 6 L12 12 L15.5 6" fill="none" stroke="currentColor" stroke-width="2"/>`,
  };

  // --- Tile monogramma: ricava fondo + testo dal colore-linguaggio ------------------------------
  // UNICO punto di switch fra "tenue" (badge scuro, default) e "pieno" (colore acceso, testo chiaro).
  const TILE_STYLE: "tenue" | "pieno" = "tenue";
  const TILE_DARK_BASE = "#14161b"; // fondo scuro su cui poggia il badge "tenue"

  function hexToRgb(h: string): [number, number, number] {
    const s = h.replace("#", "");
    const v = s.length === 3 ? s.split("").map((c) => c + c).join("") : s;
    return [parseInt(v.slice(0, 2), 16), parseInt(v.slice(2, 4), 16), parseInt(v.slice(4, 6), 16)];
  }
  function toHex(r: number, g: number, b: number): string {
    return (
      "#" +
      [r, g, b].map((x) => Math.round(Math.max(0, Math.min(255, x))).toString(16).padStart(2, "0")).join("")
    );
  }
  /** Mescola `a` verso `b` della frazione `t` (0..1). */
  function mix(a: string, b: string, t: number): string {
    const A = hexToRgb(a);
    const B = hexToRgb(b);
    return toHex(A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t, A[2] + (B[2] - A[2]) * t);
  }
  /** Luminanza percepita 0..1 (per decidere se schiarire il testo del tile). */
  function lum(h: string): number {
    const [r, g, b] = hexToRgb(h);
    return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  }
  function tileColors(c: string): { fill: string; text: string } {
    if (TILE_STYLE === "pieno") return { fill: c, text: lum(c) > 0.6 ? "#1a1a1a" : "#ffffff" };
    // tenue: fondo = colore al ~22% sul fondo scuro; testo = colore (schiarito se troppo scuro)
    return { fill: mix(TILE_DARK_BASE, c, 0.22), text: lum(c) < 0.5 ? mix(c, "#ffffff", 0.35) : c };
  }

  const kind = $derived(glyph.startsWith("lang:") ? "lang" : glyph.startsWith("tile:") ? "tile" : "icon");
  const langId = $derived(kind === "lang" ? glyph.slice(5) : "");
  const tileLabel = $derived(kind === "tile" ? glyph.slice(5) : "");
  const tile = $derived(kind === "tile" ? tileColors(color) : null);
</script>

{#if kind === "lang" && LANG_SYMBOLS[langId]}
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke-linecap="round"
    stroke-linejoin="round"
    style="color:{color}; flex:0 0 auto; display:block"
    aria-hidden="true"
  >
    <!-- eslint-disable-next-line svelte/no-at-html-tags — SVG statico autoredatto, nessun input utente -->
    {@html LANG_SYMBOLS[langId]}
  </svg>
{:else if kind === "tile" && tile}
  <svg width={size} height={size} viewBox="0 0 24 24" style="flex:0 0 auto; display:block" aria-hidden="true">
    <rect x="3" y="3" width="18" height="18" rx="6" fill={tile.fill} />
    <text
      x="12"
      y="12.6"
      text-anchor="middle"
      dominant-baseline="central"
      fill={tile.text}
      style="font:500 11px var(--font-sans)">{tileLabel}</text
    >
  </svg>
{:else}
  <span class="fg-fallback" style="color:{color}; display:inline-flex">
    <Icon name={glyph} {size} {strokeWidth} />
  </span>
{/if}
