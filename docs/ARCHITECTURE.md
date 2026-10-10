# Architecture

A map of how Orbit is built, for anyone picking the project up. For the *why* behind each
decision (and the per‑dependency justification), see the chronological log in
[`NOTES.md`](../NOTES.md) (Italian).

## Stack

- **Tauri 2** (Rust core + the system WebView) — not Electron.
- **Svelte 5 + Vite + TypeScript** (plain Vite, not SvelteKit).
- **Tailwind v4** (CSS‑first `@theme` tokens) for the dark theme.
- **CodeMirror 6** (editor), **xterm.js + portable‑pty** (terminal).
- **git2 / libgit2** (local git), **notify** (file watcher).

## Repo layout

```
index.html            # Vite entry → src/main.ts → App.svelte
src/
  main.ts             # mounts App, imports fonts + app.css
  app.css             # Tailwind @theme tokens + CSS variables (single source of truth)
  App.svelte          # window shell: TopBar | (Sidebar | Editor | Terminal) | StatusBar
  lib/
    components/       # UI (Svelte components)
    state/            # reactive state + actions (Svelte 5 runes in .svelte.ts);
                      #   plain .ts helpers: dotorbit.ts (.orbit config), projectFiles.ts (list_files cache),
                      #   scratch.ts (scratchpad); pure, vitest-tested logic: shelfRules.ts, terminalLayout.ts,
                      #   editorTabs.ts
    editor/           # CodeMirror extensions (theme, indent guides, git gutter, semantic overlay, code lens) + outline.ts (symbols), activeEditor.ts
    assets/           # orbit-wordmark.svg (the brand wordmark as vector paths)
    util.ts           # pure helpers (paths, file icons, language label, time)
    markdown.ts       # Markdown → sanitized HTML (marked + DOMPurify, lazy) + heading TOC
    clipboard.ts      # centralized copy/paste: Tauri clipboard plugin + navigator fallback, explicit success
    gitgraph.ts       # Git Graph lane layout (pure): commits + parents → lanes and segments to draw
    motion.ts         # panelSlide: side transition of the shell panels, strips and splitters (M57)
    focus.ts          # focusOnMount: focus (and select) an input on mount — Svelte 5's autofocus doesn't (M60)
src-tauri/
  src/lib.rs          # Rust entry: fs/session/window commands + run() (registers all)
  src/git.rs          # git commands (libgit2), incl. git_graph (branch/commit graph)
  src/activity.rs     # Activity: work units from Claude transcripts (scan_activity, watch_activity)
  src/pty.rs          # terminal/PTY commands
  src/watcher.rs      # file watcher (emits "fs-changed")
  src/symbols.rs      # heuristic project symbol scanner (scan_symbols) — no LSP, std only
  src/refs.rs         # code lens references: identifier lexer (no comments/strings), counts by name, ref_list
  src/winsession.rs   # multi-window session: per-window registry, reopen-all + close-all, geometry (replaces winstate)
  src/updater.rs      # in-app updates from GitHub releases (tauri-plugin-updater driven by own commands)
  tauri.conf.json     # window, bundle, productName "Orbit"
  tauri.windows.conf.json # Windows overrides: no bundle.fileAssociations ("Open with" lives in hooks.nsh)
  capabilities/       # Tauri permission capabilities
  windows/hooks.nsh   # NSIS hooks: Orbit in "Open with" without becoming the default; hands back older defaults
scripts/New-Release.ps1 # release: version check, signed installers, latest.json, GitHub release (-Publish)
scripts/              # footprint measurement (measure-orbit.ps1, measure-orbit-ram.ps1)
app-icon.svg          # brand mark, single source of the OS icons (see Theming → Brand mark)
docs/                 # this doc + screenshots
NOTES.md              # decision log (per milestone), Italian
CLAUDE.md             # tells Claude Code the .orbit/run.json + .orbit/claude.json formats
```

## Frontend architecture

Three kinds of frontend module, kept separate:

1. **Components** (`lib/components/*.svelte`) — presentation + local UI state only. They read
   global state and call actions; they don't own domain logic.
2. **State modules** (`lib/state/*.svelte.ts`) — the source of truth. Each exports a
   `$state(...)` object plus the actions that mutate it and the `invoke()` calls to the backend.
3. **Editor extensions** (`lib/editor/*.ts`) — CodeMirror 6 building blocks.

### State modules (`lib/state/`)

