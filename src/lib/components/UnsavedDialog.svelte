<script lang="ts">
  // Dialog "modifiche non salvate" a 3 pulsanti (il confirm nativo di Tauri ne ha solo 2: niente "Salva").
  // Uno solo per tutta l'app (M59): lo apre unsaved.askUnsaved, da schede, finestra, cartelle e aggiornamenti.
  import FileGlyph from "./FileGlyph.svelte";
  import Backdrop from "./Backdrop.svelte";
  import { unsavedUI, answerUnsaved } from "../state/unsaved.svelte";
  import { workspace } from "../state/workspace.svelte";
  import { dirname, fileIcon, relTo } from "../util";
  import { focusOnMount } from "../focus";

  let files = $derived(unsavedUI.files);
</script>

{#if files.length}
  <Backdrop onClose={() => answerUnsaved("cancel")} dim z={120} />
  <div class="confirm" role="dialog" aria-modal="true" aria-label="Unsaved changes">
    <div class="ctitle">Unsaved changes</div>
    {#if files.length === 1}
      <p class="cmsg">Do you want to save the changes to <b>{files[0].name}</b>?</p>
    {:else}
      <p class="cmsg">Do you want to save the changes to these {files.length} files?</p>
      <!-- con la cartella in grigio, per distinguere i file omonimi -->
      <ul class="cfiles">
        {#each files.slice(0, 6) as f (f.path)}
          {@const fi = fileIcon(f.name)}
          {@const dir = relTo(dirname(f.path), workspace.rootPath)}
          <li title={f.path}>
            <span class="ti"><FileGlyph glyph={fi.glyph} color={fi.color} size={14} /></span>
            <span class="label">{f.name}</span>
            {#if dir}<span class="cdir">{dir}</span>{/if}
          </li>
        {/each}
        {#if files.length > 6}<li class="more">and {files.length - 6} more</li>{/if}
      </ul>
    {/if}
    <div class="cbtns">
      <button class="cbtn ghost" onclick={() => answerUnsaved("cancel")}>Cancel</button>
      <button class="cbtn danger" onclick={() => answerUnsaved("discard")}>{unsavedUI.discardLabel}</button>
      <button class="cbtn primary" use:focusOnMount onclick={() => answerUnsaved("save")}>{files.length === 1 ? "Save" : "Save all"}</button>
    </div>
  </div>
{/if}

<style>
  .confirm {
    position: fixed;
    z-index: 121;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    width: min(420px, 90vw);
    background: var(--color-surface-2);
    border: 1px solid var(--color-line-strong);
    border-radius: var(--radius-lg);
    box-shadow: var(--shadow-pop);
    padding: 18px 20px 16px;
  }
  .ctitle {
    font-size: 14px;
    font-weight: 650;
    color: var(--color-ink);
    margin-bottom: 8px;
  }
  .cmsg {
    margin: 0 0 16px;
    font-size: 12.5px;
    line-height: 1.45;
    color: var(--color-ink-muted);
  }
  .cmsg b {
    color: var(--color-ink);
    font-weight: 600;
  }
  .cfiles {
    margin: -6px 0 16px;
    padding: 0;
    list-style: none;
    font-size: 12.5px;
    color: var(--color-ink);
  }
  .cfiles li {
    display: flex;
    align-items: center;
    gap: 7px;
    height: 22px;
    min-width: 0;
  }
  .ti {
    display: inline-flex;
    align-items: center;
    flex: 0 0 auto;
  }
  .label {
    flex: 0 0 auto;
    max-width: 60%;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .cdir {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    color: var(--color-ink-subtle);
    font-size: 11.5px;
  }
  .cfiles .more {
    padding-left: 21px; /* sotto i nomi: glifo 14 + spazio 7 */
    color: var(--color-ink-subtle);
  }
  .cbtns {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
  }
  .cbtn {
    height: 30px;
    padding: 0 14px;
    border-radius: var(--r-md);
    border: 1px solid var(--color-line-strong);
    background: var(--color-surface-3);
    color: var(--color-ink);
    font-size: 12.5px;
    cursor: pointer;
  }
  .cbtn:hover {
    background: var(--color-surface-4);
  }
  .cbtn.ghost {
    background: transparent;
  }
  .cbtn.danger {
    color: #ff9b9b;
  }
  .cbtn.danger:hover {
    background: rgba(241, 76, 76, 0.16);
  }
  .cbtn.primary {
    background: var(--color-accent);
    border-color: var(--color-accent);
    color: #08111f;
    font-weight: 600;
  }
  .cbtn.primary:hover {
    filter: brightness(1.08);
  }
</style>
