<script lang="ts">
  // Anteprima dei file HTML: iframe servito dall'asset protocol di Tauri (convertFileSrc),
  // come i PDF di AssetView. Il documento mantiene il suo URL reale, quindi ancore (#toc),
  // immagini/CSS relativi e data URI funzionano nativamente. `sandbox` senza allow-scripts:
  // gli script della pagina NON girano — il WebView padre ha accesso all'IPC di Tauri e una
  // pagina arbitraria non deve poterlo raggiungere (stessa ragione per cui markdown.ts sanifica).
  import { convertFileSrc } from "@tauri-apps/api/core";

  interface Props {
    path: string;
    diskRev: number; // bump a ogni save/reload esterno → rimonta l'iframe per rileggere dal disco
  }
  let { path, diskRev }: Props = $props();
  let src = $derived(convertFileSrc(path));
</script>

{#key diskRev}
  <iframe {src} title={path} sandbox="allow-same-origin"></iframe>
{/key}

<style>
  iframe {
    width: 100%;
    height: 100%;
    border: 0;
    background: #fff; /* le pagine HTML assumono sfondo chiaro; evita il flash scuro del tema */
  }
</style>
