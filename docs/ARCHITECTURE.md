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
                      #   plain .ts helpers: dotorbit.ts (.orbit config), projectFiles.ts (list_files cache)
    editor/           # CodeMirror extensions (theme, indent guides, git gutter, semantic overlay) + outline.ts (symbols), activeEditor.ts
    util.ts           # pure helpers (paths, file icons, language label, time)
    markdown.ts       # Markdown → sanitized HTML (marked + DOMPurify, lazy) + heading TOC
    clipboard.ts      # centralized copy/paste: Tauri clipboard plugin + navigator fallback, explicit success
src-tauri/
  src/lib.rs          # Rust entry: fs/session/window commands + run() (registers all)
  src/git.rs          # git commands (libgit2), incl. git_graph (branch/commit graph)
  src/activity.rs     # Activity: work units from Claude transcripts (scan_activity, watch_activity)
  src/pty.rs          # terminal/PTY commands
  src/watcher.rs      # file watcher (emits "fs-changed")
  src/symbols.rs      # heuristic project symbol scanner (scan_symbols) — no LSP, std only
  src/winsession.rs   # multi-window session: per-window registry, reopen-all + close-all, geometry (replaces winstate)
  tauri.conf.json     # window, bundle, productName "Orbit"
  capabilities/       # Tauri permission capabilities
