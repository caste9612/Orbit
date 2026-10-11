<script lang="ts">
  // Impostazioni → Terminal → Cursor (M64): un piccolo terminale per provare il cursore scelto, in una
  // shell o in una chat di Claude. Nessun processo dietro: l'eco dei tasti la fa questo componente
  // (testo, frecce, Home/End, Invio, Backspace), il cursore è lo stesso dei terminali veri (TerminalCaret).
  import { onMount, onDestroy, untrack } from "svelte";
  import { Terminal } from "@xterm/xterm";
  import { FitAddon } from "@xterm/addon-fit";
  import "@xterm/xterm/css/xterm.css";
  import Icon from "./Icon.svelte";
  import { TerminalCaret } from "../terminalCaret";
  import { xtermTheme } from "../terminalTheme";
  import { settings, monoStack } from "../state/settings.svelte";

  const ROWS = 5;
  const PROMPT = { shell: "\x1b[32m~/orbit\x1b[0m \x1b[34m$\x1b[0m ", chat: "\x1b[2m>\x1b[0m " };
  const PROMPT_LEN = { shell: 10, chat: 2 }; // caratteri visibili del prompt
  const INTRO = {
    shell: "\x1b[2m# click and type: arrows, Home/End and Enter move the cursor\x1b[0m",
    chat: "\x1b[2mClaude chats have their own cursor shape. Type a message:\x1b[0m",
  };

  let chat = $state(false);
  let fitHost: HTMLDivElement;
  let term: Terminal | undefined;
  let fit: FitAddon | undefined;
  let caret: TerminalCaret | undefined;
  let ro: ResizeObserver | undefined;
  let line = ""; // testo scritto dopo il prompt
  let at = 0; // posizione del cursore in `line`

  const mode = () => (chat ? "chat" : "shell");

  function restart() {
    if (!term) return;
    line = "";
    at = 0;
    term.reset();
    term.write(`${INTRO[mode()]}\r\n${PROMPT[mode()]}`);
  }

  function newPrompt(prefix = "") {
    line = "";
    at = 0;
    term?.write(`${prefix}\r\n${PROMPT[mode()]}`);
  }

  function onData(d: string) {
    if (!term) return;
    switch (d) {
      case "\r":
        return newPrompt();
      case "\x03": // Ctrl+C
        return newPrompt("^C");
      case "\x7f":
      case "\b":
        if (at > 0) {
          const rest = line.slice(at);
          line = line.slice(0, at - 1) + rest;
          at--;
          term.write("\b" + rest + " " + "\b".repeat(rest.length + 1));
        }
        return;
      case "\x1b[D":
      case "\x1bOD":
        if (at > 0) {
          at--;
          term.write("\x1b[D");
        }
        return;
      case "\x1b[C":
      case "\x1bOC":
        if (at < line.length) {
          at++;
          term.write("\x1b[C");
        }
        return;
      case "\x1b[H":
      case "\x1bOH":
      case "\x01": // Home / Ctrl+A
        if (at > 0) term.write(`\x1b[${at}D`);
        at = 0;
        return;
      case "\x1b[F":
      case "\x1bOF":
      case "\x05": // End / Ctrl+E
        if (at < line.length) term.write(`\x1b[${line.length - at}C`);
        at = line.length;
        return;
    }
    if (d.startsWith("\x1b")) return; // altri tasti speciali: niente
    // testo (anche incollato): solo caratteri stampabili, dentro la riga
    const room = term.cols - PROMPT_LEN[mode()] - 1 - line.length;
    const text = [...d].filter((ch) => ch >= " " && ch !== "\x7f").join("").slice(0, Math.max(0, room));
    if (!text) return;
    const rest = line.slice(at);
    line = line.slice(0, at) + text + rest;
    at += text.length;
    term.write(text + rest + "\b".repeat(rest.length));
  }

  /** Colonne secondo la larghezza; le righe restano ROWS (l'altezza la dà xterm). */
  function refit() {
    const d = fit?.proposeDimensions();
    if (term && d && d.cols > 0 && d.cols !== term.cols) term.resize(d.cols, ROWS);
  }

  onMount(() => {
    term = new Terminal({
      fontFamily: monoStack(settings.fontMono),
      fontSize: settings.terminalFontSize,
      lineHeight: 1.2,
      cols: 60,
      rows: ROWS,
      scrollback: 0,
      // come Terminal.svelte: il cursore di xterm è una barra trasparente, lo disegna TerminalCaret
      cursorBlink: false,
      cursorStyle: "bar",
      cursorWidth: 1,
      cursorInactiveStyle: "none",
      theme: xtermTheme(),
    });
    fit = new FitAddon();
    term.loadAddon(fit);
    term.open(fitHost);
    term.onData(onData);
    caret = new TerminalCaret(term, () => settings.termCaret, () => chat);
    ro = new ResizeObserver(refit);
    ro.observe(fitHost);
    refit();
    restart();
  });

  // stile del cursore o shell/chat cambiati: ridisegna (come i terminali veri)
  $effect(() => {
    void { ...settings.termCaret };
    void chat;
    untrack(() => caret?.refresh());
  });
  $effect(() => {
    const th = xtermTheme();
    untrack(() => {
      if (term) term.options.theme = th;
    });
  });
  $effect(() => {
    const fam = monoStack(settings.fontMono);
    const sz = settings.terminalFontSize;
    untrack(() => {
      if (!term) return;
      term.options.fontFamily = fam;
      term.options.fontSize = sz;
      refit();
    });
  });

  function setChat(v: boolean) {
    if (chat === v) return;
    chat = v;
    restart();
    term?.focus();
  }

  onDestroy(() => {
    ro?.disconnect();
    caret?.dispose();
    term?.dispose();
  });
</script>

<div class="tprev">
  <!-- due schede come nel pannello dei terminali: shell e chat di Claude hanno forme diverse -->
  <div class="tabs" role="tablist" aria-label="Preview as">
    <button role="tab" aria-selected={!chat} class:on={!chat} onclick={() => setChat(false)}>
      <Icon name="terminal" size={12} strokeWidth={1.8} />Shell
    </button>
    <button role="tab" aria-selected={chat} class:on={chat} onclick={() => setChat(true)}>
      <Icon name="sparkles" size={12} strokeWidth={1.8} />Claude chat
    </button>
  </div>
  <div class="tbody">
    <div class="tfit" bind:this={fitHost}></div>
  </div>
</div>

<style>
  .tprev {
    border: 1px solid var(--color-line-strong);
    border-radius: var(--r-md);
    overflow: hidden;
  }
  .tabs {
    display: flex;
    gap: 2px;
    padding: 3px 4px 0;
    background: var(--color-surface-2);
    border-bottom: 1px solid var(--color-line);
  }
  .tabs button {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    height: 24px;
    padding: 0 10px;
    border: 0;
    border-radius: var(--r-sm) var(--r-sm) 0 0;
    background: transparent;
    color: var(--color-ink-muted);
    font-family: var(--font-sans);
    font-size: 11.5px;
    cursor: pointer;
  }
  .tabs button:hover {
    color: var(--color-ink);
  }
  .tabs button.on {
    background: var(--color-surface-1);
    color: var(--color-ink);
  }
  .tbody {
    padding: 6px 4px 6px 10px; /* come .term in Terminal.svelte */
    background: var(--color-surface-1);
    cursor: text;
  }
  .tbody :global(.xterm-viewport) {
    background-color: var(--color-surface-1);
  }
  /* il caret del browser nella textarea nascosta di xterm sarebbe un secondo cursore */
  .tbody :global(.xterm-helper-textarea) {
    caret-color: transparent !important;
  }
</style>
