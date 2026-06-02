<script lang="ts">
  // Logo del brand "Orbit": quadrato arrotondato con gradiente + glifo orbita
  // (corpo centrale, anello, satellite). `gid` rende univoco l'id del gradiente.
  interface Props {
    size?: number;
    gid?: string;
  }
  let { size = 22, gid = "brandGrad" }: Props = $props();
</script>

<svg width={size} height={size} viewBox="0 0 32 32" fill="none" aria-hidden="true">
  <defs>
    <linearGradient id={gid} x1="0" y1="0" x2="32" y2="32" gradientUnits="userSpaceOnUse">
      <stop stop-color="#3b9dff" />
      <stop offset="1" stop-color="#6b5bff" />
    </linearGradient>
  </defs>
  <rect x="1.5" y="1.5" width="29" height="29" rx="8.5" fill="url(#{gid})" />
  <ellipse
    cx="16"
    cy="16"
    rx="9.6"
    ry="4.3"
    transform="rotate(-25 16 16)"
    stroke="#fff"
    stroke-width="1.8"
    fill="none"
    opacity="0.95"
  />
  <circle cx="16" cy="16" r="2.7" fill="#fff" />
  <circle cx="24.6" cy="12" r="2" fill="#fff" />
</svg>
