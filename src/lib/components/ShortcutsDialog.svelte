<script lang="ts">
  // Pannello dedicato "Keyboard shortcuts": preset (Orbit / Visual Studio / IntelliJ / Custom) +
  // riepilogo completo. In modalità "Custom" ogni comando configurabile è ribindabile: clic sulla
  // scorciatoia → premi i nuovi tasti (Esc annulla). I conflitti vengono evidenziati.
  import { scale } from "svelte/transition";
  import Icon from "./Icon.svelte";
  import Backdrop from "./Backdrop.svelte";
  import { settings } from "../state/settings.svelte";
  import {
    mergedGroups,
    formatKey,
    closeShortcuts,
    hasCustom,
    createCustom,
    deleteCustom,
    setCustomKey,
    conflictKeys,
    keyStringFromEvent,
    type CommandId,
  } from "../state/keybindings.svelte";

  const groups = $derived(mergedGroups());
  const conflicts = $derived(conflictKeys());
  const isCustom = $derived(settings.keymap === "custom");

  let capturing = $state<CommandId | null>(null);

  function startCapture(id: CommandId) {
    if (isCustom) capturing = id;
  }
  function customize() {
    if (settings.keymap === "custom") return;
    if (hasCustom())
      settings.keymap = "custom"; // riprendi la mappa esistente senza sovrascriverla
    else createCustom(settings.keymap); // copia il preset attivo in una nuova mappa Custom
  }
  function removeCustom() {
    capturing = null;
    deleteCustom("orbit");
  }

  // Cattura del tasto in FASE DI CATTURA su window: precede il dispatch globale di App.svelte
  // (listener in bubbling) così rebindare "Ctrl+P" non apre il quick-open mentre lo si assegna.
  $effect(() => {
    const id = capturing;
    if (!id) return;
    const handler = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopImmediatePropagation();
      if (e.key === "Escape") {
        capturing = null;
        return;
      }
      const key = keyStringFromEvent(e);
      if (!key) return; // aspetta una combinazione valida
      setCustomKey(id, key);
      capturing = null;
    };
    window.addEventListener("keydown", handler, { capture: true });
    return () => window.removeEventListener("keydown", handler, { capture: true });
  });
</script>

<Backdrop onClose={closeShortcuts} dim z={112} />

