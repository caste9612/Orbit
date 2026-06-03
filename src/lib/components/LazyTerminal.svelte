<script lang="ts">
  // Carica xterm (Terminal) on-demand: lo tiene fuori dal chunk iniziale così non
  // pesa sul primo paint. Il modulo è cache-ato dal bundler dopo il primo import.
  const props = $props();
  let Comp = $state<any>(null);
  import("./Terminal.svelte").then((m) => (Comp = m.default));
</script>

{#if Comp}
  <Comp {...props} />
{/if}
