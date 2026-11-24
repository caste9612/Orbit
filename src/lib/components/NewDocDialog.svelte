<script lang="ts">
  // «New document from template» (M77): sceglie un template (di questo PC o di Orbit), chiede i suoi campi {{…}},
  // mostra l'anteprima e crea il file nella cartella da cui è stato aperto, poi lo apre nell'editor visuale.
  import { invoke } from "@tauri-apps/api/core";
  import { open as pickFolder } from "@tauri-apps/plugin-dialog";
  import { scale } from "svelte/transition";
  import Icon from "./Icon.svelte";
  import Backdrop from "./Backdrop.svelte";
  import { newDocUI, closeNewDoc, loadDocTemplates, type DocTemplate } from "../state/docTemplates.svelte";
  import { templateMeta, templateFields, fillTemplate, fileNameFrom, analyze, frameDoc, insertRuntime, type TemplateField } from "../htmldoc/htmlDoc";
  import runtimeHtml from "../htmldoc/runtime.html?raw";
  import { openFile } from "../state/workspace.svelte";
  import { revealPath } from "../state/explorer.svelte";
  import { notify } from "../state/toast.svelte";
  import { isLightTheme } from "../state/settings.svelte";
  import { basename, canonPath, joinPath, relTo, isUnder } from "../util";
  import { workspace } from "../state/workspace.svelte";
  import { focusOnMount } from "../focus";

  interface Entry {
    t: DocTemplate;
    name: string;
    description: string;
    fileName: string | null;
  }

  let dir = $state("");
  let entries = $state<Entry[]>([]);
  let loading = $state(true);
  let sel = $state(0);
  let fields = $state<TemplateField[]>([]);
  let fileName = $state("");
  let fileNameTouched = false;
  let busy = $state(false);

  void loadDocTemplates().then((r) => {
    dir = r.dir;
    entries = r.items.map((t) => ({ t, ...templateMeta(t.content) }));
    loading = false;
    pick(0);
  });

  const values = () => Object.fromEntries(fields.map((f) => [f.key, f.value]));
  const current = $derived(entries[sel] ?? null);

  function pick(i: number) {
    sel = i;
    const e = entries[i];
    fields = e ? templateFields(e.t.content) : [];
    fileNameTouched = false;
    suggestName();
  }
  function suggestName() {
    if (fileNameTouched || !current) return;
    const v = values();
    const base = current.fileName ? current.fileName.replace(/\{\{\s*([\w-]+)\s*(?:\|[^}]*)?\}\}/g, (_m, k: string) => v[k] ?? "") : current.name;
    fileName = fileNameFrom(base, "document");
  }

  // il documento nuovo: i campi compilati e il runtime di questo Orbit (inserito o aggiornato), così i template non
  // devono portarlo con sé e un documento nasce sempre con l'ultimo
  function build(): string {
    if (!current) return "";
    const doc = fillTemplate(current.t.content, values());
    const m = analyze(doc);
    return m.runtime !== null || m.runtimeMarker || m.charts.length ? insertRuntime(doc, runtimeHtml) : doc;
  }

  // anteprima: il documento, nella stessa gabbia dell'editor (CSP, niente rete né IPC), col tema di Orbit
  let preview = $derived.by(() => (current ? frameDoc(analyze(build()), "", {}, isLightTheme() ? "light" : "dark") : ""));

  async function create() {
    if (!current || busy) return;
    const name = fileName.trim().endsWith(".html") || fileName.trim().endsWith(".htm") ? fileName.trim() : fileName.trim() + ".html";
    if (!/^[^\\/:*?"<>|]+$/.test(name)) {
      notify("Invalid file name", "error", 2600);
      return;
    }
    const path = joinPath(newDocUI.dir, name);
    busy = true;
    try {
      if (await invoke<string | null>("resolve_existing", { paths: [path] })) {
        notify(`${name} already exists`, "error", 3000);
        return;
      }
      await invoke("write_file", { path, content: build() });
      closeNewDoc();
      await openFile(path);
    } catch (e) {
      notify(`Couldn't create ${name}`, "error", 0, { detail: String(e) });
    } finally {
      busy = false;
    }
  }

  // la cartella di destinazione: quella da cui si è aperta la finestra (o la radice), cambiabile
  async function changeDir() {
    try {
      const sel = await pickFolder({ directory: true, multiple: false, defaultPath: newDocUI.dir || workspace.rootPath || undefined });
      if (typeof sel === "string" && sel) newDocUI.dir = canonPath(sel);
    } catch (e) {
      console.error("pick folder", e);
    }
  }

  function onKey(e: KeyboardEvent) {
    if (e.key === "Enter" && !(e.target instanceof HTMLTextAreaElement)) {
      e.preventDefault();
      void create();
    }
  }

  // la cartella com'è nel progetto («docs/specs»), la radice col suo nome, fuori dal progetto il percorso intero
  const where = $derived(
    workspace.rootPath && newDocUI.dir && isUnder(newDocUI.dir, workspace.rootPath)
      ? relTo(workspace.rootPath, newDocUI.dir) || basename(newDocUI.dir)
      : newDocUI.dir,
  );
  const pcItems = $derived(entries.map((e, i) => ({ e, i })).filter((x) => x.e.t.source === "pc"));
  const orbitItems = $derived(entries.map((e, i) => ({ e, i })).filter((x) => x.e.t.source === "orbit"));
</script>

<Backdrop onClose={closeNewDoc} dim z={120} />
<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<div class="panel" role="dialog" aria-modal="true" aria-label="New document from template" tabindex="-1" onkeydown={onKey} transition:scale={{ duration: 110, start: 0.97, opacity: 0.3 }}>
  <header class="head">
    <span class="title">New document from template</span>
    <span class="where" title={newDocUI.dir}>in <b>{where}</b></span>
    <button class="change" onclick={() => void changeDir()}>Change…</button>
    <button class="ib" title="Close" aria-label="Close" onclick={closeNewDoc}><Icon name="x" size={14} strokeWidth={2} /></button>
  </header>

  <div class="body">
    <div class="list">
      {#if loading}
        <p class="hint">Loading…</p>
      {:else}
        {#snippet group(title: string, items: { e: Entry; i: number }[])}
          <div class="gh">{title}</div>
          {#each items as x (x.e.t.id)}
            <button class="item" class:on={x.i === sel} onclick={() => pick(x.i)} title={x.e.description || x.e.name}>
              <Icon name="doc" size={13} strokeWidth={1.8} />
              <span class="ell">{x.e.name}</span>
            </button>
          {/each}
        {/snippet}
        {#if pcItems.length}{@render group("On this PC", pcItems)}{/if}
        {#if orbitItems.length}{@render group("Orbit", orbitItems)}{/if}
        {#if !entries.length}<p class="hint">No templates yet.</p>{/if}
        <button class="folder" title={dir} onclick={() => dir && revealPath(dir)} disabled={!dir}>
          <Icon name="folder-open" size={13} strokeWidth={1.8} /> Templates folder
        </button>
      {/if}
    </div>

    <div class="detail">
      {#if current}
        {#if current.description}<p class="desc">{current.description}</p>{/if}
        <div class="prev" aria-label="Preview">
          <iframe title="Preview" srcdoc={preview} sandbox="allow-scripts" tabindex="-1"></iframe>
        </div>
        <div class="form">
          {#each fields as f, i (f.key)}
            <label class="row">
              <span class="lbl">{f.label}</span>
              {#if i === 0}
                <input class="ctl" bind:value={f.value} oninput={suggestName} spellcheck="false" use:focusOnMount />
              {:else}
                <input class="ctl" bind:value={f.value} oninput={suggestName} spellcheck="false" />
              {/if}
            </label>
          {/each}
          <label class="row">
            <span class="lbl">File name</span>
            <input class="ctl mono" bind:value={fileName} oninput={() => (fileNameTouched = true)} spellcheck="false" />
          </label>
        </div>
      {/if}
    </div>
  </div>

  <footer class="foot">
    <span class="hint">The fields fill the template; you can change everything later in the editor.</span>
    <button class="btn" onclick={closeNewDoc}>Cancel</button>
    <button class="btn primary" disabled={!current || busy || !fileName.trim()} onclick={() => void create()}>Create</button>
  </footer>
</div>

<style>
  .panel {
    position: fixed;
    z-index: 121;
    top: 56px;
    left: 50%;
    transform: translateX(-50%);
    width: min(860px, 94vw);
    height: min(620px, calc(100vh - 100px));
    display: flex;
    flex-direction: column;
    background: var(--color-surface-2);
    border: 1px solid var(--color-line-strong);
    border-radius: var(--radius-lg);
    box-shadow: var(--shadow-pop);
    overflow: hidden;
    color: var(--color-ink);
    font-family: var(--font-sans);
    font-size: 13px;
    outline: none;
  }
  .head {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 10px 10px 10px 14px;
    border-bottom: 1px solid var(--color-line);
  }
  .title {
    font-size: 14px;
    font-weight: 600;
  }
  .where b {
    color: var(--color-ink);
    font-weight: 500;
  }
  .change {
    flex: 0 0 auto;
    margin-right: auto;
    height: 24px;
    padding: 0 8px;
    border: 1px solid var(--color-line-strong);
    border-radius: var(--r-sm);
    background: none;
    color: var(--color-ink-muted);
    font: inherit;
    font-size: 12px;
    cursor: pointer;
  }
  .change:hover {
    color: var(--color-ink);
    border-color: var(--color-accent);
  }
  .where {
    flex: 0 1 auto;
    min-width: 0;
    color: var(--color-ink-subtle);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .body {
    flex: 1;
    min-height: 0;
    display: flex;
  }
  .list {
    flex: 0 0 230px;
    overflow: auto;
    padding: 8px;
    border-right: 1px solid var(--color-line);
    display: flex;
    flex-direction: column;
    gap: 1px;
  }
  .gh {
    padding: 8px 8px 4px;
    font-size: 10px;
    letter-spacing: 0.05em;
    text-transform: uppercase;
    color: var(--color-ink-subtle);
  }
  .item {
    display: flex;
    align-items: center;
    gap: 8px;
    height: 28px;
    padding: 0 8px;
    border: 0;
    border-radius: var(--r-sm);
    background: none;
    color: var(--color-ink);
    font: inherit;
    text-align: left;
    cursor: pointer;
  }
  .item:hover {
    background: var(--color-surface-3);
  }
  .item.on {
    background: var(--color-accent-soft);
  }
  .ell {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .folder {
    margin-top: auto;
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 6px 8px;
    border: 0;
    border-radius: var(--r-sm);
    background: none;
    color: var(--color-ink-muted);
    font: inherit;
    cursor: pointer;
  }
  .folder:hover:not(:disabled) {
    color: var(--color-ink);
    background: var(--color-surface-3);
  }
  .detail {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 10px;
    padding: 12px 14px;
    overflow: auto;
  }
  .desc {
    margin: 0;
    color: var(--color-ink-muted);
  }
  /* anteprima: la pagina a 820 px ridotta al 50%, solo da guardare */
  .prev {
    flex: 0 0 230px;
    position: relative;
    overflow: hidden;
    border: 1px solid var(--color-line);
    border-radius: var(--r-md);
    background: var(--color-surface-1);
  }
  .prev iframe {
    position: absolute;
    top: 0;
    left: 0;
    width: 200%;
    height: 200%;
    border: 0;
    transform: scale(0.5);
    transform-origin: 0 0;
    pointer-events: none;
  }
  .form {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .row {
    display: grid;
    grid-template-columns: 130px 1fr;
    align-items: center;
    gap: 10px;
  }
  .lbl {
    color: var(--color-ink-muted);
    font-size: 12px;
  }
  .ctl {
    box-sizing: border-box;
    width: 100%;
    height: 28px;
    padding: 0 8px;
    background: var(--color-surface-1);
    border: 1px solid var(--color-line);
    border-radius: var(--r-md);
    color: var(--color-ink);
    font: inherit;
    outline: none;
  }
  .ctl:focus {
    border-color: var(--color-accent);
  }
  .mono {
    font-family: var(--font-mono);
    font-size: 12px;
  }
  .foot {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 10px 14px;
    border-top: 1px solid var(--color-line);
  }
  .foot .hint {
    flex: 1;
  }
  .hint {
    margin: 0;
    color: var(--color-ink-subtle);
    font-size: 12px;
  }
  .ib {
    width: 26px;
    height: 26px;
    display: grid;
    place-items: center;
    border: 0;
    border-radius: var(--r-sm);
    background: none;
    color: var(--color-ink-muted);
    cursor: pointer;
  }
  .ib:hover {
    background: var(--color-surface-3);
    color: var(--color-ink);
  }
  .btn {
    height: 28px;
    padding: 0 14px;
    border: 1px solid var(--color-line-strong);
    border-radius: var(--r-md);
    background: var(--color-surface-3);
    color: var(--color-ink);
    font: inherit;
    cursor: pointer;
  }
  .btn.primary {
    background: var(--color-accent);
    border-color: var(--color-accent);
    color: #fff;
  }
  .btn:disabled {
    opacity: 0.5;
    cursor: default;
  }
</style>
