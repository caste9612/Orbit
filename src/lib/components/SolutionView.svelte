<script lang="ts">
  // Vista Solution dell'Explorer (M70): la soluzione scelta come la mostra il Solution Explorer di Visual
  // Studio (cartelle di soluzione, progetti, Dependencies, file annidati) e in fondo «Other files», il resto
  // della repo come su disco. Lista virtuale ad altezza fissa, come l'Explorer.
  import { onMount, tick, untrack } from "svelte";
  import Icon from "./Icon.svelte";
  import FileGlyph from "./FileGlyph.svelte";
  import ContextMenu, { type MenuItem } from "./ContextMenu.svelte";
  import { explorerView, setExplorerView } from "../state/explorerView.svelte";
  import {
    sol,
    data,
    openSolution,
    toggleNode,
    expandNode,
    collapseAll,
    loadProject,
    ownerProject,
    hiddenInOther,
    revealPath,
    watchSolution,
    reloadProjects,
    buildTarget,
    runProject,
  } from "../state/solution.svelte";
  import { canRun, expandable, type BuildVerb, type SNode } from "../state/solutionTree";
  import {
    tree,
    toggle as toggleFs,
    edit,
    startCreate,
    startRename,
    commitEdit,
    cancelEdit,
    deleteEntry,
    copyPath,
    copyRelPath,
    revealPath as revealInOs,
    type TreeNode,
  } from "../state/explorer.svelte";
  import { openFile, openInNewGroup, workspace, activePath, activeFile } from "../state/workspace.svelte";
  import { addTerminal } from "../state/terminals.svelte";
  import { runFile } from "../state/run.svelte";
  import { layout } from "../state/layout.svelte";
  import { decorations } from "../state/git.svelte";
  import { settings } from "../state/settings.svelte";
  import { isHidden, relOf } from "../state/shelf.svelte";
  import { notify } from "../state/toast.svelte";
  import { fileIcon, basename, dirname, isUnder, normSlash, pathKey, runCommand, samePath } from "../util";
  import { writeClipboard } from "../clipboard";

  const ROW = 22;
  const OVERSCAN = 8;
  const OTHER: SNode = { id: "other", kind: "other", name: "Other files", path: null, dir: null, children: [], detail: "not in the solution" };

  type Row =
    | { kind: "s"; node: SNode; depth: number; key: string }
    | { kind: "f"; node: TreeNode; depth: number; key: string }
    | { kind: "note"; text: string; error: boolean; depth: number; key: string }
    | { kind: "input"; depth: number; key: string };

  // la soluzione scelta, ricaricata se cambia la scelta o la repo a cui si riferisce (explorerView.root, non
  // workspace.rootPath: durante un cambio repo quello cambia prima, con la soluzione della repo precedente)
  $effect(() => {
    const p = explorerView.current;
    void explorerView.root;
    untrack(() => void openSolution(p));
  });
  // Show All Files: i progetti già letti si rileggono con (o senza) quello che escludono
  let lastShowAll = explorerView.showAll;
  $effect(() => {
    const on = explorerView.showAll;
    if (on === lastShowAll) return;
    lastShowAll = on;
    untrack(() => reloadProjects());
  });
  // «Collapse all» dalla testata della barra laterale
  let lastCollapse = explorerView.collapseSeq;
  $effect(() => {
    const n = explorerView.collapseSeq;
    if (n === lastCollapse) return;
    lastCollapse = n;
    untrack(collapseAll);
  });
  onMount(() => watchSolution());

  // ---- righe ----

  let rows = $derived.by(() => {
    void sol.version; // l'albero non è reattivo: si ricalcola a ogni modifica
    const out: Row[] = [];
    const root = data.root;
    if (!root) return out;
    const creating = edit.active && edit.mode === "create" ? edit.dir : null;
    const visit = (n: SNode, depth: number) => {
      out.push({ kind: "s", node: n, depth, key: n.id });
      if (!sol.expanded[n.id]) return;
      if (creating && n.dir && (n.kind === "project" || n.kind === "dir") && samePath(n.dir, creating)) {
        out.push({ kind: "input", depth: depth + 1, key: "__input__" });
      }
      if (n.kind === "project") {
        const busy = sol.busy[n.id];
        if (busy === "loading" && !n.children.length) out.push({ kind: "note", text: "Loading…", error: false, depth: depth + 1, key: `${n.id}|#note` });
        else if (busy && busy !== "loading") out.push({ kind: "note", text: `Couldn't read the project: ${busy}`, error: true, depth: depth + 1, key: `${n.id}|#note` });
      }
      for (const c of n.children) visit(c, depth + 1);
    };
    visit(root, 0);
    out.push({ kind: "s", node: OTHER, depth: 0, key: "other" });
    if (sol.expanded.other) {
      if (creating && workspace.rootPath && samePath(creating, workspace.rootPath)) out.push({ kind: "input", depth: 1, key: "__input__" });
      const fs = (nodes: TreeNode[], depth: number) => {
        for (const n of nodes) {
          if (hiddenInOther(n.entry.path, n.entry.name, depth) || isHidden(relOf(n.entry.path))) continue;
          out.push({ kind: "f", node: n, depth, key: `fs:${n.entry.path}` });
          if (!n.entry.isDir || !n.expanded) continue;
          if (creating && samePath(n.entry.path, creating)) out.push({ kind: "input", depth: depth + 1, key: "__input__" });
          fs(n.children, depth + 1);
        }
      };
      fs(tree.roots, 1);
    }
    return out;
  });

  let scrollTop = $state(0);
  let viewportH = $state(600);
  let listEl: HTMLDivElement;
  let start = $derived(Math.max(0, Math.floor(scrollTop / ROW) - OVERSCAN));
  let end = $derived(Math.min(rows.length, Math.ceil((scrollTop + viewportH) / ROW) + OVERSCAN));
  let visible = $derived(rows.slice(start, end));

  function bringIntoView(key: string) {
    if (!listEl) return;
    const idx = rows.findIndex((r) => r.key === key);
    if (idx < 0) return;
    const top = idx * ROW;
    if (top < scrollTop) listEl.scrollTop = top;
    else if (top + ROW > scrollTop + viewportH) listEl.scrollTop = top + ROW - viewportH;
  }

  // riga evidenziata un attimo (progetto raggiunto da Dependencies)
  let flash = $state<string | null>(null);
  let flashTimer: ReturnType<typeof setTimeout> | undefined;
  function flashRow(key: string) {
    flash = key;
    clearTimeout(flashTimer);
    flashTimer = setTimeout(() => (flash = null), 1400);
  }

  // ---- decorazioni git ----

  let deco = $derived(decorations());
  // i progetti scritti a mano possono avere un'altra grafia dei percorsi: confronto in minuscolo
  let decoFiles = $derived(new Map([...deco.files].map(([k, v]) => [k.toLowerCase(), v])));
  let decoDirs = $derived(new Set([...deco.dirs].map((d) => d.toLowerCase())));
  const fileCode = (p: string | null) => (p ? decoFiles.get(normSlash(p).toLowerCase()) : undefined);
  const dirDirty = (p: string | null) => !!p && decoDirs.has(normSlash(p).toLowerCase());
  // cartelle di soluzione con dentro progetti (o file della soluzione) modificati
  let dirtyFolders = $derived.by(() => {
    void sol.version;
    const out = new Set<string>();
    const visit = (n: SNode): boolean => {
      let any = (n.kind === "project" && dirDirty(n.dir)) || (n.kind === "file" && !!fileCode(n.path));
      if (n.kind === "folder" || n.kind === "solution") for (const c of n.children) any = visit(c) || any;
      if (any && n.kind === "folder") out.add(n.id);
      return any;
    };
    if (data.root) visit(data.root);
    return out;
  });
  function gitColor(code: string): string {
    if (code === "U" || code === "A") return "var(--color-success)";
    if (code === "D") return "var(--color-danger)";
    return "var(--color-warning)";
  }

  // ---- «Segui il file attivo» ----

  let revealed = "";
  $effect(() => {
    if (!settings.revealActive) return;
    const f = activeFile();
    if (!f || f.kind === "diff" || !sol.path || sol.loading) return;
    const k = `${sol.path}|${f.path}`;
    if (k === revealed) return;
    revealed = k;
    const p = f.path;
    untrack(() => void reveal(p));
  });
  async function reveal(p: string) {
    const key = await revealPath(p);
    if (!key) return;
    await tick();
    bringIntoView(key);
  }

  // ---- azioni ----

  function activate(n: SNode) {
    if (n.kind === "file") {
      if (!n.path) return;
      if (n.missing) notify(`${n.name} isn't on disk`, "error");
      else void openFile(n.path);
      return;
    }
    if (n.kind === "dep") {
      if (n.target) void goToProject(n.target);
      return;
    }
    if (expandable(n)) toggleNode(n);
  }

  function onRowClick(e: MouseEvent, n: SNode) {
    if (renamingPath(n.path)) return;
    // la freccia apre e chiude anche i file con altri file annidati sotto
    if ((e.target as HTMLElement).closest(".chev") && expandable(n)) toggleNode(n);
    else activate(n);
  }

  async function goToProject(file: string) {
    const id = `p:${pathKey(file)}`;
    const up: SNode[] = [];
    const find = (n: SNode, chain: SNode[]): boolean => {
      if (n.id === id) {
        up.push(...chain);
        return true;
      }
      return n.children.some((c) => (c.kind === "folder" || c.kind === "project") && find(c, [...chain, n]));
    };
    if (!data.root || !find(data.root, [])) {
      notify(`${basename(file)} isn't in this solution`);
      return;
    }
    for (const a of up) expandNode(a);
    await tick();
    bringIntoView(id);
    flashRow(id);
  }

  function openTerminalAt(dir: string) {
    layout.terminalVisible = true;
    addTerminal({ title: basename(dir) || "Terminal", cwd: dir });
  }
  async function copyName(name: string) {
    const ok = await writeClipboard(name);
    notify(ok ? "Name copied" : "Copy failed", ok ? "success" : "error", 1200);
  }

  /** Crea un file o una cartella in `dir`, aprendo prima il nodo che la mostra. */
  function createIn(n: SNode | null, dir: string, kind: "file" | "dir") {
    if (n) expandNode(n);
    else sol.expanded.other = true;
    void startCreate(dir, kind);
  }

  // dopo un crea/rinomina/elimina si rilegge subito il progetto (il watcher arriverebbe poco dopo)
  function refreshAt(dir: string) {
    const ids = [...data.models].filter(([, m]) => isUnder(dir, m.dir)).map(([id]) => id);
    if (ids.length) reloadProjects(ids);
  }
  async function commit() {
    if (!edit.active) return;
    const dir = edit.dir;
    await commitEdit();
    if (!edit.active) refreshAt(dir);
  }
  async function remove(path: string, name: string, isDir: boolean) {
    await deleteEntry(path, name, isDir);
    refreshAt(dirname(path));
  }
  const renamingPath = (p: string | null) => !!p && edit.active && edit.mode === "rename" && !!edit.target && samePath(edit.target, p);

  function autofocus(node: HTMLInputElement) {
    node.focus();
    const dot = node.value.lastIndexOf(".");
    if (edit.mode === "rename" && dot > 0) node.setSelectionRange(0, dot);
    else node.select();
  }
  function onInputKey(e: KeyboardEvent) {
    if (e.key === "Enter") {
      e.preventDefault();
      void commit();
    } else if (e.key === "Escape") {
      e.preventDefault();
      cancelEdit();
    }
  }

  // ---- menu contestuali ----

  let menu = $state<{ x: number; y: number; items: MenuItem[]; key: string } | null>(null);

  function buildItems(verb: BuildVerb, n: SNode, label: string): MenuItem {
    const icons: Record<BuildVerb, string> = { build: "hammer", rebuild: "refresh", clean: "eraser" };
    return { label, icon: icons[verb], onClick: () => void buildTarget(verb, n.path!, n.name, n.dir ?? dirname(n.path!)) };
  }

  function pathItems(path: string, withName = false): MenuItem[] {
    const items: MenuItem[] = [
      { label: "Copy path", icon: "copy", separatorBefore: true, onClick: () => copyPath(path) },
      { label: "Copy relative path", icon: "copy", onClick: () => copyRelPath(path) },
    ];
    if (withName) items.push({ label: "Copy name", icon: "copy", onClick: () => copyName(basename(path)) });
    return items;
  }

  function itemsFor(n: SNode): MenuItem[] {
    const items: MenuItem[] = [];
    const { model } = ownerProject(n);
    const sdk = model?.style === "sdk";
    switch (n.kind) {
      case "solution":
        items.push(buildItems("build", n, "Build Solution"), buildItems("rebuild", n, "Rebuild Solution"), buildItems("clean", n, "Clean Solution"));
        items.push(
          { label: "Open in terminal", icon: "terminal", separatorBefore: true, onClick: () => openTerminalAt(n.dir!) },
          { label: "Reveal in Explorer", icon: "external-link", onClick: () => revealInOs(n.path!) },
          ...pathItems(n.path!),
        );
        break;
      case "project":
        if (!n.missing) {
          items.push(buildItems("build", n, "Build"), buildItems("rebuild", n, "Rebuild"), buildItems("clean", n, "Clean"));
          if (model && canRun(model)) items.push({ label: "Run", icon: "play", onClick: () => runProject(model, n.name) });
          items.push({ label: "Edit project file", icon: "code", separatorBefore: true, onClick: () => void openFile(n.path!) });
          if (sdk) {
            items.push(
              { label: "New file…", icon: "file-plus", separatorBefore: true, onClick: () => createIn(n, n.dir!, "file") },
              { label: "New folder…", icon: "folder-plus", onClick: () => createIn(n, n.dir!, "dir") },
            );
          }
          items.push(
            { label: "Open in terminal", icon: "terminal", separatorBefore: true, onClick: () => openTerminalAt(n.dir!) },
            { label: "Reveal in Explorer", icon: "external-link", onClick: () => revealInOs(n.path!) },
          );
        }
        items.push(...pathItems(n.path!));
        break;
      case "dir": {
        if (!n.path) break; // cartella virtuale: un filtro del C++ o i soli file collegati
        const path = n.path;
        if (sdk && !n.excluded) {
          items.push(
            { label: "New file…", icon: "file-plus", onClick: () => createIn(n, path, "file") },
            { label: "New folder…", icon: "folder-plus", onClick: () => createIn(n, path, "dir") },
          );
        }
        items.push(
          { label: "Open in terminal", icon: "terminal", separatorBefore: items.length > 0, onClick: () => openTerminalAt(path) },
          { label: "Reveal in Explorer", icon: "external-link", onClick: () => revealInOs(path) },
        );
        if (sdk || n.excluded) {
          items.push(
            { label: "Rename…", icon: "pencil", separatorBefore: true, onClick: () => startRename(path, n.name, true) },
            { label: "Delete", icon: "trash", danger: true, onClick: () => void remove(path, n.name, true) },
          );
        }
        items.push(...pathItems(path));
        break;
      }
      case "file": {
        if (!n.path) break;
        const path = n.path;
        // i file della soluzione e quelli collegati stanno altrove: rinominarli romperebbe il riferimento
        const editable = !n.link && !n.missing && !n.id.startsWith("si:") && (sdk || !!n.excluded);
        if (runCommand(n.name)) items.push({ label: "Run", icon: "play", onClick: () => runFile(path) });
        items.push({ label: "Open to the side", icon: "panel-left", separatorBefore: items.length > 0, onClick: () => void openInNewGroup(path) });
        if (editable) {
          items.push(
            { label: "Rename…", icon: "pencil", separatorBefore: true, onClick: () => startRename(path, n.name, false) },
            { label: "Delete", icon: "trash", danger: true, onClick: () => void remove(path, n.name, false) },
          );
        }
        items.push(...pathItems(path, true), { label: "Reveal in Explorer", icon: "external-link", onClick: () => revealInOs(path) });
        break;
      }
      case "dep":
        if (n.target) items.push({ label: "Go to project", icon: "arrow-right", onClick: () => void goToProject(n.target!) });
        items.push({ label: "Copy name", icon: "copy", separatorBefore: !!n.target, onClick: () => copyName(n.name) });
        break;
      case "other": {
        const root = workspace.rootPath;
        if (!root) break;
        items.push(
          { label: "New file…", icon: "file-plus", onClick: () => createIn(null, root, "file") },
          { label: "New folder…", icon: "folder-plus", onClick: () => createIn(null, root, "dir") },
          { label: "Open in terminal", icon: "terminal", separatorBefore: true, onClick: () => openTerminalAt(root) },
          { label: "Reveal in Explorer", icon: "external-link", onClick: () => revealInOs(root) },
        );
        break;
      }
    }
    return items;
  }

  /** Menu delle righe di «Other files»: quello dell'Explorer a cartelle. */
  function fsItems(n: TreeNode): MenuItem[] {
    const p = n.entry.path;
    const dir = n.entry.isDir ? p : dirname(p);
    const items: MenuItem[] = [];
    if (!n.entry.isDir && runCommand(n.entry.name)) items.push({ label: "Run", icon: "play", onClick: () => runFile(p) });
    items.push(
      { label: "New file…", icon: "file-plus", separatorBefore: items.length > 0, onClick: () => void startCreate(dir, "file") },
      { label: "New folder…", icon: "folder-plus", onClick: () => void startCreate(dir, "dir") },
      { label: "Open in terminal", icon: "terminal", separatorBefore: true, onClick: () => openTerminalAt(dir) },
      { label: "Reveal in Explorer", icon: "external-link", onClick: () => revealInOs(p) },
    );
    if (!n.entry.isDir) items.push({ label: "Open to the side", icon: "panel-left", separatorBefore: true, onClick: () => void openInNewGroup(p) });
    items.push(
      { label: "Rename…", icon: "pencil", separatorBefore: true, onClick: () => startRename(p, n.entry.name, n.entry.isDir) },
      { label: "Delete", icon: "trash", danger: true, onClick: () => void deleteEntry(p, n.entry.name, n.entry.isDir) },
      ...pathItems(p, true),
    );
    return items;
  }

  async function openMenu(e: MouseEvent, row: Row) {
    e.preventDefault();
    e.stopPropagation();
    const x = e.clientX;
    const y = e.clientY;
    let items: MenuItem[] = [];
    if (row.kind === "s") {
      // il menu di un progetto dipende dal suo contenuto (Run solo per gli eseguibili): lo si legge prima
      const n = row.node;
      if (n.kind === "project" && !n.missing && !data.models.has(n.id)) await loadProject(n);
      items = itemsFor(n);
    } else if (row.kind === "f") {
      items = fsItems(row.node);
    }
    if (items.length) menu = { x, y, items, key: row.key };
  }

  // ---- presentazione ----

  const LANG_FILE: Record<string, string> = { cs: "x.cs", vb: "x.vb", fs: "x.fs", cpp: "x.cpp" };
  const GROUP_ICON: Record<string, string> = { frameworks: "layers", packages: "box", projects: "code", assemblies: "braces" };

  function label(n: SNode): string {
    return n.kind === "solution" ? `Solution '${n.name}'` : n.name;
  }
  function detailOf(n: SNode): string | undefined {
    if (n.kind === "solution") return `(${n.detail})`;
    if (n.kind === "project" && n.missing) return "(not found)";
    return n.detail;
  }
