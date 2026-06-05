<script lang="ts">
  import { onMount } from "svelte";
  import Icon from "./Icon.svelte";
  import Backdrop from "./Backdrop.svelte";
  import {
    git,
    refreshStatus,
    stage,
    unstage,
    stageAll,
    commit,
    loadBranches,
    checkout,
    showDiff,
    discardFile,
    setView,
    loadLog,
    showCommit,
    gitFetch,
    gitPull,
    gitPush,
    gitMerge,
  } from "../state/git.svelte";
  import { relativeTime } from "../util";

  let message = $state("");
  let branchOpen = $state(false);
  let mergeOpen = $state(false);
  let error = $state("");

  // Altri branch (locali) su cui fare merge nel corrente.
  let mergeable = $derived(git.branches.filter((b) => b !== git.branch));
  // Barra di sync: utile se c'è un remoto (fetch/pull/push) o un altro branch (merge).
  let showSync = $derived(git.isRepo && (git.hasRemote || mergeable.length > 0));

  onMount(() => {
    refreshStatus();
    loadBranches();
  });

  function doRefresh() {
    if (git.view === "history") loadLog();
    else refreshStatus();
  }

  function closeMenus() {
    branchOpen = false;
    mergeOpen = false;
  }
  function toggleBranch() {
    branchOpen = !branchOpen;
    mergeOpen = false;
    if (branchOpen) loadBranches();
  }
  function toggleMerge() {
    mergeOpen = !mergeOpen;
    if (mergeOpen) {
      branchOpen = false;
      loadBranches();
    }
  }
  function doMerge(name: string) {
    mergeOpen = false;
    gitMerge(name);
  }

  async function doCommit() {
    error = "";
    try {
      await commit(message);
      message = "";
    } catch (e) {
      error = String(e);
    }
  }
  async function doCheckout(name: string) {
    branchOpen = false;
    error = "";
    try {
      await checkout(name);
    } catch (e) {
      error = String(e);
    }
  }
</script>

