<script lang="ts">
  import { tick } from "svelte";
  import ContextMenu, { type MenuItem } from "./ContextMenu.svelte";
  import Lazy from "./Lazy.svelte";
  import ShelfSection from "./ShelfSection.svelte";
  import TreeRow from "./TreeRow.svelte";
  import { tree, toggle, flatten, reveal, edit, startCreate, commitEdit, revealPath, type TreeNode } from "../state/explorer.svelte";
  import { openFile, workspace, activePath } from "../state/workspace.svelte";
  import { decorations } from "../state/git.svelte";
  import { relOf, isHidden, colorOf, shelfUi, NOISE, shelveNoise, shelveDotFolders } from "../state/shelf.svelte";
  import { shelfDragDown, shelfDragClick } from "../state/shelfDrag.svelte";
  import { fsMenuItems, openTerminalAt } from "../state/treeMenu";
  import { normSlash, samePath } from "../util";

  // Lista virtuale ad altezza fissa: rende solo le righe nel viewport (+overscan).
  const ROW = 22;
  const OVERSCAN = 8;

  type Row =
    | { kind: "node"; node: TreeNode; depth: number; shelved: boolean }
    | { kind: "input"; depth: number };

  // Albero principale senza le voci messe nello scaffale (raggruppate in fondo); con l'occhio acceso (M73)
  // restano al loro posto, in grigio.
  let rows = $derived.by(() => {
    const out: Row[] = [];
    const creating = edit.active && edit.mode === "create" && edit.where === "tree";
    if (creating && edit.dir === workspace.rootPath) out.push({ kind: "input", depth: 0 });
    for (const n of flatten(tree.roots)) {
      const shelved = isHidden(relOf(n.entry.path), n.entry.isDir);
      if (shelved && !shelfUi.peek) continue;
      out.push({ kind: "node", node: n, depth: n.depth, shelved });
      if (creating && n.entry.isDir && edit.dir === n.entry.path) out.push({ kind: "input", depth: n.depth + 1 });
    }
    return out;
  });
  let scrollTop = $state(0);
  let viewportH = $state(600);
  let treeEl: HTMLDivElement;

  let start = $derived(Math.max(0, Math.floor(scrollTop / ROW) - OVERSCAN));
  let end = $derived(Math.min(rows.length, Math.ceil((scrollTop + viewportH) / ROW) + OVERSCAN));
  let visible = $derived(rows.slice(start, end));

  let menu = $state<{ x: number; y: number; node: TreeNode | null } | null>(null);
  let shelfPicker = $state<{ x: number; y: number; absPath: string; isDir: boolean } | null>(null);

  let deco = $derived(decorations());

  // cartelle rumore e cartelle col punto ancora nell'albero: il menu della radice offre di metterle via
  let hasNoise = $derived(tree.roots.some((n) => n.entry.isDir && NOISE.includes(n.entry.name) && !isHidden(relOf(n.entry.path))));
  let hasDots = $derived(tree.roots.some((n) => n.entry.isDir && n.entry.name.startsWith(".") && !isHidden(relOf(n.entry.path))));

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
    if (shelfDragClick()) return; // il click che chiude un trascinamento sullo scaffale
    if (n.entry.isDir) toggle(n);
    else openFile(n.entry.path);
  }

  function openMenu(e: MouseEvent, node: TreeNode | null) {
    e.preventDefault();
    e.stopPropagation();
    if (!node && !workspace.rootPath) return;
    menu = { x: e.clientX, y: e.clientY, node };
  }

  function menuItems(node: TreeNode | null): MenuItem[] {
    const mx = menu?.x ?? 0;
    const my = menu?.y ?? 0;
    if (node) {
      // finestra leggera (M57): nella cartella non si scrive nulla, quindi niente scaffale
      const shelf = workspace.light
        ? null
        : { label: "Add to shelf…", icon: "archive", onClick: () => (shelfPicker = { x: mx, y: my, absPath: node.entry.path, isDir: node.entry.isDir }) };
      return fsMenuItems(node, { shelf });
    }
    const root = workspace.rootPath!;
    const items: MenuItem[] = [
      { label: "New file…", icon: "file-plus", onClick: () => startCreate(root, "file") },
      { label: "New folder…", icon: "folder-plus", onClick: () => startCreate(root, "dir") },
      { label: "Open in terminal", icon: "terminal", separatorBefore: true, onClick: () => openTerminalAt(root) },
      { label: "Reveal in Explorer", icon: "external-link", onClick: () => revealPath(root) },
    ];
    if (workspace.light) return items;
    if (hasNoise) items.push({ label: "Shelve noise folders", icon: "archive", separatorBefore: true, onClick: shelveNoise });
    if (hasDots) items.push({ label: "Shelve dot-folders", icon: "archive", separatorBefore: !hasNoise, onClick: shelveDotFolders });
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
          <TreeRow node={null} depth={r.depth} top={idx * ROW} height={ROW} onCommit={commitEdit} />
        {:else}
          {@const n = r.node}
          {@const np = normSlash(n.entry.path)}
          <TreeRow
            node={n}
            depth={n.depth}
            top={idx * ROW}
            height={ROW}
            active={!n.entry.isDir && samePath(n.entry.path, activePath() ?? "")}
            target={menu?.node?.entry.path === n.entry.path}
            dim={r.shelved}
            swatch={r.shelved ? colorOf(relOf(n.entry.path), n.entry.isDir) : null}
            gitCode={n.entry.isDir ? undefined : deco.files.get(np)}
            gitDir={n.entry.isDir && deco.dirs.has(np)}
            onclick={() => activate(n)}
            oncontextmenu={(e) => openMenu(e, n)}
            onpointerdown={(e) => !r.shelved && shelfDragDown(e, { abs: n.entry.path, name: n.entry.name, isDir: n.entry.isDir })}
            onCommit={commitEdit}
          />
        {/if}
      {/each}
    </div>
  </div>

  {#if !workspace.light}<ShelfSection />{/if}
</div>

{#if menu}
  <ContextMenu x={menu.x} y={menu.y} items={menuItems(menu.node)} onClose={() => (menu = null)} />
{/if}
{#if shelfPicker}
  <!-- il picker dello scaffale si carica quando serve, fuori dal chunk d'avvio (M73) -->
  <Lazy
    load={() => import("./ShelfPicker.svelte")}
    x={shelfPicker.x}
    y={shelfPicker.y}
    target={{ abs: shelfPicker.absPath, isDir: shelfPicker.isDir }}
    onClose={() => (shelfPicker = null)}
  />
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
</style>
