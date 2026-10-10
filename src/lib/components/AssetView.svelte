<script module lang="ts">
  // Zoom e scorrimento di ogni immagine, ricordati finché Orbit resta aperto: la vista si rimonta a ogni
  // cambio di scheda, e tornando sull'immagine la si ritrova com'era.
  const memo = new Map<string, { scale: number | null; left: number; top: number }>();
</script>

<script lang="ts">
  // Viewer per file non testuali mostrabili dal WebView: immagini e PDF. Usa l'asset
  // protocol di Tauri (convertFileSrc) per servire il file locale senza base64.
  // Immagini (M58): adattate alla vista; Ctrl+rotella le ingrandisce attorno al cursore, come il font del
  // codice; doppio clic (o la percentuale in basso) passa da "adatta" al 100% e ritorno; ingrandite si
  // spostano trascinandole o con la rotella.
  import { flushSync } from "svelte";
  import { convertFileSrc } from "@tauri-apps/api/core";

  interface Props {
    path: string;
    kind: "image" | "pdf";
  }
  let { path, kind }: Props = $props();
  let src = $derived(convertFileSrc(path));

  const PAD = 16; // margine attorno all'immagine
  // scatti della rotella su livelli "tondi", come nei visualizzatori di immagini; c'è anche "adatta"
  const LEVELS = [0.05, 0.1, 0.15, 0.2, 0.25, 1 / 3, 0.5, 2 / 3, 0.75, 1, 1.25, 1.5, 2, 3, 4, 5, 6, 8, 10, 12, 16, 20, 24, 32];
  const PIXELATED = 3; // da 300% i pixel restano netti invece di sfumare (come VS Code)
  const NOTCH = 50; // delta della rotella per uno scatto: i touchpad mandano tanti delta piccoli

  let view = $state<HTMLDivElement>();
  let vw = $state(0); // area visibile
  let vh = $state(0);
  let nw = $state(0); // dimensioni naturali, note a immagine caricata
  let nh = $state(0);
  let loaded = $state(false);
  let failed = $state(false);
  let scale = $state<number | null>(null); // null = adattata alla vista (e la segue quando cambia)
  // senza misure naturali l'immagine resta adattata, senza zoom. WebView2 le dà sempre (anche a un SVG con
  // il solo viewBox: altezza 150 e larghezza dal rapporto); altri motori potrebbero non darle
  let sized = $derived(loaded && nw > 0 && nh > 0);
  let fit = $derived(sized && vw && vh ? Math.max(0.01, Math.min(1, (vw - 2 * PAD) / nw, (vh - 2 * PAD) / nh)) : 1);
  let eff = $derived(scale ?? fit);
  let geo = $derived(placeAt(eff));
  let pannable = $derived(sized && (geo.sw > vw || geo.sh > vh));
  let grabbing = $state(false);
  let grab: { x: number; y: number; left: number; top: number } | null = null;
  let wheelAcc = 0;

  /** Ingombro dell'immagine e del "palco" che scorre, alla scala s. Posizioni intere: nitida al 100%. */
  function placeAt(s: number) {
    const w = nw * s;
    const h = nh * s;
    const sw = Math.max(vw, Math.ceil(w) + 2 * PAD);
    const sh = Math.max(vh, Math.ceil(h) + 2 * PAD);
    return { w, h, sw, sh, x: Math.round((sw - w) / 2), y: Math.round((sh - h) / 2) };
  }

  /** Porta la scala a `next` tenendo fermo il punto sotto (ax, ay), in coordinate della vista. */
  function zoomTo(next: number | null, ax: number, ay: number) {
    if (!view || !sized) return;
    const s0 = eff;
    const g0 = geo;
    const ix = (view.scrollLeft + ax - g0.x) / s0;
    const iy = (view.scrollTop + ay - g0.y) / s0;
    scale = next;
    flushSync(); // il palco ha già la misura nuova: lo scorrimento non viene tagliato a quella vecchia
    view.scrollLeft = geo.x + ix * eff - ax;
    view.scrollTop = geo.y + iy * eff - ay;
    remember();
  }

  /** Livello successivo nella direzione data ("adatta" compreso); null = adatta. */
  function stepFrom(cur: number, dir: number): number | null {
    const levels = [...LEVELS, fit].sort((a, b) => a - b);
    const next = dir > 0 ? levels.find((l) => l > cur * 1.001) : levels.findLast((l) => l < cur / 1.001);
    if (next === undefined) return scale; // già al limite
    return next === fit ? null : next;
  }

  function onWheel(e: WheelEvent) {
    if (!e.ctrlKey || !sized || !view) return; // senza Ctrl la rotella scorre l'immagine ingrandita
    e.preventDefault();
    wheelAcc += e.deltaMode === 1 ? e.deltaY * 33 : e.deltaY;
    if (Math.abs(wheelAcc) < NOTCH) return;
    const dir = wheelAcc < 0 ? 1 : -1;
    wheelAcc = 0;
    const r = view.getBoundingClientRect();
    zoomTo(stepFrom(eff, dir), e.clientX - r.left, e.clientY - r.top);
  }

  /** Adattata → 100% (200% se al 100% ci sta già); ingrandita → di nuovo adattata. */
  function toggleFit(ax: number, ay: number) {
    zoomTo(scale !== null ? null : fit < 1 ? 1 : 2, ax, ay);
  }
  let toggleLabel = $derived(scale !== null ? "Fit to window" : fit < 1 ? "Actual size" : "Zoom to 200%");

  function onDblClick(e: MouseEvent) {
    if (!view) return;
    const r = view.getBoundingClientRect();
    toggleFit(e.clientX - r.left, e.clientY - r.top);
  }

  function onPointerDown(e: PointerEvent) {
    if (e.button !== 0 || !pannable || !view) return;
    e.preventDefault(); // niente selezione né trascinamento nativo dell'immagine
    grab = { x: e.clientX, y: e.clientY, left: view.scrollLeft, top: view.scrollTop };
    grabbing = true;
    view.setPointerCapture(e.pointerId);
  }
  function onPointerMove(e: PointerEvent) {
    if (!grab || !view) return;
    view.scrollLeft = grab.left - (e.clientX - grab.x);
    view.scrollTop = grab.top - (e.clientY - grab.y);
  }
  function onPointerUp() {
    grab = null;
    grabbing = false;
  }

  function onLoad(e: Event) {
    const img = e.currentTarget as HTMLImageElement;
    nw = img.naturalWidth;
    nh = img.naturalHeight;
    loaded = true;
    const m = memo.get(path);
    if (m && view && sized) {
      scale = m.scale;
      flushSync();
      view.scrollLeft = m.left;
      view.scrollTop = m.top;
    }
  }
  function remember() {
    if (view && sized) memo.set(path, { scale, left: view.scrollLeft, top: view.scrollTop });
  }
