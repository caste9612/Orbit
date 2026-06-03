<script lang="ts">
  import Icon from "./Icon.svelte";
  import ContextMenu, { type MenuItem } from "./ContextMenu.svelte";
  import {
    tree,
    toggle,
    flatten,
    edit,
    startCreate,
    startRename,
    commitEdit,
    cancelEdit,
    deleteEntry,
    copyPath,
    type TreeNode,
  } from "../state/explorer.svelte";
  import { openFile, workspace } from "../state/workspace.svelte";
  import { decorations } from "../state/git.svelte";
  import { fileIcon, dirname } from "../util";

  // Lista virtuale ad altezza fissa: rende solo le righe nel viewport (+overscan).
  const ROW = 22;
  const OVERSCAN = 8;

  type Row =
    | { kind: "node"; node: TreeNode; depth: number }
    | { kind: "input"; depth: number };

  // Riga sintetica di input per la creazione: iniettata dopo la cartella target
  // (o in cima, se si crea nella radice). La rinomina avviene in riga.
  function buildRows(base: TreeNode[]): Row[] {
    const out: Row[] = [];
    const creating = edit.active && edit.mode === "create";
    if (creating && edit.dir === workspace.rootPath) out.push({ kind: "input", depth: 0 });
    for (const n of base) {
      out.push({ kind: "node", node: n, depth: n.depth });
      if (creating && n.entry.isDir && edit.dir === n.entry.path) {
        out.push({ kind: "input", depth: n.depth + 1 });
      }
    }
    return out;
  }

  let rows = $derived(buildRows(flatten(tree.roots)));
  let scrollTop = $state(0);
  let viewportH = $state(600);

  let start = $derived(Math.max(0, Math.floor(scrollTop / ROW) - OVERSCAN));
  let end = $derived(
    Math.min(rows.length, Math.ceil((scrollTop + viewportH) / ROW) + OVERSCAN),
  );
  let visible = $derived(rows.slice(start, end));

  let menu = $state<{ x: number; y: number; node: TreeNode | null } | null>(null);

  // decorazioni git (file/cartelle modificati) — aggiornate live dal watcher
  let deco = $derived(decorations());
  function gitColor(code: string): string {
    if (code === "U" || code === "A") return "var(--color-success)";
    if (code === "D") return "var(--color-danger)";
    return "var(--color-warning)"; // M, R, T
  }

  function onScroll(e: Event) {
    scrollTop = (e.currentTarget as HTMLElement).scrollTop;
  }
  function activate(n: TreeNode) {
    if (n.entry.isDir) toggle(n);
    else openFile(n.entry.path);
  }

  // Mette a fuoco e seleziona il nome (senza estensione) appena l'input compare.
  function autofocus(node: HTMLInputElement) {
    node.focus();
    const dot = node.value.lastIndexOf(".");
    if (edit.mode === "rename" && dot > 0) node.setSelectionRange(0, dot);
    else node.select();
  }

  function onInputKey(e: KeyboardEvent) {
    if (e.key === "Enter") {
      e.preventDefault();
      commitEdit();
    } else if (e.key === "Escape") {
      e.preventDefault();
      cancelEdit();
    }
  }

  function openMenu(e: MouseEvent, node: TreeNode | null) {
    e.preventDefault();
    e.stopPropagation();
    if (!node && !workspace.rootPath) return;
    menu = { x: e.clientX, y: e.clientY, node };
  }

  function menuItems(node: TreeNode | null): MenuItem[] {
    // Cartella di destinazione per "nuovo": la cartella stessa, o il padre di un file.
    const dir = node ? (node.entry.isDir ? node.entry.path : dirname(node.entry.path)) : workspace.rootPath!;
    const items: MenuItem[] = [
      { label: "Nuovo file…", icon: "file-plus", onClick: () => startCreate(dir, "file") },
      { label: "Nuova cartella…", icon: "folder-plus", onClick: () => startCreate(dir, "dir") },
    ];
    if (node) {
      items.push(
        { label: "Rinomina…", icon: "pencil", separatorBefore: true, onClick: () => startRename(node.entry.path, node.entry.name, node.entry.isDir) },
        { label: "Elimina", icon: "trash", danger: true, onClick: () => deleteEntry(node.entry.path, node.entry.name, node.entry.isDir) },
        { label: "Copia percorso", icon: "copy", separatorBefore: true, onClick: () => copyPath(node.entry.path) },
      );
    }
    return items;
  }