</script>

<div class="solution-root">
  {#if sol.error}
    <div class="empty">
      <p class="muted">Couldn't read the solution.</p>
      <p class="hint">{sol.error}</p>
      <button class="link" onclick={() => setExplorerView(null)}>Back to folders</button>
    </div>
  {:else if !data.root && sol.loading}
    <div class="empty"><p class="muted">Loading the solution…</p></div>
  {/if}
  <div
    class="tree"
    bind:this={listEl}
    onscroll={(e) => (scrollTop = (e.currentTarget as HTMLElement).scrollTop)}
    bind:clientHeight={viewportH}
    role="tree"
    tabindex="-1"
  >
    <div class="canvas" style="height:{rows.length * ROW}px">
      {#each visible as r, i (r.key)}
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
              onblur={() => void commit()}
              title={edit.error ?? ""}
              placeholder={edit.kind === "dir" ? "folder name" : "file name"}
            />
          </div>
        {:else if r.kind === "note"}
          <div class="row note" class:error={r.error} style="top:{idx * ROW}px; height:{ROW}px; padding-left:{6 + r.depth * 14 + 16}px" title={r.text}>
            {r.text}
          </div>
        {:else if r.kind === "f"}
          {@const n = r.node}
          {@const renaming = renamingPath(n.entry.path)}
          {@const gcode = n.entry.isDir ? undefined : fileCode(n.entry.path)}
          <button
            type="button"
            class="row"
            class:active={!n.entry.isDir && samePath(n.entry.path, activePath() ?? "")}
            class:target={menu?.key === r.key}
            style="top:{idx * ROW}px; height:{ROW}px; padding-left:{6 + r.depth * 14}px"
            onclick={() => !renaming && (n.entry.isDir ? toggleFs(n) : openFile(n.entry.path))}
            oncontextmenu={(e) => openMenu(e, r)}
            title={n.entry.name}
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
              <!-- svelte-ignore a11y_autofocus -->
              <input
                class="edit"
                class:err={!!edit.error}
                bind:value={edit.value}
                use:autofocus
                onkeydown={onInputKey}
                onblur={() => void commit()}
                onclick={(e) => e.stopPropagation()}
                title={edit.error ?? ""}
              />
            {:else}
              <span class="name" style={gcode ? `color:${gitColor(gcode)}` : ""}>{n.entry.name}</span>
              {#if gcode}
                <span class="gcode" style="color:{gitColor(gcode)}">{gcode}</span>
              {:else if n.entry.isDir && dirDirty(n.entry.path)}
                <span class="gdot"></span>
              {/if}
            {/if}
          </button>
        {:else}
          {@const n = r.node}
          {@const open = !!sol.expanded[n.id]}
          {@const renaming = renamingPath(n.path)}
          {@const gcode = n.kind === "file" ? fileCode(n.path) : undefined}
          {@const dirty =
            (n.kind === "folder" && dirtyFolders.has(n.id)) || ((n.kind === "project" || n.kind === "dir") && dirDirty(n.dir))}
          {@const detail = detailOf(n)}
          <button
            type="button"
            class="row"
            class:active={n.kind === "file" && !!n.path && samePath(n.path, activePath() ?? "")}
            class:target={menu?.key === r.key || flash === r.key}
            class:excluded={n.excluded}
            class:missing={n.missing}
            class:top={n.kind === "solution" || n.kind === "other"}
            style="top:{idx * ROW}px; height:{ROW}px; padding-left:{6 + r.depth * 14}px"
            onclick={(e) => onRowClick(e, n)}
            oncontextmenu={(e) => openMenu(e, r)}
            title={n.missing && n.kind === "file" ? `${n.name} — not on disk` : (n.path ?? n.name)}
          >
            <span class="chev" class:open>
              {#if expandable(n)}<Icon name="chevron-right" size={14} strokeWidth={2} />{/if}
            </span>
            {#if n.kind === "solution"}
              <span class="ic sln"><Icon name="solution" size={16} strokeWidth={1.6} /></span>
            {:else if n.kind === "folder" || n.kind === "dir"}
              <span class="ic dir" class:virtual={n.kind === "dir" && !n.path}>
                <Icon name={open ? "folder-open" : "folder"} size={16} strokeWidth={1.6} />
              </span>
            {:else if n.kind === "project"}
              {#if LANG_FILE[n.lang ?? ""]}
                {@const fi = fileIcon(LANG_FILE[n.lang ?? ""])}
                <span class="ic"><FileGlyph glyph={fi.glyph} color={fi.color} size={16} /></span>
              {:else}
                <span class="ic"><Icon name="box" size={16} strokeWidth={1.6} /></span>
              {/if}
            {:else if n.kind === "deps"}
              <span class="ic"><Icon name="box" size={16} strokeWidth={1.6} /></span>
            {:else if n.kind === "group" || n.kind === "dep"}
              <span class="ic"><Icon name={GROUP_ICON[n.group ?? ""] ?? "box"} size={15} strokeWidth={1.6} /></span>
            {:else if n.kind === "other"}
              <span class="ic dir"><Icon name="explorer" size={15} strokeWidth={1.6} /></span>
            {:else}
              {@const fi = fileIcon(n.name)}
              <span class="ic" class:lnk={n.link}><FileGlyph glyph={fi.glyph} color={fi.color} size={16} /></span>
            {/if}
            {#if renaming}
              <!-- svelte-ignore a11y_autofocus -->
              <input
                class="edit"
                class:err={!!edit.error}
                bind:value={edit.value}
                use:autofocus
                onkeydown={onInputKey}
                onblur={() => void commit()}
                onclick={(e) => e.stopPropagation()}
                title={edit.error ?? ""}
              />
            {:else}
              <span class="name" style={gcode ? `color:${gitColor(gcode)}` : ""}>{label(n)}</span>
              {#if detail}<span class="detail">{detail}</span>{/if}
              {#if gcode}
                <span class="gcode" style="color:{gitColor(gcode)}">{gcode}</span>
              {:else if dirty}
                <span class="gdot"></span>
              {/if}
            {/if}
          </button>
        {/if}
      {/each}
    </div>
  </div>
</div>

{#if menu}
  <ContextMenu x={menu.x} y={menu.y} items={menu.items} onClose={() => (menu = null)} />
{/if}

<style>
  .solution-root {
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
  /* Show All Files: su disco ma fuori dal progetto */
  .row.excluded {
    opacity: 0.55;
  }
  .row.missing .name {
    color: var(--color-warning);
  }
  .row.top .name {
    font-weight: 600;
  }
  .row.note {
    cursor: default;
    color: var(--color-ink-subtle);
    font-size: 12px;
    font-style: italic;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .row.note.error {
    color: var(--color-danger);
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
    position: relative;
    flex: 0 0 auto;
    display: grid;
    place-items: center;
    color: var(--color-ink-subtle);
  }
  .ic.dir {
    color: var(--color-ink-muted);
  }
  .ic.dir.virtual {
    opacity: 0.6;
  }
  /* il nastro di Visual Studio */
  .ic.sln {
    color: #a07ad8;
  }
  /* file collegato (fuori dalla cartella del progetto): la freccetta delle scorciatoie */
  .ic.lnk::after {
    content: "";
    position: absolute;
    left: -2px;
    bottom: -1px;
    width: 7px;
    height: 7px;
    border-radius: 2px;
    background:
      linear-gradient(45deg, transparent 42%, var(--color-ink) 42%, var(--color-ink) 58%, transparent 58%),
      var(--color-panel);
    box-shadow: 0 0 0 1px var(--color-panel);
  }
  .name {
    flex: 0 1 auto;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  /* con poco spazio cede prima il dettaglio (versione, «not in the solution»), poi il nome */
  .detail {
    flex: 1 1000 auto;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    margin-left: 4px;
    color: var(--color-ink-subtle);
    font-size: 11.5px;
  }
  .gcode {
    flex: 0 0 auto;
    margin-left: auto;
    padding-left: 4px;
    font-family: var(--font-mono);
    font-size: 10.5px;
    font-weight: 700;
  }
  .gdot {
    flex: 0 0 auto;
    width: 6px;
    height: 6px;
    margin-left: auto;
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
  .empty {
    padding: 12px 18px 6px;
    display: flex;
    flex-direction: column;
    gap: 6px;
    align-items: flex-start;
  }
  .muted {
    margin: 0;
    color: var(--color-ink-muted);
    font-size: 12.5px;
  }
  .hint {
    margin: 0;
    color: var(--color-ink-subtle);
    font-size: 12px;
    line-height: 1.45;
    overflow-wrap: anywhere;
  }
  .link {
    padding: 0;
    border: 0;
    background: none;
    color: var(--color-accent);
    font-size: 12.5px;
    cursor: pointer;
  }
  .link:hover {
    text-decoration: underline;
  }
</style>
