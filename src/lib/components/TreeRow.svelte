<script lang="ts">
  // Una riga dell'albero su disco (M73): la stessa nell'Explorer a cartelle, in «Other files» della vista
  // Solution e nello scaffale, che prima ne avevano ciascuno una copia. Con `node` null è la riga in cui si
  // scrive il nome di un file o di una cartella nuovi.
  import Icon from "./Icon.svelte";
  import FileGlyph from "./FileGlyph.svelte";
  import { edit, cancelEdit, type EditPlace, type TreeNode } from "../state/explorer.svelte";
  import { fileIcon, samePath } from "../util";

  interface Props {
    node: TreeNode | null;
    depth: number;
    top?: number | null; // lista virtuale: posizione assoluta in px; null = nel flusso della pagina
    height?: number;
    active?: boolean; // il file aperto nell'editor
    target?: boolean; // la riga del menu contestuale aperto
    dim?: boolean; // voce dello scaffale mostrata al suo posto nell'albero (l'occhio, M73)
    swatch?: string | null; // colore della categoria dello scaffale
    gitCode?: string;
    gitDir?: boolean;
    detail?: string; // testo tenue dopo il nome (es. il percorso, nello scaffale)
    title?: string;
    place?: EditPlace | "none"; // l'albero o lo scaffale: la casella di rinomina compare solo dove è partita
    // ("none": la stessa voce ripetuta più sotto nello scaffale)
    onclick?: (e: MouseEvent) => void;
    oncontextmenu?: (e: MouseEvent) => void;
    onpointerdown?: (e: PointerEvent) => void;
    onCommit: () => void;
  }
  let {
    node,
    depth,
    top = null,
    height = 22,
    active = false,
    target = false,
    dim = false,
    swatch = null,
    gitCode,
    gitDir = false,
    detail,
    title,
    place = "tree",
    onclick,
    oncontextmenu,
    onpointerdown,
    onCommit,
  }: Props = $props();

  let renaming = $derived(
    !!node && edit.active && edit.mode === "rename" && edit.where === place && !!edit.target && samePath(edit.target, node.entry.path),
  );
  let pos = $derived(`${top !== null ? `top:${top}px;` : ""}height:${height}px;padding-left:${6 + depth * 14}px`);

  function gitColor(code: string): string {
    if (code === "U" || code === "A") return "var(--color-success)";
    if (code === "D") return "var(--color-danger)";
    return "var(--color-warning)";
  }
  function autofocus(el: HTMLInputElement) {
    el.focus();
    const dot = el.value.lastIndexOf(".");
    if (edit.mode === "rename" && dot > 0) el.setSelectionRange(0, dot);
    else el.select();
  }
  function onKey(e: KeyboardEvent) {
    if (e.key === "Enter") {
      e.preventDefault();
      onCommit();
    } else if (e.key === "Escape") {
      e.preventDefault();
      cancelEdit();
    }
  }
</script>

