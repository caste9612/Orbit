<script lang="ts">
  // Carica un componente on-demand (dynamic import), tenendolo FUORI dal chunk d'avvio.
  // Si usa per overlay/viewer/viste mostrati di rado: `load` è una funzione del tipo
  // `() => import("./X.svelte")` (specificatore LETTERALE → Vite lo code-splitta); gli altri
  // prop sono inoltrati al componente. `load()` parte una volta sola all'init (come
  // LazyEditor/LazyTerminal), così i prop reattivi non rilanciano l'import né resettano la vista.
  const { load, ...rest } = $props();
  let Comp = $state<any>(null);
  // svelte-ignore state_referenced_locally
  void (load as () => Promise<{ default: any }>)().then((m) => (Comp = m.default));
</script>

{#if Comp}
  <Comp {...rest} />
{/if}
