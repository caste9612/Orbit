<script lang="ts">
  import { onMount, onDestroy, untrack } from "svelte";
  import { Terminal, type ILinkProvider, type ILink } from "@xterm/xterm";
  import { FitAddon } from "@xterm/addon-fit";
  import { WebLinksAddon } from "@xterm/addon-web-links";
  import "@xterm/xterm/css/xterm.css";
  import { invoke } from "@tauri-apps/api/core";
  import { listen, type UnlistenFn } from "@tauri-apps/api/event";
  import { openFile, openFileAt, workspace } from "../state/workspace.svelte";
  import { notify } from "../state/toast.svelte";
  import { settings, monoStack } from "../state/settings.svelte";
  import { xtermTheme } from "../terminalTheme";
  import { setTerminalFocus, clearTerminalFocus } from "../state/terminals.svelte";
  import { motionUntil } from "../state/layout.svelte";
  import { joinPath } from "../util";
  import { writeClipboard, readClipboard } from "../clipboard";
  import { log, logError } from "../state/logs.svelte";
  import { TerminalCaret } from "../terminalCaret";

  interface Props {
    id: string;
    cwd?: string | null;
    /** true = non uccidere il PTY allo smontaggio (es. terminale del pannello principale). */
    persistent?: boolean;
    /** programma shell da lanciare (assoluto o in PATH); null = default di piattaforma. */
    shell?: string | null;
    /** tab attiva: se true rifit + focus (le tab nascoste restano montate). */
    active?: boolean;
    /** comando da lanciare all'avvio (run config); inviato una sola volta. */
    initCommand?: string | null;
    /** chiamato dopo aver inviato initCommand, così il parent non lo rilancia. */
    onStart?: () => void;
    /** true = collegati a un PTY già esistente, senza spawn (terminale estratto/reincollato). */
    attach?: boolean;
    /** percorsi cliccabili nell'output (disattivati nella finestra flottante: niente editor). */
    enableLinks?: boolean;
    /** la bell (BEL) ha suonato: Claude ha finito un turno / aspetta input. */
    onBell?: () => void;
    /** il programma ha impostato il titolo della finestra (OSC 0/2): Claude Code vi mette un riassunto
     *  della conversazione, le shell il comando in corso → nome automatico della scheda. */
    onTitle?: (title: string) => void;
    /** chat di Claude (non una shell): il cursore prende la forma scelta per le chat (M63). */
    chat?: boolean;
  }
  let {
    id,
    cwd = null,
    persistent = false,
    shell = null,
    active = false,
    initCommand = null,
    onStart,
    attach = false,
    enableLinks = true,
    onBell,
    onTitle,
    chat = false,
  }: Props = $props();

  let host: HTMLDivElement; // contenitore col padding: listener, ResizeObserver, test "tab nascosta"
  let fitHost: HTMLDivElement; // genitore DIRETTO di .xterm, senza padding (vedi CSS e fitSafe)
  let term: Terminal | undefined;
  let fit: FitAddon | undefined;
  let unlistenData: UnlistenFn | undefined;
  let unlistenExit: UnlistenFn | undefined;
  let ro: ResizeObserver | undefined;
  let disposed = false;
  let lastCols = 0;
  let lastRows = 0;
  let resizeTimer: ReturnType<typeof setTimeout> | undefined;
  // un solo AbortController per TUTTI i listener su `host`: onDestroy li rimuove in blocco.
  // (Prima non venivano rimossi e in HMR si accumulavano → il click destro incollava più volte:
  //  era la causa del "doppio incolla" che, una volta partito, continuava.)
  let listenerAbort: AbortController | undefined;

  function b64ToBytes(b64: string): Uint8Array {
    const bin = atob(b64);
    const arr = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
    return arr;
  }

  // Apre il file indicato da un token tipo "src/App.svelte:12" cliccato nel terminale.
  async function openPathToken(token: string) {
    const mm = token.match(/^(.+?)(?::(\d+))?(?::\d+)?$/);
    const p = mm ? mm[1] : token;
    const line = mm && mm[2] ? parseInt(mm[2], 10) : 0;
    const isAbs = /^([A-Za-z]:[\\/]|[\\/])/.test(p);
    // percorsi relativi (es. quelli stampati da Claude): provo la cwd del terminale e poi la
    // radice del progetto, e apro il PRIMO che esiste davvero (niente più "os error 2").
    const bases = isAbs
      ? [p]
      : ([
          cwd ? joinPath(cwd, p) : null,
          workspace.rootPath ? joinPath(workspace.rootPath, p) : null,
        ].filter(Boolean) as string[]);
    const abs = await invoke<string | null>("resolve_existing", { paths: bases }).catch(() => null);
    if (!abs) {
      notify(`File non trovato: ${p}`, "error");
      return;
    }
    if (line > 0) void openFileAt(abs, line);
    else void openFile(abs);
  }

  // Rileva percorsi (con estensione, opzionale :riga) nell'output e li rende cliccabili.
  function pathLinkProvider(): ILinkProvider {
    const re = /(?:[A-Za-z]:)?[\w.\\/-]*\w\.[A-Za-z]\w*(?::\d+(?::\d+)?)?/g;
    return {
      provideLinks(y: number, callback: (links: ILink[] | undefined) => void) {
        const buf = term?.buffer.active.getLine(y - 1);
        if (!buf) {
          callback(undefined);
          return;
        }
        const text = buf.translateToString(true);
        const links: ILink[] = [];
        re.lastIndex = 0;
        let m: RegExpExecArray | null;
        while ((m = re.exec(text)) !== null) {
          const token = m[0];
          if (token.length < 3) continue;
          const startX = m.index + 1;
          links.push({
            text: token,
            range: { start: { x: startX, y }, end: { x: startX + token.length - 1, y } },
            activate: () => void openPathToken(token),
            decorations: { pointerCursor: true, underline: true },
          });
        }
        callback(links.length ? links : undefined);
      },
    };
  }

  function fitSafe(resize = false) {
    if (!fit || !term || disposed) return;
    // tab nascosta (display:none) → dimensioni nulle: non rifittare/ridimensionare il PTY
    if (!host || host.clientWidth < 2 || host.clientHeight < 2) return;
    try {
      fit.fit();
      // ridimensiona il PTY solo se la griglia è davvero cambiata: evita ridisegni
      // ridondanti dei programmi TUI (es. il banner di Claude che si "duplicava").
      if (resize && (term.cols !== lastCols || term.rows !== lastRows)) {
        lastCols = term.cols;
        lastRows = term.rows;
        invoke("pty_resize", { id, cols: term.cols, rows: term.rows }).catch(() => {});
      }
    } catch {
      /* host non ancora dimensionato */
    }
  }

  // coalescizza i fit ravvicinati (zoom del font / resize rapidi della finestra) in uno solo.
  // Durante una transizione del layout (cambio repo, collasso dell'editor, riquadri che si spostano) il
  // contenitore cambia a ogni frame: un solo fit ~40 ms dopo la fine, non un pty_resize per frame
  // (ogni resize fa ridisegnare i programmi TUI). Tetto di 1,5 s se la transizione non si chiude.
  function scheduleFit(resize = false) {
    if (resizeTimer) clearTimeout(resizeTimer);
    const wait = Math.max(90, Math.min(1500, motionUntil() - performance.now() + 40));
    resizeTimer = setTimeout(() => fitSafe(resize), wait);
  }

  // —— Copia/incolla (via lib/clipboard.ts: niente errori ingoiati, plugin Tauri + fallback) ——
  // Incolla togliendo gli a-capo FINALI così non esegue da solo (premi Invio tu). Il doppio-incolla
  // "sticky" era causato dai listener accumulati: lo risolve l'AbortController in onDestroy, non una
  // guardia temporale (che scarterebbe anche incolli legittimi ravvicinati).
  async function pasteFromClipboard(src: "contextmenu" | "keyboard") {
    log("paste", `paste via ${src}`, { id, disposed }); // due voci ravvicinate qui = doppio-trigger
    const t = await readClipboard();
    if (disposed || !term) return; // terminale smontato durante l'await
    try {
      if (t) {
        term.paste(t.replace(/[\r\n]+$/, ""));
        log("paste", "term.paste done", { id, len: t.length });
      } else if (t === null) notify("Paste: clipboard read failed", "error", 1500);
    } catch (e) {
      logError("paste", "term.paste threw", { id, err: String(e) });
    }
  }
  // `loud`: la copia AUTOMATICA su selezione (mouseup) resta SILENZIOSA anche se fallisce — capita a
  // ogni drag, un toast d'errore sarebbe spam; la copia ESPLICITA (Ctrl/Cmd+Shift+C) invece segnala.
  async function copySelectionToClipboard(loud = false) {
    const sel = term && term.hasSelection() ? term.getSelection() : "";
    if (!sel) return;
    log("copy", "copy selection", { id, len: sel.length, loud });
    const ok = await writeClipboard(sel);
    if (!ok && loud) notify("Copy to clipboard failed", "error", 1500);
  }

  onMount(async () => {
    log("terminal", "mount", { id, attach });
    term = new Terminal({
      fontFamily: monoStack(settings.fontMono),
      fontSize: settings.terminalFontSize,
      lineHeight: 1.2,
      // niente blink: il timer di lampeggio ri-mostra il cursore durante i ridisegni rapidi
      // dei TUI (Claude), facendolo "saltare" sui caratteri aggiornati anche quando è nascosto.
      cursorBlink: false,
      // cursore di xterm: una barra sottile e trasparente, anche senza fuoco (vedi TerminalCaret)
      cursorStyle: "bar",
      cursorWidth: 1,
      cursorInactiveStyle: "none",
      scrollback: settings.terminalScrollback,
      allowProposedApi: true,
      theme: xtermTheme(),
    });
    fit = new FitAddon();
    term.loadAddon(fit);
    // Il FitAddon calcola le righe sull'altezza del GENITORE di .xterm presa con getComputedStyle (cioè
    // padding INCLUSO, col box-sizing border-box) e sottrae solo il padding di .xterm. Con xterm aperto
    // direttamente nel contenitore col padding contava 12px inesistenti → righe sbagliate: a seconda
    // dell'altezza restava una striscia sotto l'ultima riga o l'ultima riga veniva tagliata. Per questo
    // xterm si apre in un div interno senza padding.
    term.open(fitHost);
    caret = new TerminalCaret(term, () => settings.termCaret, () => chat);
    // WebGL solo mentre il terminale si vede (vedi attachWebgl): lo segue un IntersectionObserver
    io = new IntersectionObserver((entries) => {
      visible = entries[entries.length - 1].isIntersecting;
      if (releaseTimer) clearTimeout(releaseTimer);
      if (visible) void attachWebgl();
      else releaseTimer = setTimeout(detachWebgl, 3000); // un cambio di scheda veloce non lo ricrea
    });
    io.observe(host);
    // URL http(s) cliccabili (gestisce anche gli URL che vanno a capo su più righe): un clic li apre
    // nel browser di sistema via il comando Rust open_url. Attivo ovunque (anche finestra flottante).
    term.loadAddon(
      new WebLinksAddon((_e, uri) => {
        void invoke("open_url", { url: uri }).catch(() => {});
      }),
    );
    // percorsi di file cliccabili (disattivati nella finestra flottante, che non ha un editor)
    if (enableLinks) term.registerLinkProvider(pathLinkProvider());

    // la bell (BEL) segnala "ho finito / aspetto input" — Claude la suona a fine turno: avvisa il parent
    term.onBell(() => onBell?.());
    // titolo della "finestra" impostato dal programma (OSC 0/2) → nome automatico della scheda
    term.onTitleChange((title) => onTitle?.(title));

    // OSC 52: una TUI (es. Claude) copia negli appunti via escape sequence. xterm di default la IGNORA
    // → in Claude vedi "copied to clipboard" ma la clipboard di sistema non si aggiornava (incollavi il
    // testo VECCHIO). La gestiamo noi: decodifica base64 → scrittura in clipboard (via il plugin Tauri).
    term.parser.registerOscHandler(52, (data) => {
      const semi = data.indexOf(";"); // formato "<sel>;<base64>" (sel=c/p/…; "?" = query → ignora)
      const payload = semi >= 0 ? data.slice(semi + 1) : "";
      if (payload && payload !== "?") {
        try {
          const text = new TextDecoder().decode(b64ToBytes(payload));
          log("clipboard", "OSC52 copy from terminal", { id, len: text.length });
          void writeClipboard(text);
        } catch {
          /* base64 malformato: ignora */
        }
      }
      return true; // gestito (non propagare al default, che la ignorerebbe)
    });

    // Tutti i listener su `host` condividono questo signal → onDestroy li rimuove in un colpo.
    listenerAbort = new AbortController();
    const { signal } = listenerAbort;

    // Click destro. Se una TUI cattura il mouse (es. Claude col mouse-reporting) il click destro è SUO:
    // lasciamo passare gli eventi mouse così incolla LEI col suo meccanismo nativo → niente doppione
    // (prima incollavamo sia noi sia Claude). Con una shell normale (niente mouse-tracking) incolliamo
    // NOI. Tenendo SHIFT si forza sempre il nostro incolla (xterm non inoltra il mouse alla TUI quando
    // Shift è premuto). preventDefault sopprime comunque il menu nativo di WebView2; Ctrl/Cmd+Shift+V
    // resta il nostro incolla esplicito.
    host.addEventListener(
      "contextmenu",
      (e) => {
        e.preventDefault();
        e.stopPropagation();
        const mode = term?.modes.mouseTrackingMode ?? "none";
        if (mode !== "none" && !e.shiftKey) {
          log("paste", "right-click deferred to TUI (mouse tracking)", { id, mode });
          return; // la TUI riceve il mouse e incolla da sé
        }
        void pasteFromClipboard("contextmenu");
      },
      { capture: true, signal },
    );

    // Copia-su-selezione: finita una selezione col tasto SINISTRO, copiala subito (stile VS Code).
    host.addEventListener(
      "mouseup",
      (e) => {
        if (e.button !== 0) return; // solo il sinistro; il destro incolla (sopra)
        void copySelectionToClipboard();
      },
      { signal },
    );

    // Tastiera: Ctrl/Cmd+Shift+C copia la selezione, Ctrl/Cmd+Shift+V incolla (a-capo finali tolti).
    // Ctrl+C "nudo" resta SIGINT: NON lo intercettiamo.
    term.attachCustomKeyEventHandler((e) => {
      if (e.type !== "keydown") return true;
      const cs = (e.ctrlKey || e.metaKey) && e.shiftKey;
      if (cs && (e.key === "C" || e.key === "c")) {
        void copySelectionToClipboard(true); // copia esplicita → segnala l'eventuale errore
        return false;
      }
      if (cs && (e.key === "V" || e.key === "v")) {
        void pasteFromClipboard("keyboard");
        return false;
      }
      return true;
    });

    // focus REALE del terminale: se il focus è qui (non nell'editor) la bell non disturba; quando
    // arriva la bell e NON sei qui, scatta l'attenzione (vedi notifyTerminalBell). relatedTarget
    // interno all'host = focus che si sposta dentro al terminale → non conta come "uscita".
    host.addEventListener("focusin", () => setTerminalFocus(id), { signal });
    host.addEventListener(
      "focusout",
      (e) => {
        if (!host.contains(e.relatedTarget as Node | null)) clearTerminalFocus(id);
      },
      { signal },
    );

    // DIAGNOSTICA doppio-incolla: un evento "paste" del DOM qui = incolla NATIVO (Ctrl+V gestito da
    // xterm o menu contestuale nativo di WebView2), distinto dal nostro pasteFromClipboard (che chiama
    // term.paste() programmaticamente, senza evento DOM). Se per UN click destro compaiono ENTRAMBI,
    // il raddoppio viene dall'incolla nativo non soppresso.
    host.addEventListener(
      "paste",
      (e) => {
        const dt = (e as ClipboardEvent).clipboardData;
        log("paste", "DOM paste event (native/xterm)", { id, len: dt ? dt.getData("text").length : -1 });
      },
      { signal },
    );

    fitSafe();

    unlistenData = await listen<string>(`pty-data-${id}`, (e) => term?.write(b64ToBytes(e.payload)));
    unlistenExit = await listen(`pty-exit-${id}`, () =>
      term?.write("\r\n\x1b[90m· process exited ·\x1b[0m\r\n"),
    );

    if (attach) {
      // PTY già esistente (estratto in finestra flottante / reincollato): non rispawnare,
      // ridimensiona soltanto così il programma in esecuzione (es. Claude) ridisegna.
      await invoke("pty_resize", { id, cols: term.cols, rows: term.rows }).catch(() => {});
    } else {
      // `false` = il PTY esisteva già (remount): dentro c'è un processo vivo (es. claude) e
      // l'initCommand finirebbe DIGITATO in esso come input — mai re-inviarlo in quel caso.
      const fresh = await invoke<boolean>("pty_spawn", { id, cols: term.cols, rows: term.rows, cwd, shell });
      if (initCommand) {
        if (fresh) await invoke("pty_write", { id, data: initCommand + "\r" }).catch(() => {});
        onStart?.(); // segna comunque `started`: su un PTY preesistente il comando è ormai moot
      }
    }
    lastCols = term.cols;
    lastRows = term.rows;
    term.onData((d) => {
      // DIAGNOSTICA: cosa esce dal terminale verso il PTY, solo per gli incolla (testo di più caratteri o la
      // modalità incolla delle shell, `bracketed`). Se UN incolla genera DUE onData con la stessa lunghezza →
      // doppio input reale a monte del PTY. Tasti singoli, frecce e report del mouse (sequenze che iniziano
      // con ESC) non si registrano: erano rumore continuo nei TUI come Claude (M62).
      const bracketed = d.includes("\x1b[200~");
      if (d.length > 2 && (bracketed || d[0] !== "\x1b")) log("pty", "onData→pty_write", { id, len: d.length, bracketed });
      invoke("pty_write", { id, data: d }).catch((e) => logError("pty", "pty_write failed", { id, err: String(e) }));
    });

    ro = new ResizeObserver(() => scheduleFit(true));
    ro.observe(host);
    if (active) term.focus();
  });

  // quando la tab diventa attiva (da nascosta a visibile): rifit e porta il focus
  $effect(() => {
    if (active && term && !disposed) {
      fitSafe(true);
      term.focus();
    }
  });

  // —— Testo sulla GPU (WebGL) solo per i terminali visibili (M62) ——
  // Disegnare col WebGL costa ~2,6× meno CPU del renderer DOM quando l'output si ridisegna di continuo (lo
  // spinner di Claude: 14,7 % → 5,6 % di un core). Ma ogni contesto tiene un atlante di glifi in VRAM (~7–8 MB) e Chromium ne
  // regge ~16 per pagina: prima ogni terminale montato col WebGL ne teneva uno anche nascosto (altra repo,
  // altra scheda) e oltre il sedicesimo i più vecchi tornavano al DOM senza dirlo. Ora il contesto nasce
  // quando il terminale diventa visibile e si rilascia 3 s dopo che è sparito; xterm torna da solo al DOM.
  let caret: TerminalCaret | undefined;
  // stile del cursore (Impostazioni → Terminal cursor) o tipo della scheda cambiati: ridisegna
  $effect(() => {
    void { ...settings.termCaret };
    void chat;
    untrack(() => caret?.refresh());
  });

  let io: IntersectionObserver | undefined;
  let visible = false;
  let releaseTimer: ReturnType<typeof setTimeout> | undefined;
  let webgl: { dispose(): void } | null = null;
  let webglLoading = false;

  async function attachWebgl() {
    if (webgl || webglLoading || !term || disposed || !visible || !settings.webgl) return;
    webglLoading = true;
    try {
      const { WebglAddon } = await import("@xterm/addon-webgl"); // import dinamico: fuori dal bundle iniziale
      if (webgl || !term || disposed || !visible || !settings.webgl) return;
      const addon = new WebglAddon();
      addon.onContextLoss(() => {
        if (webgl === addon) webgl = null;
        addon.dispose(); // contesto perso (GPU resettata): si torna al DOM; si riprova alla prossima visibilità
      });
      term.loadAddon(addon);
      webgl = addon;
    } catch {
      /* WebGL non disponibile su questa GPU/webview: resta il renderer DOM */
    } finally {
      webglLoading = false;
    }
  }
  function detachWebgl() {
    webgl?.dispose();
    webgl = null;
  }

  // l'impostazione cambia dal vivo, senza riaprire i terminali
  $effect(() => {
    const on = settings.webgl;
    untrack(() => (on ? void attachWebgl() : detachWebgl()));
  });

  // righe di storico (Impostazioni): ridurle accorcia subito lo storico già accumulato
  $effect(() => {
    const lines = settings.terminalScrollback;
    if (term && !disposed) term.options.scrollback = lines;
  });

  // cambio tema/accento dalle Impostazioni → ricolora il terminale al volo
  $effect(() => {
    const th = xtermTheme(); // legge settings.theme / settings.accent (dipendenze tracciate)
    if (term && !disposed) term.options.theme = th;
  });

  // cambio font/dimensione dalle Impostazioni → applica al terminale e rifit
  $effect(() => {
    const fam = monoStack(settings.fontMono);
    const sz = settings.terminalFontSize;
    if (term && !disposed) {
      term.options.fontFamily = fam;
      term.options.fontSize = sz;
      scheduleFit(true);
    }
  });

  onDestroy(() => {
    disposed = true;
    log("terminal", "unmount", { id });
    clearTerminalFocus(id); // non lasciare focusedId puntato a un terminale smontato
    if (resizeTimer) clearTimeout(resizeTimer);
    if (releaseTimer) clearTimeout(releaseTimer);
    listenerAbort?.abort(); // rimuove TUTTI i listener su host (contextmenu/mouseup/focus) in blocco
    ro?.disconnect();
    io?.disconnect();
    caret?.dispose();
    unlistenData?.();
    unlistenExit?.();
    if (!persistent) invoke("pty_kill", { id }).catch(() => {});
    term?.dispose();
  });
