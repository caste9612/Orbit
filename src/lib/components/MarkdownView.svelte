<script lang="ts">
  import Icon from "./Icon.svelte";
  import { renderMarkdown, extractHeadings, slug } from "../markdown";
  import { openFile } from "../state/workspace.svelte";
  import { joinPath, dirname } from "../util";

  interface Props {
    content: string;
    path: string;
    onTaskToggle: (newContent: string) => void;
  }
  let { content, path, onTaskToggle }: Props = $props();

  let html = $state("");
  let body: HTMLElement | undefined;
  let tocOpen = $state(true);
  let headings = $derived(extractHeadings(content));

  // render (async, lazy) a ogni cambio di sorgente
  $effect(() => {
    const src = content;
    void renderMarkdown(src).then((h) => (html = h));
  });

  // dopo il render: id agli heading + checkbox interattive
  $effect(() => {
    html; // dipendenza
    if (!body) return;
    for (const h of body.querySelectorAll("h1,h2,h3,h4,h5,h6")) {
      (h as HTMLElement).id = slug(h.textContent || "");
    }
    const boxes = body.querySelectorAll<HTMLInputElement>('input[type="checkbox"]');
    boxes.forEach((b, i) => {
      b.disabled = false;
      b.addEventListener("change", () => onTaskToggle(toggleTask(content, i)), { once: true });
    });
  });

  /** Inverte l'i-esima task list nel sorgente (ordine = ordine di render). */
  function toggleTask(src: string, index: number): string {
    const lines = src.split("\n");
    let n = -1;
    let inFence = false;
    for (let i = 0; i < lines.length; i++) {
      if (/^\s*```/.test(lines[i])) {
        inFence = !inFence;
        continue;
      }
      if (inFence) continue;
      const m = /^(\s*[-*+]\s+)\[([ xX])\](.*)$/.exec(lines[i]);
      if (m) {
        n++;
        if (n === index) {
          const checked = m[2] !== " ";
          lines[i] = `${m[1]}[${checked ? " " : "x"}]${m[3]}`;
          break;
        }
      }
    }
    return lines.join("\n");
  }

  function scrollToId(id: string) {
    try {
      body?.querySelector("#" + CSS.escape(id))?.scrollIntoView({ behavior: "smooth", block: "start" });
    } catch {
      /* id non valido */
    }
  }

  function onClick(e: MouseEvent) {
    const a = (e.target as HTMLElement).closest("a");
    if (!a) return;
    const href = a.getAttribute("href");
    if (!href) return;
    e.preventDefault(); // mai navigare l'intera app
    if (href.startsWith("#")) {
      scrollToId(href.slice(1));
    } else if (/^https?:\/\//i.test(href)) {
      window.open(href, "_blank");
    } else {
      void openFile(joinPath(dirname(path), href.replace(/^\.\//, "")));
    }
  }
</script>

<div class="mdwrap">
  {#if headings.length > 2}
    <aside class="toc" class:closed={!tocOpen}>
      <button class="toc-h" onclick={() => (tocOpen = !tocOpen)}>
        <Icon name={tocOpen ? "chevron-down" : "chevron-right"} size={13} strokeWidth={2} />
        <span>Outline</span>
      </button>
      {#if tocOpen}
        <nav>
          {#each headings as h (h.id + h.text)}
            <button class="toc-i" style="padding-left:{(h.level - 1) * 10 + 8}px" onclick={() => scrollToId(h.id)}>{h.text}</button>
          {/each}
        </nav>
      {/if}
    </aside>
  {/if}

  <!-- HTML sanitizzato (DOMPurify); il click è delegato ai soli <a> interni -->
  <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <article class="mdbody" bind:this={body} onclick={onClick}>{@html html}</article>
</div>

<style>
  .mdwrap {
    position: relative;
    height: 100%;
    overflow: auto;
    background: var(--color-surface-1);
  }
  .mdbody {
    max-width: 820px;
    margin: 0;
    display: flow-root; /* BFC: il corpo affianca l'outline flottante senza scorrerci sotto */
    padding: 32px 40px 80px;
    color: var(--color-ink);
    font-family: var(--font-sans);
    font-size: 14px;
    line-height: 1.7;
    user-select: text;
  }
  .toc {
    position: sticky;
    top: 12px;
    float: right;
    width: 210px;
    max-height: 70vh;
    overflow: auto;
    margin: 12px 12px 0 0;
    padding: 4px;
    background: var(--color-surface-2);
    border: 1px solid var(--color-line);
    border-radius: var(--radius);
    font-size: 12px;
    z-index: 1;
  }
  .toc.closed {
    width: auto;
  }
  .toc-h {
    display: flex;
    align-items: center;
    gap: 6px;
    width: 100%;
    background: transparent;
    border: 0;
    color: var(--color-ink-muted);
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.05em;
    text-transform: uppercase;
    padding: 4px 6px;
    cursor: pointer;
  }
  .toc-i {
    display: block;
    width: 100%;
    text-align: left;
    background: transparent;
    border: 0;
    color: var(--color-ink-muted);
    font-size: 12px;
    padding: 3px 8px;
    border-radius: 4px;
    cursor: pointer;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .toc-i:hover {
    background: var(--color-surface-3);
    color: var(--color-ink);
  }

  /* ---- contenuto renderizzato (HTML da {@html}, quindi :global) ---- */
  .mdbody :global(h1),
  .mdbody :global(h2),
  .mdbody :global(h3),
  .mdbody :global(h4) {
    line-height: 1.3;
    margin: 1.6em 0 0.6em;
    color: #eaeef3;
    font-weight: 650;
  }
  .mdbody :global(h1) {
    font-size: 1.9em;
    border-bottom: 1px solid var(--color-line);
    padding-bottom: 0.3em;
  }
  .mdbody :global(h2) {
    font-size: 1.45em;
    border-bottom: 1px solid var(--color-line);
    padding-bottom: 0.25em;
  }
  .mdbody :global(h3) {
    font-size: 1.2em;
  }
  .mdbody :global(p),
  .mdbody :global(ul),
  .mdbody :global(ol),
  .mdbody :global(blockquote),
  .mdbody :global(table) {
    margin: 0.7em 0;
  }
  .mdbody :global(a) {
    color: var(--color-accent);
    text-decoration: none;
  }
  .mdbody :global(a:hover) {
    text-decoration: underline;
  }
  .mdbody :global(code) {
    font-family: var(--font-mono);
    font-size: 0.88em;
    background: var(--color-surface-3);
    padding: 0.15em 0.4em;
    border-radius: 4px;
  }
  .mdbody :global(pre) {
    background: var(--color-surface-0);
    border: 1px solid var(--color-line);
    border-radius: var(--radius);
    padding: 12px 14px;
    overflow: auto;
  }
  .mdbody :global(pre code) {
    background: none;
    padding: 0;
    font-size: 12.5px;
    line-height: 1.5;
  }
  .mdbody :global(blockquote) {
    border-left: 3px solid var(--color-line-strong);
    margin-left: 0;
    padding: 0.2em 0 0.2em 1em;
    color: var(--color-ink-muted);
  }
  .mdbody :global(table) {
    border-collapse: collapse;
    width: 100%;
    font-size: 0.92em;
  }
  .mdbody :global(th),
  .mdbody :global(td) {
    border: 1px solid var(--color-line);
    padding: 6px 10px;
    text-align: left;
  }
  .mdbody :global(th) {
    background: var(--color-surface-2);
  }
  .mdbody :global(img) {
    max-width: 100%;
    border-radius: var(--radius);
  }
  .mdbody :global(hr) {
    border: 0;
    border-top: 1px solid var(--color-line);
    margin: 1.6em 0;
  }
  .mdbody :global(.task-list-item),
  .mdbody :global(li:has(> input[type="checkbox"])) {
    list-style: none;
  }
  .mdbody :global(input[type="checkbox"]) {
    margin-right: 8px;
    accent-color: var(--color-accent);
    cursor: pointer;
  }
</style>
