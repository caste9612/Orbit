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
    editor/           # CodeMirror extensions (theme, indent guides, git gutter) + outline.ts (symbols), activeEditor.ts
    util.ts           # pure helpers (paths, file icons, language label, time)
    markdown.ts       # Markdown → sanitized HTML (marked + DOMPurify, lazy) + heading TOC
src-tauri/
  src/lib.rs          # Rust entry: fs/session/window commands + run() (registers all)
  src/git.rs          # git commands (libgit2)
  src/pty.rs          # terminal/PTY commands
  src/watcher.rs      # file watcher (emits "fs-changed")
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
| `workspace` | open folder, document pool (kinds: file/diff/image/pdf), **editor groups** (split view) + active group/tab, branch; `openFile`, `openInNewGroup`, `moveTab`, `splitWithTab`, `saveActive`, … |
| `explorer` | the lazy file tree + inline file ops (new/rename/delete) |
| `git` | status, diff, branches, commit, discard, history, **gutter `tick`**, tree decorations, **upstream ahead/behind + fetch/pull/push/merge** |
| `terminals` | terminal tabs (id/title/shell/cwd) + active tab; **bell attention** (`notifyTerminalBell` → tab marker + toast when a terminal needs you) |
| `run` | `.orbit/run.json` run configs + "Set up for Claude" |
| `claude` | Claude launcher + **shortcuts** + **wrappers** (`.orbit/claude.json`); opens `claude` in a terminal; the wrapper composer copies the composed prompt to the clipboard |
| `shelf` | shelved folders by category (`.orbit/shelf.json`) |
| `search` | project text search (debounced) |
| `quickopen` | Ctrl+P fuzzy file finder |
| `symbols` | **Go to Symbol** palette (Ctrl+Shift+O): outline of the active editor + fuzzy filter |
| `claudeChats` | the project's recent Claude Code sessions (preview + turn count, from transcripts) + resume |
| `scratch` | one‑click persistent scratchpad (`.orbit/scratch.md`) for notes/prompts |
| `docs` | documentation tree (README + `docs/**`) for the Docs view |
| `settings` | **theme** (4 full presets incl. light)/font/size/accent (incl. **Auto**)/smooth‑caret/webgl/claude‑terminal/**bell‑notify** (localStorage) + applies CSS vars per theme |
| `layout` | panel sizes/visibility + focused panel |
| `persist` | per‑folder session save/restore (autosave via `$effect.root`); `switchFolder` swaps the workspace folder cleanly |
| `toast` | transient notifications |

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
lean (~475 KB; the ~338 KB xterm and ~73 KB CodeMirror chunks load on demand). The terminal WebGL renderer is a *further* dynamic import, gated on
`settings.webgl` (off by default). **marked + DOMPurify** are likewise lazy (`markdown.ts`
imports them on first render), so the Markdown feature adds nothing to the startup payload.
A small generic **`Lazy.svelte`** wrapper (`load={() => import("./X.svelte")}`, props forwarded) does
the same for the **overlays** (Settings, QuickOpen, SymbolPalette, WrapperComposer), the **viewers**
(DiffView, AssetView, MarkdownView) and the **non‑default sidebar views** (Git/Search/Docs/Chats), so
first paint loads only the Explorer + the active editor.

### Feature notes

- **Markdown** — `markdown.ts` renders Markdown to **sanitized** HTML (the WebView has IPC
  access, so a malicious README must not run scripts). `MarkdownView.svelte` is a reading‑mode
  preview with a heading TOC, interactive task lists (writing back to the source), and clickable
  internal links / anchors. `EditorArea` shows a per‑file **source ⇄ preview** toggle for `.md`
  (state `OpenFile.preview`, default on for `README`).
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
  Configuration (section headers via `ContextMenu`'s `header` items).
- **Go to symbol** — `editor/outline.ts` extracts an outline from CodeMirror's syntax tree
  (`ensureSyntaxTree`), `editor/activeEditor.ts` tracks the focused editor, and `symbols.svelte.ts`
  + `SymbolPalette.svelte` are the `Ctrl+Shift+O` fuzzy palette that jumps to a definition.
- **Claude chats** — `claudeChats.svelte.ts` lists the project's Claude Code sessions; the backend
  `claude_sessions` reads the `~/.claude/projects/<slug>/*.jsonl` transcripts (a short preview from
  the last user message + a turn count), and clicking resumes one with `claude --resume <id>` (id
  validated as a UUID).
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
- **Folder switch** — `openFolderDialog` → `persist.switchFolder`: saves the current session, sets
  `rootPath=null` (suspends autosave), `resetDocs()`, then `loadSession(newRoot)` — switching folders
  restores the new folder's tabs and never carries the previous folder's documents.
- **Terminal links** — clicked path tokens resolve through `resolve_existing` (Rust): absolute, then
  relative to the terminal's cwd, then the project root — first that exists wins (works for binaries
  like images too); otherwise a "file not found" toast.
- **Terminal & floating windows** — PTYs live in the Rust backend keyed by `id`, so any webview just
  attaches via `pty-data-<id>` events + `pty_write` / `pty_resize`. "Pop out" opens a
  `term-float-<id>` webview (unique label per terminal → **several can float at once**; permitted by
  `capabilities/default.json` → `windows: ["main", "term-float-*"]`) that **attaches to the same PTY**
  (the live session keeps running) and removes the tab from the panel; **Dock** (or closing the
  window) emits a global `term-redock` event that re‑attaches it (a dead PTY is reaped on EOF and
  `redockTerminal` checks `pty_alive` first, so a finished session never leaves a zombie tab). The
  float window wears the app's own chrome (`decorations: false` + a custom title bar).
- **Per‑project window title** — an `$effect` in `App.svelte` sets the window title to
  `<project> — Orbit` via `getCurrentWindow().setTitle` (capability `core:window:allow-set-title`),
  so multiple instances are distinguishable in the taskbar / Alt‑Tab.
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
- **Window** (`lib.rs`): `open_new_window`.
- **Misc** (`lib.rs`): `reveal_path` (show a path in the OS file manager), `claude_sessions` (list
  the project's Claude Code transcripts, each with a preview from its **last** user message + a turn
  count — `session_preview`).
- **Git** (`git.rs`): `git_status`, `git_diff`, `git_stage`, `git_unstage`, `git_commit`,
  `git_branches`, `git_checkout_branch`, `git_create_branch`, `git_discard`, `git_log`, `git_show`.
- **Terminal** (`pty.rs`): `pty_spawn`, `pty_write`, `pty_resize`, `pty_kill`, `pty_alive`, `list_shells`;
  streams output as `pty-data-<id>` events.
- **Watcher** (`watcher.rs`): `watch_start`; emits a debounced **`fs-changed`** event that the
  frontend listens to (refresh tree + git + reload open files + run config + Claude config + shelf
  + Docs index when visible).

**Adding a command:** write `#[tauri::command] fn foo(...) -> Result<T, String>` in the right
`*.rs`, add `foo` (or `module::foo`) to the `generate_handler!` list in `lib.rs`, then call
`invoke<T>("foo", {...})` from a state module. No capability entry is needed for custom
commands (only Tauri plugin commands need permissions in `capabilities/`).

## Persistence

- **Session** (per folder): `save_state(key=folder, data)` → `app_config_dir()/sessions/<hash>.json`
  + `last_session.txt` (editor groups + tabs + active group + panel layout). Restored on launch
  (`persist.loadSession`; reads legacy single‑group sessions too).
- **Settings** (app‑global): `localStorage["orbit.settings"]`, applied as CSS variables on
  `document.documentElement`. (Per WebView origin: dev and the installed app have separate stores.)
- **Project config** (committed/shared): `.orbit/run.json` (run configs) and `.orbit/claude.json`
  (Claude launcher command/args + shortcuts). `.orbit/shelf.json` is a personal view preference and
  is git‑ignored.

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
cargo test --manifest-path src-tauri/Cargo.toml  # backend unit tests
```

## Recipe: add a feature

1. Backend (if needed): add a `#[tauri::command]` + register it in `lib.rs`.
2. State: add fields/actions to an existing `lib/state/*.svelte.ts` (or a new module) that call
   `invoke(...)`.
3. UI: a component reads the state and calls the actions; reuse `Backdrop`/`Switch`/`Icon`.
4. Persist if it's a preference (settings) or session data (persist).
5. `npm run check` + `cargo test`, then verify in `npm run tauri dev`.