</script>

<div class="term" bind:this={host}>
  <div class="term-fit" bind:this={fitHost}></div>
</div>

<style>
  .term {
    height: 100%;
    width: 100%;
    box-sizing: border-box;
    padding: 6px 4px 6px 10px;
    background: var(--color-surface-1); /* = xtermTheme().background */
  }
  /* genitore di .xterm SENZA padding: il FitAddon misura questo (vedi onMount) */
  .term-fit {
    height: 100%;
    width: 100%;
  }
  :global(.term .xterm) {
    height: 100%;
  }
  /* Sotto l'ultima riga avanza sempre un po' di spazio (meno di una riga). xterm 6 dà il colore del
     tema solo allo scrollable element che avvolge le righe; lì sotto si vede il .xterm-viewport, che
     xterm.css colora #000 → era la "riga nera" in fondo al terminale (M27 aveva colorato il contenitore,
     che però è coperto dal viewport). */
  :global(.term .xterm .xterm-viewport) {
    background-color: var(--color-surface-1); /* = xtermTheme().background */
  }
  /* xterm usa una <textarea> nascosta per l'input: il browser vi disegna il PROPRIO caret,
     che appare come un "secondo cursore" (e resta visibile/in movimento anche quando il
     programma nasconde il cursore vero, es. mentre Claude pensa). Lo rendo invisibile:
     resta solo il cursore gestito da xterm. */
  :global(.term .xterm-helper-textarea) {
    caret-color: transparent !important;
  }
  :global(.term .xterm-viewport)::-webkit-scrollbar {
    width: 11px;
  }
</style>