</script>

<div
  class="tree"
  onscroll={onScroll}
  bind:clientHeight={viewportH}
  oncontextmenu={(e) => openMenu(e, null)}
  role="tree"
  tabindex="-1"
>
  <div class="canvas" style="height:{rows.length * ROW}px">
    {#each visible as r, i (r.kind === "node" ? r.node.entry.path : "__input__")}
      {@const idx = start + i}
      {#if r.kind === "input"}
        <div class="row input" style="top:{idx * ROW}px; height:{ROW}px; padding-left:{6 + r.depth * 14}px">
          <span class="chev"></span>
          <span class="ic" class:dir={edit.kind === "dir"}>
            <Icon name={edit.kind === "dir" ? "folder" : "file"} size={15} strokeWidth={1.7} />
          </span>
          <!-- svelte-ignore a11y_autofocus -->
          <input
            class="edit"
            class:err={!!edit.error}
            bind:value={edit.value}
            use:autofocus
            onkeydown={onInputKey}
            onblur={commitEdit}
            title={edit.error ?? ""}
            placeholder={edit.kind === "dir" ? "nome cartella" : "nome file"}
          />
        </div>
      {:else}
        {@const n = r.node}
        {@const fi = fileIcon(n.entry.name)}
        {@const renaming = edit.active && edit.mode === "rename" && edit.target === n.entry.path}
        {@const np = n.entry.path.replace(/\\/g, "/").replace(/\/+$/, "")}
        {@const gcode = n.entry.isDir ? undefined : deco.files.get(np)}
        {@const gdir = n.entry.isDir && deco.dirs.has(np)}
        <button
          type="button"
          class="row"
          class:active={!n.entry.isDir && workspace.activePath === n.entry.path}
          class:target={menu?.node?.entry.path === n.entry.path}
          style="top:{idx * ROW}px; height:{ROW}px; padding-left:{6 + n.depth * 14}px"
          onclick={() => !renaming && activate(n)}
          oncontextmenu={(e) => openMenu(e, n)}
          title={n.entry.name}
        >
          <span class="chev" class:open={n.expanded}>
            {#if n.entry.isDir}<Icon name="chevron-right" size={14} strokeWidth={2} />{/if}
          </span>
          {#if n.entry.isDir}
            <span class="ic dir">
              <Icon name={n.expanded ? "folder-open" : "folder"} size={15} strokeWidth={1.6} />
            </span>
          {:else}
            <span class="ic" style="color:{fi.color}">
              <Icon name={fi.glyph} size={15} strokeWidth={1.7} />
            </span>
          {/if}
          {#if renaming}
            <!-- svelte-ignore a11y_autofocus -->
            <input
              class="edit"
              class:err={!!edit.error}
              bind:value={edit.value}
              use:autofocus
              onkeydown={onInputKey}
              onblur={commitEdit}
              onclick={(e) => e.stopPropagation()}
              title={edit.error ?? ""}
            />
          {:else}
            <span class="name" style={gcode ? `color:${gitColor(gcode)}` : ""}>{n.entry.name}</span>
            {#if gcode}
              <span class="gcode" style="color:{gitColor(gcode)}">{gcode}</span>
            {:else if gdir}
              <span class="gdot"></span>
            {/if}
          {/if}
        </button>
      {/if}
    {/each}
  </div>
</div>

{#if menu}
  <ContextMenu x={menu.x} y={menu.y} items={menuItems(menu.node)} onClose={() => (menu = null)} />
{/if}

<style>
  .tree {
    height: 100%;
    overflow: auto;
    position: relative;
  }
  .canvas {
    position: relative;
    width: 100%;
  }
  .row {
    position: absolute;
    left: 0;
    right: 0;
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
  }
  .row:hover {
    background: var(--color-surface-3);
  }
  .row.active {
    background: var(--color-surface-4);
  }
  .row.target {
    outline: 1px solid rgba(var(--accent-rgb), 0.5);
    outline-offset: -1px;
    border-radius: 3px;
  }
  .row:focus-visible {
    outline: 1px solid var(--color-accent);
    outline-offset: -1px;
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
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
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
    border-radius: 3px;
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
