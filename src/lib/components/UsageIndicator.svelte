<script lang="ts">
  // Bottone "Usage" nella status bar: mostra l'ACCOUNT con cui è loggato Claude Code (CLI, letto
  // localmente da ~/.claude.json, aggiornato live dal watcher) e apre/chiude il pannello con la
  // pagina uso REALE di claude.ai (webview figlia ancorata, stile popover). Nessun dato viene
  // letto dalla pagina: è un browser incapsulato, ToS-safe; il login persiste nel profilo WebView
  // dell'app. Sostituisce i vecchi contatori stimati dai transcript (M48–M49, NOTES M50).
  // Sopra la webview Orbit disegna una TESTATA (DOM) con account CLI + Log out / browser / chiudi;
  // tasto destro sul bottone → menu con le stesse azioni (senza aprire il pannello).
  // "Log out" = cancellazione LOCALE dei cookie del profilo (claude_logout_local, nessuna
  // richiesta al server); su piattaforme senza API cookie ripiega sulla navigazione a /logout.
  import { onMount, onDestroy } from "svelte";
  import { invoke } from "@tauri-apps/api/core";
  import { listen, type UnlistenFn } from "@tauri-apps/api/event";
  import Icon from "./Icon.svelte";
  import Backdrop from "./Backdrop.svelte";
  import ContextMenu, { type MenuItem } from "./ContextMenu.svelte";
  import ClaudeAccounts from "./ClaudeAccounts.svelte";
  import { notify } from "../state/toast.svelte";
  import { settings } from "../state/settings.svelte";
  import { writeClipboard } from "../clipboard";

  interface Account {
    email?: string | null;
    name?: string | null;
    org?: string | null;
  }
  const HEADER = 34; // altezza testata (px logici) — la webview inizia subito sotto

  let open = $state(false);
  let account = $state<Account | null>(null);
  let menu = $state<{ x: number; y: number } | null>(null);
  let manage = $state(false); // finestrina di gestione account preconfigurati
  let pr = $state({ x: 0, y: 0, width: 0, height: 0 }); // rect della webview (la testata sta sopra)
  let wrap: HTMLElement | undefined;

  const acctLabel = $derived(
    account?.email ? `${account.email}${account.org ? ` · ${account.org}` : ""}` : null,
  );
  // etichetta compatta per la status bar: la parte locale dell'email
  const acctShort = $derived(account?.email ? account.email.split("@")[0] : null);

  async function loadAccount(): Promise<void> {
    try {
      account = await invoke<Account | null>("claude_account");
    } catch {
      account = null;
    }
  }

  let unlisten: UnlistenFn | undefined;
  onMount(() => {
    void loadAccount();
    void invoke("watch_claude_account").catch(() => {});
    void listen("claude-account-changed", () => void loadAccount()).then((u) => (unlisten = u));
  });

  // Rect della webview in px logici (= px DOM): ancorata in basso a destra, 4px sopra la status
  // bar (il top di questo bottone), lasciando HEADER px per la testata.
  function rect(): { x: number; y: number; width: number; height: number } {
    const margin = 8;
    const bottom = (wrap?.getBoundingClientRect().top ?? window.innerHeight - 26) - 4;
    const width = Math.min(440, window.innerWidth - margin * 2);
    const height = Math.min(680, bottom - margin - HEADER);
    return { x: window.innerWidth - width - margin, y: bottom - height, width, height };
  }

  async function show(): Promise<boolean> {
    try {
      pr = rect();
      await invoke("usage_panel_show", pr);
      open = true;
      void loadAccount(); // rinfresca l'account mostrato in testata
      return true;
    } catch {
      return false;
    }
  }
  async function toggle(): Promise<void> {
    if (open) return close();
    if (!(await show())) {
      // fallback: browser di sistema (es. build senza webview figlie)
      notify("Couldn't open the embedded panel — opening in your browser", "info");
      void invoke("open_url", { url: "https://claude.ai/settings/usage" }).catch(() => {});
    }
  }
  function close(): void {
    open = false;
    void invoke("usage_panel_close").catch(() => {});
  }

  async function logout(): Promise<void> {
    try {
      await invoke("claude_logout_local"); // cancella i cookie del profilo (locale, istantaneo)
      if (open) {
        void invoke("usage_panel_logout").catch(() => {}); // ricarica → mostra il form di login
      } else {
        notify("Signed out of claude.ai (panel)", "info");
      }
    } catch {
      // niente API cookie su questa piattaforma: serve il pannello per navigare al logout
      if (!open && !(await show())) return;
      void invoke("usage_panel_logout").catch(() => {});
    }
  }
  function openInBrowser(): void {
    void invoke("open_url", { url: "https://claude.ai/settings/usage" }).catch(() => {});
  }

  // copia l'email di un account preconfigurato: la incolli nel form di login del pannello
  async function copyAccount(email: string): Promise<void> {
    const ok = await writeClipboard(email);
    notify(ok ? "Email copied — paste it into the login form" : "Copy failed", ok ? "success" : "error", 1600);
  }

  function menuItems(): MenuItem[] {
    const items: MenuItem[] = [
      { label: acctLabel ?? "Claude Code: not signed in", header: true },
      { label: "Log out claude.ai (panel)", onClick: () => void logout() },
      { label: "Open usage in browser", icon: "external-link", onClick: openInBrowser },
    ];
    if (settings.claudeAccounts.length) {
      items.push({ label: "Copy account email", header: true, separatorBefore: true });
      for (const email of settings.claudeAccounts) {
        items.push({ label: email, icon: "copy", onClick: () => void copyAccount(email) });
      }
    }
    items.push({
      label: "Manage accounts…",
      separatorBefore: !settings.claudeAccounts.length,
      onClick: () => (manage = true),
    });
    return items;
  }

  function onResize(): void {
    if (!open) return;
    pr = rect();
    void invoke("usage_panel_bounds", pr).catch(() => {});
  }

  onDestroy(() => {
    unlisten?.();
    if (open) close();
  });
