<script lang="ts">
  interface Props {
    content: string;
  }
  let { content }: Props = $props();
  let lines = $derived(content.split("\n"));

  function cls(l: string): string {
    if (l.startsWith("@@")) return "hunk";
    if (
      l.startsWith("+++") ||
      l.startsWith("---") ||
      l.startsWith("diff ") ||
      l.startsWith("index ") ||
      l.startsWith("new file") ||
      l.startsWith("deleted file") ||
      l.startsWith("rename ") ||
      l.startsWith("similarity ")
    )
      return "meta";
    if (l.startsWith("+")) return "add";
    if (l.startsWith("-")) return "del";
    return "ctx";
  }
</script>

<div class="diff">
  {#each lines as l, i (i)}
    <div class="line {cls(l)}">{l || " "}</div>
  {/each}
</div>

<style>
  .diff {
    height: 100%;
    overflow: auto;
    padding: 8px 0;
    font-family: var(--font-mono);
    font-size: 12.5px;
    line-height: 1.5;
    user-select: text;
  }
  .line {
    padding: 0 16px;
    white-space: pre;
  }
  .add {
    background: rgba(91, 200, 138, 0.1);
    color: #7ee0a6;
  }
  .del {
    background: rgba(240, 98, 111, 0.1);
    color: #f08a93;
  }
  .hunk {
    color: var(--color-accent);
    background: rgba(110, 168, 254, 0.06);
  }
  .meta {
    color: var(--color-ink-subtle);
  }
  .ctx {
    color: var(--color-ink-muted);
  }
</style>
