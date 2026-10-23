<script lang="ts">
  import { tick } from "svelte";
  import Icon from "./Icon.svelte";
  import FileGlyph from "./FileGlyph.svelte";
  import ContextMenu, { type MenuItem } from "./ContextMenu.svelte";
  import ShelfPicker from "./ShelfPicker.svelte";
  import ShelfSection from "./ShelfSection.svelte";
  import {
    tree,
    toggle,
    flatten,
    reveal,
    edit,
    startCreate,
    startRename,
    commitEdit,
    cancelEdit,
    deleteEntry,
    copyPath,
    copyRelPath,
    revealPath,
    type TreeNode,
  } from "../state/explorer.svelte";
  import { openFile, openInNewGroup, workspace, activePath } from "../state/workspace.svelte";
  import { addTerminal } from "../state/terminals.svelte";
  import { runFile } from "../state/run.svelte";
  import { layout } from "../state/layout.svelte";
  import { decorations } from "../state/git.svelte";
  import { relOf, isHidden, NOISE, shelveNoise } from "../state/shelf.svelte";
  import { notify } from "../state/toast.svelte";
  import { fileIcon, basename, dirname, normSlash, runCommand, samePath } from "../util";
  import { writeClipboard } from "../clipboard";

  // Lista virtuale ad altezza fissa: rende solo le righe nel viewport (+overscan).
  const ROW = 22;
  const OVERSCAN = 8;

  type Row =
    | { kind: "node"; node: TreeNode; depth: number }
    | { kind: "input"; depth: number };

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

  // Albero principale senza le cartelle messe nello scaffale (raggruppate in fondo).
  let rows = $derived(buildRows(flatten(tree.roots).filter((n) => !isHidden(relOf(n.entry.path), n.entry.isDir))));
  let scrollTop = $state(0);
  let viewportH = $state(600);
  let treeEl: HTMLDivElement;

  let start = $derived(Math.max(0, Math.floor(scrollTop / ROW) - OVERSCAN));
  let end = $derived(Math.min(rows.length, Math.ceil((scrollTop + viewportH) / ROW) + OVERSCAN));
  let visible = $derived(rows.slice(start, end));

  let menu = $state<{ x: number; y: number; node: TreeNode | null } | null>(null);
  let shelfPicker = $state<{ x: number; y: number; absPath: string } | null>(null);

  let deco = $derived(decorations());
  function gitColor(code: string): string {
    if (code === "U" || code === "A") return "var(--color-success)";
    if (code === "D") return "var(--color-danger)";
    return "var(--color-warning)";
  }

  // cartelle rumore ancora nell'albero: il menu della radice offre di metterle nello scaffale
  let hasNoise = $derived(
    flatten(tree.roots).some(
      (n) => n.entry.isDir && NOISE.includes(n.entry.name) && !isHidden(relOf(n.entry.path)),
    ),
  );

  function onScroll(e: Event) {
    scrollTop = (e.currentTarget as HTMLElement).scrollTop;
  }

  // "Segui il file attivo": dopo che l'albero è stato espanso (reveal.seq), porta la riga in vista.
  // tick() attende che `rows` rifletta l'espansione prima di calcolare l'indice nella lista virtuale.
  $effect(() => {
    reveal.seq;
    const target = reveal.target;
    if (!target) return;
    void tick().then(() => bringIntoView(target));
  });
  function bringIntoView(path: string) {
    if (!treeEl) return;
    const idx = rows.findIndex((r) => r.kind === "node" && r.node.entry.path === path);
    if (idx < 0) return;
    const top = idx * ROW;
    if (top < scrollTop) treeEl.scrollTop = top;
    else if (top + ROW > scrollTop + viewportH) treeEl.scrollTop = top + ROW - viewportH;
  }
  function activate(n: TreeNode) {
    if (n.entry.isDir) toggle(n);
    else openFile(n.entry.path);
  }

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

  // apre una nuova tab terminale nella cartella indicata
  function openTerminalAt(dir: string) {
    if (!dir) return;
    layout.terminalVisible = true;
    addTerminal({ title: basename(dir) || "Terminal", cwd: dir });
  }
  // copia solo il nome del file/cartella
  async function copyName(name: string) {
    const ok = await writeClipboard(name);
    notify(ok ? "Name copied" : "Copy failed", ok ? "success" : "error", 1200);
  }

  function menuItems(node: TreeNode | null): MenuItem[] {
    const mx = menu?.x ?? 0;
    const my = menu?.y ?? 0;
    const dir = node ? (node.entry.isDir ? node.entry.path : dirname(node.entry.path)) : workspace.rootPath!;
    const items: MenuItem[] = [
      { label: "New file…", icon: "file-plus", onClick: () => startCreate(dir, "file") },
      { label: "New folder…", icon: "folder-plus", onClick: () => startCreate(dir, "dir") },
      { label: "Open in terminal", icon: "terminal", separatorBefore: true, onClick: () => openTerminalAt(dir) },
      { label: "Reveal in Explorer", icon: "external-link", onClick: () => revealPath(node ? node.entry.path : workspace.rootPath!) },
    ];
    if (node) {
      if (!node.entry.isDir) {
        items.push({ label: "Open to the side", icon: "panel-left", separatorBefore: true, onClick: () => void openInNewGroup(node.entry.path) });
      }
      items.push(
        { label: "Rename…", icon: "pencil", separatorBefore: true, onClick: () => startRename(node.entry.path, node.entry.name, node.entry.isDir) },
        { label: "Delete", icon: "trash", danger: true, onClick: () => deleteEntry(node.entry.path, node.entry.name, node.entry.isDir) },
      );
      if (node.entry.isDir) {
        items.push({ label: "Add to shelf…", icon: "archive", separatorBefore: true, onClick: () => (shelfPicker = { x: mx, y: my, absPath: node.entry.path }) });
      }
      items.push(
        { label: "Copy path", icon: "copy", separatorBefore: !node.entry.isDir, onClick: () => copyPath(node.entry.path) },
        { label: "Copy relative path", icon: "copy", onClick: () => copyRelPath(node.entry.path) },
        { label: "Copy name", icon: "copy", onClick: () => copyName(node.entry.name) },
      );
    } else if (hasNoise) {
      items.push({ label: "Shelve noise folders", icon: "archive", separatorBefore: true, onClick: shelveNoise });
    }
    // file eseguibile (script): "Run" in cima al menu
    if (node && !node.entry.isDir && runCommand(node.entry.name)) {
      items.unshift({ label: "Run", icon: "play", onClick: () => runFile(node.entry.path) });
      items[1].separatorBefore = true; // divisore subito dopo "Run"
    }
    return items;
  }