</script>

<svelte:window
  onresize={onResize}
  onkeydown={(e) => {
    if (open && e.key === "Escape") close();
  }}
/>

<div class="wrap" bind:this={wrap}>
  <button
    class="seg"
    class:on={open}
    title={"Claude usage — your real 5h / weekly limits (claude.ai)" +
      (acctLabel ? `\nClaude Code is signed in as ${acctLabel}` : "") +
      "\nRight-click for account actions"}
    onclick={toggle}
    oncontextmenu={(e) => {
      e.preventDefault();
      menu = { x: e.clientX, y: e.clientY };
    }}
  >
    <Icon name="gauge" size={13} strokeWidth={1.8} />
    <span>{acctShort ?? "Usage"}</span>
  </button>

  {#if open}
    <!-- il pannello è una webview nativa sopra il DOM: il Backdrop serve solo a chiudere al click fuori -->
    <Backdrop onClose={close} z={60} />
    <div
      class="phead"
      style="left:{pr.x}px; top:{pr.y - HEADER}px; width:{pr.width}px; height:{HEADER}px"
      role="toolbar"
      aria-label="Claude usage panel"
    >
      <Icon name="gauge" size={13} strokeWidth={1.8} />
      <span class="ptitle">Claude usage</span>
      {#if account?.email}
        <span
          class="acct"
          title="The account Claude Code (CLI) is signed in as — read locally from ~/.claude.json. The page below has its own login: compare them here."
        >
          CLI: {acctLabel}
        </span>
      {/if}
      <span class="sp"></span>
      <button class="hlink" title="Log out of claude.ai in this panel (to switch account)" onclick={() => void logout()}>
        Log out
      </button>
      <button class="hic" title="Open in your browser" onclick={openInBrowser} aria-label="Open in browser">
        <Icon name="external-link" size={12} strokeWidth={1.8} />
      </button>
      <button class="hic" title="Close" onclick={close} aria-label="Close">
        <Icon name="x" size={13} strokeWidth={1.8} />
      </button>
    </div>
  {/if}

  {#if menu}
    <ContextMenu x={menu.x} y={menu.y} items={menuItems()} onClose={() => (menu = null)} />
  {/if}

  {#if manage}
    <ClaudeAccounts current={account?.email ?? null} onClose={() => (manage = false)} />
  {/if}
</div>

<style>
  .wrap {
    position: relative;
    display: inline-flex;
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
  .seg:hover {
    background: var(--color-surface-3);
    color: var(--color-ink);
  }
  .seg.on {
    background: var(--color-surface-3);
    color: var(--color-accent);
  }

  .phead {
    position: fixed;
    z-index: 61;
    box-sizing: border-box;
    display: flex;
    align-items: center;
    gap: 7px;
    padding: 0 8px 0 10px;
    background: var(--color-surface-2);
    border: 1px solid var(--color-line-strong);
    border-bottom: 0;
    border-radius: 8px 8px 0 0;
    color: var(--color-ink);
    font-size: 11.5px;
  }
  .ptitle {
    font-weight: 600;
    letter-spacing: 0.02em;
    white-space: nowrap;
  }
  .acct {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    color: var(--color-ink-muted);
    font-size: 11px;
  }
  .sp {
    flex: 1;
  }
  .hlink {
    padding: 2px 7px;
    background: transparent;
    border: 1px solid var(--color-line-strong);
    border-radius: 5px;
    color: var(--color-ink-muted);
    font-size: 10.5px;
    white-space: nowrap;
    cursor: pointer;
  }
  .hlink:hover {
    border-color: var(--color-accent);
    color: var(--color-ink);
  }
  .hic {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 22px;
    height: 20px;
    background: transparent;
    border: 0;
    border-radius: 5px;
    color: var(--color-ink-muted);
    cursor: pointer;
  }
  .hic:hover {
    background: var(--color-surface-4);
    color: var(--color-ink);
  }
</style>
