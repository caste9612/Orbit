<script lang="ts">
  // Gli avvisi in basso a destra (toast.svelte.ts). M74: tutti larghi 360 px e costruiti sulla stessa
  // griglia, così in colonna sono allineati al pixel:
  //   | 12 | icona 28 | 10 | messaggio (e sotto il dettaglio, l'elenco) | pillole | 10 | ✕ 28 | 12 |
  // La ✕ è un cerchio di 28 px come l'icona: facile da prendere col mouse, e simmetrica all'icona dall'altro lato.
  // La colonna della ✕ c'è sempre (sugli avvisi che spariscono da soli la ✕ compare col mouse sopra): così le
  // pillole stanno sulla stessa verticale in ogni avviso, e le frecce dell'elenco cadono sotto la ✕. Icona,
  // messaggio, pillole e ✕ sono centrati sulla stessa linea. Il tempo che resta è un anello attorno all'icona,
  // fermo col mouse sopra. Con Do not disturb restano solo gli errori (gli altri vanno nello storico della 🔔,
  // e quelli fissi tornano quando lo si spegne).
  import { flip } from "svelte/animate";
  import { fade, fly } from "svelte/transition";
  import Icon from "./Icon.svelte";
  import { toasts, dismiss, pauseToast, resumeToast, type Toast, type ToastAction } from "../state/toast.svelte";
  import { settings } from "../state/settings.svelte";

  const icon: Record<Toast["kind"], string> = {
    info: "info",
    success: "check",
    error: "alert",
    attention: "sparkles",
  };

  let shown = $derived(settings.dnd ? toasts.list.filter((t) => t.kind === "error") : toasts.list);
  // entrano dal basso, se ne vanno sfumando, gli altri scorrono al loro posto; fermi senza «Smooth panel transitions»
  let ms = $derived(settings.motion ? 180 : 0);
  let hovered = $state<number | null>(null);
  let done = $state<string | null>(null); // «Copied»: conferma sul pulsante appena usato
  let doneTimer: ReturnType<typeof setTimeout> | undefined;

  function act(t: Toast, a: ToastAction) {
    a.run();
    if (!a.keep) {
      dismiss(t.id);
      return;
    }
    done = `${t.id}:${a.label}`;
    clearTimeout(doneTimer);
    doneTimer = setTimeout(() => (done = null), 1300);
  }
  function open(t: Toast) {
    t.onClick?.();
    dismiss(t.id);
  }
</script>