</script>

{#if kind === "image"}
  <div class="asset imgview">
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div
      class="view"
      class:pan={pannable}
      class:grabbing
      bind:this={view}
      bind:clientWidth={vw}
      bind:clientHeight={vh}
      onwheel={onWheel}
      onscroll={remember}
      onpointerdown={onPointerDown}
      onpointermove={onPointerMove}
      onpointerup={onPointerUp}
      onpointercancel={onPointerUp}
      ondblclick={onDblClick}
    >
      {#if failed}
        <div class="msg">This image can't be displayed</div>
      {:else}
        <div class="stage" class:free={loaded && !sized} style={sized ? `width:${geo.sw}px; height:${geo.sh}px` : ""}>
          <img
            {src}
            alt={path}
            draggable="false"
            class:pending={!loaded}
            class:pixelated={sized && eff >= PIXELATED}
            style={sized ? `left:${geo.x}px; top:${geo.y}px; width:${geo.w}px; height:${geo.h}px` : ""}
            onload={onLoad}
            onerror={() => (failed = true)}
          />
        </div>
      {/if}
    </div>
    {#if sized}
      <div class="zoombar">
        <span class="dims">{nw} × {nh}</span>
        <button class="zl" class:on={scale !== null} title="{toggleLabel} (double-click) · Ctrl+Wheel to zoom" onclick={() => toggleFit(vw / 2, vh / 2)}>
          {Math.round(eff * 100)}%
        </button>
      </div>
    {/if}
  </div>
{:else}
  <div class="asset">
    <iframe {src} title={path}></iframe>
  </div>
{/if}

<style>
  .asset {
    height: 100%;
    width: 100%;
    min-height: 0;
  }
  .imgview {
    position: relative; /* ancora la barra dello zoom, che non scorre con l'immagine */
  }
  /* la vista scorre senza barre: si sposta trascinando o con la rotella (le barre, comparendo, farebbero
     saltare l'immagine di mezza barra a ogni scatto di zoom) */
  .view {
    width: 100%;
    height: 100%;
    overflow: auto;
    scrollbar-width: none;
    background: #1e1e1e;
  }
  .view::-webkit-scrollbar {
    display: none;
  }
  .view.pan {
    cursor: grab;
  }
  .view.grabbing {
    cursor: grabbing;
  }
  .stage {
    position: relative;
  }
  /* scacchiera dietro l'immagine (si vede la trasparenza) e che si sposta con lei */
  .stage img {
    position: absolute;
    display: block;
    max-width: none;
    user-select: none;
    background-color: #1e1e1e;
    background-image:
      linear-gradient(45deg, #2a2a2a 25%, transparent 25%),
      linear-gradient(-45deg, #2a2a2a 25%, transparent 25%),
      linear-gradient(45deg, transparent 75%, #2a2a2a 75%),
      linear-gradient(-45deg, transparent 75%, #2a2a2a 75%);
    background-size: 20px 20px;
    background-position:
      0 0,
      0 10px,
      10px -10px,
      -10px 0;
  }
  .stage img.pending {
    /* prima del caricamento le misure non si sanno ancora: invisibile e senza ingombro (l'immagine si
       carica lo stesso, e naturalWidth non dipende dalla misura mostrata) */
    visibility: hidden;
    width: 0;
    height: 0;
  }
  .stage img.pixelated {
    image-rendering: pixelated;
  }
  /* immagine senza misure naturali: adattata alla vista come prima della M58 */
  .stage.free {
    height: 100%;
    display: grid;
    place-items: center;
    padding: 16px;
    box-sizing: border-box;
  }
  .stage.free img {
    position: static;
    max-width: 100%;
    max-height: 100%;
    object-fit: contain;
  }
  .msg {
    height: 100%;
    display: grid;
    place-items: center;
    color: var(--color-ink-subtle);
    font-size: 12.5px;
  }
  .zoombar {
    position: absolute;
    right: 12px;
    bottom: 12px;
    display: flex;
    align-items: center;
    gap: 6px;
    height: 24px;
    padding: 0 2px 0 9px;
    background: var(--color-surface-2);
    border: 1px solid var(--color-line-strong);
    border-radius: var(--r-md);
    box-shadow: 0 4px 14px rgba(0, 0, 0, 0.35);
    color: var(--color-ink-subtle);
    font-size: 11.5px;
    font-variant-numeric: tabular-nums;
    user-select: none;
  }
  .zl {
    height: 18px;
    min-width: 44px;
    padding: 0 6px;
    border: 0;
    border-radius: var(--r-sm);
    background: transparent;
    color: var(--color-ink-muted);
    font: inherit;
    cursor: pointer;
  }
  .zl.on {
    color: var(--color-ink);
  }
  .zl:hover {
    background: var(--color-surface-3);
    color: var(--color-ink);
  }
  iframe {
    width: 100%;
    height: 100%;
    border: 0;
    background: #fff;
  }
</style>
