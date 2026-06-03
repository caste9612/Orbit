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
    state/            # reactive state + actions (Svelte 5 runes in .svelte.ts)
    editor/           # CodeMirror extensions (theme, indent guides, git gutter)
    util.ts           # pure helpers (paths, file icons, language label, time)
src-tauri/
  src/lib.rs          # Rust entry: fs/session/window commands + run() (registers all)
  src/git.rs          # git commands (libgit2)
  src/pty.rs          # terminal/PTY commands
  src/watcher.rs      # file watcher (emits "fs-changed")
  tauri.conf.json     # window, bundle, productName "Orbit"
  capabilities/       # Tauri permission capabilities
docs/                 # this doc + screenshot
NOTES.md              # decision log (per milestone), Italian
CLAUDE.md             # tells Claude Code the .orbit/run.json format
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
| `workspace` | open folder, open tabs, active tab, branch, cursor position; `openFile`, `saveActive`, … |
| `explorer` | the lazy file tree + inline file ops (new/rename/delete) |
| `git` | status, diff, branches, commit, discard, history, **gutter `tick`**, tree decorations |
| `terminals` | terminal tabs (id/title/shell/cwd) + active tab |
| `run` | `.orbit/run.json` run configs + "Set up for Claude" |
| `shelf` | shelved folders by category (`.orbit/shelf.json`) |
| `search` | project text search (debounced) |
| `quickopen` | Ctrl+P fuzzy file finder |
| `settings` | font/size/accent/smooth‑caret/webgl (localStorage) + applies CSS vars |
| `layout` | panel sizes/visibility + focused panel |
| `persist` | per‑folder session save/restore (autosave via `$effect.root`) |
| `toast` | transient notifications |

State is plain **Svelte 5 runes**: `export const x = $state({...})`; components reading those
fields re‑render automatically. Cross‑module reactive reads (e.g. `git.tick`) drive effects.

### Heavy modules are lazy

`Editor.svelte` (CodeMirror) and `Terminal.svelte` (xterm) are loaded through
`LazyEditor.svelte` / `LazyTerminal.svelte` (dynamic `import()`), so the startup chunk stays
small (~117 KB). The terminal WebGL renderer is a *further* dynamic import, gated on
`settings.webgl` (off by default).

## Backend & IPC

Rust commands are defined with `#[tauri::command]` and registered in `lib.rs` `run()`. The
frontend calls them with `invoke("name", {args})`. Areas:

- **Filesystem** (`lib.rs`): `read_dir`, `read_file`, `write_file`, `create_file`,
  `create_dir`, `rename_path`, `delete_path`, `list_files`, `search_in_project`, `startup`.
- **Session** (`lib.rs`): `load_state`/`save_state` (keyed per folder).
- **Window** (`lib.rs`): `open_new_window`.
- **Git** (`git.rs`): `git_status`, `git_diff`, `git_stage`, `git_unstage`, `git_commit`,
  `git_branches`, `git_checkout_branch`, `git_create_branch`, `git_discard`, `git_log`, `git_show`.
- **Terminal** (`pty.rs`): `pty_spawn`, `pty_write`, `pty_resize`, `pty_kill`, `list_shells`;
  streams output as `pty-data-<id>` events.
- **Watcher** (`watcher.rs`): `watch_start`; emits a debounced **`fs-changed`** event that the
  frontend listens to (refresh tree + git + reload open files + run config + shelf).

**Adding a command:** write `#[tauri::command] fn foo(...) -> Result<T, String>` in the right
`*.rs`, add `foo` (or `module::foo`) to the `generate_handler!` list in `lib.rs`, then call
`invoke<T>("foo", {...})` from a state module. No capability entry is needed for custom
commands (only Tauri plugin commands need permissions in `capabilities/`).

## Persistence

- **Session** (per folder): `save_state(key=folder, data)` → `app_config_dir()/sessions/<hash>.json`
  + `last_session.txt`. Restored on launch (`persist.loadSession`).
- **Settings** (app‑global): `localStorage["orbit.settings"]`, applied as CSS variables on
  `document.documentElement`. (Per WebView origin: dev and the installed app have separate stores.)
- **Project config** (committed/shared): `.orbit/run.json` (run configs). `.orbit/shelf.json`
  is a personal view preference and is git‑ignored.

## Theming

`src/app.css` holds every color/size token: surfaces, ink, accent, lines in a Tailwind `@theme`
block, plus runtime‑overridable CSS variables in `:root` (`--color-bg`, `--accent-rgb`,
`--editor-font-size`, `--caret-transition`, radii, shadows). Settings overrides these at runtime.
The editor's own colors live in `lib/editor/theme.ts` (a CodeMirror theme + highlight style that
reads the same CSS variables).

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
