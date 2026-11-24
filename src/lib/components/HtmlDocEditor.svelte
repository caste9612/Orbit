<script lang="ts">
  // Editor visuale dei documenti HTML del profilo editable-html (M77). La pagina gira in un iframe
  // sandbox SENZA allow-same-origin (origine opaca) con una CSP che vieta rete e file: gli script del
  // documento (indice, grafici) girano, ma non raggiungono né l'IPC di Tauri né il disco. Lo script di
  // Orbit nella pagina (htmldoc/shim.js) manda le modifiche dei testi; qui diventano sostituzioni nel
  // SORGENTE (htmldoc/htmlDoc.ts), che resta l'unica verità: il DOM vivo non si salva mai.
  import { untrack } from "svelte";
  import Icon from "./Icon.svelte";
  import HtmlDocPanel from "./HtmlDocPanel.svelte";
  import shim from "../htmldoc/shim.js?raw";
  import runtimeHtml from "../htmldoc/runtime.html?raw";
  import * as hd from "../htmldoc/htmlDoc";
  import { fileByPath, updateContent, savePath, workspace } from "../state/workspace.svelte";
  import { writeClipboard } from "../clipboard";
  import { notify } from "../state/toast.svelte";
  import { relTo } from "../util";
  import { settings, isLightTheme } from "../state/settings.svelte";

  interface Props {
    path: string;
    content: string;
    readonly?: boolean;
  }
  let { path, content, readonly = false }: Props = $props();

  let map = $derived(hd.analyze(content));
  // l'anteprima segue il tema di Orbit; il bottone Light/Dark del pannello mostra l'altro
  let scheme = $state<"light" | "dark">(untrack(() => (isLightTheme() ? "light" : "dark")));
  $effect(() => {
    void settings.theme;
    scheme = isLightTheme() ? "light" : "dark";
  });
  let panelOpen = $state(true);

  // Due iframe: la copia nuova si carica dietro e si mostra quando è pronta, così sezioni, dati e annulla
  // non fanno lampeggiare la pagina.
  let frames = $state<(HTMLIFrameElement | undefined)[]>([undefined, undefined]);
  let docs = $state(["", ""]);
  let shown = $state(-1);
  let loading = -1;
  let token = 0;
  let shownRefs = 0;
  let scrollY = 0;
  let revealOnReady: string | null = null;
  let lastOwn = untrack(() => content); // il testo come l'ha lasciato questo editor

  let sel = $state<{ block: string | null; ref: number | null; item: number | null }>({ block: null, ref: null, item: null });
  let item = $derived(sel.item !== null ? (map.items[sel.item] ?? null) : null);
  const RUNTIME = runtimeHtml.replace(/\r/g, "").trim();
  let runtimeCurrent = $derived(map.runtime !== null && content.replace(/\r/g, "").includes(RUNTIME));

  // ---- la pagina ----
  function rebuild(src: string = content) {
    const m = src === content ? map : hd.analyze(src);
    const slot = shown === 0 ? 1 : 0;
    loading = slot;
    token++;
    docs[slot] = hd.frameDoc(m, shim, { token, scroll: scrollY, readonly, block: sel.block }, scheme);
  }

  function post(msg: Record<string, unknown>) {
    if (shown >= 0) frames[shown]?.contentWindow?.postMessage(msg, "*");
  }

  // primo caricamento e cambio di tema
  $effect(() => {
    void scheme;
    untrack(() => rebuild());
  });

  // il testo cambiato da fuori (CodeMirror affiancato, Claude sul disco): si ricarica la pagina
  let extTimer: ReturnType<typeof setTimeout> | undefined;
  $effect(() => {
    const c = content;
    if (c === lastOwn) return;
    lastOwn = c;
    sel.item = null;
    clearTimeout(extTimer);
    extTimer = setTimeout(() => rebuild(), 250);
    return () => clearTimeout(extTimer);
  });

  function onMessage(e: MessageEvent) {
    const m = e.data;
    if (!m || m.orbit !== 1) return;
    const i = frames.findIndex((f) => f && e.source === f.contentWindow);
    if (i < 0) return;
    if (m.type === "ready") {
      if (i !== loading || m.token !== token) return;
      shown = i;
      loading = -1;
      shownRefs = m.refs;
      docs[1 - i] = "";
      if (revealOnReady) {
        post({ type: "reveal", block: revealOnReady, smooth: true });
        revealOnReady = null;
      }
      return;
    }
    if (i !== shown) return;
    switch (m.type) {
      case "edit":
        textEdit(m.ref, m.html);
        break;
      case "select":
        sel = { block: m.block, ref: m.ref, item: m.item };
        break;
      case "scroll":
        scrollY = m.y;
        break;
      case "save":
        void savePath(path);
        break;
      case "undo":
        undo();
        break;
      case "redo":
        redo();
        break;
      case "link":
        if (/^https?:\/\//i.test(m.href)) window.open(m.href, "_blank");
        break;
    }
  }

  function textEdit(ref: number, html: string) {
    if (readonly || loading >= 0) return;
    const m = map;
    if (m.editables.length !== shownRefs) return rebuild(); // la pagina non corrisponde più al sorgente
    const e = m.editables[ref];
    if (!e || typeof html !== "string" || !hd.acceptableInline(html)) return;
    if (content.slice(e.el.openTo, e.el.closeFrom ?? e.el.to) === html) return;
    commit(hd.replaceInner(content, e.el, html), false, "text:" + ref);
  }

  // ---- modifiche e annulla ----
  const past: { src: string; key: string; t: number }[] = [];
  const future: string[] = [];
  let canUndo = $state(false);
  let canRedo = $state(false);

  function setContent(next: string, reload: boolean) {
    lastOwn = next;
    updateContent(path, next);
    const f = fileByPath(path);
    if (f) f.rev++; // un CodeMirror affiancato sullo stesso file prende il testo nuovo
    if (reload) {
      sel.item = null;
      rebuild(next);
    }
  }

  function commit(next: string, reload: boolean, key = "") {
    if (readonly || next === content) return;
    const now = Date.now();
    const top = past[past.length - 1];
    if (key && top && top.key === key && now - top.t < 2000) top.t = now;
    else past.push({ src: content, key, t: now });
    if (past.length > 300) past.shift();
    future.length = 0;
    canUndo = true;
    canRedo = false;
    setContent(next, reload);
  }

  function undo() {
    const p = past.pop();
    if (!p) return;
    future.push(content);
    canUndo = past.length > 0;
    canRedo = true;
    setContent(p.src, true);
  }
  function redo() {
    const n = future.pop();
    if (n === undefined) return;
    past.push({ src: content, key: "", t: 0 });
    canUndo = true;
    canRedo = future.length > 0;
    setContent(n, true);
  }

  const act: hd.DocActions = {
    reveal(id) {
      sel = { block: id, ref: null, item: null };
      post({ type: "reveal", block: id, smooth: true });
    },
    moveBlock(from, to) {
      const id = map.blocks[from]?.id ?? null;
      commit(hd.moveBlock(map, from, to), true);
      if (id) {
        sel.block = id;
        revealOnReady = id;
      }
    },
    duplicateBlock(i) {
      const r = hd.duplicateBlock(map, i);
      sel.block = r.id;
      revealOnReady = r.id;
      commit(r.src, true);
    },
    deleteBlock(i) {
      const b = map.blocks[i];
      if (b && sel.block === b.id) sel.block = null;
      commit(hd.deleteBlock(map, i), true);
    },
    addBlock(after) {
      const r = hd.addBlock(map, after);
      sel.block = r.id;
      revealOnReady = r.id;
      commit(r.src, true);
    },
    setLayout(i, layout) {
      const b = map.blocks[i];
      if (!b) return;
      commit(hd.setLayout(map, i, layout), false);
      post({ type: "layout", block: b.id, layout });
    },
    moveItem(dir) {
      if (item) commit(hd.moveItem(content, item, dir), true);
    },
    duplicateItem() {
      if (item) commit(hd.duplicateItem(content, item), true);
    },
    deleteItem() {
      if (item) commit(hd.deleteItem(content, item), true);
    },
    setData(ds, data) {
      const next = hd.setDataset(content, ds, data);
      if (map.runtime !== null) {
        commit(next, false, "data:" + ds.name);
        post({ type: "dataset", name: ds.name, json: JSON.stringify(data) });
      } else commit(next, true);
    },
    renameColumn(ds, index, name) {
      commit(hd.renameColumn(map, ds, index, name), true);
    },
    previewToken(t, value) {
      if (t.scheme === scheme) post({ type: "css", name: t.name, value });
    },
    setToken(t, value) {
      commit(hd.setToken(content, t, value), false, `token:${t.scheme}${t.name}`);
      if (t.scheme === scheme) post({ type: "css", name: t.name, value });
    },
    insertRuntime() {
      commit(hd.insertRuntime(content, runtimeHtml), true);
    },
    async copyFixPrompt() {
      const rel = workspace.rootPath ? relTo(workspace.rootPath, path) : path;
      const issues = map.problems.filter((p) => p.level !== "info");
      if (await writeClipboard(hd.fixPrompt(rel, issues))) notify("Prompt for Claude copied", "success", 1800);
      else notify("Couldn't copy the prompt", "error");
    },
    print() {
      post({ type: "print" });
    },
    undo,
    redo,
    setScheme(s) {
      scheme = s;
    },
    closePanel() {
      panelOpen = false;
    },
  };
</script>

<svelte:window onmessage={onMessage} />

<div class="hdoc" class:dark={scheme === "dark"}>
  <div class="stage">
    {#each [0, 1] as i (i)}
      <iframe
        bind:this={frames[i]}
        class:standby={i !== shown}
        srcdoc={docs[i]}
        sandbox="allow-scripts allow-modals"
        title={path}
      ></iframe>
    {/each}
    {#if !panelOpen}
      <button class="reopen" title="Show the document panel" aria-label="Show the document panel" onclick={() => (panelOpen = true)}>
        <Icon name="chevrons-left" size={14} strokeWidth={2} />
      </button>
    {/if}
  </div>
  {#if panelOpen}
    <HtmlDocPanel {map} selBlock={sel.block} {item} {readonly} {scheme} {canUndo} {canRedo} {runtimeCurrent} {act} />
  {/if}
</div>

<style>
  .hdoc {
    display: flex;
    height: 100%;
    min-width: 0;
  }
  .stage {
    position: relative;
    flex: 1;
    min-width: 160px;
    background: #fff;
  }
  .hdoc.dark .stage {
    background: #16181c;
  }
  iframe {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    border: 0;
    background: transparent;
  }
  /* la copia in caricamento: invisibile ma con il suo spazio (i grafici misurano la larghezza vera).
     Non «hidden»: è la classe di Tailwind con display:none, e un iframe così non si carica */
  iframe.standby {
    visibility: hidden;
    pointer-events: none;
  }
  .reopen {
    position: absolute;
    top: 8px;
    right: 8px;
    width: 26px;
    height: 26px;
    display: grid;
    place-items: center;
    border-radius: var(--r-md);
    border: 1px solid var(--color-line-strong);
    background: var(--color-surface-2);
    color: var(--color-ink-muted);
    cursor: pointer;
  }
  .reopen:hover {
    color: var(--color-ink);
  }
</style>
