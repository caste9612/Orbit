<script lang="ts">
  import { onMount, onDestroy } from "svelte";
  import { Terminal, type ILinkProvider, type ILink } from "@xterm/xterm";
  import { FitAddon } from "@xterm/addon-fit";
  import { WebLinksAddon } from "@xterm/addon-web-links";
  import "@xterm/xterm/css/xterm.css";
  import { invoke } from "@tauri-apps/api/core";
  import { listen, type UnlistenFn } from "@tauri-apps/api/event";
  import { openFile, openFileAt, workspace } from "../state/workspace.svelte";
  import { notify } from "../state/toast.svelte";
  import { settings, monoStack } from "../state/settings.svelte";
  import { setTerminalFocus, clearTerminalFocus } from "../state/terminals.svelte";
  import { joinPath } from "../util";

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
  }: Props = $props();

  // tema xterm allineato alla sintassi dell'editor (sfondo = editor #1e1e1e)
  const theme = {
    background: "#1e1e1e",
    foreground: "#d4d4d4",
    cursor: "#3b9dff",
    cursorAccent: "#1e1e1e",
    selectionBackground: "#264f78",
    black: "#1e1e1e",
    red: "#f14c4c",
    green: "#5bc88a",
    yellow: "#e3b341",
    blue: "#569cd6",
    magenta: "#c586c0",
    cyan: "#4ec9b0",
    white: "#d4d4d4",
    brightBlack: "#6b7480",
    brightRed: "#ff7b86",
    brightGreen: "#7ee0a6",
    brightYellow: "#f0c662",
    brightBlue: "#8fbcff",
    brightMagenta: "#d7a3e0",
    brightCyan: "#6fd9c4",
    brightWhite: "#ffffff",
  };

  let host: HTMLDivElement;
  let term: Terminal | undefined;
  let fit: FitAddon | undefined;
  let unlistenData: UnlistenFn | undefined;
  let unlistenExit: UnlistenFn | undefined;
  let ro: ResizeObserver | undefined;
  let disposed = false;
  let lastCols = 0;
  let lastRows = 0;
  let resizeTimer: ReturnType<typeof setTimeout> | undefined;

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

  // coalescizza i fit ravvicinati (zoom del font / resize rapidi della finestra) in uno solo
  function scheduleFit(resize = false) {
    if (resizeTimer) clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => fitSafe(resize), 90);
  }

  onMount(async () => {
    term = new Terminal({
      fontFamily: monoStack(settings.fontMono),
      fontSize: settings.terminalFontSize,
      lineHeight: 1.2,
      // niente blink: il timer di lampeggio ri-mostra il cursore durante i ridisegni rapidi
      // dei TUI (Claude), facendolo "saltare" sui caratteri aggiornati anche quando è nascosto.
      cursorBlink: false,
      scrollback: 5000,
      allowProposedApi: true,
      theme,
    });
    fit = new FitAddon();
    term.loadAddon(fit);
    term.open(host);
    // GPU rendering (WebGL) opzionale, default OFF: import dinamico per non pesare sul bundle
    if (settings.webgl) {
      try {
        const { WebglAddon } = await import("@xterm/addon-webgl");
        const webgl = new WebglAddon();
        webgl.onContextLoss(() => webgl.dispose());
        term.loadAddon(webgl);
      } catch {
        /* WebGL non disponibile su questa GPU/webview */
      }
    }
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

    // Click destro = INCOLLA (sempre), togliendo gli a-capo FINALI così non esegue da solo: premi Invio tu.
    // In cattura (true) così funziona anche quando un TUI come Claude attiva il mouse-reporting
    // (altrimenti il click destro verrebbe inviato al programma).
    host.addEventListener(
      "contextmenu",
      (e) => {
        e.preventDefault();
        e.stopPropagation();
        void navigator.clipboard
          .readText()
          .then((t) => {
            if (t) term?.paste(t.replace(/[\r\n]+$/, ""));
          })
          .catch(() => {});
      },
      true,
    );

    // Copia-su-selezione: finita una selezione col tasto SINISTRO, copiala subito (stile VS Code).
    host.addEventListener("mouseup", (e) => {
      if (e.button !== 0) return; // solo il sinistro; il destro incolla (sopra)
      const sel = term && term.hasSelection() ? term.getSelection() : "";
      if (sel) void navigator.clipboard.writeText(sel).catch(() => {});
    });

    // Tastiera: Ctrl/Cmd+Shift+C copia la selezione, Ctrl/Cmd+Shift+V incolla (a-capo finali tolti).
    // Ctrl+C "nudo" resta SIGINT: NON lo intercettiamo.
    term.attachCustomKeyEventHandler((e) => {
      if (e.type !== "keydown") return true;
      const cs = (e.ctrlKey || e.metaKey) && e.shiftKey;
      if (cs && (e.key === "C" || e.key === "c")) {
        const sel = term && term.hasSelection() ? term.getSelection() : "";
        if (sel) void navigator.clipboard.writeText(sel).catch(() => {});
        return false;
      }
      if (cs && (e.key === "V" || e.key === "v")) {
        void navigator.clipboard
          .readText()
          .then((t) => {
            if (t) term?.paste(t.replace(/[\r\n]+$/, ""));
          })
          .catch(() => {});
        return false;
      }
      return true;
    });

    // focus REALE del terminale: se il focus è qui (non nell'editor) la bell non disturba; quando
    // arriva la bell e NON sei qui, scatta l'attenzione (vedi notifyTerminalBell). relatedTarget
    // interno all'host = focus che si sposta dentro al terminale → non conta come "uscita".
    host.addEventListener("focusin", () => setTerminalFocus(id));
    host.addEventListener("focusout", (e) => {
      if (!host.contains(e.relatedTarget as Node | null)) clearTerminalFocus(id);
    });

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
      await invoke("pty_spawn", { id, cols: term.cols, rows: term.rows, cwd, shell });
      // run config: invia il comando una sola volta (il parent azzera initCommand dopo)
      if (initCommand) {
        await invoke("pty_write", { id, data: initCommand + "\r" }).catch(() => {});
        onStart?.();
      }
    }
    lastCols = term.cols;
    lastRows = term.rows;
    term.onData((d) => invoke("pty_write", { id, data: d }).catch(() => {}));

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
    clearTerminalFocus(id); // non lasciare focusedId puntato a un terminale smontato
    if (resizeTimer) clearTimeout(resizeTimer);
    ro?.disconnect();
    unlistenData?.();
    unlistenExit?.();
    if (!persistent) invoke("pty_kill", { id }).catch(() => {});
    term?.dispose();
  });
</script>

<div class="term" bind:this={host}></div>

<style>
  .term {
    height: 100%;
    width: 100%;
    box-sizing: border-box;
    padding: 6px 4px 6px 10px;
    /* uguale allo sfondo del tema xterm: il resto sotto l'ultima riga non si vede */
    background: #1e1e1e;
  }
  :global(.term .xterm) {
    height: 100%;
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
