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
                   ClaudePrompts, UpdateDialog, NoticeCenter · always mounted: UnsavedDialog, Toaster
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

## Explorer: folders or a solution

The Explorer shows the folders as they are on disk or, in a repository with Visual Studio solutions, a
solution the way Visual Studio's Solution Explorer shows it (M70).
- **Switching**: the ⇄ button in the header appears when the repository has a `.sln` or `.slnx`
  (`sln_find`, at every `openRoot`, and again when one appears or disappears). Its menu lists *Folders*
  and the solutions, by path, as Visual Studio's *Switch Views*. The choice is remembered per
  repository (`localStorage`); the first time it's *Folders*.
- **The view** is `SolutionView.svelte`, loaded on demand (`Lazy`): it isn't in the startup chunk.
  - The solution, then its solution folders and projects (folders first, then projects, then
    solution items), as written in the `.sln`/`.slnx`.
  - A project opens on demand (`proj_load`). Inside it:
    - **Dependencies** (SDK projects: Frameworks, Packages, Projects, Assemblies) or **References**
      (old-style and C++);
    - *Properties* first, then folders and files;
    - files nested like Visual Studio does it: `DependentUpon`, then `X.xaml.cs` under `X.xaml`,
      `X.Designer.cs` under `X.cs`/`X.resx`/`X.settings`, `X.resx` under `X.cs`, Razor and
      `appsettings.*.json` files.
  - Linked files carry a small arrow, missing ones are amber. C++ filters are virtual folders.
  - A project reference opens the project it points to (*Go to project*).
- **Show All Files** (the eye in the header) adds, in gray, what the projects leave out: files on disk
  that aren't in the project, and `bin`, `obj` and hidden folders, read when opened. A C++ project then
  shows its folders on disk instead of the filters, as in Visual Studio.
- **Other files**, at the bottom and closed, is the rest of the repository as on disk: the folder tree
  without the project folders and the folders holding nothing but project folders. It uses the same
  nodes as the folder view (expansion, refresh, shelf).