<div class="git">
  {#if branchOpen || mergeOpen}
    <Backdrop onClose={closeMenus} z={50} />
  {/if}
  <div class="branchbar">
    <button class="branch" onclick={toggleBranch}>
      <Icon name="git-branch" size={14} strokeWidth={1.7} />
      <span class="bname">{git.branch ?? "—"}</span>
      <Icon name="chevron-down" size={13} strokeWidth={1.8} />
    </button>
    <button class="act" class:spin={git.loading || git.logLoading} title="Refresh" aria-label="Refresh" onclick={doRefresh}>
      <Icon name="refresh" size={14} strokeWidth={1.7} />
    </button>

    {#if branchOpen}
      <div class="dropdown">
        {#if git.branches.length === 0}
          <div class="ditem empty">no branches</div>
        {/if}
        {#each git.branches as b (b)}
          <button class="ditem" class:cur={b === git.branch} onclick={() => doCheckout(b)}>
            <span class="tick">{#if b === git.branch}<Icon name="check" size={13} strokeWidth={2} />{/if}</span>
            {b}
          </button>
        {/each}
      </div>
    {/if}
  </div>

  {#if showSync}
    <div class="syncbar">
      {#if git.hasRemote}
        <div
          class="track"
          title={git.upstream
            ? `${git.behind} behind · ${git.ahead} ahead of ${git.upstream}`
            : "Branch not tracking a remote"}
        >
          <span class="ab" class:on={git.behind > 0}><Icon name="arrow-down" size={11} strokeWidth={2.2} />{git.behind}</span>
          <span class="ab" class:on={git.ahead > 0}><Icon name="arrow-up" size={11} strokeWidth={2.2} />{git.ahead}</span>
        </div>
      {/if}
      <span class="grow"></span>
      {#if git.hasRemote}
        <button class="sbtn" title="Fetch (git fetch --all --prune)" aria-label="Fetch" onclick={gitFetch}>
          <Icon name="cloud-download" size={15} strokeWidth={1.7} />
        </button>
        <button class="sbtn" class:hot={git.behind > 0} title="Pull (git pull)" aria-label="Pull" onclick={gitPull}>
          <Icon name="download" size={15} strokeWidth={1.7} />
        </button>
        <button
          class="sbtn"
          class:hot={git.ahead > 0}
          title={git.upstream ? "Push (git push)" : `Publish branch (git push -u origin ${git.branch ?? ""})`}
          aria-label="Push"
          onclick={gitPush}
        >
          <Icon name="upload" size={15} strokeWidth={1.7} />
        </button>
      {/if}
      <button
        class="sbtn"
        class:on={mergeOpen}
        title="Merge a branch into current"
        aria-label="Merge branch"
        disabled={mergeable.length === 0}
        onclick={toggleMerge}
      >
        <Icon name="git-merge" size={15} strokeWidth={1.7} />
      </button>

      {#if mergeOpen}
        <div class="dropdown merge">
          <div class="dhead">Merge into <b>{git.branch ?? "—"}</b></div>
          {#if mergeable.length === 0}
            <div class="ditem empty">no other branches</div>
          {/if}
          {#each mergeable as b (b)}
            <button class="ditem" onclick={() => doMerge(b)}>
              <Icon name="git-merge" size={13} strokeWidth={1.8} />
              {b}
            </button>
          {/each}
        </div>
      {/if}
    </div>
  {/if}

  <div class="viewtabs">
    <button class="vtab" class:on={git.view === "changes"} onclick={() => setView("changes")}>Changes</button>
    <button class="vtab" class:on={git.view === "history"} onclick={() => setView("history")}>History</button>
  </div>

  {#if git.view === "changes"}
  <div class="commitbox">
    <textarea
      bind:value={message}
      placeholder="Commit message (Ctrl+Enter)"
      rows="2"
      onkeydown={(e) => {
        if ((e.ctrlKey || e.metaKey) && e.key === "Enter") doCommit();
      }}
    ></textarea>
    <button
      class="primary"
      disabled={!message.trim() || git.committing || git.staged.length === 0}
      onclick={doCommit}
    >
      <Icon name="check" size={14} strokeWidth={2} />
      Commit{git.staged.length ? ` (${git.staged.length})` : ""}
    </button>
    {#if error}<div class="err">{error}</div>{/if}
  </div>

  <div class="lists">
    {#if git.staged.length}
      <div class="section">
        <div class="sechead"><span>Staged ({git.staged.length})</span></div>
        {#each git.staged as e (e.path)}
          <div class="file">
            <button class="name" onclick={() => showDiff(e, true)} title={e.path}>
              <span class="code staged">{e.staged}</span>
              <span class="t">{e.path}</span>
            </button>
            <button class="fileact" title="Unstage" aria-label="Unstage" onclick={() => unstage(e.path)}>
              <Icon name="x" size={14} strokeWidth={2} />
            </button>
          </div>
        {/each}
      </div>
    {/if}

    <div class="section">
      <div class="sechead">
        <span>Changes ({git.unstaged.length})</span>
        {#if git.unstaged.length}
          <button class="link" onclick={stageAll}>Stage all</button>
        {/if}
      </div>
      {#if git.unstaged.length === 0 && git.staged.length === 0}
        <div class="clean">Working tree clean.</div>
      {/if}
      {#each git.unstaged as e (e.path)}
        <div class="file">
          <button class="name" onclick={() => showDiff(e, false)} title={e.path}>
            <span class="code" class:untracked={e.unstaged === "U"}>{e.unstaged}</span>
            <span class="t">{e.path}</span>
          </button>
          <button class="fileact" title="Discard changes" aria-label="Discard changes" onclick={() => discardFile(e)}>
            <Icon name="trash" size={13} strokeWidth={1.8} />
          </button>
          <button class="fileact" title="Stage" aria-label="Stage" onclick={() => stage(e.path)}>
            <Icon name="plus" size={15} strokeWidth={2} />
          </button>
        </div>
      {/each}
    </div>
  </div>
  {:else}
  <div class="lists">
    {#if git.logLoading && git.log.length === 0}
      <div class="clean">Loading history…</div>
    {:else if git.log.length === 0}
      <div class="clean">No commits.</div>
    {:else}
      {#each git.log as c (c.id)}
        <button class="commit" onclick={() => showCommit(c)} title={c.summary}>
          <span class="cid">{c.short}</span>
          <span class="cmain">
            <span class="csum">{c.summary || "(no message)"}</span>
            <span class="cmeta">{c.author}{c.author ? " · " : ""}{relativeTime(c.time)}</span>
          </span>
        </button>
      {/each}
    {/if}
  </div>
  {/if}
</div>

<style>
  .git {
    display: flex;
    flex-direction: column;
    height: 100%;
    min-height: 0;
  }
  .branchbar {
    position: relative;
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 6px 8px;
  }
  .branch {
    flex: 1;
    display: flex;
    align-items: center;
    gap: 6px;
    background: var(--color-surface-3);
    border: 1px solid var(--color-line);
    border-radius: 6px;
    color: var(--color-ink);
    font-size: 12.5px;
    padding: 5px 9px;
    cursor: pointer;
    overflow: hidden;
  }
  .branch:hover {
    background: var(--color-surface-4);
  }
  .bname {
    flex: 1;
    text-align: left;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .act {
    width: 28px;
    height: 28px;
    flex: 0 0 auto;
    display: grid;
    place-items: center;
    background: transparent;
    border: 0;
    border-radius: 6px;
    color: var(--color-ink-muted);
    cursor: pointer;
  }
  .act:hover {
    background: var(--color-surface-3);
    color: var(--color-ink);
  }
  .act.spin {
    animation: spin 0.8s linear infinite;
  }
  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }
  .dropdown {
    position: absolute;
    top: 38px;
    left: 8px;
    right: 8px;
    z-index: 60; /* sopra il Backdrop (z=50) che chiude al click-fuori */
    background: var(--color-surface-3);
    border: 1px solid var(--color-line-strong);
    border-radius: 7px;
    box-shadow: 0 10px 28px rgba(0, 0, 0, 0.4);
    padding: 4px;
    max-height: 240px;
    overflow: auto;
  }
  .ditem {
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
  .ditem:hover {
    background: var(--color-surface-4);
  }
  .ditem.empty {
    color: var(--color-ink-subtle);
    cursor: default;
  }
  .ditem .tick {
    width: 14px;
    display: inline-flex;
    color: var(--color-accent);
  }

  /* barra di sincronizzazione: ahead/behind + fetch/pull/push/merge */
  .syncbar {
    position: relative;
    display: flex;
    align-items: center;
    gap: 2px;
    padding: 0 8px 6px;
  }
  .track {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    padding: 2px 8px;
    border-radius: 6px;
    background: var(--color-surface-1);
    border: 1px solid var(--color-line);
    font-size: 11.5px;
    font-variant-numeric: tabular-nums;
    color: var(--color-ink-subtle);
  }
  .ab {
    display: inline-flex;
    align-items: center;
    gap: 1px;
  }
  .ab.on {
    color: var(--color-ink);
  }
  .grow {
    flex: 1;
  }
  .sbtn {
    width: 28px;
    height: 26px;
    flex: 0 0 auto;
    display: grid;
    place-items: center;
    background: transparent;
    border: 0;
    border-radius: 6px;
    color: var(--color-ink-muted);
    cursor: pointer;
  }
  .sbtn:hover:not(:disabled) {
    background: var(--color-surface-3);
    color: var(--color-ink);
  }
  .sbtn.hot {
    color: var(--color-accent);
  }
  .sbtn.on {
    background: var(--color-surface-3);
    color: var(--color-ink);
  }
  .sbtn:disabled {
    opacity: 0.35;
    cursor: default;
  }
  .dropdown.merge {
    top: 32px;
    left: auto;
    right: 8px;
    min-width: 180px;
    max-width: calc(100% - 16px);
  }
  .dhead {
    padding: 4px 8px 6px;
    font-size: 11px;
    color: var(--color-ink-subtle);
  }
  .dhead b {
    color: var(--color-ink-muted);
    font-weight: 600;
  }

  .commitbox {
    padding: 2px 8px 8px;
    border-bottom: 1px solid var(--color-line);
  }
  textarea {
    width: 100%;
    box-sizing: border-box;
    resize: vertical;
    background: var(--color-surface-1);
    border: 1px solid var(--color-line);
    border-radius: 6px;
    color: var(--color-ink);
    font-family: var(--font-sans);
    font-size: 12.5px;
    padding: 7px 9px;
    outline: none;
  }
  textarea:focus {
    border-color: var(--color-accent);
  }
  .primary {
    margin-top: 7px;
    width: 100%;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 7px;
    background: var(--color-accent);
    color: #08111f;
    font-weight: 600;
    font-size: 12.5px;
    border: 0;
    border-radius: 6px;
    padding: 7px;
    cursor: pointer;
  }
  .primary:hover:not(:disabled) {
    filter: brightness(1.08);
  }
  .primary:disabled {
    opacity: 0.45;
    cursor: default;
  }
  .err {
    margin-top: 7px;
    color: var(--color-danger);
    font-size: 11.5px;
    word-break: break-word;
  }

  .lists {
    flex: 1;
    overflow: auto;
    min-height: 0;
  }
  .section {
    padding: 6px 0;
  }
  .sechead {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 2px 12px 4px;
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.05em;
    text-transform: uppercase;
    color: var(--color-ink-muted);
  }
  .link {
    background: transparent;
    border: 0;
    color: var(--color-accent);
    font-size: 11px;
    cursor: pointer;
  }
  .link:hover {
    text-decoration: underline;
  }
  .clean {
    padding: 4px 12px;
    color: var(--color-ink-subtle);
    font-size: 12px;
  }
  .file {
    display: flex;
    align-items: center;
    height: 24px;
  }
  .file:hover {
    background: var(--color-surface-3);
  }
  .name {
    flex: 1;
    display: flex;
    align-items: center;
    gap: 7px;
    min-width: 0;
    height: 100%;
    background: transparent;
    border: 0;
    color: var(--color-ink);
    font-size: 12.5px;
    text-align: left;
    padding: 0 6px 0 12px;
    cursor: pointer;
  }
  .code {
    flex: 0 0 14px;
    text-align: center;
    font-family: var(--font-mono);
    font-size: 11px;
    font-weight: 700;
    color: var(--color-warning);
  }
  .code.staged {
    color: var(--color-success);
  }
  .code.untracked {
    color: var(--color-ink-subtle);
  }
  .t {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    color: var(--color-ink-muted);
  }
  .file:hover .t {
    color: var(--color-ink);
  }
  .fileact {
    width: 26px;
    height: 22px;
    margin-right: 6px;
    display: grid;
    place-items: center;
    background: transparent;
    border: 0;
    border-radius: 5px;
    color: var(--color-ink-subtle);
    cursor: pointer;
    opacity: 0;
  }
  .file:hover .fileact {
    opacity: 1;
  }
  .fileact:hover {
    background: var(--color-surface-4);
    color: var(--color-ink);
  }

  .viewtabs {
    display: flex;
    gap: 2px;
    padding: 0 8px 6px;
    border-bottom: 1px solid var(--color-line);
  }
  .vtab {
    flex: 1;
    background: transparent;
    border: 0;
    border-bottom: 2px solid transparent;
    color: var(--color-ink-muted);
    font-size: 12px;
    padding: 5px 0 6px;
    cursor: pointer;
  }
  .vtab:hover {
    color: var(--color-ink);
  }
  .vtab.on {
    color: var(--color-ink);
    border-bottom-color: var(--color-accent);
  }

  .commit {
    display: flex;
    align-items: baseline;
    gap: 8px;
    width: 100%;
    background: transparent;
    border: 0;
    text-align: left;
    padding: 5px 12px;
    cursor: pointer;
  }
  .commit:hover {
    background: var(--color-surface-3);
  }
  .cid {
    flex: 0 0 auto;
    font-family: var(--font-mono);
    font-size: 11px;
    color: var(--color-accent);
  }
  .cmain {
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 1px;
  }
  .csum {
    font-size: 12.5px;
    color: var(--color-ink);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .cmeta {
    font-size: 11px;
    color: var(--color-ink-subtle);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
</style>
