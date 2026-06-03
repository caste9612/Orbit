<script lang="ts">
  import { onMount, onDestroy } from "svelte";
  import { Terminal, type ILinkProvider, type ILink } from "@xterm/xterm";
  import { FitAddon } from "@xterm/addon-fit";
  import "@xterm/xterm/css/xterm.css";
  import { invoke } from "@tauri-apps/api/core";
  import { listen, type UnlistenFn } from "@tauri-apps/api/event";
  import { openFile, openFileAt, workspace } from "../state/workspace.svelte";
  import { settings, monoStack } from "../state/settings.svelte";
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
  }
  let {
    id,
    cwd = null,
    persistent = false,
    shell = null,
    active = false,
    initCommand = null,
    onStart,
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

  function b64ToBytes(b64: string): Uint8Array {
    const bin = atob(b64);
    const arr = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
    return arr;
  }

  // Apre il file indicato da un token tipo "src/App.svelte:12" cliccato nel terminale.
  function openPathToken(token: string) {
    const mm = token.match(/^(.+?)(?::(\d+))?(?::\d+)?$/);
    const p = mm ? mm[1] : token;
    const line = mm && mm[2] ? parseInt(mm[2], 10) : 0;
    const isAbs = /^([A-Za-z]:[\\/]|[\\/])/.test(p);
    const abs = isAbs ? p : workspace.rootPath ? joinPath(workspace.rootPath, p) : p;
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
            activate: () => openPathToken(token),
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
      if (resize) invoke("pty_resize", { id, cols: term.cols, rows: term.rows }).catch(() => {});
    } catch {
      /* host non ancora dimensionato */
    }
  }

  onMount(async () => {
    term = new Terminal({
      fontFamily: monoStack(settings.fontMono),
      fontSize: settings.fontSize,
      lineHeight: 1.2,
      cursorBlink: true,
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
    // percorsi cliccabili (non nel terminale flottante, che non ha un editor)
    if (id !== "float") term.registerLinkProvider(pathLinkProvider());
    fitSafe();

    unlistenData = await listen<string>(`pty-data-${id}`, (e) => term?.write(b64ToBytes(e.payload)));
    unlistenExit = await listen(`pty-exit-${id}`, () =>
      term?.write("\r\n\x1b[90m· process exited ·\x1b[0m\r\n"),
    );

    await invoke("pty_spawn", { id, cols: term.cols, rows: term.rows, cwd, shell });
    // run config: invia il comando una sola volta (il parent azzera initCommand dopo)
    if (initCommand) {
      await invoke("pty_write", { id, data: initCommand + "\r" }).catch(() => {});
      onStart?.();
    }
    term.onData((d) => invoke("pty_write", { id, data: d }).catch(() => {}));

    ro = new ResizeObserver(() => fitSafe(true));
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
    const sz = settings.fontSize;
    if (term && !disposed) {
      term.options.fontFamily = fam;
      term.options.fontSize = sz;
      fitSafe(true);
    }
  });

  onDestroy(() => {
    disposed = true;
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
    background: var(--color-surface-1);
  }
  :global(.term .xterm) {
    height: 100%;
  }
  :global(.term .xterm-viewport)::-webkit-scrollbar {
    width: 11px;
  }
</style>