- **The Shelf** works here too since M72: the same section at the bottom, *Add to shelf…*, *Shelve noise
  folders* and *Shelve dot-folders* in the menus of *Other files*, the eye and dragging (see
  [The Shelf](#the-shelf)). Before, shelved folders were hidden from *Other files* with nowhere to find
  them.
- **Context menu**:
  - the solution and the projects have *Build*, *Rebuild*, *Clean*;
  - executable SDK projects also have *Run*;
  - every project has *Edit project file*.

  They run in a terminal tab, like the Run menu: Visual Studio's MSBuild when `vswhere` finds it
  (in PowerShell, so C++ projects build too), otherwise `dotnet build`/`clean`, and `dotnet run`.
  - New, rename and delete work where the disk is the project: SDK projects and their folders, files
    excluded from the project, *Other files*. Old-style and C++ projects, linked files and solution
    items stay read-only, because changing them would mean editing the project file.
- **Live**: the view listens to `fs-changed`.
  - A change to the solution file reloads it.
  - A change to a project file, its `.filters` or `.user`, a `Directory.*` file, a file inside a
    project or a file it links reloads that project.
  - With Show All Files off, changes to ignored files only (a build writing `bin`/`obj`) are skipped.
- **Follow the active file** works here too: the file is found in the project that contains it (read
  if needed), else in *Other files*.
- Git decorations as in the folder view: files by path, a dot on folders, projects and solution folders
  that hold changes.

## The Shelf

Folders and files put aside by category, at the bottom of the Explorer, in the folder view and in the
Solution view (`ShelfSection.svelte`). The data and the rules are in
[Frontend state](01-frontend-state.md#dotorbit-shelf--shelfrules-scratch-run). Since M73:
- **Always there**, empty too, so the feature can be found: open and empty it says *Right-click a folder or
  a file → Add to shelf…, or drag it here*. Not in a light window, which writes nothing in the folder.
- **The header** holds the eye (shelved items shown in the tree, in place and dimmed, with their
  category's color), the ⚙ that opens **Settings → Shelf**, the count, and a git dot while the section is
  closed and something inside has changed.
- **A splitter** on its top edge sets its height (remembered; double-click = automatic, at most 45%).
- **The content** (`ShelfBody.svelte`) loads on demand, out of the startup chunk:
  - categories with their color, a mark when they're hidden from search, a git dot and a menu: *Rename…*
    (inline), *Hide from search and Quick Open*, *Color*, *Delete category*;
  - items shelved by path are the **tree's own nodes** (`TreeRow`, the menu of `treeMenu.ts`): git
    colors, the active file, the full menu with *Shelf…* to change their categories, expansion saved
    with the session. `explorer.nodeAt`/`ensureNode` find them, loading the folders above without
    opening them;
  - rules show what they take (*bin — 12 folders · all repositories*, from `shelf_find`) and open on that
    list, as tree nodes too.
- **Dragging** a folder or a file from the tree (`shelfDrag.svelte.ts`) onto a category shelves it there;
  onto the header, it opens the picker. Only towards the shelf: taking an item out goes through its menu.
- **The picker** (`ShelfPicker.svelte`, on demand): *This folder* (or file), or *All folders matching* a
  name or pattern, *In every repository*, the categories with their colors, a new category, *Remove*.
- Every change shows a toast with **Undo**, which puts back both the repository's shelf and the rules for
  every repository as they were.
- When a name is edited from the shelf (*New…*, *Rename…*), the input appears in the shelf only
  (`edit.where`): with the eye on, the same item is also in the tree.

## Notifications

- **Notices** (`Toaster.svelte`, M74) sit bottom right, all 360 px wide and laid out on one grid, so a
  stack lines up to the pixel:
  `| 12 | icon 28 | 10 | message (detail and list below) | pills | 10 | ✕ 28 | 12 |`. The ✕ is a 28 px circle
  like the icon: easy to hit, and its center is as far from the right edge as the icon's is from the left.
  - The icon sits in a circle tinted with the kind's color (info, success, error, ✦ for a waiting chat); no
    side stripe.
  - Icon, message, pills (*Undo*, *Copy*) and ✕ share one center line. The detail goes below the message,
    on its edge, at most three lines.
  - The ✕ column is there in every notice (on the ones that go away by themselves the ✕ shows on hover), so
    the pills of different notices fall on the same vertical line.
  - The time left is a ring on the edge of the icon's circle (a CSS `@property` animated with the notice's
    duration), paused with the mouse over it, like the timer.
  - Errors stay until closed. Waiting chats: one chat says its name with the repo below; from two on,
    *Chats waiting for you* with the count in a pill and a row per chat (the dot in its tab's color, the
    name, the repo, an arrow under the ✕).
  - They slide in from below, fade out, and the others glide into place (`animate:flip`); still when
    *Smooth panel transitions* is off.
  - The whole notice is clickable when it leads somewhere (a transparent button under the content).
- **The 🔔** at the right of the status bar opens the last 50 notices (`NoticeCenter.svelte`, on demand), on
  the same grid (icon 24, message, time on the right; detail and *Copy* below): grouped by day (*Today*,
  *Yesterday*…), the time relative for the last hour, a dot on the icon of the ones you haven't seen yet
  while the list is open, the seen ones dimmer. Its badge counts the errors and waiting chats you haven't
  seen (red if there's an error). The header turns **Do not disturb** on and off and clears the list; with
  Do not disturb the bell is crossed out.
- The list is above the notices (z-index), so a new notice never covers it.

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
| Frame | `TopBar` (+ `RepoStrip`), `Sidebar`, `PanelStrip`, `Splitter`, `StatusBar` (+ `NoticeCenter`), `Toaster`, `Logo`, `Icon`, `Backdrop`, `Switch`, `ContextMenu`, `Lazy`, `MatchText` |
| Editor area | `EditorArea` (groups, tabs, viewers, drop of OS files), `LazyEditor` → `Editor`, `RelatedBar`, `KindBadge`, `DiffView`, `MarkdownView`, `HtmlView`, `AssetView` (images, PDF), `GitGraph`, `ActivityBoard`, `UnitDigest`, `ChatDigest` |
| Sidebar views | `Explorer` and `SolutionView` (+ `TreeRow`, `ShelfSection` → `ShelfBody`, `ShelfPicker`), `GitPanel`, `SearchView`, `DocsView`, `ActivityPanel` |
| Terminal | `TerminalPanel` (tabs, panes, split menu, floating windows), `LazyTerminal` → `Terminal` |
| Palettes | `QuickOpen`, `SymbolPalette`, `WorkspaceSymbols` |
| Dialogs | `Settings` (+ `SettingsKeyboard`, `EditorCaretPreview`, `TerminalCaretPreview`), `UnsavedDialog`, `UpdateDialog`, `LogViewer`, `WrapperComposer`, `ClaudePrompts` |
| Glyphs | `FileGlyph` (file icons), `Icon` (line-art icons, with a Fluent set for the VS 2026 theme) |
