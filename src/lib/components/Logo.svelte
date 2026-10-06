<script lang="ts">
  // Logo del brand "Orbit" ("Orbita sfumata", scelto dai mockup UI del 2026-10-06): pianeta sfumato
  // blu→viola, anello inclinato e satellite — lo stesso simbolo dell'icona dell'app (app-icon.svg),
  // qui vettoriale e senza piastrella, nitido a qualsiasi `size`. Anello e satellite seguono i colori
  // del tema (si leggono anche su Orbit Light); il pianeta resta nei colori del brand.
  interface Props {
    size?: number;
  }
  let { size = 22 }: Props = $props();
  const uid = $props.id();
  const gid = `orbit-logo-${uid}`; // id unico del gradiente: il logo compare più volte nella pagina
</script>

<svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true" style="display:block">
  <defs>
    <linearGradient id={gid} x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#4c8dff" />
      <stop offset="1" stop-color="#7c5cff" />
    </linearGradient>
  </defs>
  <ellipse
    cx="12"
    cy="12"
    rx="10.8"
    ry="4.3"
    stroke-width="1.2"
    transform="rotate(-28 12 12)"
    style="stroke: var(--color-ink-muted); stroke-opacity: 0.75"
  />
  <circle cx="12" cy="12" r="4.6" fill="url(#{gid})" />
  <circle cx="20.6" cy="7.5" r="1.7" style="fill: var(--color-ink)" />
</svg>
