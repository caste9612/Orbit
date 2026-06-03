<script lang="ts">
  interface Props {
    content: string;
  }
  let { content }: Props = $props();

  interface DRow {
    cls: "add" | "del" | "ctx" | "hunk" | "meta";
    num: string; // numero di riga (lato nuovo per add/ctx, vecchio per del)
    text: string;
  }

  // Parsa il diff unificato tenendo traccia dei numeri di riga dai marcatori @@.
  function parse(src: string): DRow[] {
    const rows: DRow[] = [];
    let oldL = 0;
    let newL = 0;
    for (const line of src.split("\n")) {
      if (line.startsWith("@@")) {
        const m = line.match(/^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
        if (m) {
          oldL = parseInt(m[1], 10);
          newL = parseInt(m[2], 10);
        }
        rows.push({ cls: "hunk", num: "", text: line });
        continue;
      }
      if (
        line.startsWith("+++") || line.startsWith("---") || line.startsWith("diff ") ||
        line.startsWith("index ") || line.startsWith("new file") || line.startsWith("deleted file") ||
        line.startsWith("rename ") || line.startsWith("similarity ") ||
        line.startsWith("old mode") || line.startsWith("new mode")
      ) {
        rows.push({ cls: "meta", num: "", text: line });
        continue;
      }
      if (line.startsWith("+")) {
        rows.push({ cls: "add", num: String(newL), text: line.slice(1) });
        newL++;
      } else if (line.startsWith("-")) {
        rows.push({ cls: "del", num: String(oldL), text: line.slice(1) });
        oldL++;
      } else {
        const text = line.startsWith(" ") ? line.slice(1) : line;
        rows.push({ cls: "ctx", num: String(newL), text });
        if (line.length) {
          oldL++;
          newL++;
        }
      }
    }
    if (rows.length && rows[rows.length - 1].cls === "ctx" && rows[rows.length - 1].text === "") {
      rows.pop(); // riga vuota spuria dallo split finale
    }
    return rows;
  }

  let rows = $derived(parse(content));
  const mark: Record<string, string> = { add: "+", del: "−", ctx: "", hunk: "", meta: "" };
</script>

<div class="diff">
  {#each rows as r, i (i)}
    <div class="line {r.cls}">
      <span class="ln">{r.num}</span>
      <span class="mk">{mark[r.cls]}</span>
      <span class="tx">{r.text || " "}</span>
    </div>
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
    display: flex;
    white-space: pre;
  }
  .ln {
    flex: 0 0 46px;
    text-align: right;
    padding-right: 10px;
    color: var(--color-ink-subtle);
    user-select: none;
  }
  .mk {
    flex: 0 0 14px;
    text-align: center;
    user-select: none;
  }
  .tx {
    flex: 1;
    padding-right: 16px;
  }
  .add {
    background: rgba(91, 200, 138, 0.1);
  }
  .add .tx,
  .add .mk {
    color: #7ee0a6;
  }
  .del {
    background: rgba(240, 98, 111, 0.1);
  }
  .del .tx,
  .del .mk {
    color: #f08a93;
  }
  .hunk {
    background: rgba(110, 168, 254, 0.06);
  }
  .hunk .tx {
    color: var(--color-accent);
  }
  .meta .tx {
    color: var(--color-ink-subtle);
  }
  .ctx .tx {
    color: var(--color-ink-muted);
  }
</style>
