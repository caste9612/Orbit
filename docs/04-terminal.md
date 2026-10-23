# Terminal

A real terminal: xterm.js in the WebView, a PTY in the Rust core (portable-pty, ConPTY on Windows). Each
repository has its own tabs, Claude chats can sit side by side, any terminal can float in its own window,
and the tabs and chats come back when you reopen Orbit.

## Key files

| File | Role |
|---|---|
| `src-tauri/src/pty.rs` | PTYs keyed by tab id: spawn, write, resize, kill, alive, shells list; output as events; which Claude chat runs in each |
| `components/Terminal.svelte` (via `LazyTerminal`) | One xterm: PTY attach, fit, WebGL, links, clipboard, theme, the drawn cursor |
| `components/TerminalPanel.svelte` | The panel: tabs of the active repo, side-by-side panes, split menu, floating windows, waking restored tabs |
| `state/terminals.svelte.ts` | The tab model, panes per repo, attention |
| `state/paneLayout.ts` | Pane layout, sizes and geometry (pure, tested), shared with the editor groups since M72 |
| `state/terminalPersist.svelte.ts` | Saving and restoring the tabs (M66) |
| `lib/terminalCaret.ts` + `.css` | The cursor Orbit draws over xterm (M63) |
| `lib/terminalTheme.ts` | xterm colors from the active theme |

## Lifecycle of a terminal

- A tab is a `TermSession` with:
  - `id` (`term-N`), also the PTY key;
  - `title`, `shortName`, `customTitle`, `autoTitle`, `color`;
  - `shell`, `cwd`, `root` (its repo);
  - `initCommand` (sent once), `kind` (`shell`/`claude`/`run`), `chat`, `dormant`.
- **The PTY outlives the component.** `pty_spawn` is idempotent:
  - if the id already exists, it returns `false` and the component only re-attaches;
  - the `initCommand` is never typed into a program already running (a `claude` would receive it as
    input).
  - This is how a running chat survives a hidden panel, a pane rearrangement or a floating window.
- **Output** travels as `pty-data-<id>` events (base64). The backend coalesces reads within ~8 ms into
  one event under heavy output. `pty-exit-<id>` prints "· process exited ·".
- **Input**: `term.onData` → `pty_write`. **Size**: `pty_resize` after a debounced fit, and only once
  after a layout motion.
- **Geometry**: xterm opens in an inner `.term-fit` div with **no padding**; the FitAddon measures the
  parent and miscounted rows when it had padding. The viewport gets the theme background, otherwise
  xterm's CSS paints the sub-row remainder black.
- **Scrollback**: the *Terminal scrollback* setting, 1,000–10,000 lines (default 3,000), applied live.
- Closing a tab kills the PTY (`closeTerminal`). The app kills every PTY on exit (`PtyManager::kill_all`).

## GPU rendering

xterm's WebGL addon (on by default since M62) is attached only while the terminal is visible: an
`IntersectionObserver` on the host attaches it, and it's released 3 s after the terminal disappears
(another repo, another tab, a hidden panel). xterm falls back to its DOM renderer by itself.
- Before, every mounted terminal kept a context and a glyph atlas in VRAM, and Chromium silently dropped
  the oldest beyond ~16 contexts.
- With Claude's spinner running, WebGL costs about 2.6× less CPU than the DOM renderer.

## The panel and side-by-side chats

- `TerminalPanel` shows only the tabs whose `root` is the active repo. Every tab of every repo stays
  mounted (hidden ones are `display: none`), so switching never restarts a process.
- **Names and colors**:
  - `shortName` is minimal and numbered per kind (`Claude 2`, `pwsh 1`; run configs keep their name);
  - `customTitle` comes from a rename (double-click);
  - `autoTitle` is the chat summary Claude Code writes in the terminal title (OSC 0/2). It's shown as a
    subtitle for chats only; shells put paths there, which is noise;
  - `color` rotates through the Activity session palette.
- **Panes** (M54–M55): up to six terminals of the repo side by side (`MAX_PANES`; four until M72),
  absolutely positioned on one surface. Moving a chat in or out of a pane never remounts xterm.
- **The layout model** (`paneLayout.ts`, called `terminalLayout.ts` until M72) is *columns of rows*,
  `Layout = string[][]`:
  - `insertPane`: a left/right drop makes a column, a top/bottom drop makes a row;
  - `replacePane` and `removePane`;
  - `arrangeAuto` chooses side by side, grid or stacked by how close the smallest pane stays to 480×260.
    With five or six chats the three-column grid wins ties (M72): on a 4K screen six 510 px columns would
    fit, but 3×2 gives each chat twice the width;
  - `placeBeside` is the direction-less "to the side".
- **Geometry** is pure too since M72, shared with the editor groups: `sizesFor` (saved sizes if the shape
  matches, else even), `paneGeometry` (the rectangles and the splitters, with a 4 px gap here) and
  `resizePanes` (dragging a splitter, never below 140 px).
- **Per-repo layout state**: `layouts` holds the structure. `autoLayout` says whether it still reflows
  with the space; a directional drop, a separator drag or a menu choice make it manual.