<div class="toaster">
  {#each shown as t (t.id)}
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div
      class="toast {t.kind}"
      class:paused={hovered === t.id}
      class:sticky={t.sticky}
      animate:flip={{ duration: ms }}
      in:fly={{ y: 14, duration: ms }}
      out:fade={{ duration: ms ? 140 : 0 }}
      onmouseenter={() => {
        hovered = t.id;
        pauseToast(t.id);
      }}
      onmouseleave={() => {
        hovered = null;
        resumeToast(t.id);
      }}
    >
      {#if t.onClick && !t.items}
        <!-- tutto l'avviso porta lì: un pulsante trasparente sotto il contenuto -->
        <button class="hit" title="Open" aria-label={t.message} onclick={() => open(t)}></button>
      {/if}
      <span class="pic" class:timed={!!t.ms} style={t.ms ? `--dur:${t.ms}ms` : ""}>
        <Icon name={t.icon ?? icon[t.kind]} size={14} strokeWidth={2} />
      </span>
      <span class="msg">
        {t.message}{#if t.count}<span class="count">{t.count}</span>{/if}
      </span>
      {#if t.actions?.length}
        <span class="acts">
          {#each t.actions as a (a.label)}
            <button class="pill" onclick={() => act(t, a)}>{done === `${t.id}:${a.label}` ? "Copied" : a.label}</button>
          {/each}
        </span>
      {/if}
      <button class="x" aria-label="Dismiss" title="Dismiss" onclick={() => dismiss(t.id)}>
        <Icon name="x" size={13} strokeWidth={2.2} />
      </button>
      {#if t.detail}<span class="det" title={t.detail}>{t.detail}</span>{/if}
      {#if t.items}
        <span class="items">
          {#each t.items as it, i (i)}
            <button class="item" onclick={it.run} title="Go to this chat">
              <span class="dot" style={it.color ? `background:${it.color}` : ""}></span>
              <span class="iname">{it.label}</span>
              <span class="idet">{it.detail ?? ""}</span>
              <span class="chev"><Icon name="chevron-right" size={12} strokeWidth={2} /></span>
            </button>
          {/each}
        </span>
      {/if}
    </div>
  {/each}
</div>

<style>
  .toaster {
    position: fixed;
    right: 14px;
    bottom: 32px;
    z-index: 120;
    display: flex;
    flex-direction: column;
    gap: 8px;
    align-items: flex-end;
    pointer-events: none;
  }
  .toast {
    --kind: var(--color-accent);
    --kind-rgb: var(--accent-rgb);
    position: relative;
    pointer-events: auto;
    /* la griglia di tutti gli avvisi: icona | messaggio | pillole | ✕ */
    display: grid;
    grid-template-columns: 28px minmax(0, 1fr) auto 28px;
    grid-auto-rows: auto;
    column-gap: 10px;
    align-items: center;
    width: 360px;
    max-width: calc(100vw - 28px);
    box-sizing: border-box;
    padding: 10px 12px;
    border: 1px solid var(--color-line-strong);
    border-radius: var(--radius);
    background: var(--color-surface-2);
    box-shadow: var(--shadow-pop);
    color: var(--color-ink);
    font-size: 12.5px;
  }
  .toast.success {
    --kind: var(--color-success);
    --kind-rgb: 47, 191, 155;
  }
  .toast.error {
    --kind: var(--color-danger);
    --kind-rgb: 241, 76, 76;
  }
  .toast.attention {
    /* in accento, non invadente; su un fondo pieno, così sopra una finestra (Impostazioni) non traspare */
    background: linear-gradient(rgba(var(--accent-rgb), 0.08), rgba(var(--accent-rgb), 0.08)), var(--color-surface-2);
  }
  /* il pulsante trasparente che apre l'avviso sta sotto; sopra solo i pulsanti ricevono il clic */
  .hit {
    position: absolute;
    inset: 0;
    z-index: 0;
    padding: 0;
    border: 0;
    border-radius: inherit;
    background: transparent;
    cursor: pointer;
  }
  .hit:hover {
    background: rgba(255, 255, 255, 0.03);
  }
  .toast > :not(.hit) {
    position: relative;
    z-index: 1;
    pointer-events: none;
  }
  .toast > button:not(.hit),
  .toast .pill,
  .toast .item {
    pointer-events: auto;
  }

  /* riga 1: tutto centrato sulla stessa linea, alta almeno quanto il cerchio */
  .pic {
    grid-row: 1;
    grid-column: 1;
    width: 28px;
    height: 28px;
    display: grid;
    place-items: center;
    border-radius: 50%;
    background: rgba(var(--kind-rgb), 0.16);
    color: var(--kind);
  }
  .msg {
    grid-row: 1;
    grid-column: 2;
    min-width: 0;
    font-weight: 500;
    line-height: 18px;
    overflow-wrap: anywhere;
  }
  .count {
    display: inline-block;
    min-width: 16px;
    height: 16px;
    margin-left: 7px;
    padding: 0 5px;
    border-radius: 8px;
    background: var(--color-accent);
    color: #fff;
    font-size: 10px;
    font-weight: 700;
    line-height: 16px;
    text-align: center;
    vertical-align: 1px;
  }
  .acts {
    grid-row: 1;
    grid-column: 3;
    display: flex;
    gap: 6px;
  }
  .pill {
    height: 24px;
    padding: 0 11px;
    border: 0;
    border-radius: 12px;
    background: rgba(var(--accent-rgb), 0.16);
    color: var(--color-accent);
    font-size: 12px;
    font-weight: 600;
    cursor: pointer;
  }
  .pill:hover {
    background: rgba(var(--accent-rgb), 0.26);
  }
  .x {
    grid-row: 1;
    grid-column: 4;
    width: 28px;
    height: 28px;
    display: grid;
    place-items: center;
    padding: 0;
    border: 0;
    border-radius: 50%;
    background: transparent;
    color: var(--color-ink-subtle);
    cursor: pointer;
  }
  .x:hover {
    background: var(--color-surface-3);
    color: var(--color-ink);
  }
  /* sugli avvisi che spariscono da soli la ✕ c'è solo col mouse sopra (la colonna resta, per l'allineamento) */
  .toast:not(.sticky) .x {
    opacity: 0;
  }
  .toast:not(.sticky):hover .x {
    opacity: 1;
  }

  /* riga 2: il dettaglio tecnico, sul filo del messaggio, fino alla colonna della ✕ */
  .det {
    grid-row: 2;
    grid-column: 2 / 4;
    margin-top: -3px;
    display: -webkit-box;
    -webkit-line-clamp: 3;
    line-clamp: 3;
    -webkit-box-orient: vertical;
    overflow: hidden;
    color: var(--color-ink-subtle);
    font-size: 11.5px;
    line-height: 16px;
    overflow-wrap: anywhere;
  }

  /* riga 3: le chat in attesa; i pallini sul filo del messaggio, le frecce sotto la ✕ */
  .items {
    grid-row: 3;
    grid-column: 2 / 5;
    display: flex;
    flex-direction: column;
    margin-top: 4px;
  }
  .item {
    position: relative;
    display: grid;
    grid-template-columns: 8px auto minmax(0, 1fr) 28px;
    column-gap: 8px;
    align-items: center;
    height: 26px;
    padding: 0;
    border: 0;
    background: transparent;
    color: var(--color-ink);
    font-size: 12px;
    text-align: left;
    cursor: pointer;
  }
  /* lo sfondo al passaggio sporge in modo uguale ai due lati */
  .item::before {
    content: "";
    position: absolute;
    inset: 0 -6px;
    border-radius: var(--r-md);
    background: transparent;
  }
  .item:hover::before {
    background: rgba(255, 255, 255, 0.06);
  }
  .item > * {
    position: relative;
  }
  .dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: var(--color-accent);
  }
  .iname {
    font-weight: 500;
  }
  .idet {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    color: var(--color-ink-subtle);
    font-size: 11.5px;
  }
  .chev {
    display: grid;
    place-items: center;
    color: var(--color-ink-subtle);
  }

  /* il tempo che resta: un anello attorno al cerchio dell'icona che si consuma, fermo col mouse sopra */
  @property --left {
    syntax: "<number>";
    inherits: false;
    initial-value: 100;
  }
  .pic.timed {
    position: relative;
  }
  /* sul bordo del cerchio, non fuori: il cerchio ha lo stesso diametro negli avvisi a tempo e in quelli fissi */
  .pic.timed::before {
    content: "";
    position: absolute;
    inset: 0;
    border-radius: 50%;
    background: conic-gradient(var(--kind) calc(var(--left) * 1%), transparent 0);
    -webkit-mask: radial-gradient(farthest-side, transparent calc(100% - 2.2px), #000 calc(100% - 2px));
    mask: radial-gradient(farthest-side, transparent calc(100% - 2.2px), #000 calc(100% - 2px));
    opacity: 0.9;
    animation: left var(--dur) linear forwards;
  }
  .toast.paused .pic.timed::before {
    animation-play-state: paused;
  }
  @keyframes left {
    from {
      --left: 100;
    }
    to {
      --left: 0;
    }
  }
</style>
