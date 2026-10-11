# Architecture

The big picture of how Orbit is built. Each area has its own page — see the [index](README.md) — and the
reasons behind every decision are in [`NOTES.md`](../NOTES.md) (Italian, one entry per milestone **M*n***).

## Stack

- **Tauri 2**: a Rust core plus the system WebView (WebView2 on Windows), not Electron.
- **Svelte 5** (runes) **+ Vite + TypeScript**: plain Vite, not SvelteKit.
- **Tailwind v4** for the design tokens (`@theme` in `src/app.css`); components use scoped CSS.
- **CodeMirror 6** for the editor; **xterm.js** in the WebView plus **portable-pty** (ConPTY on Windows) for
  the terminal.
- **git2/libgit2** for local git, **notify** for the file watcher; `tauri-plugin-dialog`,
  `tauri-plugin-clipboard-manager`, `tauri-plugin-updater` (driven from Rust).
- Few dependencies on purpose: every addition is justified in `NOTES.md`, and a lot of the UI (icons,
  splitters, popups, menus) is hand-written.

## One process per window

Every Orbit window is its own process with one `main` webview. A terminal popped out of the panel opens a
second webview in the same process (`term-float-<id>`). The windows cooperate through a small registry of
files in the app config folder (`winsession.rs`): "close all", "reopen all" and the restart after an
update work across processes without any IPC between them. WebView2 shares its browser process between
them, so separate processes cost little memory. See [Persistence](07-persistence.md#the-window-registry).

Inside a window there's **one active folder at a time** (`workspace.rootPath`). Its repository tabs are a
list on top of that: switching swaps the folder, its documents, tree and terminals in one move
([UI shell](02-ui-shell.md), [Persistence](07-persistence.md#switching-repository)).

## Frontend ⇄ backend

```
  WebView (Svelte 5)                                  Rust core (Tauri 2)
 ┌───────────────────────────────────┐   invoke   ┌────────────────────────────────────────┐
 │ components ──▶ state modules       ├──────────▶ │ lib.rs     files, sessions, startup     │
 │ (UI only)      ($state + actions + │            │ git.rs  pty.rs  symbols.rs  refs.rs     │
 │                 invoke calls)      │ ◀──────────┤ activity.rs  watcher.rs  winsession.rs  │
 └───────────────────────────────────┘    events   │ claudeproc.rs  updater.rs               │
                                                   └────────────────────────────────────────┘
```

- **Commands**: the frontend calls `invoke("name", { args })`. Anything slow (git, file reads, search,
  scans) runs off the window's main thread, so a slow `git status` can't freeze the UI (M62). The full
  list is in [Backend](08-backend.md#commands).
- **Events** go the other way: `pty-data-<id>` and `pty-exit-<id>` (terminal output), `fs-changed`
  (watcher), `activity-changed` (Claude transcripts), `update-progress`, `orbit-quit-request` ("close all"
  from another window). Between webviews of the same process, `term-redock` brings a floating terminal
  back.
- The backend owns what needs the OS: files, git, PTYs and processes, scans, windows, updates. The
  frontend owns the UI state and its logic: documents, layout, sessions (serialized as JSON and stored by
  the backend), keyboard, settings.

## Frontend modules

| Kind | Where | Role |
|---|---|---|
| Components | `lib/components/*.svelte` | Presentation and local UI state; they read state modules and call their actions |
| State modules | `lib/state/*.svelte.ts` | The source of truth: a `$state` object, the actions that change it, the `invoke` calls ([Frontend state](01-frontend-state.md)) |
| Editor extensions | `lib/editor/*.ts` | CodeMirror building blocks ([Editor](03-editor.md)) |
| Pure helpers | `lib/*.ts`, `lib/state/*.ts` without runes | Logic with no DOM and no runes, unit-tested with vitest (`util.ts`, `terminalLayout.ts`, `symbolMaps.ts`, `searchText.ts`…) |

**Heavy code loads on demand.** CodeMirror arrives with the first file you open (`LazyEditor.svelte`),
xterm with the first terminal (`LazyTerminal.svelte`), the WebGL renderer only for a visible terminal,
`marked` and DOMPurify on the first Markdown render, and `Lazy.svelte` does the same for overlays, viewers
and the non-default sidebar views. The startup chunk is ~274 KiB (≈93 KiB gzipped) as of M66.

## Repo layout

```
index.html              Vite entry → src/main.ts → App.svelte
src/
  main.ts               mounts App, imports fonts + app.css
  app.css               design tokens: Tailwind @theme + runtime CSS variables
  App.svelte            the window: TopBar | (Sidebar | EditorArea | TerminalPanel) | StatusBar, overlays
  lib/
    components/         Svelte components
    state/              state modules (.svelte.ts) + pure logic with tests (.ts)
    editor/             CodeMirror extensions, outline, active editor
    assets/             the brand wordmark
    util.ts             paths, file icons, language labels, time
    markdown.ts         Markdown → sanitized HTML (lazy) + heading TOC
    clipboard.ts        copy/paste through the Tauri plugin, with an explicit result
    gitgraph.ts         lane layout of the Git Graph
    motion.ts           panelSlide: side panels and strips sliding in and out
    focus.ts            use:focusOnMount
    caretStyles.ts      cursor styles and their options        caretTrail.ts   cursor trails (canvas)
    terminalCaret.ts    the terminal's drawn cursor (+ .css)   terminalTheme.ts  xterm colors
    searchText.ts       search in Settings
src-tauri/
  src/lib.rs            entry: files, sessions, startup, windows, misc commands; run() registers everything
  src/git.rs            git through libgit2
  src/pty.rs            terminals (PTYs) + which Claude chat runs in each
  src/claudeproc.rs     Claude Code's registry of running chats + the process tree
  src/activity.rs       Activity: work units from Claude transcripts
  src/symbols.rs        project symbol index (heuristic parsers, incremental)
  src/refs.rs           code lens references (identifier lexer)
  src/watcher.rs        file watcher → fs-changed
  src/winsession.rs     windows: registry, reopen all, close all, geometry, restart after updates
  src/updater.rs        in-app updates from GitHub releases
  tauri.conf.json       window, bundle, updater endpoint and public key
  tauri.windows.conf.json   Windows overrides (no fileAssociations: "Open with" is in hooks.nsh)
  windows/hooks.nsh     NSIS hooks: "Open with" without becoming the default app
  capabilities/         permissions of the main and floating windows
scripts/                New-Release.ps1 (signed release), measure-orbit*.ps1 (footprint)
docs/                   these pages + README screenshots
NOTES.md                decision log, Italian
CLAUDE.md               tells Claude Code about Orbit and the .orbit/ files
```

## Startup in brief

1. Rust: `winsession` decides what this process opens. A bare launch restores the saved windows,
   respawning the others; a launch with a folder or file opens just that. It then positions the window,
   which is created hidden, and shows it.
2. Frontend: `startup` returns the folder/file, the window key and the light flag. Then:
   - `loadSession` restores the window's repo list, the active folder, its tabs and layout;
   - `restoreTerminals` brings back the terminal tabs, dormant (M66);
   - the default chat starts only if the repo has none;
   - `workspace.ready` turns on;
   - the update checks start.
3. Background work follows: the symbol index (cache first, then a rescan), git status, the file watcher.
   Activity scans its transcripts only when its view opens.

The whole sequence, with switching repository and closing, is in [Persistence](07-persistence.md).

## Conventions

- **UI strings in English; code comments and `NOTES.md` in Italian.** These pages are in English.
- **Minimal dependencies**, each justified in `NOTES.md`; prefer std and built-ins.
- **Pure logic goes in a plain `.ts` with a `*.test.ts`** next to its `.svelte.ts`, so vitest runs it
  without Svelte.
- **Paths** go through `util.ts` (`joinPath`, `relTo`, `normSlash`, `canonPath`, `pathKey`, `samePath`,
  `isUnder`): never re-implement path normalization. Paths enter the workspace canonical (`\` on Windows)
  and are compared with `pathKey` (separators and, on Windows, case don't matter).
- **Focus on mount with `use:focusOnMount`**, never `autofocus`: Svelte 5 applies `autofocus` only when
  nothing else has focus (M60).
- **Radii, colors and heights come from tokens** (`--r-*`, `--color-*`, `--h-*`), never fixed values, so
  a theme can change the whole UI ([Settings](09-settings.md#themes)).
- Reusable primitives: `Backdrop` (overlay that closes on click and Esc), `Switch`, `Icon`, `Splitter`,
  `ContextMenu`, `Lazy`.