</script>

<div class="explorer-root">
  <div
    class="tree"
    bind:this={treeEl}
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
              <Icon name={edit.kind === "dir" ? "folder" : "file"} size={16} strokeWidth={1.7} />
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
              placeholder={edit.kind === "dir" ? "folder name" : "file name"}
            />
          </div>
        {:else}
          {@const n = r.node}
          {@const fi = fileIcon(n.entry.name)}
          {@const renaming = edit.active && edit.mode === "rename" && edit.target === n.entry.path}
          {@const np = normSlash(n.entry.path)}
          {@const gcode = n.entry.isDir ? undefined : deco.files.get(np)}
          {@const gdir = n.entry.isDir && deco.dirs.has(np)}
          <button
            type="button"
            class="row"
            class:active={!n.entry.isDir && samePath(n.entry.path, activePath() ?? "")}
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
                <Icon name={n.expanded ? "folder-open" : "folder"} size={16} strokeWidth={1.6} />
              </span>
            {:else}
              <span class="ic">
                <FileGlyph glyph={fi.glyph} color={fi.color} size={16} />
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

  <ShelfSection />
</div>

{#if menu}
  <ContextMenu x={menu.x} y={menu.y} items={menuItems(menu.node)} onClose={() => (menu = null)} />
{/if}
{#if shelfPicker}
  <ShelfPicker x={shelfPicker.x} y={shelfPicker.y} absPath={shelfPicker.absPath} onClose={() => (shelfPicker = null)} />
{/if}

<style>
  .explorer-root {
    height: 100%;
    min-height: 0;
    display: flex;
    flex-direction: column;
  }
  .tree {
    flex: 1;
    min-height: 0;
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
    transition: background 90ms ease;
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
