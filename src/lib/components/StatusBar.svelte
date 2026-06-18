<script lang="ts">
  import { fade } from "svelte/transition";
  import Icon from "./Icon.svelte";
  import Backdrop from "./Backdrop.svelte";
  import { workspace, editorStatus, activeFile } from "../state/workspace.svelte";
  import { git, checkout, loadBranches, createBranch } from "../state/git.svelte";
  import { langLabel } from "../util";
  import { codeIndex, rescan } from "../state/codeIndex.svelte";

  let af = $derived(activeFile());
  let isFile = $derived(!!af && af.kind === "file");
  let eol = $derived(isFile && af!.content.includes("\r\n") ? "CRLF" : "LF");
  let lang = $derived(af ? langLabel(af.name) : "");

  let open = $state(false);
  let creating = $state(false);
  let newName = $state("");
  let error = $state("");

  function toggle() {
    if (!git.isRepo) return;
    open = !open;
    if (open) {
      creating = false;
      newName = "";
      error = "";
      loadBranches();
    }
  }

  function close() {
    open = false;
    creating = false;
  }

  async function pick(name: string) {
    error = "";
    try {
      await checkout(name);
      close();
    } catch (e) {
      error = String(e);
    }
  }

  async function doCreate() {
    if (!newName.trim()) return;
    error = "";
    try {
      await createBranch(newName);
      close();
    } catch (e) {
      error = String(e);
    }
  }
</script>

<footer class="statusbar">
  <div class="left">
    <div class="branchwrap">
      <button class="seg" class:static={!git.isRepo} title="Git branch — switch / create" onclick={toggle}>
        <Icon name="git-branch" size={13} strokeWidth={1.8} />
        <span>{workspace.branch ?? "—"}</span>
      </button>

      {#if open}
        <Backdrop onClose={close} z={60} />
        <div class="popup" role="menu" transition:fade={{ duration: 80 }}>
          <div class="phead">Branch</div>
          {#if git.branches.length === 0}
            <div class="bitem empty">no branches</div>
          {/if}
          {#each git.branches as b (b)}
            <button class="bitem" class:cur={b === git.branch} role="menuitem" onclick={() => pick(b)}>
              <span class="tick">{#if b === git.branch}<Icon name="check" size={13} strokeWidth={2} />{/if}</span>
              <span class="bn">{b}</span>
            </button>
          {/each}
          <div class="divider"></div>
          {#if creating}
            <!-- svelte-ignore a11y_autofocus -->
            <input
              class="newinput"
              autofocus
              bind:value={newName}
              placeholder="new branch name"
              onkeydown={(e) => {
                if (e.key === "Enter") doCreate();
                else if (e.key === "Escape") { e.stopPropagation(); creating = false; }
              }}
            />
          {:else}
            <button class="bitem create" onclick={() => (creating = true)}>
              <span class="tick"><Icon name="plus" size={13} strokeWidth={2} /></span>
              <span class="bn">Create branch…</span>
            </button>
          {/if}
          {#if error}<div class="err">{error}</div>{/if}
        </div>
      {/if}
    </div>
  </div>
  <div class="right">
    {#if workspace.rootPath}
      <button
        class="seg idx"
        class:scanning={codeIndex.scanning}
        title={codeIndex.scanning ? "Indexing project symbols…" : "Project symbols — click to re-scan"}
        onclick={() => rescan()}
      >
        <span class="idxic"><Icon name={codeIndex.scanning ? "refresh" : "code"} size={12} strokeWidth={1.8} /></span>
        <span>{codeIndex.scanning ? "Indexing…" : `${codeIndex.symbols.length} symbols`}</span>
      </button>
    {/if}
    {#if isFile}
      <span class="seg static">Ln {editorStatus.line}, Col {editorStatus.col}</span>
      <span class="seg static">{eol}</span>
      <span class="seg static">UTF-8</span>
      <span class="seg static">{lang}</span>
    {/if}
  </div>
</footer>

<style>
  .statusbar {
    height: 22px;
    flex: 0 0 22px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    background: var(--color-surface-0);
    border-top: 1px solid var(--color-line);
    padding: 0 6px;
    font-size: 11.5px;
    color: var(--color-ink-muted);
    user-select: none;
  }
  .left,
  .right {
    display: flex;
    align-items: center;
    gap: 1px;
  }
  .branchwrap {
    position: relative;
  }
  .seg {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    height: 22px;
    padding: 0 8px;
    background: transparent;
    border: 0;
    border-radius: 4px;
    color: inherit;
    font-size: inherit;
    cursor: pointer;
  }
  .seg:not(.static):hover {
    background: var(--color-surface-3);
    color: var(--color-ink);
  }
  .seg.static {
    cursor: default;
  }
  .idxic {
    display: inline-flex;
  }
  .idx.scanning {
    color: var(--color-accent);
  }
  .idx.scanning .idxic {
    animation: idxspin 0.9s linear infinite;
  }
  @keyframes idxspin {
    to {
      transform: rotate(360deg);
    }
  }

  .popup {
    position: absolute;
    bottom: calc(100% + 4px);
    left: 0;
    z-index: 61;
    min-width: 220px;
    max-height: 300px;
    overflow: auto;
    padding: 4px;
    background: var(--color-surface-2);
    border: 1px solid var(--color-line-strong);
    border-radius: var(--radius);
    box-shadow: var(--shadow-pop);
  }
  .phead {
    padding: 4px 8px 6px;
    font-size: 10.5px;
    font-weight: 600;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--color-ink-subtle);
  }
  .bitem {
    display: flex;
    align-items: center;
    gap: 6px;
    width: 100%;
    background: transparent;
    border: 0;
    border-radius: 5px;
    color: var(--color-ink);
    font-size: 12.5px;
    text-align: left;
    padding: 5px 8px;
    cursor: pointer;
  }
  .bitem:hover {
    background: var(--color-surface-4);
  }
  .bitem.empty {
    color: var(--color-ink-subtle);
    cursor: default;
  }
  .bitem .tick {
    width: 14px;
    display: inline-flex;
    color: var(--color-accent);
  }
  .bn {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .bitem.create {
    color: var(--color-ink-muted);
  }
  .divider {
    height: 1px;
    margin: 4px 6px;
    background: var(--color-line);
  }
  .newinput {
    width: 100%;
    box-sizing: border-box;
    margin-top: 2px;
    padding: 5px 8px;
    border: 1px solid var(--color-accent);
    border-radius: 5px;
    background: var(--color-surface-1);
    color: var(--color-ink);
    font-family: var(--font-sans);
    font-size: 12.5px;
    outline: none;
  }
  .err {
    padding: 5px 8px 2px;
    color: var(--color-danger);
    font-size: 11px;
    word-break: break-word;
  }
</style>
