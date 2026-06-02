<script lang="ts">
  import { onMount, onDestroy } from "svelte";
  import { Terminal } from "@xterm/xterm";
  import { FitAddon } from "@xterm/addon-fit";
  import "@xterm/xterm/css/xterm.css";
  import { invoke } from "@tauri-apps/api/core";
  import { listen, type UnlistenFn } from "@tauri-apps/api/event";

  interface Props {
    id: string;
    cwd?: string | null;
    /** true = non uccidere il PTY allo smontaggio (es. terminale del pannello principale). */
    persistent?: boolean;
  }
  let { id, cwd = null, persistent = false }: Props = $props();

  // tema xterm coerente con la palette della shell
  const theme = {
    background: "#14171c",
    foreground: "#d7dce3",
    cursor: "#6ea8fe",
    cursorAccent: "#14171c",
    selectionBackground: "#2a4163",
    black: "#0f1115",
    red: "#f0626f",
    green: "#5bc88a",
    yellow: "#e3b341",
    blue: "#6ea8fe",
    magenta: "#c586c0",
    cyan: "#4ec9b0",
    white: "#d7dce3",
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

  function fitSafe(resize = false) {
    if (!fit || !term || disposed) return;
    try {
      fit.fit();
      if (resize) invoke("pty_resize", { id, cols: term.cols, rows: term.rows }).catch(() => {});
    } catch {
      /* host non ancora dimensionato */
    }
  }

  onMount(async () => {
    term = new Terminal({
      fontFamily: '"Cascadia Code", "JetBrains Mono", "Fira Code", Consolas, monospace',
      fontSize: 13,
      lineHeight: 1.2,
      cursorBlink: true,
      scrollback: 5000,
      allowProposedApi: true,
      theme,
    });
    fit = new FitAddon();
    term.loadAddon(fit);
    term.open(host);
    fitSafe();

    unlistenData = await listen<string>(`pty-data-${id}`, (e) => term?.write(b64ToBytes(e.payload)));
    unlistenExit = await listen(`pty-exit-${id}`, () =>
      term?.write("\r\n\x1b[90m· processo terminato ·\x1b[0m\r\n"),
    );

    await invoke("pty_spawn", { id, cols: term.cols, rows: term.rows, cwd });
    term.onData((d) => invoke("pty_write", { id, data: d }).catch(() => {}));

    ro = new ResizeObserver(() => fitSafe(true));
    ro.observe(host);
    term.focus();
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
