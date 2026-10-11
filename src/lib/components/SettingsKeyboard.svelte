<script lang="ts">
  // Impostazioni → Keyboard (M64; prima era la finestra "Keyboard shortcuts"): l'elenco completo delle
  // scorciatoie del preset attivo, già filtrato dalla ricerca. Il preset si sceglie nella riga "Keymap"
  // sopra (Settings.svelte). In modalità "Custom" ogni comando configurabile è ribindabile: clic sulla
  // scorciatoia → premi i nuovi tasti (Esc annulla). I conflitti vengono evidenziati.
  import MatchText from "./MatchText.svelte";
  import { settings } from "../state/settings.svelte";
  import {
    formatKey,
    setCustomKey,
    conflictKeys,
    keyStringFromEvent,
    type CommandId,
    type ShortcutRow,
  } from "../state/keybindings.svelte";

  // `flat` (risultati di una ricerca): niente titoli di gruppo — sotto "KEYBOARD" un titolo "EDITOR" si
  // confonderebbe con la categoria Editor — e il gruppo in testa a ogni voce ("Editor › Zoom font")
  let {
    groups,
    terms = [],
    flat = false,
  }: { groups: { category: string; items: ShortcutRow[] }[]; terms?: string[]; flat?: boolean } = $props();

  const conflicts = $derived(conflictKeys());
  const isCustom = $derived(settings.keymap === "custom");

  let capturing = $state<CommandId | null>(null);
  // tornati a un preset fisso (o mappa cancellata) mentre si aspettava un tasto: niente più cattura
  $effect(() => {
    if (!isCustom) capturing = null;
  });

  // Cattura del tasto in FASE DI CATTURA su window: precede il dispatch globale di App.svelte e
  // l'Esc della finestra (listener in bubbling), così rebindare "Ctrl+P" non apre il quick-open
  // mentre lo si assegna ed Esc annulla la cattura senza chiudere le Impostazioni.
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

<div class="list">
  {#each groups as g (g.category)}
    {#if !flat}<div class="cat">{g.category}</div>{/if}
    {#each g.items as it (it.label)}
      {@const conflict = it.id != null && conflicts.has(it.key.toLowerCase())}
      <div class="scrow">
        <span class="lbl"
          >{#if flat}<span class="grp"><MatchText text={g.category} {terms} />{" › "}</span>{/if}<MatchText text={it.label} {terms} /></span
        >
        {#if isCustom && it.id != null}
          <button
            class="kbd editable"
            class:capturing={capturing === it.id}
            class:conflict
            onclick={() => (capturing = it.id!)}
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

<style>
  .list {
    padding: 2px 0 6px;
  }
  .cat {
    font-size: 10.5px;
    font-weight: 600;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--color-ink-subtle);
    margin: 16px 0 2px;
  }
  .scrow {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    min-height: 32px;
    border-bottom: 1px solid var(--color-line);
  }
  .scrow:last-child {
    border-bottom: 0;
  }
  .grp {
    color: var(--color-ink-subtle);
  }
  .lbl {
    font-size: 12.5px;
    color: var(--color-ink-muted);
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  kbd,
  .kbd {
    flex: 0 0 auto;
    font-family: var(--font-mono);
    font-size: 11px;
    color: var(--color-ink);
    background: var(--color-surface-1);
    border: 1px solid var(--color-line-strong);
    border-bottom-width: 2px;
    border-radius: var(--r-md);
    padding: 2px 7px;
  }
  /* tasto ribindabile (modalità Custom): stessa resa di <kbd> ma cliccabile */
  .kbd.editable {
    cursor: pointer;
    transition:
      border-color 90ms ease,
      background 90ms ease,
      color 90ms ease;
  }
  .kbd.editable:hover {
    border-color: var(--color-accent);
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
