# UI shell

The window frame: how `App.svelte` assembles the panels, the top bar with the repository tabs, the side
panels and their strips, the layout motion, and the map of all components.

## The window

```
┌ TopBar ── views · back/forward · repo tabs · tools · window controls ─────────────────────────┐
│ PanelStrip │ Sidebar │╎│ EditorArea                     │╎│ TerminalPanel        │ PanelStrip │
│ (collapsed)│         │ │ groups · tabs · editor/viewers │ │ tabs · side by side  │ (collapsed)│
└ StatusBar ── branch · symbols · cursor · encoding · language ──────────────────────────────────┘
  overlays (lazy): QuickOpen, SymbolPalette, WorkspaceSymbols, Settings, LogViewer, WrapperComposer,
                   ClaudePrompts, UpdateDialog · always mounted: UnsavedDialog, Toaster
```

- `App.svelte` mounts the frame. On mount it applies the settings, loads the session, restores the
  terminals and sets `workspace.ready` (startup in [Persistence](07-persistence.md#startup)).
- It also listens to the backend events (`fs-changed`, `orbit-quit-request`, `term-redock`) and to the
  window close request.
- **Window chrome**: decorations are off; `TopBar` draws the title area, the drag region and the window
  controls. The window title follows the project (`<project> — Orbit`), so instances are easy to tell
  apart.
- **Keyboard**: one window-level `keydown` (`onKey` in `App.svelte`) asks
  `keybindings.matchCommand(e)` and runs the command, so the active preset applies everywhere. `Ctrl+1…9`
  selects a repo. `Ctrl+wheel` zooms the font of the panel under the pointer; over an image, the image
  zooms instead.
- The native WebView menu and drag are suppressed app-wide (`oncontextmenu`/`ondragstart` on the
  window). They're kept in inputs and in the editor for text drag.
- **Floating terminals** reuse `App.svelte`: a window whose label starts with `term-float` shows only
  one terminal and its own small title bar ([Terminal](04-terminal.md#floating-windows)).

## Top bar and repository tabs

- **Views** (Explorer, Git, Search, Docs, Activity) select the sidebar view; clicking the active one
  collapses the sidebar (`layout.selectView`).
- **Repo tabs** (`RepoStrip.svelte`, over `folders`):
  - centered in the bar;
  - `Ctrl+Tab`/`Ctrl+Shift+Tab` cycle, `Ctrl+1…9` jump;
  - each repo has a color (`repoColors.svelte.ts`), shown on its folder icon. It's automatic, from the
    terminal tab palette by a hash of the path, or picked from the tab's context menu;
  - a dot on the tab of a repo whose terminal is waiting for you.
- **When they don't fit** (M69), `repoStrip.ts` (pure, tested) plans the strip:
  - repos collapse from the **right** into 30 px chips with their initials on their color. The ones on
    the left stay full tabs, so the order decides which stay readable;
  - the first **three** stay full tabs while they fit (`KEEP_FULL`): before one of them collapses, the
    last chips go into a **+N** chip, with the waiting dot if one of them waits. Its menu lists them,
    then *Add folder…*. With room for more than three, every repo stays visible, full or as a chip;
  - the active repo is always a full tab, in its place, and counts among the three: if it sits among the
    chips, the last full tab on its left gives way;
  - hovering a chip shows a card with branch, waiting chats and changed files (`git_status` on hover,
    cached 10 s).
  - Natural widths come from an invisible copy of the strip with every repo as a full tab. The tabs get
    explicit widths, so they change size with the layout motion when repos are switched, added or
    reordered, and at once while the window resizes.
- **Moving the window** (M69): the strip keeps 56 px free on each side (`gripFor`). In a narrow window
  the free sides shrink first, down to 12 px, so the active tab stays whole.
  - The spacer and the logo are `data-tauri-drag-region="deep"`: any point that isn't a button drags the
    window, the gaps between tabs and the 4 px above them included. The tabs opt out with `"false"`, so
    reordering keeps working.
  - Before M69 only direct clicks on the empty spacer counted, and the logo didn't (the click lands on
    the SVG): with many repos only 3–4 px strips were left.
- **Drag to reorder** is pointer-based, like the editor tabs. HTML5 drag and drop is off, because the
  OS file drop needs `dragDropEnabled`:
  - a 5 px threshold separates a click from a drag;
  - the dragged tab follows the pointer and the others shift by one slot;
  - `moveFolder` reorders only on drop; a chip dropped among the full tabs becomes one then.
  - Dragged more than 28 px **below the bar**, the tab stays dimmed in place and a label follows the
    pointer: on release the repo opens in a new window there (`repoWindow.ts`, see
    [Persistence](07-persistence.md#a-repo-moved-to-a-new-window)).
- **Tab context menu**: color (or *Automatic*), *Move to new window*, *Remove from list*. Chips have no
  ✕, so removing one goes through here.
- **Narrow widths**: the fixed clusters never shrink. Only the repo strip absorbs the squeeze (free
  sides, then chips, then **+N**), and below 980 logical px the views lose their labels. Everything,
  window close button included, stays reachable down to the 720 px minimum width.
- **Tools**: scratchpad, Claude menu, Run menu, new window, close all, settings. A **Waiting (N)** pill
  appears when chats wait, and an **Update** pill when a new version is out.

## Sidebar and panel strips

- `Sidebar.svelte` hosts the views. The non-default ones load lazily, and during a repo switch
  (`workspace.switching`) they stay mounted, so "Open folder…" never flashes.
- **Collapsible panels** (M57): when `sidebarVisible` or `terminalVisible` is false, the panel is
  replaced by `PanelStrip.svelte`, a vertical bar as thick as the status bar.
  - On the left it holds the views, with a changes dot on Git.
  - On the right it holds the repo's terminal tabs, in their colors and with the attention dot.
  - « and » collapse and expand. Panel and strip swap in one motion (`panelSlide`, `lib/motion.ts`).
- **Splitters** (`Splitter.svelte`, pointer events) resize sidebar and terminal panel. Dragging is
  immediate, never animated.

## Layout motion

Programmatic layout changes animate as **one** motion (M56):
- switching repository;
- the editor collapsing or expanding;
- maximizing the terminal panel;
- showing or hiding a panel;
- arranging chats.

- `layout.beginMotion()` sets `layout.animating` and returns `end()`; `animate(fn)` is the synchronous
  form. Calls nest: `switchFolder` keeps one motion open across its awaits.
- Components turn their CSS transitions on only while `animating` is true (`.sidebar.animating`,
  `.terminal-panel.animating`, `.editor-area.animating`), for `--motion-ms`.
- That token comes from the *Smooth panel transitions* setting, not from `prefers-reduced-motion`,
  which is always on when Windows' animation effects are off.
- `panelSlide` slides the side panels and strips. Unlike Svelte's `slide`, it keeps the side borders at
  0 for the whole transition (Chromium rounds a 0–1 px border up to 1 px) and forces `flex-grow: 0`.
  Its duration is 0 until `workspace.ready`, so startup never animates.
- Terminals refit **once**, about 40 ms after the motion ends (`motionUntil()` in `scheduleFit`), instead
  of resizing the PTY at every frame.
- Terminal panes keep their own transition, turned off (`.still`) while the surface itself is resizing.
- **One motion per repo switch** (M65): every target is decided up front from the saved session, and
  the editor auto-collapse waits for the end of `workspace.switching` (see below).

## Editor auto-collapse

- When no group has a tab and the terminal panel is visible, the editor shrinks to its 220 px minimum
  (`.editor-area.collapsed`, the welcome reduced to the logo). The terminal panel then fills the rest
  (`.terminal-panel.fill`), and the splitter becomes a fixed gap.
- An `$effect` in `App.svelte` drives it:
  - closing the last tab collapses after a 400 ms grace period, so close-then-open doesn't resize the
    PTYs;
  - opening a file expands immediately.
- During startup and a repo switch the effect stays out: `loadSession` decides the collapse from the
  saved tabs, together with the panel widths.
  - Before M65, a slow restore (over 400 ms) collapsed the editor and re-expanded it when the tabs
    arrived.
  - At the end of a switch, `settleEditorCollapsed` aligns it with the tabs actually open, inside the
    same motion.
- `terminalWidth` is never touched, so opening a file brings the previous layout back.

## Light window

A file opened on its own ("Open with", a double-click) opens in a **light window** (M57):
- `startup()` returns `light: true` when the first argument is a file;
- `persist.openLight(dir, file)` collapses both panels and opens the folder as context only: a
  non-recursive watch, no git status.

In a light window:
- no session is read or saved, and there's no "reopen all" entry;
- no repo tab and no symbol index;
- nothing is written in the folder (no `.orbit/`, no `.claude/`);
- the project tools are hidden.

**Open «X» as project** (`promoteLight`) turns the window into a normal project on the repo containing
the file. It keeps the open files and adopts the terminals.

## Component map

| Area | Components |
|---|---|
| Frame | `TopBar` (+ `RepoStrip`), `Sidebar`, `PanelStrip`, `Splitter`, `StatusBar`, `Toaster`, `Logo`, `Icon`, `Backdrop`, `Switch`, `ContextMenu`, `Lazy`, `MatchText` |
| Editor area | `EditorArea` (groups, tabs, viewers, drop of OS files), `LazyEditor` → `Editor`, `RelatedBar`, `KindBadge`, `DiffView`, `MarkdownView`, `HtmlView`, `AssetView` (images, PDF), `GitGraph`, `ActivityBoard`, `UnitDigest`, `ChatDigest` |
| Sidebar views | `Explorer` (+ `MiniTree`, `ShelfPicker`), `GitPanel`, `SearchView`, `DocsView`, `ActivityPanel` |
| Terminal | `TerminalPanel` (tabs, panes, split menu, floating windows), `LazyTerminal` → `Terminal` |
| Palettes | `QuickOpen`, `SymbolPalette`, `WorkspaceSymbols` |
| Dialogs | `Settings` (+ `SettingsKeyboard`, `EditorCaretPreview`, `TerminalCaretPreview`), `UnsavedDialog`, `UpdateDialog`, `LogViewer`, `WrapperComposer`, `ClaudePrompts` |
| Glyphs | `FileGlyph` (file icons), `Icon` (line-art icons, with a Fluent set for the VS 2026 theme) |