{#snippet nameInput(placeholder: string)}
  <!-- svelte-ignore a11y_autofocus -->
  <input
    class="edit"
    class:err={!!edit.error}
    bind:value={edit.value}
    use:autofocus
    onkeydown={onKey}
    onblur={onCommit}
    onclick={(e) => e.stopPropagation()}
    title={edit.error ?? ""}
    {placeholder}
  />
{/snippet}

{#if !node}
  <div class="row input" class:abs={top !== null} style={pos}>
    <span class="chev"></span>
    <span class="ic" class:dir={edit.kind === "dir"}>
      <Icon name={edit.kind === "dir" ? "folder" : "file"} size={16} strokeWidth={1.7} />
    </span>
    {@render nameInput(edit.kind === "dir" ? "folder name" : "file name")}
  </div>
{:else}
  {@const n = node}
  <button
    type="button"
    class="row"
    class:abs={top !== null}
    class:active
    class:target
    class:dim
    style={pos}
    onclick={(e) => !renaming && onclick?.(e)}
    {oncontextmenu}
    {onpointerdown}
    title={title ?? n.entry.name}
  >
    <span class="chev" class:open={n.expanded}>
      {#if n.entry.isDir}<Icon name="chevron-right" size={14} strokeWidth={2} />{/if}
    </span>
    {#if n.entry.isDir}
      <span class="ic dir"><Icon name={n.expanded ? "folder-open" : "folder"} size={16} strokeWidth={1.6} /></span>
    {:else}
      {@const fi = fileIcon(n.entry.name)}
      <span class="ic"><FileGlyph glyph={fi.glyph} color={fi.color} size={16} /></span>
    {/if}
    {#if renaming}
      {@render nameInput("")}
    {:else}
      <span class="name" class:grow={!detail} style={gitCode ? `color:${gitColor(gitCode)}` : ""}>{n.entry.name}</span>
      {#if detail}<span class="detail">{detail}</span>{/if}
      {#if swatch}<span class="swatch" style="background:{swatch}" aria-hidden="true"></span>{/if}
      {#if gitCode}
        <span class="gcode" style="color:{gitColor(gitCode)}">{gitCode}</span>
      {:else if gitDir}
        <span class="gdot"></span>
      {/if}
    {/if}
  </button>
{/if}

<style>
  .row {
    position: relative;
    width: 100%;
    display: flex;
    align-items: center;
    gap: 3px;
    padding-right: 8px;
    background: transparent;
    border: 0;
    color: var(--color-ink);
    font-size: 13px;
    text-align: left;
    white-space: nowrap;
    cursor: pointer;
    transition: background 90ms ease;
  }
  /* lista virtuale: righe ad altezza fissa posizionate in assoluto */
  .row.abs {
    position: absolute;
    left: 0;
    right: 0;
    width: auto;
  }
  .row:hover {
    background: var(--color-surface-3);
  }
  .row.active {
    background: var(--color-surface-4);
    box-shadow: inset 2px 0 0 0 var(--color-accent);
  }
  .row.target {
    outline: 1px solid rgba(var(--accent-rgb), 0.5);
    outline-offset: -1px;
    border-radius: var(--r-xs);
  }
  .row:focus-visible {
    outline: 1px solid var(--color-accent);
    outline-offset: -1px;
  }
  /* voce dello scaffale vista al suo posto (l'occhio): c'è, ma si capisce che è messa da parte */
  .row.dim .name,
  .row.dim .ic,
  .row.dim .detail {
    opacity: 0.5;
  }
  .row.input {
    cursor: default;
  }
  .chev {
    flex: 0 0 16px;
    display: grid;
    place-items: center;
    color: var(--color-ink-subtle);
    transition: transform 110ms ease;
  }
  .chev.open {
    transform: rotate(90deg);
  }
  .ic {
    flex: 0 0 auto;
    display: grid;
    place-items: center;
    color: var(--color-ink-subtle);
  }
  .ic.dir {
    color: var(--color-ink-muted);
  }
  .name {
    flex: 0 1 auto;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .name.grow {
    flex: 1;
  }
  .detail {
    flex: 1;
    min-width: 0;
    margin-left: 5px;
    overflow: hidden;
    text-overflow: ellipsis;
    color: var(--color-ink-subtle);
    font-size: 11px;
  }
  .swatch {
    flex: 0 0 auto;
    width: 7px;
    height: 7px;
    margin-left: 4px;
    border-radius: 50%;
  }
  .gcode {
    flex: 0 0 auto;
    margin-left: 4px;
    font-family: var(--font-mono);
    font-size: 10.5px;
    font-weight: 700;
  }
  .gdot {
    flex: 0 0 auto;
    width: 6px;
    height: 6px;
    margin-left: 4px;
    border-radius: 50%;
    background: var(--color-warning);
  }
  .edit {
    flex: 1;
    min-width: 0;
    margin-right: 4px;
    padding: 0 4px;
    height: 18px;
    border: 1px solid var(--color-accent);
    border-radius: var(--r-xs);
    background: var(--color-surface-1);
    color: var(--color-ink);
    font-family: var(--font-sans);
    font-size: 12.5px;
    outline: none;
  }
  .edit.err {
    border-color: var(--color-danger);
  }
</style>
