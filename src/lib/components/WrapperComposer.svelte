<script lang="ts">
  // Composer dei "wrapper" Claude: scegli un wrapper dal menu, scrivi il tuo prompt, vedi
  // l'anteprima del testo composto (template + {{input}}) e lo copi negli appunti per incollarlo
  // in Claude. Nessuna shell di mezzo → il testo può essere multiriga.
  import { fade } from "svelte/transition";
  import Icon from "./Icon.svelte";
  import Backdrop from "./Backdrop.svelte";
  import { wrapperUI, closeWrapper, composeWrapper } from "../state/claude.svelte";
  import { notify } from "../state/toast.svelte";
  import { writeClipboard } from "../clipboard";

  let input = $state("");
  let composed = $derived(wrapperUI.wrapper ? composeWrapper(wrapperUI.wrapper.template, input) : "");

  async function copy() {
    if (!input.trim()) return;
    if (await writeClipboard(composed)) {
      notify("Prompt copiato — incollalo in Claude", "success", 1800);
      closeWrapper();
    } else {
      notify("Copia negli appunti non riuscita", "error");
    }
  }
  function onKey(e: KeyboardEvent) {
    if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
      e.preventDefault();
      void copy();
    }
  }
</script>

<Backdrop onClose={closeWrapper} dim z={120} />
<div class="composer" role="dialog" aria-modal="true" aria-label="Componi prompt" transition:fade={{ duration: 80 }}>
  <div class="chead">
    <Icon name={wrapperUI.wrapper?.icon ?? "sparkles"} size={15} strokeWidth={1.7} />
    <span class="ctitle">{wrapperUI.wrapper?.name ?? "Wrapper"}</span>
  </div>

  <!-- svelte-ignore a11y_autofocus -->
  <textarea
    autofocus
    bind:value={input}
    placeholder="Scrivi il tuo prompt… (verrà inserito nel template)"
    rows="4"
    spellcheck="false"
    onkeydown={onKey}
  ></textarea>

  <div class="plabel">Anteprima del testo composto</div>
  <pre class="preview">{composed}</pre>

  <div class="cbtns">
    <span class="hint">Ctrl+Enter per copiare</span>
    <button class="cbtn ghost" onclick={closeWrapper}>Annulla</button>
    <button class="cbtn primary" disabled={!input.trim()} onclick={copy}>
      <Icon name="copy" size={14} strokeWidth={1.8} />
      Copia negli appunti
    </button>
  </div>
</div>

<style>
  .composer {
    position: fixed;
    z-index: 121;
    top: 64px;
    left: 50%;
    transform: translateX(-50%);
    width: min(640px, 92vw);
    max-height: min(80vh, 640px);
    display: flex;
    flex-direction: column;
    background: var(--color-surface-2);
    border: 1px solid var(--color-line-strong);
    border-radius: var(--radius-lg);
    box-shadow: var(--shadow-pop);
    padding: 14px 16px 13px;
  }
  .chead {
    display: flex;
    align-items: center;
    gap: 8px;
    color: var(--color-accent);
    font-size: 13.5px;
    font-weight: 600;
    margin-bottom: 10px;
  }
  .ctitle {
    color: var(--color-ink);
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
    font-size: 13px;
    line-height: 1.45;
    padding: 8px 10px;
    outline: none;
  }
  textarea:focus {
    border-color: var(--color-accent);
  }
  .plabel {
    margin: 12px 0 5px;
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: var(--color-ink-subtle);
  }
  .preview {
    margin: 0;
    flex: 1;
    min-height: 56px;
    max-height: 38vh;
    overflow: auto;
    background: var(--color-surface-1);
    border: 1px solid var(--color-line);
    border-radius: 6px;
    color: var(--color-ink-muted);
    font-family: var(--font-mono);
    font-size: 12px;
    line-height: 1.5;
    padding: 8px 10px;
    white-space: pre-wrap;
    word-break: break-word;
  }
  .cbtns {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: 8px;
    margin-top: 12px;
  }
  .hint {
    margin-right: auto;
    color: var(--color-ink-subtle);
    font-size: 11px;
  }
  .cbtn {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    height: 30px;
    padding: 0 14px;
    border-radius: 6px;
    border: 1px solid var(--color-line-strong);
    background: var(--color-surface-3);
    color: var(--color-ink);
    font-size: 12.5px;
    cursor: pointer;
  }
  .cbtn:hover:not(:disabled) {
    background: var(--color-surface-4);
  }
  .cbtn.ghost {
    background: transparent;
  }
  .cbtn.primary {
    background: var(--color-accent);
    border-color: var(--color-accent);
    color: #08111f;
    font-weight: 600;
  }
  .cbtn.primary:hover:not(:disabled) {
    filter: brightness(1.08);
  }
  .cbtn:disabled {
    opacity: 0.45;
    cursor: default;
  }
</style>