docs/                 # this doc + screenshot
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
| `workspace` | open folder, document pool (kinds: file/diff/image/pdf), **editor groups** (split view) + active group/tab, branch; `openFile`, `openInNewGroup`, `moveTab`, `splitWithTab`, `saveActive`, **`autosaveAll`** (IntelliJ‑style), a `beforeNavigate` hook (feeds the nav history), markdown `preview` default from `settings.mdMode`, … |
| `folders` | the **open repositories** list for the top‑bar switcher — **per‑window**: in‑memory `$state` only (NOT global localStorage, which is shared across instances and caused clobbering), persisted in the active folder's session as `repos` and reseeded by `loadSession({repos:true})` at window startup; `addFolder`/`removeFolder`/`setFolders`/`openFromList`/`cycleRepo`/`selectRepoIndex` — switching the active repo reuses `persist.switchFolder` (one active root at a time) |
| `explorer` | the lazy file tree + inline file ops (new/rename/delete); **reveal active file** (`revealInTree`, used by "follow active file") |
| `git` | status, diff, branches, commit, discard, history, **gutter `tick`**, tree decorations, **upstream ahead/behind + fetch/pull/push/merge** |
| `terminals` | terminal tabs (id/title/shell/cwd) + active tab + `focusedId` (real xterm focus); **bell attention** (`notifyTerminalBell`: Claude rings the bell — Orbit enables `preferredNotifChannel:terminal_bell` on launch — → dot on the **repo's tab** + on the session tab + a **sticky, clickable attention toast** (click → `goToTerminal`: switch repo, reveal panel, focus the tab) + a top‑bar **Waiting (N)** pill; persists via title `●` + taskbar `requestUserAttention` while you're away; cleared on focus/open via `clearAttention`→`dismissByKey`); **per‑repo**: each session is tagged with its `root` so the tab bar shows only the active repo's terminals (all stay mounted, PTYs alive) |
| `run` | `.orbit/run.json` run configs + "Set up for Claude" |
| `claude` | Claude launcher + **shortcuts** + **wrappers** (`.orbit/claude.json`); opens `claude` in a terminal; the wrapper composer copies the composed prompt to the clipboard; **quick add/remove** of prompts & wrappers (`ClaudePrompts.svelte` → writes `claude.json`); invalid JSON **warns** (toast) and keeps the menu instead of silently resetting |
| `shelf` | shelved folders by category — per‑path entries (`shelved`) **and by‑name rules** (`byName`: hides every folder with that name, incl. nested or recreated — e.g. C# `bin`/`obj`); `.orbit/shelf.json`. Pure hide/group logic split into `shelfRules.ts` (unit‑tested) |
| `search` | project text search (debounced) |
| `quickopen` | Ctrl+P fuzzy file finder |
| `symbols` | **Go to Symbol** palette (Ctrl+Shift+O): outline of the active editor + fuzzy filter |
| `codeIndex` | **project symbol index** (the "address book") from `scan_symbols`, cached in `.orbit/index/`: **Go to definition** (F12/Ctrl+click), **Project symbols** palette (Ctrl+T), the related‑bar context (`contextAt`), the **semantic‑overlay name sets** (`semSets`/`semIndex` → type & function names for the editor overlay), and the **back/forward nav history** (records jumps *and* file/tab switches; `nav` counts drive the top‑bar arrows) |
| `keybindings` | central **command registry** + keyboard matcher/dispatch, with per‑preset keys (Orbit/VS/IntelliJ) **plus a user‑built `custom` keymap** (`settings.customKeys`, rebind per command) and the shortcuts‑reference panel; `keyStringFromEvent` captures a rebind, `conflictKeys` flags duplicates |
| `activity` | **Activity** view: work units from `scan_activity` across all `~/.claude/projects` (prompt‑first segmentation in Rust); project on/off toggles `activityPrefs` (persisted, hides noise) + `openActivity`; live refresh via `watch_activity`→`activity-changed` |
| `scratch` | one‑click persistent scratchpad (`.orbit/scratch.md`) for notes/prompts |
| `docs` | documentation tree (README + `docs/**`) for the Docs view |
| `settings` | **theme** (4 full presets incl. light)/**keymap** (Orbit/VS/IntelliJ/**custom** + `customKeys`)/font/size/accent (incl. **Auto**)/smooth‑caret/webgl/claude‑terminal/**bell‑notify**/**reveal‑active**/**autosave**/**mdMode** (markdown default: readme‑only/preview/source) (localStorage) + applies CSS vars per theme |
| `layout` | panel sizes/visibility + focused panel |
| `persist` | session save/restore (autosave via `$effect.root`); sessions keyed **`<winKey>\|<folder>`** (per‑window: the same folder in two windows doesn't clobber), `setWinKey` from `startup()`; `switchFolder` swaps the active folder cleanly (keeps the window's repo list) |
| `toast` | transient notifications, plus a **sticky, clickable `attention`** variant (`notifyAttention`/`dismissByKey`, coalesced by `key`) used by the Claude‑waiting notification |
| `logs` | **diagnostic logs** (`log`/`logWarn`/`logError`): in‑memory ring buffer + batched on‑disk persistence (Rust `append_log`) + global error capture, all gated by `settings.logging` (default on); `LogViewer` overlay + export (copy / reveal file). Instruments clipboard/paste/terminal to diagnose issues (e.g. the double‑paste) |

State is plain **Svelte 5 runes**: `export const x = $state({...})`; components reading those
fields re‑render automatically. Cross‑module reactive reads (e.g. `git.tick`) drive effects.

**Editor groups (split view).** The editor area renders N side‑by‑side groups. `openFiles` is the
shared document pool (content/dirty live here), and each `workspace.groups[i]` holds an ordered list
of tab paths + its active path — so the same file can appear in several groups. A document is
dropped from the pool only when no group references it. Tabs are moved / split / reordered with a
**pointer‑based** drag in `EditorArea.svelte` (pointer events + `elementFromPoint` hit‑testing):
this is required because **`dragDropEnabled: true`** in `tauri.conf.json` (so the OS file‑drop events
carry real paths — see *Drag‑and‑drop* below) suppresses in‑page HTML5 DnD on Windows. A
window‑level `dragstart` preventer in `App.svelte` kills the stray native drag (and its "no‑drop"
cursor). The editor uses soft **line wrapping** (gutter stays correct).

### Heavy modules are lazy

`Editor.svelte` (CodeMirror) and `Terminal.svelte` (xterm) are loaded through
`LazyEditor.svelte` / `LazyTerminal.svelte` (dynamic `import()`), so the startup chunk stays
lean (~492 KB; the ~338 KB xterm and ~75 KB CodeMirror chunks load on demand). The terminal WebGL renderer is a *further* dynamic import, gated on
`settings.webgl` (off by default). **marked + DOMPurify** are likewise lazy (`markdown.ts`
imports them on first render), so the Markdown feature adds nothing to the startup payload.
A small generic **`Lazy.svelte`** wrapper (`load={() => import("./X.svelte")}`, props forwarded) does
the same for the **overlays** (Settings, QuickOpen, SymbolPalette, WorkspaceSymbols, ShortcutsDialog,
WrapperComposer), the **viewers**
(DiffView, AssetView, MarkdownView, **ActivityBoard**, **UnitDigest**) and the **non‑default sidebar views** (Git/Search/Docs/Activity), so
first paint loads only the Explorer + the active editor.

### Feature notes

- **Markdown** — `markdown.ts` renders Markdown to **sanitized** HTML (the WebView has IPC
  access, so a malicious README must not run scripts). `MarkdownView.svelte` is a reading‑mode
  preview with a heading TOC, interactive task lists (writing back to the source), and clickable
  internal links / anchors. `EditorArea` shows a per‑file **source ⇄ preview** toggle for `.md`
  (state `OpenFile.preview`); the initial value comes from `settings.mdMode` — `readme` (README‑only,
  the default), `preview` (all `.md`) or `source`.
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
  triggers = one unit; a `git commit` labels the unit it falls in; a branch change is a hard boundary;
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
  view (`claude_sessions` stays in `lib.rs` but is now unused).
- **Usage (real limits)** — the status‑bar **Usage** button toggles an embedded view of
  `claude.ai/settings/usage` (the user's REAL 5h/weekly meters): `UsageIndicator.svelte` computes the
  anchor rect (bottom‑right, above the status bar, logical px = DOM px) and calls `usage_panel_show`;
  a `Backdrop` closes it on outside click (the native webview draws above the DOM, so the backdrop
  only ever receives outside clicks), `Esc` closes too, window resize re‑invokes `usage_panel_bounds`.
  A DOM **header strip** sits in the reserved 34px above the webview: it shows the account **Claude
  Code (CLI) is signed in as** (`claude_account`, read locally from `~/.claude.json` — the panel's
  claude.ai login is a separate session, so this makes a mismatch visible at a glance; the status‑bar
  button shows its short form too, refreshed live by `watch_claude_account` → `claude-account-changed`),
  plus **Log out**, open‑in‑browser and close; right‑clicking the button offers the same actions
  without opening the panel, and lists the **saved account emails** (`settings.claudeAccounts`,
  addresses only — each entry copies to the clipboard for the login form; `ClaudeAccounts.svelte`
  manages the list, with one‑click add of the current CLI account). **Log out** = `claude_logout_local`, which **deletes the WebView
  profile's cookies locally** (ICoreWebView2CookieManager on Windows; no network request, and
  localStorage — where Orbit keeps its settings — is a separate store, untouched), then
  `usage_panel_logout` reloads the page to the login form if the panel is open (on platforms without
  the cookie API it falls back to navigating `claude.ai/logout`). Login persists in the app's WebView
  profile. It's a plain embedded browser — no injected scripts, no data extraction, no credential
  reuse (ToS‑safe; automating claude.ai or reusing its tokens is a documented ban risk). Replaces the
  transcript‑based counters of M48–M49 (see NOTES M50).
- **Git sync** — ahead/behind is computed locally with libgit2 (`git_upstream`, no network); the
  actual fetch/pull/push/merge run the `git` CLI in a terminal tab (reusing the user's git auth), so
  no openssl/libssh2 is pulled into the build.
- **Viewers (images & PDF)** — `util.assetKind` tags `.png/.jpg/.svg/.pdf/…` so `workspace.loadDoc`
  creates an `image`/`pdf` doc (no text read); `AssetView.svelte` shows it via Tauri's **asset
  protocol** (`convertFileSrc`, no base64 — needs `assetProtocol` in `tauri.conf` + the
  `protocol-asset` Cargo feature): images in `<img>`, PDFs in an `<iframe>` (WebView2's viewer).
- **Drag‑and‑drop (OS files)** — `EditorArea` listens to `getCurrentWebview().onDragDropEvent` and
  opens dropped file paths (requires `dragDropEnabled: true`; the same flag forces the pointer‑based
  tab drag above). `assetProtocol.scope` is `["**"]`, consistent with `read_file` already exposing
  any path over IPC; the Markdown preview is DOMPurify‑sanitized.
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
  autosave), `resetDocs()`, `loadSession(path)`, then forces the **Explorer** view + visible sidebar
  (deterministic on switch; startup still honors the saved view). It returns a `SwitchResult`
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
  `notify` watcher on the config dir (event‑driven, no polling) and exits on a newer token. **Crash
  recovery:** `prune_dead()` at startup drops entries whose pid is dead (`pid_alive`, cfg‑gated: Win32
  `OpenProcess` / Unix `kill(pid,0)`), so a crashed window never blocks restore. Applies to `main`;
  `term-float-*` windows stay ephemeral. The window is created `visible: false` and shown after positioning.
- **Open with (Windows)** — `bundle.fileAssociations` registers Orbit as a handler for common file
  types, so it shows up in the OS "Open with" menu (registered by the **installer**, not `tauri dev`).
  `startup()` opens a file passed as the first CLI argument (`orbit.exe "<file>"`) and uses its
  parent folder as the workspace.

## Backend & IPC

Rust commands are defined with `#[tauri::command]` and registered in `lib.rs` `run()`. The
frontend calls them with `invoke("name", {args})`. Areas:

- **Filesystem** (`lib.rs`): `read_dir`, `read_file`, `write_file`, `create_file`,
  `create_dir`, `rename_path`, `delete_path`, `list_files`, `search_in_project`, `resolve_existing`, `startup`.
- **Session** (`lib.rs`): `load_state`/`save_state` (keyed per folder).
- **Window** (`lib.rs` + `winsession.rs`): `open_new_window`; `winsession::register_window` (a window
  records its folder + geometry in the per‑window registry) and `winsession::close_all_windows`.
- **Misc** (`lib.rs`): `reveal_path` (show a path in the OS file manager). (`claude_sessions` /
  `session_preview` remain but are now **unused** — superseded by the Activity view.)
- **Diagnostics** (`lib.rs`): `app_version`; `append_log(text)` (appends to `app_config_dir/logs/orbit-<pid>.log`,
  one file per process, rotated over ~2 MB); `log_file_path` — back the log system (`lib/state/logs.svelte.ts`).
- **Activity** (`activity.rs`): `scan_activity(limit)` — scans ALL `~/.claude/projects/*/*.jsonl` and
  returns `WorkUnit[]` (prompt‑first segmentation; camelCase incl. files `{op,path,add,del,userModified}`,
  cmds, prompts, commit, kind, start/end, live); `watch_activity` — `notify` watcher on `~/.claude/projects`
  that emits a debounced **`activity-changed`** event for live refresh.
- **Usage panel** (`lib.rs`): `usage_panel_show` / `usage_panel_close` / `usage_panel_bounds` /
  `usage_panel_logout` — the claude.ai usage page as a **child webview** anchored in the main window
  (Tauri's `unstable` cargo feature for `Window::add_child`; coordinates in logical px).
  `claude_account` reads the CLI's current account from `~/.claude.json` (local file);
  `watch_claude_account` watches that file (notify, non‑recursive on home, debounced) and emits
  `claude-account-changed`; `claude_logout_local` deletes the WebView profile's cookies
  (ICoreWebView2CookieManager via `webview2-com`/`windows-core`, both already in the dependency tree;
  cfg(windows), other platforms return an error and the frontend falls back to navigating
  `claude.ai/logout`). The panel commands are **async on purpose**: on Windows, creating a webview
  from a sync command deadlocks (creation waits on a message pump the command blocks). The remote
  page has **no IPC access** (its label is in no capability).
- **Git** (`git.rs`): `git_status`, `git_diff`, `git_stage`, `git_unstage`, `git_commit`,
  `git_branches`, `git_checkout_branch`, `git_create_branch`, `git_discard`, `git_log`, `git_show`,
  `git_graph` (all branches, topological order, parents+refs — powers the Git Graph view; lane layout
  is computed in the frontend, `lib/gitgraph.ts`).
- **Terminal** (`pty.rs`): `pty_spawn`, `pty_write`, `pty_resize`, `pty_kill`, `pty_alive`, `list_shells`;
  streams output as `pty-data-<id>` events.
- **Symbols** (`symbols.rs`): `scan_symbols(root)` — heuristic project‑wide symbol scan (C#/Java, C/C++,
  TS/JS/Svelte, Python, Rust, Go; std only, no LSP / no `regex`); returns
  `Symbol { name, kind, file, line, container, bases, isAbstract }`.
- **Watcher** (`watcher.rs`): `watch_start`; emits a debounced **`fs-changed`** event that the
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
  to reopen on a bare launch, carries `key` per entry), `windows-control.json` (close‑all token). Each
  process writes only its own files → race‑free. The stable `key` survives reopen‑all: passed to respawned
  windows via env `ORBIT_WIN_KEY` (see `WinKey`/`resolve_key`), so each reopened window restores ITS session.
- **Settings** (app‑global): `localStorage["orbit.settings"]`, applied as CSS variables on
  `document.documentElement`. (Per WebView origin: dev and the installed app have separate stores.)
- **Project config** (committed/shared): `.orbit/run.json` (run configs) and `.orbit/claude.json`
  (Claude launcher command/args + shortcuts). `.orbit/shelf.json` is a personal view preference and
  is git‑ignored, as is `.orbit/index/symbols.json` (the rebuildable symbol‑navigation cache).

## Theming

`src/app.css` holds every color/size token: surfaces, ink, accent, lines in a Tailwind `@theme`
block (defaults = **Orbit Dark**), plus runtime‑overridable CSS variables in `:root` (`--color-bg`,
`--accent-rgb`, `--editor-font-size`, `--caret-transition`, the editor's `--cm-*`, radii, shadows).

**Themes.** `settings.svelte.ts` defines `THEMES` (Orbit Dark / Eclipse / Slate / Orbit Light): each is
a full set of CSS variables (all surfaces/lines/inks + bg + default accent + the editor `--cm-*`) that
`applySettings` writes on `documentElement` — the accent‑preset mechanism extended to the whole palette.
The accent can be **Auto** (follows the theme) or a preset (overrides). The editor picks a light/dark
**HighlightStyle** via a `Compartment` (`editorTheme(light)` in `lib/editor/theme.ts`), reconfigured
when the theme changes; its selection / active‑line / bracket read the `--cm-*` variables so they adapt.

**File glyphs.** `FileGlyph.svelte` renders a file's icon from `fileIcon()` (`util.ts`): a dedicated SVG
**symbol** (`lang:*`) for languages with a strong identity, a **monogram tile** (`tile:*`, fill/text
derived from the language color at a single switch point), or a line‑art `Icon` fallback for non‑code.

## Conventions

- **Minimal dependencies** — every addition is justified in `NOTES.md`. Prefer std/built‑ins;
  many "components" (icons, splitter, popups) are hand‑written to avoid libraries.
- **UI strings in English; code comments and `NOTES.md` in Italian.**
- **CodeMirror grammars load on demand** (`@codemirror/language-data`), so the bundle stays light.
- **Path helpers** are centralized in `util.ts` (`normSlash`, `relTo`, `joinPath`, `basename`,
  `dirname`) — don't re‑implement path normalization in components.
- Reusable UI primitives: `Backdrop.svelte` (popup overlay) and `Switch.svelte` (toggle).

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
