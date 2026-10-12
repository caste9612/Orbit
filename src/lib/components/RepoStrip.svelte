<script lang="ts">
  // Striscia delle repo della finestra, al centro della top bar (M37, M56, M69). Una scheda per repo,
  // riordinabile trascinando. Quando lo spazio non basta le repo si comprimono da destra in chip con le
  // iniziali sul colore della repo; le prime tre restano intere finché ci stanno, e le ultime chip finiscono
  // nel menu «+N» (piano in repoStrip.ts): l'ordine decide quali restano leggibili. Ai lati resta sempre uno
  // spazio libero da cui trascinare la finestra.
  // Passando su una chip compare una schedina con branch, chat in attesa e file modificati; il tasto destro
  // apre colore, «Move to new window» e «Remove from list»; una scheda trascinata in basso, fuori dalla
  // barra, si apre in una finestra nuova (repoWindow.ts).
  import { invoke } from "@tauri-apps/api/core";
  import Icon from "./Icon.svelte";
  import ContextMenu, { type MenuItem } from "./ContextMenu.svelte";
  import { workspace } from "../state/workspace.svelte";
  import { openFolderDialog } from "../state/explorer.svelte";
  import { folders, openFromList, removeFolder, moveFolder } from "../state/folders.svelte";
  import { terminals, repoNeedsAttention, TAB_COLORS } from "../state/terminals.svelte";
  import { motionMs } from "../state/layout.svelte";
  import { repoColor, setRepoColor, hasCustomColor } from "../state/repoColors.svelte";
  import { planStrip, gripFor, GRIP, initials, type StripPlan } from "../state/repoStrip";
  import { canMoveRepo, moveRepoToNewWindow } from "../state/repoWindow";
  import { basename } from "../util";

  // misure in px, le stesse del CSS qui sotto
  const GAP = 4; // fra due elementi della striscia
  const CHIP = 30; // repo compressa
  const ADD = 26; // bottone «+»
  const MORE = 34; // chip «+N»
  const TEAR = 28; // sotto la barra di tanto, la scheda trascinata diventa una finestra nuova

  let stripEl = $state<HTMLElement>();
  let barEl = $state<HTMLElement>();
  let measureEl = $state<HTMLElement>();
  let grip = $state(GRIP);
  let plan = $state<StripPlan>({ modes: [], hidden: 0, activeWidth: null });
  let fullW = $state<number[]>([]);
  let anim = $state(false); // le schede cambiano larghezza con il movimento fluido
  let animTimer: ReturnType<typeof setTimeout> | undefined;

  const activeIndex = $derived(folders.list.findIndex((f) => f.path === workspace.rootPath));
  const hiddenWaiting = $derived(folders.list.some((f, i) => plan.modes[i] === "hidden" && repoNeedsAttention(f.path)));

  /** Ricalcola il piano dalle larghezze naturali (la copia invisibile) e dallo spazio della striscia.
   *  `animated`: cambio, aggiunta o riordino di repo, con il movimento fluido; il ridimensionamento della
   *  finestra invece è immediato. */
  function replan(animated: boolean) {
    if (!stripEl || !measureEl) return;
    const widths = [...measureEl.children].map((el) => Math.ceil(el.getBoundingClientRect().width));
    const space = stripEl.clientWidth;
    const g = gripFor(space);
    const next = planStrip({ full: widths, active: activeIndex, avail: space - 2 * g, chip: CHIP, gap: GAP, add: ADD, more: MORE });
    const same =
      g === grip &&
      widths.length === fullW.length &&
      widths.every((w, i) => w === fullW[i]) &&
      JSON.stringify(next) === JSON.stringify(plan);
    if (same) return;
    clearTimeout(animTimer);
    anim = animated;
    if (animated) animTimer = setTimeout(() => (anim = false), motionMs() + 60);
    fullW = widths;
    grip = g;
    plan = next;
  }

  // lo spazio della striscia cambia col ridimensionamento della finestra
  function watchSpace(node: HTMLElement) {
    const ro = new ResizeObserver(() => replan(false));
    ro.observe(node);
    return { destroy: () => ro.disconnect() };
  }
  // le larghezze naturali cambiano con lista, repo attiva e branch (movimento fluido) e con font e tema
  function watchWidths(node: HTMLElement) {
    const mo = new MutationObserver(() => replan(true));
    mo.observe(node, { childList: true, subtree: true, characterData: true });
    const ro = new ResizeObserver(() => replan(false));
    ro.observe(node);
    return {
      destroy() {
        mo.disconnect();
        ro.disconnect();
      },
    };
  }

  /** Larghezza della scheda `i`: chip, oppure la naturale misurata (quella dell'attiva se deve stringersi). */
  function widthFor(i: number): number | null {
    if (plan.modes[i] === "chip") return CHIP;
    if (i === activeIndex && plan.activeWidth !== null) return plan.activeWidth;
    return fullW[i] ?? null;
  }

  // ---- riordino e strappo ---------------------------------------------------------------------------
  // La scheda presa segue il puntatore (transform), le altre scivolano di una posizione e la LISTA cambia
  // solo al rilascio, così il DOM non si riordina durante il trascinamento. Soglia di 5 px: sotto, è un
  // clic. Trascinata in basso, fuori dalla barra, la scheda resta al suo posto e un'etichetta segue il
  // puntatore: al rilascio la repo si apre in una finestra nuova, dove la lasci.
  let drag = $state<{ from: number; to: number; dx: number; width: number; tear: boolean; x: number; y: number } | null>(null);
  let settling = $state(false); // al rilascio: un frame senza transizione (il DOM riordinato coincide col visivo)
  let pending: { index: number; x0: number; y0: number; pointerId: number; el: HTMLElement } | null = null;
  let slots: { i: number; left: number; width: number }[] = []; // schede visibili, all'inizio del trascinamento
  let barBottom = 0;
  let suppressClick = false;

  function repoDown(e: PointerEvent, index: number) {
    if (e.button !== 0 || (e.target as HTMLElement).closest(".rt-close")) return;
    hideCard();
    pending = { index, x0: e.clientX, y0: e.clientY, pointerId: e.pointerId, el: e.currentTarget as HTMLElement };
  }
  function repoMove(e: PointerEvent) {
    if (!pending) return;
    const dx = e.clientX - pending.x0;
    const dy = e.clientY - pending.y0;
    if (!drag) {
      if (Math.hypot(dx, dy) < 5) return;
      slots = [...(barEl?.querySelectorAll<HTMLElement>(":scope > .repotab") ?? [])].map((t) => {
        const r = t.getBoundingClientRect();
        return { i: Number(t.dataset.i), left: r.left, width: r.width };
      });
      barBottom = barEl?.getBoundingClientRect().bottom ?? 0;
      try {
        pending.el.setPointerCapture(pending.pointerId);
      } catch {
        /* no-op */
      }
      const me = slots.find((s) => s.i === pending!.index);
      drag = { from: pending.index, to: pending.index, dx: 0, width: me?.width ?? 0, tear: false, x: e.clientX, y: e.clientY };
    }
    drag.dx = dx;
    drag.x = e.clientX;
    drag.y = e.clientY;
    const f = folders.list[drag.from];
    drag.tear = !!f && e.clientY > barBottom + TEAR && canMoveRepo(f.path);
    if (drag.tear) {
      drag.to = drag.from;
      return;
    }
    // destinazione fra le schede visibili: dove cade il CENTRO di quella trascinata
    const p = slots.findIndex((s) => s.i === drag!.from);
    if (p === -1) return;
    const center = slots[p].left + drag.width / 2 + dx;
    let q = p;
    for (let k = p - 1; k >= 0; k--) {
      if (center < slots[k].left + slots[k].width / 2) q = k;
      else break;
    }
    if (q === p) {
      for (let k = p + 1; k < slots.length; k++) {
        if (center > slots[k].left + slots[k].width / 2) q = k;
        else break;
      }
    }
    drag.to = slots[q].i;
  }
  function repoUp(e: PointerEvent) {
    if (drag) {
      const { from, to, tear } = drag;
      settling = true;
      drag = null;
      if (tear) {
        const f = folders.list[from];
        if (f) void moveRepoToNewWindow(f.path, "cursor");
      } else if (from !== to) moveFolder(from, to);
      requestAnimationFrame(() => requestAnimationFrame(() => (settling = false)));
      suppressClick = true; // il clic che segue il rilascio NON deve cambiare repo
      setTimeout(() => (suppressClick = false), 0);
      try {
        (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
      } catch {
        /* no-op */
      }
    }
    pending = null;
  }
  /** Transform della scheda `i` durante il riordino: quella presa segue il puntatore, le altre fra origine
   *  e destinazione scivolano di una posizione. */
  function repoShift(i: number): string {
    if (!drag || drag.tear) return "";
    if (i === drag.from) return `translateX(${drag.dx}px)`;
    const pf = slots.findIndex((s) => s.i === drag!.from);
    const pt = slots.findIndex((s) => s.i === drag!.to);
    const pi = slots.findIndex((s) => s.i === i);
    if (pf === -1 || pt === -1 || pi === -1) return "";
    const step = drag.width + GAP;
    if (pf < pt && pi > pf && pi <= pt) return `translateX(${-step}px)`;
    if (pt < pf && pi >= pt && pi < pf) return `translateX(${step}px)`;
    return "";
  }
  function repoClick(path: string) {
    if (suppressClick) {
      suppressClick = false;
      return;
    }
    void openFromList(path);
  }

  // ---- schedina di una repo compressa ---------------------------------------------------------------
  // Branch e file modificati di una repo non attiva si leggono con git solo al passaggio del mouse, e si
  // tengono per 10 s.
  interface Card {
    path: string;
    x: number;
    y: number;
    branch: string | null;
    changed: number;
    repo: boolean;
    loading: boolean;
    waiting: number;
  }
  let card = $state<Card | null>(null);
  let cardTimer: ReturnType<typeof setTimeout> | undefined;
  const gitInfo = new Map<string, { at: number; branch: string | null; changed: number; repo: boolean }>();

  async function readGit(path: string) {
    const hit = gitInfo.get(path);
    if (hit && Date.now() - hit.at < 10_000) return hit;
    const s = await invoke<{ isRepo: boolean; branch: string | null; entries: unknown[] }>("git_status", { root: path });
    const info = { at: Date.now(), branch: s.branch, changed: s.entries.length, repo: s.isRepo };
    gitInfo.set(path, info);
    return info;
  }
  function showCard(e: PointerEvent, path: string) {
    if (drag || pending) return;
    clearTimeout(cardTimer);
    const el = e.currentTarget as HTMLElement;
    cardTimer = setTimeout(() => {
      const r = el.getBoundingClientRect();
      card = {
        path,
        x: Math.max(6, Math.min(r.left - 8, window.innerWidth - 246)),
        y: r.bottom + 6,
        branch: null,
        changed: 0,
        repo: true,
        loading: true,
        waiting: terminals.list.filter((t) => t.root === path && t.needsAttention).length,
      };
      readGit(path)
        .then((g) => {
          if (card?.path !== path) return;
          card.branch = g.branch;
          card.changed = g.changed;
          card.repo = g.repo;
          card.loading = false;
        })
        .catch(() => {
          if (card?.path !== path) return;
          card.repo = false;
          card.loading = false;
        });
    }, 250);
  }
  function hideCard() {
    clearTimeout(cardTimer);
    card = null;
  }

  // ---- menu ----------------------------------------------------------------------------------------
  let menu = $state<{ x: number; y: number; items: MenuItem[] } | null>(null);

  function openTabMenu(e: MouseEvent, path: string) {
    e.preventDefault();
    hideCard();
    const custom = hasCustomColor(path);
    const current = repoColor(path);
    const items: MenuItem[] = [{ label: "Color", header: true }];
    for (const c of TAB_COLORS) {
      const pick = () => setRepoColor(path, c.color);
      items.push(custom && current === c.color ? { label: c.name, icon: "check", onClick: pick } : { label: c.name, swatch: c.color, onClick: pick });
    }
    items.push({ label: "Automatic", icon: custom ? "refresh" : "check", disabled: !custom, onClick: () => setRepoColor(path, null) });
    items.push({
      label: "Move to new window",
      icon: "new-window",
      separatorBefore: true,
      disabled: !canMoveRepo(path),
      onClick: () => void moveRepoToNewWindow(path, "beside"),
    });
    items.push({ label: "Remove from list", icon: "x", danger: true, onClick: () => void removeFolder(path) });
    menu = { x: e.clientX, y: e.clientY, items };
  }

  function openMoreMenu(e: MouseEvent) {
    hideCard();
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const items: MenuItem[] = folders.list
      .filter((_, i) => plan.modes[i] === "hidden")
      .map((f) => ({
        label: repoNeedsAttention(f.path) ? `${f.name} · waiting` : f.name,
        swatch: repoColor(f.path),
        onClick: () => void openFromList(f.path),
      }));
    items.push({ label: "Add folder…", icon: "folder-plus", separatorBefore: items.length > 0, onClick: openFolderDialog });
    menu = { x: r.left, y: r.bottom + 4, items };
  }
</script>

<div class="strip" class:anim bind:this={stripEl} use:watchSpace style:padding-inline="{grip}px">
  <div class="repozone">
    <div class="repobar" bind:this={barEl}>
      {#each folders.list as f, i (f.path)}
        {@const mode = plan.modes[i] ?? "full"}
        {#if mode !== "hidden"}
          {@const active = f.path === workspace.rootPath}
          {@const w = widthFor(i)}
          <!-- svelte-ignore a11y_no_static_element_interactions -->
          <div
            class="repotab"
            class:active
            class:chip={mode === "chip"}
            class:dragging={drag?.from === i}
            class:lifted={drag?.from === i && drag.tear}
            class:settling
            data-i={i}
            data-tauri-drag-region="false"
            style:--repo={repoColor(f.path)}
            style:width={w !== null ? `${w}px` : null}
            style:transform={repoShift(i)}
            onpointerdown={(e) => repoDown(e, i)}
            onpointermove={repoMove}
            onpointerup={repoUp}
            onpointercancel={repoUp}
            onpointerenter={(e) => {
              if (mode === "chip") showCard(e, f.path);
            }}
            onpointerleave={hideCard}
            oncontextmenu={(e) => openTabMenu(e, f.path)}
          >
            {#if mode === "chip"}
              <button class="rt-chip" aria-label={f.name} onclick={() => repoClick(f.path)}>{initials(f.name)}</button>
            {:else}
              <button class="rt-main" title={f.path} onclick={() => repoClick(f.path)}>
                <span class="rt-ic"><Icon name={active ? "folder-open" : "folder"} size={12} strokeWidth={1.8} /></span>
                <span class="rt-name">{f.name}</span>
                {#if active && workspace.branch}
                  <span class="rt-branch" title={workspace.branch}><Icon name="git-branch" size={10} strokeWidth={1.8} /><span class="rt-bname">{workspace.branch}</span></span>
                {/if}
              </button>
              <button class="rt-close" title={active ? "Remove (switch to a neighbor)" : "Remove from list"} aria-label="Remove from list" onclick={() => removeFolder(f.path)}>
                <Icon name="x" size={10} strokeWidth={2} />
              </button>
            {/if}
            {#if repoNeedsAttention(f.path)}<span class="rt-attn" title="A terminal in this repo is waiting (Claude finished / needs you)"></span>{/if}
          </div>
        {/if}
      {/each}
    </div>
    <!-- in fondo: «+N» con le repo che non stanno (e «Add folder…»), altrimenti «+» -->
    {#if plan.hidden > 0}
      <button class="repomore" title="More repositories" aria-label="{plan.hidden} more repositories" onclick={openMoreMenu}>
        +{plan.hidden}{#if hiddenWaiting}<span class="rt-attn"></span>{/if}
      </button>
    {:else}
      <!-- 14 px in un bottone 26×22 con bordo da 1: 5 px ai lati e 3 sopra e sotto (M57) -->
      <button class="repoadd" title="Add folder…" aria-label="Add folder" onclick={openFolderDialog}>
        <Icon name="plus" size={14} strokeWidth={2} />
      </button>
    {/if}
  </div>
  <!-- copia invisibile: ogni repo come scheda intera, per misurarne la larghezza naturale -->
  <div class="measure" bind:this={measureEl} use:watchWidths aria-hidden="true" inert>
    {#each folders.list as f (f.path)}
      {@const active = f.path === workspace.rootPath}
      <div class="repotab" class:active>
        <span class="rt-main"
          ><span class="rt-ic"><Icon name={active ? "folder-open" : "folder"} size={12} strokeWidth={1.8} /></span><span class="rt-name">{f.name}</span
          >{#if active && workspace.branch}<span class="rt-branch"><Icon name="git-branch" size={10} strokeWidth={1.8} /><span class="rt-bname">{workspace.branch}</span></span>{/if}</span
        >
        <span class="rt-close"></span>
      </div>
    {/each}
  </div>
</div>

{#if card}
  <div class="repocard" style="left:{card.x}px; top:{card.y}px" role="tooltip">
    <div class="rc-head"><span class="rc-dot" style:background={repoColor(card.path)}></span>{basename(card.path)}</div>
    <div class="rc-row">
      <Icon name="git-branch" size={12} strokeWidth={1.8} />
      {#if card.loading}<span class="rc-dim">…</span>{:else if !card.repo}<span class="rc-dim">Not a git repository</span>{:else}{card.branch ?? "No branch"}{/if}
    </div>
    <div class="rc-row" class:waiting={card.waiting > 0}>
      <Icon name="sparkles" size={12} strokeWidth={1.8} />
      {card.waiting ? `${card.waiting} chat${card.waiting > 1 ? "s" : ""} waiting` : "No chat waiting"}
    </div>
    {#if card.repo}
      <div class="rc-row">
        <Icon name="pencil" size={12} strokeWidth={1.8} />
        {#if card.loading}<span class="rc-dim">…</span>{:else}{card.changed ? `${card.changed} changed file${card.changed > 1 ? "s" : ""}` : "No changes"}{/if}
      </div>
    {/if}
  </div>
{/if}

{#if drag?.tear}
  {@const f = folders.list[drag.from]}
  {#if f}
    <div class="tear" style="left:{drag.x + 14}px; top:{drag.y + 10}px; --repo:{repoColor(f.path)}">
      <span class="tear-chip">{initials(f.name)}</span>{f.name}<span class="tear-hint"><Icon name="new-window" size={12} strokeWidth={1.7} />New window</span>
    </div>
  {/if}
{/if}

{#if menu}
  <ContextMenu x={menu.x} y={menu.y} items={menu.items} onClose={() => (menu = null)} />
{/if}

<style>
  /* tutto lo spazio centrale della barra; i lati (padding) restano liberi per trascinare la finestra */
  .strip {
    position: relative;
    flex: 1;
    min-width: 0;
    align-self: stretch;
    display: flex;
    align-items: center;
    justify-content: center; /* la striscia si popola dal centro (M56) */
    overflow: hidden; /* contiene la copia invisibile, larga quanto tutte le schede intere */
  }
  .repozone {
    display: flex;
    align-items: center;
    gap: 4px;
    min-width: 0;
    max-width: 100%;
  }
  .repobar {
    display: flex;
    align-items: center;
    gap: 4px;
    flex: 0 1 auto;
    width: max-content;
    max-width: 100%;
    min-width: 0;
    height: 22px;
    overflow: hidden;
  }
  .repotab {
    position: relative; /* ancora il pallino "attenzione" (un terminale di QUESTA repo è in attesa) */
    display: inline-flex;
    align-items: center;
    flex: 0 0 auto;
    max-width: 220px;
    height: 22px;
    border: 1px solid var(--color-line);
    border-radius: var(--r-lg);
    background: var(--color-surface-1);
    color: var(--color-ink-muted);
    overflow: hidden;
    touch-action: none; /* riordino per trascinamento con pointer capture */
    transition:
      background 90ms ease,
      border-color 90ms ease,
      color 90ms ease,
      transform 150ms var(--motion-ease);
  }
  /* cambio, aggiunta o riordino di repo: le schede cambiano larghezza con il movimento fluido (M69) */
  .strip.anim .repotab {
    transition:
      background 90ms ease,
      border-color 90ms ease,
      color 90ms ease,
      transform 150ms var(--motion-ease),
      width var(--motion-ms) var(--motion-ease);
  }
  /* riordino: la tab presa segue il puntatore senza transizione e sopra le altre; al rilascio nessuna
     transizione per un frame (il DOM riordinato coincide già con la posizione visiva) */
  .strip .repotab.dragging,
  .strip .repotab.settling {
    transition:
      background 90ms ease,
      border-color 90ms ease,
      color 90ms ease;
  }
  .repotab.dragging {
    z-index: 2;
    cursor: grabbing;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.35);
  }
  .repotab.lifted {
    opacity: 0.45;
    box-shadow: none;
  }
  .repotab:not(.active):hover {
    background: var(--color-surface-3);
    color: var(--color-ink);
  }
  .repotab.active {
    color: var(--color-ink);
    background: rgba(var(--accent-rgb), 0.16);
    border-color: rgba(var(--accent-rgb), 0.5);
    /* la tab ATTIVA mostra nome + branch per intero; se nemmeno lei ci sta, si accorcia con l'ellissi */
    flex: 0 1 auto;
    max-width: none;
    min-width: 0;
  }
  /* repo compressa: le iniziali sul colore della repo (M69) */
  .repotab.chip {
    justify-content: center;
    border-color: color-mix(in srgb, var(--repo) 50%, transparent);
    background: color-mix(in srgb, var(--repo) 18%, var(--color-surface-1));
  }
  .repotab.chip:not(.active):hover {
    background: color-mix(in srgb, var(--repo) 32%, var(--color-surface-1));
  }
  .rt-chip {
    display: grid;
    place-items: center;
    width: 100%;
    height: 100%;
    padding: 0;
    border: 0;
    background: transparent;
    color: color-mix(in srgb, var(--repo) 72%, var(--color-ink));
    font: inherit;
    font-size: 10.5px;
    font-weight: 650;
    letter-spacing: 0.03em;
    cursor: pointer;
  }
  .rt-main {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    height: 100%;
    padding: 0 5px 0 9px;
    border: 0;
    background: transparent;
    color: inherit;
    font: inherit;
    font-size: 12px;
    cursor: pointer;
    min-width: 0;
  }
  /* l'icona della cartella nel colore della repo, così lo ritrovi quando si comprime (M69) */
  .rt-ic {
    display: inline-flex;
    flex: 0 0 auto;
    color: var(--repo);
  }
  .rt-name {
    flex: 0 1 auto; /* sotto pressione si accorcia con ellissi */
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .rt-branch {
    flex: 0 1 auto;
    min-width: 0;
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding-left: 2px;
    color: var(--color-ink-muted);
    font-size: 11px;
  }
  .rt-branch :global(svg) {
    flex: 0 0 auto; /* l'icona del branch non si comprime */
  }
  .rt-bname {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .rt-close {
    display: grid;
    place-items: center;
    flex: 0 0 auto;
    width: 16px;
    height: 16px;
    margin-right: 4px;
    border: 0;
    border-radius: var(--r-sm);
    background: transparent;
    color: var(--color-ink-subtle);
    cursor: pointer;
    opacity: 0;
    transition:
      opacity 90ms ease,
      background 90ms ease;
  }
  .repotab:hover .rt-close {
    opacity: 1;
  }
  .rt-close:hover {
    background: var(--color-surface-4);
    color: var(--color-ink);
  }
  /* pallino "attenzione" della repo: un suo terminale ha suonato la bell (Claude finito / in attesa).
     Overlay nell'angolo (non sposta il contenuto): pulsa 4 volte, poi resta acceso finché non apri quel
     terminale (M62: prima pulsava all'infinito, anche per ore). */
  .rt-attn {
    position: absolute;
    top: 2px;
    right: 3px;
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: var(--color-accent);
    box-shadow: 0 0 0 1.5px var(--color-surface-0);
    pointer-events: none;
    animation: rt-attn-pulse 1.6s ease-in-out 4;
  }
  @keyframes rt-attn-pulse {
    0%,
    100% {
      opacity: 1;
    }
    50% {
      opacity: 0.35;
    }
  }
  .repoadd,
  .repomore {
    position: relative;
    flex: 0 0 auto;
    display: grid;
    place-items: center;
    height: 22px;
    border: 1px solid var(--color-line);
    border-radius: var(--r-lg);
    background: var(--color-surface-1);
    color: var(--color-ink-muted);
    cursor: pointer;
    transition:
      background 90ms ease,
      color 90ms ease;
  }
  .repoadd {
    width: 26px;
  }
  .repomore {
    min-width: 34px;
    padding: 0 6px;
    font: inherit;
    font-size: 11.5px;
    font-weight: 600;
  }
  .repoadd:hover,
  .repomore:hover {
    background: var(--color-surface-3);
    color: var(--color-ink);
  }
  /* copia invisibile per misurare: fuori dal flusso, mai visibile né cliccabile */
  .measure {
    position: absolute;
    left: 0;
    top: 0;
    display: flex;
    gap: 4px;
    width: max-content;
    visibility: hidden;
    pointer-events: none;
  }

  .repocard {
    position: fixed;
    z-index: 85;
    display: grid;
    gap: 5px;
    min-width: 190px;
    max-width: 240px;
    padding: 9px 11px;
    background: var(--color-surface-2);
    border: 1px solid var(--color-line-strong);
    border-radius: var(--radius);
    box-shadow: var(--shadow-pop);
    color: var(--color-ink-muted);
    font-size: 12px;
    pointer-events: none;
  }
  .rc-head {
    display: flex;
    align-items: center;
    gap: 7px;
    min-width: 0;
    color: var(--color-ink);
    font-weight: 600;
    overflow-wrap: anywhere;
  }
  .rc-dot {
    flex: 0 0 auto;
    width: 9px;
    height: 9px;
    border-radius: 2px;
  }
  .rc-row {
    display: flex;
    align-items: center;
    gap: 7px;
    min-width: 0;
    overflow-wrap: anywhere;
  }
  .rc-row :global(svg) {
    flex: 0 0 auto;
  }
  .rc-row.waiting {
    color: var(--color-accent);
  }
  .rc-dim {
    color: var(--color-ink-subtle);
  }

  /* scheda trascinata fuori dalla barra: l'etichetta che segue il puntatore */
  .tear {
    position: fixed;
    z-index: 95;
    display: inline-flex;
    align-items: center;
    gap: 7px;
    height: 26px;
    padding: 0 10px 0 5px;
    border: 1px solid color-mix(in srgb, var(--repo) 55%, transparent);
    border-radius: var(--radius-sm);
    background: var(--color-surface-2);
    box-shadow: var(--shadow-pop);
    color: var(--color-ink);
    font-size: 12px;
    white-space: nowrap;
    pointer-events: none;
  }
  .tear-chip {
    display: grid;
    place-items: center;
    width: 24px;
    height: 18px;
    border-radius: var(--r-sm);
    background: color-mix(in srgb, var(--repo) 25%, transparent);
    color: color-mix(in srgb, var(--repo) 72%, var(--color-ink));
    font-size: 10px;
    font-weight: 650;
  }
  .tear-hint {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    margin-left: 4px;
    color: var(--color-ink-subtle);
  }
</style>
