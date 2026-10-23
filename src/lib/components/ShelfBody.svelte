<script lang="ts">
  // Contenuto della sezione Shelf (M73): le categorie con colore, menu e pallino git; le voci come nodi veri
  // dell'albero (stessa riga e stesso menu dell'Explorer); le regole con l'elenco di ciò che prendono.
  // Caricato su richiesta (Lazy) da ShelfSection, che all'avvio mostra solo la testata.
  import { untrack } from "svelte";
  import Icon from "./Icon.svelte";
  import Lazy from "./Lazy.svelte";
  import ContextMenu, { type MenuItem } from "./ContextMenu.svelte";
  import type { PickerTarget } from "./ShelfPicker.svelte";
  import TreeRow from "./TreeRow.svelte";
  import { focusOnMount } from "../focus";
  import { toggle, nodeAt, ensureNode, edit, commitEdit, type TreeNode } from "../state/explorer.svelte";
  import { openFile, workspace, activePath } from "../state/workspace.svelte";
  import { decorations } from "../state/git.svelte";
  import { TAB_COLORS } from "../state/terminals.svelte";
  import {
    shelfUi,
    shelfMatches,
    matchKey,
    byCategory,
    categoryMeta,
    toggleShelfCategory,
    toggleShelfRule,
    unshelveRule,
    unshelvePath,
    setRuleGlobal,
    renameCategory,
    deleteCategory,
    setCategoryColor,
    setCategoryHiddenFromSearch,
  } from "../state/shelf.svelte";
  import { shelfDrag } from "../state/shelfDrag.svelte";
  import { fsMenuItems } from "../state/treeMenu";
  import type { ShelfRule } from "../state/shelfRules";
  import { basename, joinPath, normSlash, pathKey, samePath } from "../util";

  type SRow =
    | { kind: "cat"; key: string; cat: string; count: number; color: string | null; hidden: boolean; dirty: boolean; open: boolean }
    | { kind: "item"; key: string; node: TreeNode; depth: number; root: "path" | "match" | null; rel: string; missing: boolean; place: "shelf" | "none" }
    | { kind: "rule"; key: string; rule: ShelfRule; mk: string; count: number | null; capped: boolean; dirty: boolean; open: boolean }
    | { kind: "input"; key: string; depth: number };

  let root = $derived(workspace.rootPath);
  let cats = $derived(byCategory());
  let deco = $derived(decorations());
  // dentro (o è) una voce con modifiche git; per una voce non ancora letta non si sa se è cartella o file
  const dirtyAt = (abs: string) => {
    const p = normSlash(abs);
    return deco.dirs.has(p) || deco.files.has(p);
  };

  // voci per percorso non trovate su disco (cartella cancellata o spostata): si mostrano spente
  let missing = $state<Record<string, true>>({});
  const tried = new Set<string>();
  let triedRoot: string | null = null;

  /** Un nodo da mostrare anche quando la voce non è (ancora) nell'albero: stesso aspetto, niente figli. */
  const stub = (abs: string, isDir: boolean): TreeNode => ({
    entry: { name: basename(abs), path: abs, isDir },
    depth: 0,
    expanded: false,
    loaded: true,
    children: [],
  });

  let rows = $derived.by(() => {
    const out: SRow[] = [];
    if (!root) return out;
    const creating = edit.active && edit.mode === "create" && edit.where === "shelf" ? edit.dir : null;
    let inputDone = false;
    const shown = new Set<string>(); // la casella di rinomina compare solo alla prima occorrenza di un nodo
    const placeOf = (path: string) => (shown.has(pathKey(path)) ? "none" : (shown.add(pathKey(path)), "shelf")) as "shelf" | "none";
    const children = (n: TreeNode, depth: number, key: string) => {
      if (creating && !inputDone && samePath(creating, n.entry.path)) {
        inputDone = true;
        out.push({ kind: "input", key: `${key}|#input`, depth });
      }
      for (const c of n.children) {
        out.push({ kind: "item", key: `${key}|${c.entry.path}`, node: c, depth, root: null, rel: "", missing: false, place: placeOf(c.entry.path) });
        if (c.entry.isDir && c.expanded) children(c, depth + 1, key);
      }
    };
    for (const c of cats) {
      const meta = categoryMeta(c.category);
      const open = !!shelfUi.cats[c.category];
      const matchesOf = (r: ShelfRule) => shelfMatches.byRule[matchKey(r.kind, r.pattern)];
      const dirty =
        c.paths.some((rel) => dirtyAt(joinPath(root, rel))) ||
        c.rules.some((r) => (matchesOf(r)?.rels ?? []).some((rel) => dirtyAt(joinPath(root, rel))));
      out.push({ kind: "cat", key: `cat|${c.category}`, cat: c.category, count: c.paths.length + c.rules.length, color: meta.color ?? null, hidden: !!meta.hideFromSearch, dirty, open });
      if (!open) continue;
      for (const r of c.rules) {
        const mk = matchKey(r.kind, r.pattern);
        const m = matchesOf(r);
        const rels = m?.rels ?? [];
        const ropen = !!shelfUi.rules[mk];
        const key = `${c.category}|rule|${r.global ? "g" : "r"}|${mk}`;
        out.push({
          kind: "rule",
          key,
          rule: r,
          mk,
          count: shelfMatches.root === root ? rels.length : null,
          capped: !!m?.capped,
          dirty: rels.some((rel) => dirtyAt(joinPath(root, rel))),
          open: ropen,
        });
        if (!ropen) continue;
        for (const rel of rels) {
          const abs = joinPath(root, rel);
          const node = nodeAt(abs) ?? stub(abs, r.kind === "folders");
          out.push({ kind: "item", key: `${key}|${rel}`, node, depth: 2, root: "match", rel, missing: false, place: placeOf(abs) });
          if (node.entry.isDir && node.expanded) children(node, 3, `${key}|${rel}`);
        }
      }
      for (const rel of c.paths) {
        const abs = joinPath(root, rel);
        const found = nodeAt(abs);
        const node = found ?? stub(abs, true);
        const key = `${c.category}|path|${rel}`;
        out.push({ kind: "item", key, node, depth: 1, root: "path", rel, missing: !found && !!missing[pathKey(abs)], place: placeOf(abs) });
        if (found?.entry.isDir && found.expanded) children(found, 2, key);
      }
    }
    return out;
  });

  // le voci aperte che l'albero non ha ancora letto: si caricano le cartelle che le contengono (senza
  // aprirle); una volta per voce, così una voce che non esiste non fa ripartire il giro
  $effect(() => {
    const r = root;
    if (!r) return;
    const want: string[] = [];
    for (const c of cats) {
      if (!shelfUi.cats[c.category]) continue;
      for (const rel of c.paths) want.push(joinPath(r, rel));
      for (const rule of c.rules) {
        const mk = matchKey(rule.kind, rule.pattern);
        if (shelfUi.rules[mk]) for (const rel of shelfMatches.byRule[mk]?.rels ?? []) want.push(joinPath(r, rel));
      }
    }
    untrack(() => {
      if (r !== triedRoot) {
        tried.clear();
        missing = {};
        triedRoot = r;
      }
      for (const abs of want) {
        const k = pathKey(abs);
        if (tried.has(k) || nodeAt(abs)) continue;
        tried.add(k);
        void ensureNode(abs).then((n) => {
          if (!n && r === workspace.rootPath) missing[k] = true;
        });
      }
    });
  });

  // ---- azioni sulle righe ----

  function activate(n: TreeNode) {
    if (n.entry.isDir) void toggle(n);
    else void openFile(n.entry.path);
  }

  let menu = $state<{ x: number; y: number; items: MenuItem[]; key: string } | null>(null);
  let picker = $state<{ x: number; y: number; target: PickerTarget } | null>(null);
  function openMenu(e: MouseEvent, key: string, items: MenuItem[]) {
    e.preventDefault();
    e.stopPropagation();
    menu = { x: e.clientX, y: e.clientY, items, key };
  }

  function itemMenu(e: MouseEvent, r: Extract<SRow, { kind: "item" }>) {
    const { x, y } = { x: e.clientX, y: e.clientY };
    const n = r.node;
    if (r.missing) {
      openMenu(e, r.key, [{ label: "Remove from shelf", icon: "trash", onClick: () => unshelvePath(r.rel) }]);
      return;
    }
    const shelf: MenuItem | null =
      r.root === "path" ? { label: "Shelf…", icon: "archive", onClick: () => (picker = { x, y, target: { abs: n.entry.path, isDir: n.entry.isDir } }) } : null;
    openMenu(e, r.key, fsMenuItems(n, { shelf, where: "shelf" }));
  }

  function ruleMenu(e: MouseEvent, r: Extract<SRow, { kind: "rule" }>) {
    const { x, y } = { x: e.clientX, y: e.clientY };
    const { kind, pattern, global } = r.rule;
    openMenu(e, r.key, [
      { label: "Shelf…", icon: "archive", onClick: () => (picker = { x, y, target: { rule: r.rule } }) },
      { label: "In every repository", icon: global ? "check" : "globe", onClick: () => setRuleGlobal(kind, pattern, !global) },
      { label: "Remove the rule", icon: "trash", danger: true, separatorBefore: true, onClick: () => unshelveRule(kind, pattern, global) },
    ]);
  }

  // ---- categorie: rinomina, colore, ricerca, elimina ----

  let renamingCat = $state<string | null>(null);
  let catValue = $state("");
  function startRenameCat(cat: string) {
    renamingCat = cat;
    catValue = cat;
  }
  function commitRenameCat() {
    const from = renamingCat;
    renamingCat = null;
    if (from && catValue.trim() && catValue.trim() !== from) renameCategory(from, catValue);
  }
  function catMenu(e: MouseEvent, r: Extract<SRow, { kind: "cat" }>) {
    openMenu(e, r.key, [
      { label: "Rename…", icon: "pencil", onClick: () => startRenameCat(r.cat) },
      { label: "Hide from search and Quick Open", icon: r.hidden ? "check" : "search-off", onClick: () => setCategoryHiddenFromSearch(r.cat, !r.hidden) },
      { label: "Color", header: true, separatorBefore: true },
      ...TAB_COLORS.map((c) => ({ label: c.name, swatch: c.color, onClick: () => setCategoryColor(r.cat, c.color) })),
      { label: "No color", icon: r.color ? undefined : "check", onClick: () => setCategoryColor(r.cat, null) },
      { label: "Delete category", icon: "trash", danger: true, separatorBefore: true, onClick: () => deleteCategory(r.cat) },
    ]);
  }

  const countLabel = (r: Extract<SRow, { kind: "rule" }>) => {
    if (r.count === null) return "…";
    const what = r.rule.kind === "folders" ? "folder" : "file";
    return r.capped ? `${r.count}+ ${what}s` : `${r.count} ${what}${r.count === 1 ? "" : "s"}`;
  };
  const parentOf = (rel: string) => (rel.includes("/") ? rel.slice(0, rel.lastIndexOf("/")) : undefined);
