<script lang="ts">
  import { onMount } from "svelte";
  import { invoke } from "@tauri-apps/api/core";
  import Icon from "./Icon.svelte";
  import Self from "./MiniTree.svelte";
  import { openFile, activePath } from "../state/workspace.svelte";
  import { fileIcon } from "../util";

  interface FsEntry {
    name: string;
    path: string;
    isDir: boolean;
  }
  interface Props {
    path: string;
    depth?: number;
  }
  let { path, depth = 0 }: Props = $props();

  let entries = $state<FsEntry[] | null>(null);
  let open = $state<Record<string, boolean>>({});

  onMount(async () => {
    try {
      entries = await invoke<FsEntry[]>("read_dir", { path });
    } catch {
      entries = [];
    }
  });

  function activate(e: FsEntry) {
    if (e.isDir) open[e.path] = !open[e.path];
    else openFile(e.path);
  }
</script>

{#if entries === null}
  <div class="mini-msg" style="padding-left:{8 + depth * 13}px">…</div>
{:else}
  {#each entries as e (e.path)}
    {@const fi = fileIcon(e.name)}
    <button
      class="mini-row"
      class:active={!e.isDir && activePath() === e.path}
      style="padding-left:{8 + depth * 13}px"
      onclick={() => activate(e)}
      title={e.name}
    >
      <span class="mchev" class:open={open[e.path]}>
        {#if e.isDir}<Icon name="chevron-right" size={12} strokeWidth={2} />{/if}
      </span>
      {#if e.isDir}
        <span class="mic dir"><Icon name={open[e.path] ? "folder-open" : "folder"} size={14} strokeWidth={1.6} /></span>
      {:else}
        <span class="mic" style="color:{fi.color}"><Icon name={fi.glyph} size={14} strokeWidth={1.7} /></span>
      {/if}
      <span class="mname">{e.name}</span>
    </button>
    {#if e.isDir && open[e.path]}
      <Self path={e.path} depth={depth + 1} />
    {/if}
  {/each}
{/if}

<style>
  .mini-row {
    display: flex;
    align-items: center;
    gap: 3px;
    width: 100%;
    height: 21px;
    padding-right: 8px;
    background: transparent;
    border: 0;
    color: var(--color-ink);
    font-size: 12.5px;
    text-align: left;
    white-space: nowrap;
    cursor: pointer;
  }
  .mini-row:hover {
    background: var(--color-surface-3);
  }
  .mini-row.active {
    background: var(--color-surface-4);
  }
  .mchev {
    flex: 0 0 14px;
    display: grid;
    place-items: center;
    color: var(--color-ink-subtle);
    transition: transform 110ms ease;
  }
  .mchev.open {
    transform: rotate(90deg);
  }
  .mic {
    flex: 0 0 auto;
    display: grid;
    place-items: center;
    color: var(--color-ink-subtle);
  }
  .mic.dir {
    color: var(--color-ink-muted);
  }
  .mname {
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .mini-msg {
    font-size: 12px;
    color: var(--color-ink-subtle);
    padding: 2px 8px;
  }
</style>