| Module | Owns |
|---|---|
| `workspace` | open folder (+ `switching`: true while `switchFolder` swaps roots, so the sidebar keeps the old views instead of flashing "no folder"), document pool (kinds: file/diff/image/pdf/activity/gitgraph), **editor groups** (split view) + active group/tab, branch; `openFile`, `openInNewGroup`, `moveTab`, `splitWithTab`, `closeTab` / **`closeTabs`** (several at once, M58 — the next active tab comes from the pure `editorTabs.nextActive`), `saveActive`, **`autosaveAll`** (IntelliJ‑style), a `beforeNavigate` hook (feeds the nav history), per‑group `previews` (md/html source ⇄ preview, default from `settings.mdMode`), `openPreviewToSide`, **light window** flags (`light`, `lightProject`: a file opened on its own — see *Light window*), … |
| `folders` | the **open repositories** list for the top‑bar switcher — **per‑window**: in‑memory `$state` only (NOT global localStorage, which is shared across instances and caused clobbering), persisted in the active folder's session as `repos` and reseeded by `loadSession({repos:true})` at window startup; `addFolder`/`removeFolder`/`setFolders`/`openFromList`/`cycleRepo`/`selectRepoIndex`/**`moveFolder`** (drag‑to‑reorder in the top bar; the order persists through `repos`) — switching the active repo reuses `persist.switchFolder` (one active root at a time) |
| `explorer` | the lazy file tree + inline file ops (new/rename/delete); **reveal active file** (`revealInTree`, used by "follow active file"); `copyPath` / `copyRelPath` / `revealPath`, shared by the tree and the editor-tab menus |
| `git` | status, diff, branches, commit, discard, history, **gutter `tick`**, tree decorations, **upstream ahead/behind + fetch/pull/push/merge**; `workdir` (repo root from `git_status`) and `gitRel(path)`: git paths are relative to the repo root, which is above the open folder when a **subfolder** is opened (M59) |
| `terminals` | terminal tabs (id/title/shortName/customTitle/autoTitle/color/shell/cwd) + active tab + `focusedId` (real xterm focus); **bell attention** (`notifyTerminalBell`: Claude rings the bell — Orbit enables `preferredNotifChannel:terminal_bell` on launch — → dot on the **repo's tab** + on the session tab + a **sticky, clickable attention toast** (click → `goToTerminal`: switch repo, reveal panel, focus the tab) + a top‑bar **Waiting (N)** pill; persists via title `●` + taskbar `requestUserAttention` while you're away; cleared on focus/open via `clearAttention`→`dismissByKey`); **per‑repo**: each session is tagged with its `root` so the tab bar shows only the active repo's terminals (all stay mounted, PTYs alive); **side‑by‑side panes** per repo (`layouts[rootKey]` columns‑of‑rows, `autoLayout`, `sizes`, `zoomId`; `splitWith`/`showInPane`/`closePane`/`toggleZoom`/`setArrangement`/`setSizes`; invariant: `activeId` is always one of the visible panes — see *Chats side by side*); most‑recently‑used tabs per repo (`recentByRoot`) for the **self split** (`selfSplitPartner`); `adoptTerminals` (tabs follow a promoted light window, or the first folder opened); `tabIcon` (shared by panel and strip) |
| `run` | `.orbit/run.json` run configs + "Set up for Claude" |
| `claude` | Claude launcher + **shortcuts** + **wrappers** (`.orbit/claude.json`); opens `claude` in a terminal; the wrapper composer copies the composed prompt to the clipboard; **quick add/remove** of prompts & wrappers (`ClaudePrompts.svelte` → writes `claude.json`); invalid JSON **warns** (toast) and keeps the menu instead of silently resetting |
| `shelf` | shelved folders by category — per‑path entries (`shelved`) **and by‑name rules** (`byName`: hides every folder with that name, incl. nested or recreated — e.g. C# `bin`/`obj`); `.orbit/shelf.json`. Pure hide/group logic split into `shelfRules.ts` (unit‑tested) |
| `search` | project text search (debounced) |
| `quickopen` | Ctrl+P fuzzy file finder |
| `symbols` | **Go to Symbol** palette (Ctrl+Shift+O): outline of the active editor + fuzzy filter |
| `codeIndex` | **project symbol index** (the "address book") from `scan_symbols`, cached in `.orbit/index/`: **Go to definition** (F12/Ctrl+click), **Project symbols** palette (Ctrl+T), the related‑bar context (`contextAt`), the **semantic‑overlay name sets** (`semSets`/`semIndex` → type & function names for the editor overlay), the **code lens** data (`refs` counts from `index/refs.json`, `lensesFor`, `openReferences`/`openImplementations`), and the **back/forward nav history** (records jumps *and* file/tab switches; `nav` counts drive the top‑bar arrows) |
| `keybindings` | central **command registry** + keyboard matcher/dispatch, with per‑preset keys (Orbit/VS/IntelliJ) **plus a user‑built `custom` keymap** (`settings.customKeys`, rebind per command) and the shortcuts‑reference panel; `keyStringFromEvent` captures a rebind, `conflictKeys` flags duplicates |
| `activity` | **Activity** view: work units from `scan_activity` across all `~/.claude/projects` (prompt‑first segmentation in Rust); project on/off toggles `activityPrefs` (persisted, hides noise) + `openActivity`; live refresh via `watch_activity`→`activity-changed` |
| `scratch` | one‑click persistent plain‑text scratchpad (`.orbit/scratch.txt`) for notes/prompts; renames a legacy `scratch.md` on first use |
| `docs` | documentation tree (README + `docs/**`) for the Docs view |
| `settings` | **theme** (5 full presets incl. light)/**keymap** (Orbit/VS/IntelliJ/**custom** + `customKeys`)/font/size/accent (incl. **Auto**)/smooth‑caret/**motion** (smooth panel transitions → `--motion-ms`)/webgl/claude‑terminal/**bell‑notify**/**reveal‑active**/**autosave**/**mdMode** (markdown default: readme‑only/preview/source) (localStorage) + applies CSS vars per theme |
| `layout` | panel sizes/visibility (`sidebarVisible`/`terminalVisible` false = **collapsed into a strip**, see *Collapsible panels*) + focused panel + `editorCollapsed` (runtime only: no tabs open → the editor shrinks to its minimum width, see *Editor auto‑collapse*) + `terminalMaximized` (chats side by side, saved in the session) + the **layout motion** API (`animating`, `beginMotion`/`animate`/`motionUntil`/`motionMs` — see *Smooth layout motion*) |
| `persist` | session save/restore (autosave via `$effect.root`); sessions keyed **`<winKey>\|<folder>`** (per‑window: the same folder in two windows doesn't clobber), `setWinKey` from `startup()`; **`prepareQuit`** (M59: autosave if on, then the unsaved question, then the session written at once — before the window closes, on a Close‑all request from another window, and before an update) and `settleUnsaved` (the same for a folder switch); `switchFolder` swaps the active folder cleanly (keeps the window's repo list and sidebar view, prefetches the destination session in parallel with saving the current one, decides `editorCollapsed` from the saved tabs up front and shows the new repo's terminals as soon as the root is open — one layout motion); `openLight` / `promoteLight` (light window and its "Open … as project"; a light window never reads or saves a session) |
| `toast` | transient notifications, plus a **sticky, clickable `attention`** variant (`notifyAttention`/`dismissByKey`, coalesced by `key`, optional `icon`) used by the Claude‑waiting and update notices |
| `unsaved` | the **one** "unsaved changes" question of the app (M59): `askUnsaved(files)` → `save`/`discard`/`cancel` (a promise; `UnsavedDialog.svelte`, mounted once in App), `resolveUnsaved` (asks and saves; false = cancelled or a save failed). Used by tab closing, window close, Close all, folder switch, "Open as project" and updates |
| `updater` | in‑app updates (M59): `checkForUpdates` (automatic ~30 s after start and every 6 h unless `settings.checkUpdates` is off — never in dev builds; manual from Settings), `updates` state (available version + notes, dialog phase `downloading`/`closing`/`installing`/`error`, progress), `installUpdate`, `announceUpdated` |
| `logs` | **diagnostic logs** (`log`/`logWarn`/`logError`): in‑memory ring buffer + batched on‑disk persistence (Rust `append_log`) + global error capture, all gated by `settings.logging` (default on); `LogViewer` overlay + export (copy / reveal file). Instruments clipboard/paste/terminal to diagnose issues (e.g. the double‑paste) |

State is plain **Svelte 5 runes**: `export const x = $state({...})`; components reading those
fields re‑render automatically. Cross‑module reactive reads (e.g. `git.tick`) drive effects.

**Editor groups (split view).** The editor area renders N side‑by‑side groups. `openFiles` is the
shared document pool (content/dirty live here), and each `workspace.groups[i]` holds an ordered list
of tab paths + its active path — so the same file can appear in several groups. A document is
dropped from the pool only when no group references it. Paths enter the workspace **canonical**
(M59, `util.canonPath`: `\` on Windows) and are compared with `samePath`/`pathKey` (separators and, on
Windows, letter case don't matter), so go‑to‑definition (`root\` + `src/x.ts`), terminal links and the
tree all reach the same document — before, they could open one file as two documents, and saving one
overwrote the other. Sessions saved with mixed forms are merged on restore. Tabs are moved / split / reordered with a
**pointer‑based** drag in `EditorArea.svelte` (pointer events + `elementFromPoint` hit‑testing):
this is required because **`dragDropEnabled: true`** in `tauri.conf.json` (so the OS file‑drop events
carry real paths — see *Drag‑and‑drop* below) suppresses in‑page HTML5 DnD on Windows. A
window‑level `dragstart` preventer in `App.svelte` kills the stray native drag (and its "no‑drop"
cursor). The editor uses soft **line wrapping** (gutter stays correct).

### Heavy modules are lazy

`Editor.svelte` (CodeMirror) and `Terminal.svelte` (xterm) are loaded through
`LazyEditor.svelte` / `LazyTerminal.svelte` (dynamic `import()`), so the startup chunk stays
lean (~536 KB; the ~343 KB xterm and ~76 KB CodeMirror chunks load on demand). The terminal WebGL renderer is a *further* dynamic import, gated on
`settings.webgl` (off by default). **marked + DOMPurify** are likewise lazy (`markdown.ts`
imports them on first render), so the Markdown feature adds nothing to the startup payload.
A small generic **`Lazy.svelte`** wrapper (`load={() => import("./X.svelte")}`, props forwarded) does
the same for the **overlays** (Settings, QuickOpen, SymbolPalette, WorkspaceSymbols, ShortcutsDialog,
WrapperComposer), the **viewers**
(DiffView, AssetView, MarkdownView, HtmlView, **ActivityBoard**, **UnitDigest**) and the **non‑default sidebar views** (Git/Search/Docs/Activity), so
first paint loads only the Explorer + the active editor.

### Feature notes

- **Smooth layout motion** (M56) — programmatic layout changes (repo switch, editor auto‑collapse,
  maximized panel, show/hide of sidebar and terminal panel, chat pane arrangement) animate as one
  motion; splitter drags stay immediate. `layout.svelte.ts` owns the clock: `beginMotion()` sets
  `layout.animating` and returns `end()` (nestable — `switchFolder` keeps it open across its awaits);
  `animate(fn)` is the synchronous form. Components gate their CSS transitions on that flag
  (`.sidebar.animating`, `.terminal-panel.animating`, `.editor-area.animating` → width / flex‑grow /
  flex‑basis for `--motion-ms`, a token written by `applySettings` from the **"Smooth panel
  transitions"** setting — deliberately *not* `prefers-reduced-motion`, which is permanently on when
  Windows' animation effects are off). The maximized editor is now `width: 0`/`visibility: hidden`
  rather than `display: none` so it can animate. Collapse/expand of the two side panels uses
  `panelSlide` (`lib/motion.ts`, M57) on the component roots — and on the strips that take their place,
  the splitters (`motion` prop) and the `.gap` — with duration 0 until `workspace.ready`, so startup never
  animates. Unlike Svelte's `slide` it keeps the side borders at 0 for the whole transition (Chromium rounds a
  border between 0 and 1 px up to 1 px, so `slide` left 2 px until the last frame) and sets `flex-grow: 0` /
  `flex-basis: auto` (a filling panel or a fixed basis would ignore the animated width). Terminal panes (`.slot`) keep a permanent left/top/width/height transition that
  `.surface.still` turns off while the surface itself is resizing, during a shell motion or while a
  pane splitter is dragged — the panes must follow the surface frame‑by‑frame then. `Terminal.svelte`
  consults `motionUntil()` in `scheduleFit` and refits xterm **once ~40 ms after the motion ends**
  (capped at 1.5 s) instead of a `pty_resize` per frame. `switchFolder` is a single motion: it
  prefetches the destination session, applies widths and `editorCollapsed` (from the saved tabs —
  previously the App effect expanded the editor while `rootPath` was null and collapsed it 400 ms
  later: two jumps) and syncs the terminals as soon as the root opens; `workspace.switching` keeps the
  sidebar views mounted so "Open folder…" never flashes.
- **Repo tabs drag‑to‑reorder** (M56) — same pointer‑based approach as editor tabs (HTML5 DnD is off,
  see *Drag‑and‑drop*): a 5 px threshold separates a click from a drag; the grabbed tab follows the
  pointer via `transform`, the tabs between source and destination shift by one slot with a 150 ms
  transform transition, and `folders.moveFolder` reorders the list **only on drop** (a one‑frame
  `settling` class disables transitions while the DOM reorder lands exactly where the tabs already
  are). The repo row is centered in the top bar (`justify-content: center` on the spacer).
- **Collapsible panels** (M57) — when `layout.sidebarVisible` / `layout.terminalVisible` is false the panel
  is *collapsed*: `App.svelte` wraps `.body` in a `.main` row and renders `PanelStrip.svelte` on that edge
  (`side="left"` / `"right"`), a vertical bar as thick as the status bar (22 px incl. the 1 px border toward the
  content, chrome background). Left: the views (Explorer, Git + changes dot, Search, Docs, Activity →
  `selectView` / `openActivity`); right: the repo's terminal tabs in their `color`, with the attention dot
  (`setActiveTerminal` + expand). A « / » button in each panel header collapses it (after a separator from the
  view's own actions); » / « at the top of the strip expands. Panel and strip swap in one motion (`panelSlide`).
- **Light window** (M57) — `startup()` returns `light: true` when the first CLI argument is a file and no
  explicit folder (`LUME_DIR`) is given ("Open with", double‑click). `persist.openLight(dir, file)` sets
  `workspace.light`, collapses both panels and opens the folder with `openRoot(dir, { light: true })`
  (`watch_start` non‑recursive, no git status). While light: no session is read or saved, no `register_window`
  (so no "reopen all", and closing it leaves the restore set alone), no repo tab, no symbol index, no Claude
  bell setting written (`.claude/`), and the project tools (Scratchpad/Claude/Run) are hidden — nothing is
  written into the folder. The top bar shows **Open «X» as project**, where X is `project_root` (nearest
  ancestor with `.git`) or the folder itself; `promoteLight()` loads that folder as a normal project (its
  per‑window session, repo list, index, recursive watch), reopens the files and adopts the terminal tabs.
- **Markdown** — `markdown.ts` renders Markdown to **sanitized** HTML (the WebView has IPC
  access, so a malicious README must not run scripts). `MarkdownView.svelte` is a reading‑mode
  preview with a heading TOC, interactive task lists (writing back to the source), and clickable
  internal links / anchors. `EditorArea` shows a per‑file **source ⇄ preview** toggle for `.md`;
  the initial value comes from `settings.mdMode` — `readme` (README‑only, the default), `preview`
  (all `.md`) or `source`. Preview state lives **per editor group** (`EditorGroup.previews`, persisted
  in the session), so the same file can be source in one pane and preview in another: the
  **"Open preview to the side"** button (`openPreviewToSide`) opens a split with source left,
  preview right — for Markdown the side preview updates **live while typing** (both panes share the
  pooled buffer).
- **HTML preview** — `.html/.htm` files get the same per‑group **source ⇄ preview** toggle in
  `EditorArea` (and the same "open preview to the side" split). `HtmlView.svelte` renders the file
  **from disk** in a sandboxed `<iframe>` served by the asset protocol (`convertFileSrc`): the
  document keeps its real URL, so `#anchors`, relative images/CSS and data URIs work natively (an
  `srcdoc` + `<base>` approach would break fragment links). `sandbox="allow-same-origin"` **without**
  `allow-scripts`: page scripts never run — the parent WebView has Tauri IPC access, same threat
  model as the sanitized Markdown preview. Since the preview reads the disk (not the buffer), the
  toggle saves a dirty buffer first; `OpenFile.diskRev` (bumped on every save and external reload)
  remounts the iframe, so a side‑by‑side preview refreshes on save and on external changes. HTML
  files always open in source mode.
- **Docs view** — `docs.svelte.ts` builds a **hierarchical tree** of the project's Markdown
  (root `README` + `docs/**`) via `list_files`, ordered by numeric prefix, with cleaned titles and
  `_`‑folders de‑emphasized. `DocsView.svelte` renders it (a recursive snippet); clicking a page
  opens it in preview.
- **Claude integration** — `claude.svelte.ts` opens `claude` in a terminal tab at the project root
  and runs **shortcuts** (`claude "<prompt>"`), reusing the run‑config mechanism
  (`addTerminal({ cwd, initCommand })`). Config is `.orbit/claude.json` (command/args/shortcuts),
  Claude‑editable and documented in `CLAUDE.md`. With `settings.claudeTerminal` on (default), the
  **first terminal at startup** launches Claude (only at startup, in `App.svelte`); the terminal
  icon / `+` always open a plain shell. **Wrappers** are prompt templates with a `{{input}}`
  placeholder: `WrapperComposer.svelte` substitutes your text and **copies the result to the
  clipboard** (no shell → multiline is fine). The Claude menu is grouped into Prompts / Wrappers /
  Configuration (section headers via `ContextMenu`'s `header` items). *Add / remove prompts…* opens
  `ClaudePrompts.svelte`, a lightweight add‑form + delete list that writes `.orbit/claude.json` (via
  `addShortcut`/`removeShortcut`/`addWrapper`/`removeWrapper`). Loading uses `readOrbitConfig`, which
  distinguishes *absent* from *invalid* JSON: an invalid `run.json`/`claude.json` shows a toast and keeps
  the current menu instead of silently resetting to defaults (run/claude configs reload live on `fs-changed`).
- **Autosave** — `settings.autosave` (on by default, IntelliJ‑style) saves dirty docs on **window blur**
  (`getCurrentWindow().onFocusChanged` in `App.svelte`) and on **tab/file switch** (an `$effect` tracking
  `activePath()` saves the doc being left). `workspace.savePath(path, { auto:true })` is silent and **skips
  files changed on disk** (conflict) so autosave never clobbers an external edit; `autosaveAll` saves all.
- **Go to symbol** — `editor/outline.ts` extracts an outline from CodeMirror's syntax tree
  (`ensureSyntaxTree`), `editor/activeEditor.ts` tracks the focused editor, and `symbols.svelte.ts`
  + `SymbolPalette.svelte` are the `Ctrl+Shift+O` fuzzy palette that jumps to a definition.
- **Semantic highlighting overlay** — `editor/semanticHighlight.ts` is a CodeMirror `ViewPlugin` that
  colors identifiers matching a known project **type** (`cm-sem-type`, teal) or **method/function**
  (`cm-sem-func`, gold) — VS‑style — so even languages with only a lexical grammar (notably **C#** via the
  legacy `clike` stream parser, and **C/C++**) get type/method coloring for *the user's own* code, with no
  LSP. Name sets come from the symbol index (`codeIndex.semSets`); it decorates only the visible range,
  skips string/comment nodes (`syntaxTree`) and files with no language, and re‑decorates on a `semIndex`
  bump (an empty `view.dispatch({})` nudge from `Editor.svelte`). Heuristic (by name, not scope‑aware);
  colors are `!important` in `editorTheme` to win over the lexical color.
- **Code navigation (project‑wide, heuristic)** — `symbols.rs`'s `scan_symbols` walks the project and
  extracts symbols with a hand‑rolled per‑language parser (C#/Java, **C/C++**, TS/JS/JSX/Svelte, Python,
  Rust, Go; types, methods, functions, properties + base types and an `abstract` flag) — **no LSP, no
  `regex` crate**. The C/C++ path is conservative (types from `class`/`struct`/`union`/`enum`; functions
  only from body‑opening lines to avoid matching calls). `codeIndex.svelte.ts` caches the result in `.orbit/index/symbols.json` (loads instantly,
  re‑scans in the background; `scheduleRescan` is debounced on `fs-changed`, and the watcher excludes
  `.orbit/index` to avoid a rescan loop). **Go to definition** (`goToDefinitionAtCursor` via F12, or
  Ctrl+click in `Editor.svelte`) resolves the word under the cursor (a picker if names collide);
  **Project symbols** is the `Ctrl+T` palette (`WorkspaceSymbols.svelte`). A **back/forward history**
  (top‑bar arrows + `Alt+←/→`) records both jumps and file/tab switches: `workspace` calls a synchronous
  `beforeNavigate(dest)` hook before changing the active file (in `openFile`/`openInNewGroup`/`setActiveTab`),
  which `codeIndex` uses to push the leaving position; `navBack`/`navForward` suppress recording of their
  own move and pre‑set the current position to dodge async races. `RelatedBar.svelte` (under the breadcrumb) shows `contextAt`'s enclosing symbol
  (type › method) with clickable base types / implementers and `KindBadge.svelte` monograms; it reserves
  its height when the file has symbols (no layout shift) and empties when the cursor is outside a symbol.
- **Code lens (M60)** — `editor/codeLens.ts`: block widgets from a `StateField`
  (`Decoration.widget({ block: true, side: -1 })`) above each declaration line, mapped through edits and
  replaced by the `setLenses` effect; each lens is indented like its line (`.cm-line` padding + indent ×
  `defaultCharacterWidth`) and acts on `click` (its `mousedown` is swallowed so the caret doesn't move).
  `Editor.svelte` feeds it from `codeIndex.lensesFor(relPath)` in an `$effect` on the symbol index, the
  `refs` counts, `settings.codeLens` and the file. The counts come from the **same walk** as the symbols:
  `refs.rs` lexes each file per language family (C‑like, C#, JS/TS/Svelte, Go, Python, markup — comments
  and strings skipped, interpolations read, Rust lifetimes and raw strings, Python prefixes) and counts the
  **lines** containing each identifier, so the number on the lens equals the rows of the list; the scan
  keeps only names that are symbols and `codeIndex` caches them in `.orbit/index/refs.json`. A lens shows
  `refs − declarations − constructors`, with **≈** when the name is declared more than once; constructors
  and Python dunders get none. *N references* calls `ref_list(root, name)` (async: every matching line,
  ≤ 2000, declarations filtered out) and shows it in the `Ctrl+T` palette (file glyph + line text, the
  `ref` kind); *N implementations* reuses `showImplementers`. On Quiver (C#, 1,780 symbols) scan + counts
  take ~22 ms in release.
- **Follow active file (reveal)** — `settings.revealActive` (the ⌖ toggle in the explorer toolbar)
  drives an `$effect` in `App.svelte` that calls `explorer.revealInTree(activeFile.path)`: it expands
  the active file's ancestor folders (matched by segment name, case‑insensitive, lazy‑loading as
  needed) and a transient `reveal {target, seq}` signal tells `Explorer.svelte` to scroll the row into
  view (only when off‑screen). The effect wraps the call in **`untrack`** because `revealInTree`
  mutates `tree`/`reveal` (incl. `reveal.seq++`) — otherwise those reads/writes would become effect
  dependencies and self‑invalidate into a loop; `revealInTree` also has a re‑entrancy/coalescing guard.
- **Keyboard shortcuts** — `keybindings.svelte.ts` is a single command **registry** with a key per
  preset (Orbit / Visual Studio / IntelliJ, `settings.keymap`); `App.svelte`'s window `keydown` runs
  `matchCommand(e)` → action, so the active preset applies everywhere (Go‑to‑definition moved from the
  CodeMirror keymap to this window‑level dispatch). A **Custom** keymap is built from any base preset
  (`createCustom`) and stored as `settings.customKeys`; in `ShortcutsDialog.svelte` each configurable
  command is then click‑to‑rebind — the capture listener runs in the **capture phase** (so rebinding e.g.
  `Ctrl+P` doesn't trigger the command), `keyStringFromEvent` rejects bare non‑function keys, and
  `conflictKeys` highlights duplicates. `ShortcutsDialog.svelte` (opened from Settings) shows the preset
  picker (incl. Custom) + a grouped reference (configurable commands + the fixed editor/mouse ones).
- **Run a script file** — `run.svelte.ts`'s `runFile` opens a terminal in the file's folder and runs an
  executable script (`.ps1`/`.cmd`/`.bat`/`.sh`); `isRunnable` + `runCommand` (`util.ts`) map the
  extension to its interpreter. Surfaced from the tree context menu (`Explorer.svelte`) and the editor
  toolbar (`EditorArea.svelte`); reuses the terminal model (`cwd`/`initCommand`), no new Rust command.
- **Activity (work units)** — `activity.rs`'s `scan_activity` reads ALL `~/.claude/projects/*/*.jsonl`
  transcripts and reconstructs **work units** (PROMPT‑FIRST: each user prompt + the files/commands it
  triggers = one unit; a `git commit` labels the unit it falls in — the message is read only from flags
  after `git commit` (`-m`, `-am`, `--message=`, `-F -` with a heredoc, PowerShell here‑strings) —; a unit
  with no prompt of its own (work that went on after a branch change or a commit) is labelled `↳ <the
  request it came from>`; a branch change is a hard boundary;
  file +/− from `toolUseResult.structuredPatch`, the full prompt text is kept for the digest). `watch_activity`
  watches `~/.claude/projects` (notify) and emits **`activity-changed`** for live refresh. Frontend:
  `activity.svelte.ts` (state + `loadActivity` + project on/off `activityPrefs`, persisted; `sessionColor` =
  stable per‑session hash color, `sessionLabel` = aiTitle or short id), `ActivityPanel.svelte`
  (sidebar: project toggles + mini‑stats), `ActivityBoard.svelte` (editor‑area tab, doc kind **`"activity"`**:
  a **Timeline** lens — one row per unit on a shared vertical time axis, repos in columns, day dividers;
  units carry a chat‑colored dot and a small **chat header** where the session changes within a column —
  and a **Chats** lens — one card per session, day‑grouped; selecting it opens `ChatDigest.svelte` in the
  bottom panel with the whole conversation, every prompt in order with its unit's outcome, plus a
  per‑chat resume. The timeline's unit digest stays `UnitDigest.svelte`). The chat is the resume atom
  (`claude --resume` restarts whole sessions only). `openActivity` opens the panel + the board; **▶ resume**
  runs `claude --resume <id>` (switching to the unit's repo first). Supersedes the old Chats
  view (removed).
- **Git sync** — ahead/behind is computed locally with libgit2 (`git_upstream`, no network); the
  actual fetch/pull/push/merge run the `git` CLI in a terminal tab (reusing the user's git auth), so
  no openssl/libssh2 is pulled into the build.
- **Viewers (images & PDF)** — `util.assetKind` tags `.png/.jpg/.svg/.pdf/…` so `workspace.loadDoc`
  creates an `image`/`pdf` doc (no text read); `AssetView.svelte` shows it via Tauri's **asset
  protocol** (`convertFileSrc`, no base64 — needs `assetProtocol` in `tauri.conf` + the
  `protocol-asset` Cargo feature): images in `<img>`, PDFs in an `<iframe>` (WebView2's viewer).
  **Image zoom (M58)**: the image is sized in JS on a "stage" (fit = `min(1, view / natural size)`, or an
  explicit scale; integer offsets, so 100% is crisp) inside a scroll view with **hidden scrollbars**
  (scrollbars appearing and disappearing would shift the image by half a bar at every zoom step).
  `Ctrl+wheel` steps through round levels (5%…3200%, "fit" included) and keeps the image point under the
  pointer fixed (`flushSync` before re-scrolling, so the scroll is not clamped to the old size); wheel
  deltas accumulate, so a touchpad pinch steps like wheel notches. The window-level `Ctrl+wheel` font
  zoom in `App.svelte` skips `.imgview`. Double-click and the corner percentage toggle fit ⇄ 100% (200%
  for images already at 100%); dragging pans; `image-rendering: pixelated` from 300%. Zoom and scroll are
  remembered per path in a module-level map, since the view remounts at every tab switch. If the engine
  reports no natural size (WebView2 always gives one, even for an SVG with only a `viewBox`; other
  webviews may not), the image keeps the old CSS fit, without zoom.
- **Drag‑and‑drop (OS files)** — `EditorArea` listens to `getCurrentWebview().onDragDropEvent` and
  opens dropped file paths (requires `dragDropEnabled: true`; the same flag forces the pointer‑based
  tab drag above). `assetProtocol.scope` is `["**"]`, consistent with `read_file` already exposing
  any path over IPC; the Markdown preview is DOMPurify‑sanitized.
- **Editor tab menu (M58)** — right‑click on a tab (`EditorArea`): Close / Close others / Close to the
  right / Close saved / Close all (plus *Close all in this group* when the editor is split), then copy
  path / copy relative path / reveal in Explorer for files on disk. Entries that don't apply are shown
  **disabled** (`MenuItem.disabled` in `ContextMenu`). Every close goes through `requestClose(targets)`:
  the dirty documents that would disappear entirely (no copy left open in another group) get **one**
  Save all / Don't save / Cancel dialog, and a failed save keeps its tab open. The "all tabs" dropdown
  ends with the same *Close all*.
- **Editor context menu** — right‑click in `Editor.svelte` opens a `ContextMenu` (cut/copy/paste/
  select‑all/go‑to‑symbol) acting on the CodeMirror `view`. The native WebView2 menu/drag are
  suppressed app‑wide via `<svelte:window oncontextmenu/ondragstart>` in `App.svelte` (kept in
  `input`/`textarea`, and `.cm-editor` for text drag).
- **Repositories (top‑bar switcher)** — Orbit keeps the model **single‑active‑root** (`workspace.rootPath`
  is one string, used ~98× across 24 files) and adds a *list* on top: `folders.svelte.ts` holds the open
  repos **per‑window** (in‑memory `$state`, persisted in the active folder's session as `repos` — NOT global
  localStorage, which is shared across instances → see NOTES M39) and the top bar (`TopBar.svelte`) shows
  them as **inline tabs**. Switching reuses `persist.switchFolder`, so there's **no Rust and no refactor**
  of the single‑root model — one active repo at a time, not simultaneous multi‑root (deliberately; see
  NOTES M37). `switchFolder(path)`: autosaves dirty files when `settings.autosave` is on (else confirms before discarding), `saveSessionNow()`, `rootPath=null` (suspends
  autosave), `resetDocs()`, `loadSession(path)`, then **keeps the current sidebar view and visibility**
  (tab‑like: it neither forces Explorer nor applies the target repo's saved view — startup still honors
  the saved view) and restores the repo's expanded Explorer tree (`snapshotExpanded`). It returns a `SwitchResult`
  (`switched`|`cancelled`|`failed`): if the folder is **gone** it restores the previous one (no empty
  window) and toasts, and the caller drops the dead entry — `openRoot` reads `read_dir` **before** touching
  `rootPath`, so a failed open never leaves half‑state.
- **Per‑repo reactions are centralized in `openRoot`** — the single folder‑load path resets search,
  invalidates the Quick‑Open/Docs file cache, and reloads Docs when that view is active,
  so a repo switch never shows the *previous* repo's stale views. Terminals are filtered per repo
  (`TerminalPanel` shows only sessions whose `root` matches; `syncActiveTerminalToRoot` restores the repo's
  last‑active terminal). Keyboard: `Ctrl+Tab`/`Ctrl+Shift+Tab` cycle, `Ctrl+1…9` jump (in `keybindings` +
  `App.svelte`).
- **Top bar under narrow widths** — fixed clusters (`actions`, window controls `wctrls`) are
  `flex-shrink:0` so they're never clipped; only the repo strip (a scroll container, `min-width:0`)
  absorbs the squeeze, and **below 980 logical px the nav collapses to icons‑only** (a media query hiding
  labels) — recovering ~185px so everything, *including the window's close button*, stays on screen down
  to the `minWidth: 720` (logical). The repo strip's `+` / `…` (the latter lists all repos when tabs
  overflow) sit **outside** the scrolling area, so they're always reachable.
- **Editor auto‑collapse** — when no group has a tab (and a folder is open with the terminal panel
  visible), an `$effect` in `App.svelte` sets `layout.editorCollapsed`: the editor area shrinks to its
  220px minimum (`.editor-area.collapsed`, the welcome reduced to the logo), the terminal panel fills the
  rest (`.terminal-panel.fill`) and the splitter between them is swapped for a fixed gap. The effect
  stays out of it while `rootPath` is null (startup / repo switch): there `loadSession` decides the
  collapse up front from the saved tabs, together with the panel widths, so a repo switch is one
  motion. Closing the last tab by hand collapses after a 400 ms grace period (so close‑then‑open
  doesn't pump the PTYs); expanding is immediate. Both animate (see *Smooth layout motion*).
  `terminalWidth` is never touched, so opening a file restores the previous layout.
- **Terminal links** — clicked path tokens resolve through `resolve_existing` (Rust): absolute, then
  relative to the terminal's cwd, then the project root — first that exists wins (works for binaries
  like images too); otherwise a "file not found" toast.
- **Clipboard (copy/paste)** — all copy/paste goes through `lib/clipboard.ts`
  (`writeClipboard`/`readClipboard`): it prefers the **Tauri clipboard plugin** (Rust‑side, immune to
  WebView2 focus/permission quirks) when available and falls back to `navigator.clipboard`, **returning
  success/failure instead of swallowing it** — so a failed copy is surfaced (toast) and the editor's
  **Cut copies *before* deleting** (no "cut into the void" on a clipboard error). In the terminal,
  **right‑click paste defers to a mouse‑capturing TUI**: when the app has mouse tracking on (e.g. Claude
  Code, `term.modes.mouseTrackingMode !== 'none'`) the right‑click is left to the TUI so it pastes once
  with its native handling — this fixed the terminal **double‑paste** (previously both Orbit *and* the TUI
  pasted); **Shift+right‑click** / **Ctrl/Cmd+Shift+V** force Orbit's own paste, and a plain shell always
  pastes via Orbit. Orbit also honors **OSC 52** (`registerOscHandler(52)` → write clipboard) so a TUI's
  own copy (Claude's "copied to clipboard") actually reaches the system clipboard (fixes the stale‑paste
  after selecting). Terminal listeners live under one **`AbortController`** removed in `onDestroy`
  (hygiene); paste guards a disposed terminal + try/catch; auto copy‑on‑selection is silent on failure
  (explicit copy/paste surface it). Consumers: terminal, editor, explorer (copy path/name), wrapper composer.
- **Terminal geometry** — `Terminal.svelte` opens xterm in an inner `.term-fit` div with **no padding**
  (the padding lives on the outer `.term`): the FitAddon sizes rows/cols from the computed height of the
  `.xterm` *parent* (padding included under `border-box`) minus only `.xterm`'s own padding, so a padded
  parent made it count space that isn't there (a gap or a clipped last row, depending on the height).
  The `.xterm-viewport` gets the theme background, because xterm 6 colors only the scrollable element that
  wraps the rows, and `xterm.css` paints the viewport `#000` — the always‑present sub‑row remainder
  below the last row was the old "black line".
- **Chats side by side** — `TerminalPanel.svelte` keeps every terminal mounted in one `.surface`; the
  visible ones (the active tab, or up to `MAX_PANES` = 4 split panes of the current repo, or the zoomed
  one) are **absolutely positioned** by `rect()`, the rest stay `display:none` — so moving a chat into or
  out of a pane never remounts xterm (no restart, no lost scrollback) and the existing ResizeObservers
  resize the PTYs. The layout model (pure, unit‑tested in `terminalLayout.ts`) is **columns of rows**:
  `Layout = string[][]`; `insertPane(layout, id, anchor, side)` makes a new column for a left/right drop
  and a new row for a top/bottom drop (a visible pane is moved, never duplicated), `replacePane` swaps,
  `removePane` drops empty columns, `arrangeAuto` picks side‑by‑side / grid / stacked by how close the
  smallest pane stays to 480×260 px, `placeBeside` is the direction‑less "to the side" (new column if it
  fits, else a row under the active pane). Per repo, `terminals.layouts` holds the structure and
  `autoLayout` whether it still re‑flows with the space (a directional drop, a splitter drag or a
  *Side by side* / *Stacked* choice make it manual; *Automatic* reverts). Pane sizes are fractions
  (`PaneSizes {shape, cols, rows[]}`) valid while the shape (rows per column) is unchanged; draggable
  `.psplit` separators (pointer capture, ~140 px minimum) edit them. Entry points: the panel's **Split**
  menu, the ✨ **New Claude chat** button, `launchClaude(…, { side: true })` / `resumeClaude(id,
  { side: true })` (Claude menu, Activity Chats lens), and a pointer‑based drag of a **tab or pane
  header** (`elementFromPoint` on `.slot.shown`; the drop zone is `dropZone` — the nearest edge within a
  third, else the center). Dragging the visible chat onto an edge of its own pane (no split yet) is a **self
  split**: it goes to that side and the most recently used other tab of the repo to the other
  (`splitPartner`, pure + tested); the drop mark only appears when the drop will change something. A pane header (color bar, name, Claude's summary as subtitle, zoom, pop out, remove) appears
  only when split; `layout.terminalMaximized` hides the editor with `display:none` (still mounted). A
  waiting chat that is already visible only pulses its header. **Names and colors**: `TermSession` has
  `shortName` (minimal, numbered per kind: `Claude 2`, `pwsh 1`; run configs keep their name),
  `customTitle` (rename: double‑click, or the tab's right‑click menu), `autoTitle` (the terminal title
  Claude Code sets via OSC 0/2, `term.onTitleChange` → shown as subtitle/tooltip only for chats; shell
  titles are noise and ignored) and `color` (rotating through `TAB_COLORS`, the Activity session
  palette, changeable from the menu; it travels to the floating window and back). `displayTitle()` =
  custom name or short name.
- **Terminal & floating windows** — PTYs live in the Rust backend keyed by `id`, so any webview just
  attaches via `pty-data-<id>` events + `pty_write` / `pty_resize`. "Pop out" opens a
  `term-float-<id>` webview (unique label per terminal → **several can float at once**; permitted by
  `capabilities/default.json` → `windows: ["main", "term-float-*"]`) that **attaches to the same PTY**
  (the live session keeps running) and removes the tab from the panel; **Dock** (or closing the
  window) emits a global `term-redock` event that re‑attaches it (a dead PTY is reaped on EOF and
  `redockTerminal` checks `pty_alive` first, so a finished session never leaves a zombie tab). The
  float window wears the app's own chrome (`decorations: false` + a custom title bar). Its bar also
  shows a **folder + branch badge** — a snapshot passed as URL params (`root`/`branch`) at detach,
  since the float webview doesn't run git itself — and a **pin** that toggles the window's
  *always‑on‑top* at runtime (`getCurrentWindow().setAlwaysOnTop`, capability
  `core:window:allow-set-always-on-top`; the window is still created with `alwaysOnTop: true`).
- **Per‑project window title** — an `$effect` in `App.svelte` sets the window title to
  `<project> — Orbit` via `getCurrentWindow().setTitle` (capability `core:window:allow-set-title`),
  so multiple instances are distinguishable in the taskbar / Alt‑Tab.
- **Multi‑window session** — `winsession.rs` (Rust only, no plugin) makes the separate Orbit processes
  cooperate so you can **close all** windows at once and **reopen them all at their positions** (the
  instances stay one process each; see NOTES M36 for why not single‑process — WebView2 is already shared,
  so the RAM saving would be marginal). Each window writes its own **`windows/<id>.json`** (folder +
  geometry, id = `pid‑nanos`) in `app_config_dir` — **one file per window**, so concurrent processes never
  race on a shared file; writes are atomic via a **per‑process** temp. Geometry is captured on **blur**
  (`Focused(false)`) and before snapshots — not only on close, else the restored position would be the
  opening one — tracking the last *normal* (non‑max) geom and guarding against off‑screen monitors.
  **Reopen‑all:** a *bare* launch (no folder from CLI/env) restores `windows-restore.json` — this instance
  opens the first entry and **re‑spawns** the rest (geometry passed via `ORBIT_WIN_*` env); a launch *with*
  a folder opens only that. The decision is the pure, tested `plan()`. **Close‑all:** `close_all_windows`
  snapshots the live set → restore, then bumps a token in `windows-control.json`; every instance runs a
  `notify` watcher on the config dir (event‑driven, no polling) and, on a newer token, emits
  **`orbit-quit-request`** to its frontend, which saves or asks (`prepareQuit`) and then calls `quit_now`
  (M59: before, they exited at once and unsaved edits were lost; a window whose user cancels stays open and
  keeps listening). **Closing a window** is two‑phase (M59): `CloseRequested` only saves the geometry — the
  frontend's `onCloseRequested` may still cancel it for unsaved changes — and the entry leaves the live set on
  `Destroyed` (`finish_close`; `save_on_exit` does both on `app.exit`). **Crash
  recovery:** `prune_dead()` at startup drops entries whose pid is dead (`pid_alive`, cfg‑gated: Win32
  `OpenProcess` / Unix `kill(pid,0)`), so a crashed window never blocks restore. Applies to `main`;
  `term-float-*` windows stay ephemeral. The window is created `visible: false` and shown after positioning.
- **Updates (M59)** — `updater.rs` drives the official `tauri-plugin-updater` from Orbit's own commands (no
  JS package, no plugin permissions): `update_check` reads `latest.json` from the latest GitHub release
  (`plugins.updater.endpoints`), `update_download` fetches the installer (progress → `update-progress`) and
  `update_install` checks its **minisign signature** against `plugins.updater.pubkey` and starts it. Before
  installing, the frontend runs `prepareQuit`, then `winsession::quit_others` snapshots every window for
  restore and asks the other processes to quit (same token as Close‑all, own baseline moved first), polling
  `other_instances` (Windows: processes of the SAME exe path, light windows included — what the installer
  must replace) until they're gone. On Windows the plugin runs the NSIS installer **passive** (`/P /UPDATE /R
  /ARGS …`) and exits with `std::process::exit`, so its `on_before_exit` hook kills the PTYs and leaves the
  registry like a normal exit. A marker (`update-restart.json`, valid 10 min) makes the relaunched process
  ignore the arguments the installer passes back and **reopen every window** (bare‑start restore), and
  `startup()` reports `updatedTo` for the "updated" notice. TLS is the OS's (`native-tls`: SChannel on
  Windows, corporate proxy roots included) and the system proxy is honoured. Releases come from
  `scripts/New-Release.ps1` (signing key outside the repo, `createUpdaterArtifacts` only there so a plain
  `tauri build` needs no key); `bundle.windows.nsis.installerIcon` gives setup and uninstaller Orbit's icon.
- **Open with (Windows)** — Orbit shows up in the OS "Open with" menu of common text, code, image and
  PDF files (registered by the **installer**, not `tauri dev`) **without becoming their default**.
  `bundle.fileAssociations` (still used on macOS/Linux) is nulled for Windows in `tauri.windows.conf.json`
  (JSON merge patch), because Tauri's NSIS installer makes Orbit the default handler of every listed
  extension (`HKCU\Software\Classes\.ext` = `Orbit document`, the old value in `Orbit document_backup`).
  Instead `src-tauri/windows/hooks.nsh` (`NSIS_HOOK_POSTINSTALL`) writes the `Orbit document` ProgID (same
  name, so an "always use Orbit" already chosen keeps working) and adds it to each extension's
  `OpenWithProgids`; where the default is still the one an older Orbit set — or the empty value its
  uninstaller left, which would hide the system default — it hands back the backup or removes it. User
  choices (`UserChoice`) are never touched; script types (`bat`/`cmd`/`ps1`/`sh`/`bash`) only get that
  clean‑up, so they keep running on double‑click. `NSIS_HOOK_PREUNINSTALL` removes the entries and the
  ProgID. `ORBIT_PROGID` and `ORBIT_FOR_EACH_EXT` can be redefined before including the file: the M60 test
  bench ran install and uninstall with a fake ProgID on fake extensions (5 starting states). The hooks are
  NSIS‑only: the **MSI** (WiX) package registers no "Open with" at all (a WiX fragment with
  `OpenWithProgids` would be the equivalent).
  `startup()` opens a file passed as the first CLI argument (`orbit.exe "<file>"`) in a **light window**,
  with its parent folder as context only (see *Light window*).

## Backend & IPC

Rust commands are defined with `#[tauri::command]` and registered in `lib.rs` `run()`. The
frontend calls them with `invoke("name", {args})`. Areas:

- **Filesystem** (`lib.rs`): `read_dir`, `read_file`, `write_file`, `create_file`,
  `create_dir`, `rename_path`, `delete_path`, `list_files`, `search_in_project`, `resolve_existing`, `startup`
  (folder/file/search from CLI or env + the `light` flag), `project_root` (nearest ancestor with `.git`).
- **Session** (`lib.rs`): `load_state`/`save_state` (keyed per folder).
- **Window** (`lib.rs` + `winsession.rs`): `open_new_window`; `winsession::register_window` (a window
  records its folder + geometry in the per‑window registry) and `winsession::close_all_windows`;
  `quit_now` (exit after the frontend confirmed), `quit_others` / `other_instances` (updates, M59).
- **Updates** (`updater.rs`): `update_check` → `{ version, current, notes, date }` or null,
  `update_download` (emits `update-progress` `[received, total]`), `update_install`.
- **Misc** (`lib.rs`): `reveal_path` (show a path in the OS file manager; on Windows `explorer` gets a raw
  `/select,"<path>"` argument — `Command::arg` would quote the whole argument when the path has a space, and
  explorer then opens Documents with nothing selected); `open_url` (open an
  http/https link from the terminal in the system browser — other schemes are refused).
- **Diagnostics** (`lib.rs`): `app_version`; `append_log(text)` (appends to `app_config_dir/logs/orbit-<pid>.log`,
  one file per process, rotated over ~2 MB); `log_file_path` — back the log system (`lib/state/logs.svelte.ts`).
- **Activity** (`activity.rs`): `scan_activity(limit)` — scans ALL `~/.claude/projects/*/*.jsonl` and
  returns `WorkUnit[]` (prompt‑first segmentation; camelCase incl. files `{op,path,add,del,userModified}`,
  cmds, prompts, commit, kind, start/end, live); async on a blocking thread with a per‑transcript cache
  keyed on mtime + size (M59: only changed transcripts are re‑read — 469 ms → 2.5 ms on 206 MiB of
  transcripts — and the main thread is never blocked); `watch_activity` — `notify` watcher on
  `~/.claude/projects` that emits a debounced **`activity-changed`** event for live refresh.
- **Git** (`git.rs`): `git_status` (with `workdir`, the repo root), `git_diff`, `git_stage`, `git_unstage`, `git_commit`,
  `git_branches`, `git_checkout_branch`, `git_create_branch`, `git_discard`, `git_log`, `git_show`,
  `git_graph` (all branches, topological order, parents+refs — powers the Git Graph view; lane layout
  is computed in the frontend, `lib/gitgraph.ts`).
- **Terminal** (`pty.rs`): `pty_spawn`, `pty_write`, `pty_resize`, `pty_kill`, `pty_alive`, `list_shells`;
  streams output as `pty-data-<id>` events.
- **Symbols** (`symbols.rs`): `scan_symbols(root)` — heuristic project‑wide symbol scan (C#/Java, C/C++,
  TS/JS/Svelte, Python, Rust, Go; std only, no LSP / no `regex`); async (blocking thread, M60); returns
  `{ symbols: Symbol[], refs: Record<name, lines> }` with
  `Symbol { name, kind, file, line, container, bases, isAbstract }` and the code lens counts. TS/JS (M60): a
  value built with a callback (`const t = list.find((x) => …)`) is not a function, and functions nested in
  other functions (indented past the top level, or past the `<script>` of a Svelte component) are local
  helpers and stay out (1,072 → 953 symbols on Orbit, none at top level lost). `ref_list(root, name)`
  (`refs.rs`, async) lists the lines that use a name for the code lens palette. C#/Java members (M59): a declaration
  needs a modifier **before** the name and no expression in front of it (`=`, strings, `.`, unbalanced
  parentheses, `new`/`return`/`await`…), so calls and `new X()` are no longer indexed as methods; leading
  attributes/annotations are skipped, generic methods (`Load<T>(…)`) and `Name => …` properties are found.
- **Watcher** (`watcher.rs`): `watch_start(root, recursive?)` (non‑recursive for the light window); emits a
  debounced **`fs-changed`** event that the
  frontend listens to (refresh tree + git + reload open files + run config + Claude config + shelf
  + Docs index when visible + symbol re‑scan). The watch ignores `.orbit/index` so caching the symbol
  index never re‑triggers itself.

**Adding a command:** write `#[tauri::command] fn foo(...) -> Result<T, String>` in the right
`*.rs`, add `foo` (or `module::foo`) to the `generate_handler!` list in `lib.rs`, then call
`invoke<T>("foo", {...})` from a state module. No capability entry is needed for custom
commands (only Tauri plugin commands need permissions in `capabilities/`).

## Persistence

- **Session** (per **window**, keyed `<winKey>\|<folder>`): `save_state(key, data)` →
  `app_config_dir()/sessions/<hash>.json` + `last_session.txt` (editor groups + tabs + active group +
  panel layout + the window's repo list `repos`). `winKey` is the stable per‑window key from `startup()`
  (`winsession::WinKey`), so the **same folder open in two windows doesn't clobber** (M39). Restored on
  launch (`persist.loadSession`; reads legacy single‑group sessions too). `last_session.txt` (bare‑launch
  fallback) stays global.
- **Multi‑window session** (app‑global, `winsession.rs`): `app_config_dir()/windows/<id>.json` (one
  per live window: folder + geometry + **`key`** = stable session key), `windows-restore.json` (snapshot
  to reopen on a bare launch, carries `key` per entry), `windows-control.json` (close‑all token),
  `update-restart.json` (written right before an update installs, consumed by the relaunch). Each
  process writes only its own files → race‑free. The stable `key` survives reopen‑all: passed to respawned
  windows via env `ORBIT_WIN_KEY` (see `WinKey`/`resolve_key`), so each reopened window restores ITS session.
- **Settings** (app‑global): `localStorage["orbit.settings"]`, applied as CSS variables on
  `document.documentElement`. (Per WebView origin: dev and the installed app have separate stores.)
- **Project config** (committed/shared): `.orbit/run.json` (run configs) and `.orbit/claude.json`
  (Claude launcher command/args + shortcuts). `.orbit/shelf.json` is a personal view preference and
  is git‑ignored, as is `.orbit/index/symbols.json` (the rebuildable symbol‑navigation cache).

## Theming

`src/app.css` holds every color/size token: surfaces, ink, accent, lines in a Tailwind `@theme`
block (pre‑JS defaults = **Orbit Dark**; the runtime default theme is VS 2026), plus runtime‑overridable
CSS variables in `:root` (`--color-bg`, `--color-panel`, `--accent-rgb`, `--editor-font-size`,
`--caret-transition`, the editor's `--cm-*`, the radius scale `--r-*`, `--h-tabs`/`--h-head`,
`--icon-stroke`, shadows). Components never hard‑code a radius: they use the scale, so a theme can change
the shape of the whole UI.

**Themes.** `settings.svelte.ts` defines `THEMES` (Visual Studio 2026 Dark — the default since 0.9 —,
Orbit Dark, Eclipse, Slate, Orbit Light): each is a full set of CSS variables (all surfaces/lines/inks +
bg + default accent + the editor `--cm-*`) that `applySettings` writes on `documentElement` — the
accent‑preset mechanism extended to the whole palette. Variables that only *some* themes define
(`color-accent-soft`, `color-panel` = the sidebar body) are removed when switching to a theme without
them, so nothing sticks. A theme may also carry a **`look`**: `fontSans` (→ `--font-sans`), `radii`
(the `--r-xs…--r-xxl` scale that **every** `border-radius` in the components uses — no fixed px left),
`heights` (`--h-tabs` editor tab bar, `--h-head` panel headers), `iconStroke` (`--icon-stroke`, read by
`Icon.svelte` as the stroke width of every icon), `iconSet: "fluent"` (an alternate, squarer glyph set
in `Icon.svelte` for the main chrome icons) and `flatGlyphs` (outline file tiles in `FileGlyph.svelte`).
Without a `look` the `app.css` defaults apply (the historical Orbit shape). The VS theme's colors were
**sampled pixel‑by‑pixel** from a VS 2026 screenshot (see NOTES M55). The accent can be **Auto**
(follows the theme) or a preset (overrides). The editor picks a light/dark **HighlightStyle** via a
`Compartment` (`editorTheme(light)` in `lib/editor/theme.ts`), reconfigured when the theme changes; its
selection / active‑line / bracket read the `--cm-*` variables so they adapt. The **terminal** follows
the theme too: `Terminal.svelte` builds xterm's theme from the active theme's vars (background =
editor surface, foreground = ink, cursor = accent, selection = `--cm-selection`) with a dark or light
ANSI set, re‑applied live on theme/accent change. A one‑time migration (`uiV09` in the saved settings)
moves existing installs to the new default once; later choices are kept.

**File glyphs.** `FileGlyph.svelte` renders a file's icon from `fileIcon()` (`util.ts`): a dedicated SVG
**symbol** (`lang:*`) for languages with a strong identity, a **monogram tile** (`tile:*`, fill/text
derived from the language color at a single switch point), or a line‑art `Icon` fallback for non‑code.

**Brand mark.** `Logo.svelte` draws the logo (gradient planet, tilted ring, satellite) as inline SVG —
the same mark as `app-icon.svg`, the single source of the OS icons: `npx tauri icon app-icon.svg`, then
keep only the six files already tracked in `src-tauri/icons`. In the UI the ring and satellite take the
theme's ink colors (readable on Orbit Light too); the planet keeps the brand gradient.

## Conventions

- **Minimal dependencies** — every addition is justified in `NOTES.md`. Prefer std/built‑ins;
  many "components" (icons, splitter, popups) are hand‑written to avoid libraries.
- **UI strings in English; code comments and `NOTES.md` in Italian.**
- **CodeMirror grammars load on demand** (`@codemirror/language-data`), so the bundle stays light.
- **Path helpers** are centralized in `util.ts` (`normSlash`, `relTo`, `joinPath`, `basename`,
  `dirname`) — don't re‑implement path normalization in components.
- Reusable UI primitives: `Backdrop.svelte` (popup overlay) and `Switch.svelte` (toggle).
- **Focus on mount with `use:focusOnMount`** (`lib/focus.ts`), never `autofocus`: Svelte 5 applies
  `autofocus` only when nothing else has the focus, so a palette opened from the editor stayed unfocused and
  the keys went into the file (M60). `use:focusOnMount={{ select: true }}` also selects the text.

## Develop / build / test

```bash
npm install
npm run tauri dev      # hot reload (frontend) + Rust core
npm run tauri build    # binary + installers in src-tauri/target/release
npm run check                                    # svelte-check (TS/Svelte)
npm run test                                     # vitest (frontend pure-logic unit tests)
cargo test --manifest-path src-tauri/Cargo.toml  # backend unit tests
```

## Recipe: add a feature

1. Backend (if needed): add a `#[tauri::command]` + register it in `lib.rs`.
2. State: add fields/actions to an existing `lib/state/*.svelte.ts` (or a new module) that call
   `invoke(...)`.
3. UI: a component reads the state and calls the actions; reuse `Backdrop`/`Switch`/`Icon`.
4. Persist if it's a preference (settings) or session data (persist).
5. `npm run check` + `npm run test` + `cargo test`, then verify in `npm run tauri dev`.
   Pure logic (no runes/DOM) goes in a plain `.ts` next to its `.svelte.ts` (e.g. `shelfRules.ts`)
   with a `*.test.ts` — vitest runs them without the Svelte plugin.
