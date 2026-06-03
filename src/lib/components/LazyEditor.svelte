<script lang="ts">
  // Carica CodeMirror (Editor) on-demand al primo file aperto: lo tiene fuori dal
  // chunk iniziale (la welcome non ha editor). Il modulo è cache-ato dal bundler,
  // quindi i caricamenti successivi sono immediati.
  const props = $props();
  let Comp = $state<any>(null);
  import("./Editor.svelte").then((m) => (Comp = m.default));
</script>

{#if Comp}
  <Comp {...props} />
{/if}
