<script lang="ts">
  // Testo di una voce delle Impostazioni (M64): `codice` fra backtick e parole cercate evidenziate.
  import { segments } from "../searchText";

  let { text, terms = [] }: { text: string; terms?: string[] } = $props();
  const parts = $derived(segments(text, terms));
</script>

{#each parts as p, i (i)}{#if p.code}<code class:hit={p.hit}>{p.text}</code>{:else if p.hit}<mark>{p.text}</mark>{:else}{p.text}{/if}{/each}

<style>
  code {
    font-family: var(--font-mono);
    font-size: 0.92em;
    color: var(--color-ink-muted);
  }
  mark,
  code.hit {
    background: rgba(var(--accent-rgb), 0.3);
    color: var(--color-ink);
    border-radius: 2px;
  }
</style>