<div class="panel" role="dialog" aria-label="Keyboard shortcuts" transition:scale={{ duration: 110, start: 0.97, opacity: 0.3 }}>
  <header class="head">
    <span class="title">Keyboard shortcuts</span>
    <button class="x" aria-label="Close" onclick={closeShortcuts}><Icon name="x" size={16} strokeWidth={1.8} /></button>
  </header>

  <div class="kmrow">
    <span class="kmlabel">Keymap</span>
    <div class="kmctl">
      <select class="control" bind:value={settings.keymap}>
        <option value="orbit">Orbit (default)</option>
        <option value="vs">Visual Studio</option>
        <option value="intellij">IntelliJ</option>
        {#if hasCustom()}<option value="custom">Custom</option>{/if}
      </select>
      {#if isCustom}
        <button class="kmbtn danger" onclick={removeCustom} title="Delete the custom keymap and go back to Orbit">Delete</button>
      {:else if hasCustom()}
        <button class="kmbtn" onclick={customize} title="Resume editing your custom keymap">Edit custom</button>
      {:else}
        <button class="kmbtn" onclick={customize} title="Create an editable copy of this preset">Customize…</button>
      {/if}
    </div>
  </div>
  {#if isCustom}
    <div class="kmnote">Click a shortcut to rebind it — press the new keys, or Esc to cancel.</div>
  {/if}

  <div class="list">
    {#each groups as g (g.category)}
      <div class="cat">{g.category}</div>
      {#each g.items as it (it.label)}
        {@const conflict = it.id != null && conflicts.has(it.key.toLowerCase())}
        <div class="scrow">
          <span class="lbl">{it.label}</span>
          {#if isCustom && it.id != null}
            <button
              class="kbd editable"
              class:capturing={capturing === it.id}
              class:conflict
              onclick={() => startCapture(it.id!)}
              title={conflict ? "Conflicts with another shortcut" : "Click to rebind"}
            >
              {capturing === it.id ? "Press keys…" : formatKey(it.key)}
            </button>
          {:else}
            <kbd>{formatKey(it.key)}</kbd>
          {/if}
        </div>
      {/each}
    {/each}
  </div>
</div>

<style>
  .panel {
    position: fixed;
    z-index: 113;
    top: 64px;
    left: 50%;
    transform: translateX(-50%);
    width: min(520px, 92vw);
    max-height: calc(100vh - 110px);
    display: flex;
    flex-direction: column;
    background: var(--color-surface-2);
    border: 1px solid var(--color-line-strong);
    border-radius: var(--radius-lg);
    box-shadow: var(--shadow-pop);
    overflow: hidden;
  }
  .head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 12px 14px;
    border-bottom: 1px solid var(--color-line);
    flex: 0 0 auto;
  }
  .title {
    font-size: 14px;
    font-weight: 600;
    color: var(--color-ink);
  }
  .x {
    display: grid;
    place-items: center;
    width: 26px;
    height: 26px;
    border: 0;
    border-radius: var(--radius-sm);
    background: transparent;
    color: var(--color-ink-muted);
    cursor: pointer;
  }
  .x:hover {
    background: var(--color-surface-3);
    color: var(--color-ink);
  }
  .kmrow {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    padding: 12px 14px;
    border-bottom: 1px solid var(--color-line);
    flex: 0 0 auto;
  }
  .kmlabel {
    font-size: 13px;
    color: var(--color-ink);
  }
  .kmctl {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .control {
    background: var(--color-surface-1);
    border: 1px solid var(--color-line-strong);
    border-radius: var(--radius-sm);
    color: var(--color-ink);
    font-family: var(--font-sans);
    font-size: 12.5px;
    padding: 6px 8px;
    cursor: pointer;
    outline: none;
  }
  .control:focus {
    border-color: var(--color-accent);
  }
  .kmbtn {
    height: 30px;
    padding: 0 12px;
    border: 1px solid var(--color-line-strong);
    border-radius: var(--radius-sm);
    background: var(--color-surface-1);
    color: var(--color-ink);
    font-family: var(--font-sans);
    font-size: 12px;
    cursor: pointer;
  }
  .kmbtn:hover {
    background: var(--color-surface-3);
  }
  .kmbtn.danger:hover {
    background: rgba(241, 76, 76, 0.16);
    color: #ff9b9b;
    border-color: rgba(241, 76, 76, 0.4);
  }
  .kmnote {
    padding: 9px 14px;
    border-bottom: 1px solid var(--color-line);
    font-size: 11.5px;
    color: var(--color-ink-muted);
    background: rgba(var(--accent-rgb), 0.06);
    flex: 0 0 auto;
  }
  .list {
    overflow-y: auto;
    padding: 8px 14px 14px;
  }
  .cat {
    font-size: 10.5px;
    font-weight: 600;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--color-ink-subtle);
    margin: 10px 0 4px;
  }
  .scrow {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 4px 0;
  }
  .lbl {
    font-size: 12.5px;
    color: var(--color-ink-muted);
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  kbd {
    flex: 0 0 auto;
    font-family: var(--font-mono);
    font-size: 11px;
    color: var(--color-ink);
    background: var(--color-surface-1);
    border: 1px solid var(--color-line-strong);
    border-bottom-width: 2px;
    border-radius: 5px;
    padding: 2px 7px;
  }
  /* tasto ribindabile (modalità Custom): stessa resa di <kbd> ma cliccabile */
  .kbd.editable {
    cursor: pointer;
    transition: border-color 90ms ease, background 90ms ease, color 90ms ease;
  }
  .kbd.editable:hover {
    border-color: var(--color-accent);
    color: var(--color-ink);
  }
  .kbd.editable.capturing {
    border-color: var(--color-accent);
    color: var(--color-accent);
    background: rgba(var(--accent-rgb), 0.12);
  }
  .kbd.editable.conflict {
    border-color: rgba(241, 76, 76, 0.6);
    color: #ff9b9b;
  }
</style>