- Pane sizes are fractions, valid while the shape is unchanged.
- **Gestures**: drag a tab or a pane header (drop on an edge to split, on the center to swap); the split
  menu; *New Claude chat*; `launchClaude(…, { side: true })`. Dragging the visible chat onto its own
  edge splits it with the most recently used other tab (`splitPartner`).
- **Zoom** one pane temporarily (`toggleZoom`); **maximize** the panel over the editor
  (`layout.terminalMaximized`).

## Floating windows

- *Pop out* opens a `term-float-<id>` webview attached to the **same PTY**, so the chat keeps running.
  Several can float at once.
- The tab leaves the panel but stays in `terminals.floating`, with its kind and chat.
- Closing the floating window, or *Dock*, emits `term-redock`. `redockTerminal` checks `pty_alive` first,
  so a finished session never leaves a zombie tab.
- The floating window has its own title bar with a folder + branch badge (passed as URL parameters) and
  an always-on-top pin.
- Closing Orbit's main window ends the process and takes the floating windows with it (M66). They come
  back as tabs at the next start.

## Attention: a terminal waiting for you

- Claude rings the bell when it finishes a turn or waits for input; Orbit turns it on with
  `preferredNotifChannel: "terminal_bell"` in the project's `.claude/settings.local.json`.
- `notifyTerminalBell` marks the tab only if you aren't actually using that terminal (real xterm focus,
  not just window focus). It then shows:
  - a dot on the tab and on the repo tab;
  - a sticky, clickable toast that takes you there (`goToTerminal`);
  - the **Waiting (N)** pill;
  - `●` in the window title, and the taskbar flag while Orbit is in the background.
- A chat already in view only pulses its pane header.
- Attention dots pulse four times, then stay on (M62).

## Links, clipboard, input

- **Paths** in the output are links: `resolve_existing` tries absolute, then relative to the terminal's
  cwd, then the project root; the first that exists opens.
- **URLs** open in the browser via `open_url` (http/https only).
- **Paste**:
  - with mouse tracking on (a TUI such as Claude Code), right-click is left to the program, so it pastes
    once with its own handling. This fixed the double paste;
  - `Shift`+right-click and `Ctrl+Shift+V` force Orbit's paste;
  - in a plain shell, Orbit always pastes.
- **OSC 52** (a program setting the clipboard) is honored, so Claude's "copied to clipboard" reaches the
  system clipboard.
- The browser's caret in xterm's hidden textarea is made transparent, so it never shows as a second
  cursor.

## The cursor

xterm can't animate its cursor, so Orbit draws one (M63, `terminalCaret.ts`):
- xterm's own cursor is a transparent 1 px bar;
- an overlay on `.xterm-screen` follows `buffer.cursorX/Y` after every render. A frame only sees the
  final position, so a TUI redraw doesn't make it jump;
- it hides when the program hides the cursor (`?25l`, read from xterm's state or a parser hook);
- moves under 70 ms apart and longer than a cell **snap**, without glide or trail. Fast output and
  Claude's redraws never animate it;
- **shape**: a bar in Claude chats, a block in shells, a hollow block when the terminal isn't focused.
  The styles are the same as in the editor ([Settings](09-settings.md#cursor-styles)).

## Run configurations and jobs

- `.orbit/run.json` entries (the Run menu) open a tab with an `initCommand`; their `kind` is `run`.
- `runFile` runs a script by its interpreter (`.ps1`, `.cmd`, `.bat`, `.sh`) in its folder.
- Git fetch, pull, push and merge are `run` tabs too, so they use your git credentials.
- Jobs are not restored after a restart.

## Restore after a restart

Since M66 every window saves its terminal tabs and brings them back:
- **What's saved** (`terminalPersist`): for every repo of the window, under `<winKey>|#terminals`:
  - the tabs: name, color, folder, shell, kind, and for chats the conversation id and its folder;
  - the active tab;
  - the panes (layout, mode, sizes).
  - Popped-out tabs are included; `run` tabs are not.
  - Saving is debounced on every change, plus a final save before the window closes (`onBeforeQuit`).
- **Which conversation a tab shows** comes from Claude Code's registry of running chats, refreshed every
  15 s and before closing ([Claude](05-claude.md#which-conversation-runs-in-a-tab)). It also covers a
  `claude` started by hand in a shell.
- **Coming back**:
  - `restoreTerminals` recreates the tabs **dormant**: no PTY, no process;
  - `TerminalPanel` wakes the tabs in view (`wakeTerminal`). The others wake when you open them, so a
    launch doesn't start a process per chat;
  - a chat restarts with `claude --resume <id>` in its folder, using its repo's `.orbit/claude.json`
    (`claude.chatCommand`). If the transcript is gone (a chat opened and never used), it restarts as a
    new chat;
  - shells restart fresh, without their old output.
- The default chat at startup (*Launch Claude in the default terminal*) starts only when the repo has no
  restored tabs.
- The same path brings the terminals of a repo **moved to a new window** (M69) back in that window: they
  are written under its key before it starts, and closed here
  ([Persistence](07-persistence.md#a-repo-moved-to-a-new-window)).
