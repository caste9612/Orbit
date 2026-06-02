<script lang="ts">
  // Logo del brand: quadrato arrotondato con gradiente + glifo prompt `>_`.
  // `gid` rende univoco l'id del gradiente se il logo compare più volte nella pagina.
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
  <path
    d="M11.5 11 L16.5 16 L11.5 21"
    stroke="#fff"
    stroke-width="2.4"
    stroke-linecap="round"
    stroke-linejoin="round"
  />
  <path d="M18.5 21 H22" stroke="#fff" stroke-width="2.4" stroke-linecap="round" />
</svg>
