<script lang="ts">
  // Viewer per file non testuali mostrabili dal WebView: immagini e PDF. Usa l'asset
  // protocol di Tauri (convertFileSrc) per servire il file locale senza base64.
  import { convertFileSrc } from "@tauri-apps/api/core";

  interface Props {
    path: string;
    kind: "image" | "pdf";
  }
  let { path, kind }: Props = $props();
  let src = $derived(convertFileSrc(path));
</script>

<div class="asset" class:img={kind === "image"}>
  {#if kind === "image"}
    <img {src} alt={path} />
  {:else}
    <iframe {src} title={path}></iframe>
  {/if}
</div>

<style>
  .asset {
    height: 100%;
    width: 100%;
    min-height: 0;
  }
  /* immagine: centrata, con scacchiera per vedere la trasparenza */
  .asset.img {
    overflow: auto;
    display: grid;
    place-items: center;
    padding: 16px;
    box-sizing: border-box;
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
  img {
    display: block;
    max-width: 100%;
    max-height: 100%;
    object-fit: contain;
  }
  iframe {
    width: 100%;
    height: 100%;
    border: 0;
    background: #fff;
  }
</style>
