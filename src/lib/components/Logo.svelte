<script lang="ts">
  // Logo del brand "Orbit": la NUOVA icona dell'app (pianeta con anello), così il mark in-UI
  // coincide con l'icona OS. Asset raster piccolo (128px, angoli già arrotondati e trasparenti)
  // reso alla `size` richiesta — vettorializzarla a mano non replicherebbe pianeta/anello/gradiente.
  import iconUrl from "../assets/orbit-icon.png";
  interface Props {
    size?: number;
  }
  let { size = 22 }: Props = $props();
</script>

<img
  src={iconUrl}
  width={size}
  height={size}
  alt=""
  aria-hidden="true"
  draggable="false"
  style="display:block"
/>
