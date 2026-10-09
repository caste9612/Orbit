<script lang="ts">
  // Striscia di un pannello COMPRESSO (M57, stile tool window di IntelliJ/VS): quando barra laterale o
  // pannello terminale sono chiusi ne resta una striscia sul bordo della finestra, spessa quanto la
  // status bar e con lo stesso aspetto, che ne mostra il contenuto in piccolo — a sinistra le viste,
  // a destra le chat/terminali della repo con la loro tinta e il pallino d'attesa. Un clic riapre il
  // pannello (sulla vista o sulla scheda scelta) nello stesso movimento fluido degli altri cambi di layout.
  import Icon from "./Icon.svelte";
  import { panelSlide } from "../motion";
  import { layout, selectView, toggleSidebar, toggleTerminal, motionMs, animate, type SidebarView } from "../state/layout.svelte";
  import { workspace } from "../state/workspace.svelte";
  import { changedCount } from "../state/git.svelte";
  import { openActivity } from "../state/activity.svelte";
  import { terminals, setActiveTerminal, displayTitle, tabIcon } from "../state/terminals.svelte";

  let { side }: { side: "left" | "right" } = $props();

  const views: { id: SidebarView; icon: string; label: string }[] = [
    { id: "explorer", icon: "explorer", label: "Explorer" },
    { id: "git", icon: "git-branch", label: "Source Control" },
    { id: "search", icon: "search", label: "Search" },
    { id: "docs", icon: "book-open", label: "Documentation" },
    { id: "activity", icon: "activity", label: "Activity" },
  ];

  let changed = $derived(changedCount());
  // schede della repo attiva, come nel pannello (le altre restano vive ma nascoste)
  let tabs = $derived(terminals.list.filter((t) => t.root === workspace.rootPath));

  function openView(v: SidebarView) {
    if (v === "activity") openActivity(); // come in top bar: pannello + board nell'area editor
    else selectView(v);
  }
  function openTerminal(id: string) {
    setActiveTerminal(id);
    animate(() => (layout.terminalVisible = true));
  }
</script>

<!-- panelSlide|global come Sidebar e TerminalPanel: compressione e riapertura sono un movimento solo (il
     pannello si chiude mentre la striscia entra); durata 0 finché il workspace non è pronto (avvio) -->
<aside
  class="strip {side}"
  aria-label={side === "left" ? "Sidebar (collapsed)" : "Terminal panel (collapsed)"}
  transition:panelSlide|global={{ duration: workspace.ready ? motionMs() : 0 }}
>
  {#if side === "left"}
    <button class="sb" title="Expand sidebar (Ctrl+B)" aria-label="Expand sidebar" onclick={toggleSidebar}>
      <Icon name="chevrons-right" size={13} strokeWidth={1.7} />
    </button>
    <span class="sep" aria-hidden="true"></span>
    {#each views as v (v.id)}
      <button
        class="sb"
        class:cur={layout.sidebarView === v.id}
        title={v.id === "git" && changed > 0 ? `${v.label} — ${changed} changed` : v.label}
        aria-label={v.label}
        onclick={() => openView(v.id)}
      >
        <Icon name={v.icon} size={13} strokeWidth={1.7} />
        {#if v.id === "git" && changed > 0}<span class="mark" aria-hidden="true"></span>{/if}
      </button>
    {/each}
  {:else}
    <button class="sb" title="Expand terminal panel (Ctrl+`)" aria-label="Expand terminal panel" onclick={toggleTerminal}>
      <Icon name="chevrons-left" size={13} strokeWidth={1.7} />
    </button>
    {#if tabs.length}<span class="sep" aria-hidden="true"></span>{/if}
    {#each tabs as t (t.id)}
      <button
        class="sb"
        class:cur={t.id === terminals.activeId}
        style="color:{t.color}"
        title={`${displayTitle(t)}${t.autoTitle ? ` · ${t.autoTitle}` : ""}${t.needsAttention ? " — waiting for you" : ""}`}
        aria-label={displayTitle(t)}
        onclick={() => openTerminal(t.id)}
      >
        <Icon name={tabIcon(t)} size={13} strokeWidth={1.8} />
        {#if t.needsAttention}<span class="mark attn" aria-hidden="true"></span>{/if}
      </button>
    {/each}
  {/if}
</aside>

<style>
  /* Stesso spessore e stesso aspetto della status bar (22 px con il bordo da 1 px verso il contenuto,
     fondo chrome), così le barre incorniciano la finestra. Contenuto largo 21: bottoni 21×21 con icone
     da 13 → 4 px per lato, margini interi e simmetrici (vedi la regola di simmetria in M57). */
  .strip {
    width: 22px;
    flex: 0 0 auto; /* base dalla larghezza: con una base fissa panelSlide non potrebbe animarla */
    min-height: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 4px;
    padding: 4px 0;
    background: var(--color-surface-0);
    overflow: hidden;
    user-select: none;
  }
  .strip.left {
    border-right: 1px solid var(--color-line);
  }
  .strip.right {
    border-left: 1px solid var(--color-line);
  }
  .sb {
    position: relative; /* ancora il pallino (modifiche git / chat in attesa) */
    flex: 0 0 auto;
    width: 21px;
    height: 21px;
    display: grid;
    place-items: center;
    padding: 0;
    border: 0;
    border-radius: var(--r-sm);
    background: transparent;
    color: var(--color-ink-muted);
    cursor: pointer;
    transition:
      background 100ms ease,
      color 100ms ease;
  }
  .sb:hover {
    background: var(--color-surface-3);
    color: var(--color-ink);
  }
  /* la vista / la scheda che si riapre col bottone in cima: appena più chiara, senza accento (il
     pannello è chiuso, niente da segnalare come "aperto") */
  .left .sb.cur {
    color: var(--color-ink);
  }
  .right .sb {
    opacity: 0.75; /* tinta della scheda smorzata, piena all'hover e sull'attiva */
  }
  .right .sb:hover,
  .right .sb.cur {
    opacity: 1;
  }
  .sep {
    flex: 0 0 auto;
    width: 11px;
    height: 1px;
    background: var(--color-line-strong);
  }
  /* pallino in alto a destra: modifiche git (fisso) o chat in attesa (pulsa come nelle schede) */
  .mark {
    position: absolute;
    top: 2px;
    right: 2px;
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: var(--color-accent);
    box-shadow: 0 0 0 1.5px var(--color-surface-0);
    pointer-events: none;
  }
  .mark.attn {
    animation: strip-attn 1.6s ease-in-out infinite;
  }
  @keyframes strip-attn {
    0%,
    100% {
      opacity: 1;
    }
    50% {
      opacity: 0.35;
    }
  }
</style>