</script>

<div class="shelf-body">
  {#each rows as r (r.key)}
    {#if r.kind === "cat"}
      {#if renamingCat === r.cat}
        <div class="cat-head">
          <span class="chev" class:open={r.open}><Icon name="chevron-right" size={12} strokeWidth={2} /></span>
          <input
            class="cat-edit"
            bind:value={catValue}
            use:focusOnMount={{ select: true }}
            onkeydown={(e) => {
              if (e.key === "Enter") commitRenameCat();
              else if (e.key === "Escape") renamingCat = null;
            }}
            onblur={commitRenameCat}
            aria-label="Category name"
          />
        </div>
      {:else}
        <button
          class="cat-head"
          class:drop={shelfDrag.over === r.cat}
          class:target={menu?.key === r.key}
          data-shelf-drop={r.cat}
          onclick={() => toggleShelfCategory(r.cat)}
          oncontextmenu={(e) => catMenu(e, r)}
          title="Right-click to rename, color or delete"
        >
          <span class="chev" class:open={r.open}><Icon name="chevron-right" size={12} strokeWidth={2} /></span>
          {#if r.color}<span class="dot" style="background:{r.color}"></span>{/if}
          <span class="cat-name">{r.cat}</span>
          {#if r.hidden}<span class="cat-flag" title="Hidden from search and Quick Open"><Icon name="search-off" size={11} strokeWidth={1.8} /></span>{/if}
          {#if r.dirty}<span class="gdot" title="Changes inside"></span>{/if}
          <span class="cat-count">{r.count}</span>
        </button>
      {/if}
    {:else if r.kind === "rule"}
      <div class="srule" class:target={menu?.key === r.key} oncontextmenu={(e) => ruleMenu(e, r)} role="treeitem" aria-selected="false" aria-expanded={r.open} tabindex="-1">
        <button class="rule-main" onclick={() => toggleShelfRule(r.mk)} title={r.rule.global ? "Rule for every repository" : "Rule for this repository"}>
          <span class="chev" class:open={r.open}>{#if r.count}<Icon name="chevron-right" size={12} strokeWidth={2} />{/if}</span>
          <span class="ric"><Icon name={r.rule.global ? "globe" : "archive"} size={13} strokeWidth={1.6} /></span>
          <span class="sfname">{r.rule.pattern}</span>
          <span class="spath">{countLabel(r)}{r.rule.global ? " · all repositories" : ""}</span>
          {#if r.dirty}<span class="gdot" title="Changes inside"></span>{/if}
        </button>
        <button class="rule-x" title="Remove the rule {r.rule.pattern}" aria-label="Remove rule" onclick={() => unshelveRule(r.rule.kind, r.rule.pattern, r.rule.global)}>
          <Icon name="x" size={12} strokeWidth={2} />
        </button>
      </div>
    {:else if r.kind === "input"}
      <TreeRow node={null} depth={r.depth} place="shelf" onCommit={commitEdit} />
    {:else}
      {@const n = r.node}
      {@const np = normSlash(n.entry.path)}
      <TreeRow
        node={n}
        depth={r.depth}
        place={r.place}
        active={!n.entry.isDir && samePath(n.entry.path, activePath() ?? "")}
        target={menu?.key === r.key}
        dim={r.missing}
        detail={r.missing ? "not found" : r.root ? parentOf(r.rel) : undefined}
        title={r.root ? r.rel : n.entry.name}
        gitCode={n.entry.isDir ? undefined : deco.files.get(np)}
        gitDir={n.entry.isDir && deco.dirs.has(np)}
        onclick={() => !r.missing && activate(n)}
        oncontextmenu={(e) => itemMenu(e, r)}
        onCommit={commitEdit}
      />
    {/if}
  {/each}
</div>

{#if menu}
  <ContextMenu x={menu.x} y={menu.y} items={menu.items} onClose={() => (menu = null)} />
{/if}
{#if picker}
  <Lazy load={() => import("./ShelfPicker.svelte")} x={picker.x} y={picker.y} target={picker.target} onClose={() => (picker = null)} />
{/if}

<style>
  .shelf-body {
    overflow: auto;
    padding-bottom: 4px;
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
  .cat-head {
    display: flex;
    align-items: center;
    gap: 4px;
    width: 100%;
    height: 22px;
    padding: 0 8px;
    background: transparent;
    border: 0;
    color: var(--color-ink);
    font-size: 12px;
    text-align: left;
    cursor: pointer;
  }
  .cat-head:hover {
    background: var(--color-surface-3);
  }
  .cat-head.target {
    outline: 1px solid rgba(var(--accent-rgb), 0.5);
    outline-offset: -1px;
  }
  /* bersaglio del trascinamento dall'albero (la sezione ha la classe `dragging` mentre si trascina) */
  :global(.shelf.dragging) .cat-head {
    outline: 1px dashed var(--color-line-strong);
    outline-offset: -2px;
  }
  .cat-head.drop {
    background: rgba(var(--accent-rgb), 0.18);
    outline: 1px solid var(--color-accent) !important;
  }
  .cat-name {
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .cat-flag {
    display: grid;
    place-items: center;
    color: var(--color-ink-subtle);
  }
  .cat-count {
    color: var(--color-ink-subtle);
    font-size: 11px;
  }
  .cat-edit {
    flex: 1;
    min-width: 0;
    height: 18px;
    padding: 0 4px;
    border: 1px solid var(--color-accent);
    border-radius: var(--r-xs);
    background: var(--color-surface-1);
    color: var(--color-ink);
    font-family: var(--font-sans);
    font-size: 12px;
    outline: none;
  }
  .dot {
    flex: 0 0 8px;
    height: 8px;
    border-radius: 50%;
  }
  .gdot {
    flex: 0 0 auto;
    width: 6px;
    height: 6px;
    margin: 0 2px;
    border-radius: 50%;
    background: var(--color-warning);
  }
  /* regola per nome: una riga che si apre sull'elenco di ciò che prende, con × per toglierla */
  .srule {
    display: flex;
    align-items: center;
    width: 100%;
    height: 22px;
    padding-right: 6px;
    color: var(--color-ink-muted);
    font-size: 12.5px;
    white-space: nowrap;
  }
  .srule:hover {
    background: var(--color-surface-3);
    color: var(--color-ink);
  }
  .srule.target {
    outline: 1px solid rgba(var(--accent-rgb), 0.5);
    outline-offset: -1px;
  }
  .rule-main {
    flex: 1;
    min-width: 0;
    height: 100%;
    display: flex;
    align-items: center;
    gap: 3px;
    padding: 0 0 0 20px;
    border: 0;
    background: transparent;
    color: inherit;
    font-size: inherit;
    text-align: left;
    cursor: pointer;
  }
  .ric {
    display: grid;
    place-items: center;
    color: var(--color-ink-subtle);
  }
  .sfname {
    flex: 0 0 auto;
    margin-left: 2px;
    font-family: var(--font-mono);
    font-size: 12px;
  }
  .spath {
    flex: 1;
    min-width: 0;
    margin-left: 5px;
    overflow: hidden;
    text-overflow: ellipsis;
    color: var(--color-ink-subtle);
    font-size: 11px;
  }
  .rule-x {
    flex: 0 0 auto;
    display: grid;
    place-items: center;
    width: 18px;
    height: 18px;
    padding: 0;
    border: 0;
    border-radius: var(--r-sm);
    background: transparent;
    color: var(--color-ink-subtle);
    cursor: pointer;
    opacity: 0;
  }
  .srule:hover .rule-x {
    opacity: 1;
  }
  .rule-x:hover {
    background: rgba(241, 76, 76, 0.16);
    color: #ff9b9b;
  }
</style>
