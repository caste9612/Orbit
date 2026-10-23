# Backend

The Rust core under `src-tauri/src/`. It does what needs the operating system — files, git, terminals and
processes, scans, windows, updates — and talks to the WebView through **commands** (called with
`invoke`) and **events** (emitted to the WebView).

## Modules

| Module | Role |
|---|---|
| `lib.rs` | Entry point: `run()` builds the app, registers plugins, state and every command; files, sessions, startup arguments, misc commands; kills the PTYs on exit |
| `winsession.rs` | Windows: the per-window registry, reopen all, close all, geometry, the restart after an update, exit when the main window is gone ([Persistence](07-persistence.md#the-window-registry)) |
| `pty.rs` | Terminals: PTYs keyed by tab id, output streaming, shells list, which Claude chat runs in each |
| `claudeproc.rs` | Claude Code's registry of running chats + the process tree ([Claude](05-claude.md#which-conversation-runs-in-a-tab)) |
| `git.rs` | Git through libgit2, local operations only |
| `symbols.rs` | The heuristic, incremental project symbol index ([Code navigation](06-code-navigation.md)) |
| `refs.rs` | The identifier lexer behind the code lens counts and `ref_list` |
| `activity.rs` | Work units from Claude transcripts, incremental, plus a watcher ([Claude](05-claude.md#the-activity-view)) |
| `watcher.rs` | The project file watcher → `fs-changed` |
| `solution.rs` | Visual Studio solutions and projects for the Explorer's Solution view, read without MSBuild ([UI shell](02-ui-shell.md#explorer-folders-or-a-solution)) |
| `updater.rs` | In-app updates through `tauri-plugin-updater`, driven by Orbit's own commands ([Release](11-release.md)) |

Plugins: `tauri-plugin-dialog` (folder picker, confirm), `tauri-plugin-clipboard-manager` (reliable
clipboard), `tauri-plugin-updater` (used from Rust only: no JS package, no permissions).

## Threading

- A plain `#[tauri::command] fn` runs on the window's **main thread**. Fine for quick work; anything that
  can be slow would freeze the UI.
- Since M62 the slow ones run elsewhere:
  - `#[tauri::command(async)]` puts them on a thread pool: file reads and writes, search, file lists,
    git status, diff, log, graph, show, branches, upstream;
  - `async fn` + `spawn_blocking` serves the scans: symbols, references, Activity, Claude chats.
- Since M68 the **git writes** run off the main thread too (stage, unstage, commit, discard, create and
  switch branch), and so does deleting files and folders.
  - A branch switch on a big repository rewrites the working folder, and deleting a `node_modules`
    takes seconds; both used to freeze the window.
  - The git writes go through one lock (`GIT_WRITE` in `git.rs`): in parallel, two index writes would
    collide on `index.lock`. "Stage all" sends one call per file at once; the main thread used to line
    them up.
- Before M62, a large repository's `git status` stalled every IPC call after each save. Now the 99th
  percentile of IPC latency under load is about 2 ms.

## Commands

**Files and startup** (`lib.rs`)

| Command | What it does |
|---|---|
| `startup` | The folder, file, search, light flag, window key and `updatedTo` this window was started with |
| `read_dir` · `read_file` · `write_file` | Directory listing, text read, write (async) |
| `create_file` · `create_dir` · `rename_path` · `delete_path` | File operations from the tree |
| `list_files(root)` | Every file of the project, skipping ignored folders (Quick Open, Docs) — async |
| `shelf_find(root, folders, files)` | What the shelf's rules by name take (M73): the folders and files matching each name or pattern (`*`, `?`, case-insensitive), at most 500 per rule. One walk that doesn't enter what it found, folders ignored by git, `.git`, `node_modules`, `target`, `dist` — async |
| `search_in_project` | Text search; skips binaries and ignored folders — async |
| `resolve_existing(paths)` | First existing path among candidates (terminal links) |
| `project_root(path)` | Nearest ancestor with `.git` (light window → "Open as project") |
| `load_state` · `save_state(key, data, pointer?)` | Sessions and terminal stores; `pointer: false` doesn't update the last-folder pointer |
| `open_new_window(dir?, key?, place?)` | A new Orbit process. It never inherits this window's `ORBIT_WIN_*` variables; with `key` and `place` (a repo moved to a new window, M69) it gets that session key and a position, `"cursor"` or `"beside"` ([Persistence](07-persistence.md#a-repo-moved-to-a-new-window)) |
| `reveal_path` · `open_url` | Show a file in the OS file manager; open an http(s) link |
| `app_version` · `append_log` · `log_file_path` | Version; diagnostic log file |

**Windows** (`winsession.rs`): `register_window(folder)`, `close_all_windows`, `quit_now`, `quit_others`,
`other_instances`.

**Terminals** (`pty.rs`)

| Command | What it does |
|---|---|
| `pty_spawn(id, cols, rows, cwd?, shell?)` | Starts a shell; returns `false` if the id already exists (re-attach, the initial command must not be sent) |
| `pty_write` · `pty_resize` · `pty_kill` · `pty_alive` | Input, size, close, liveness (floating windows check it before docking) |
| `list_shells` | Shells found on the machine — Windows: PowerShell, PowerShell 7 (if installed), Command Prompt, Git Bash (in Program Files, in the per-user install, or next to the `git.exe` on `PATH`), WSL; elsewhere: `$SHELL`, bash, zsh, fish, sh |
| `pty_claude_sessions(ids)` | Claude conversation id and folder running in each terminal (M66) |
| `claude_transcripts(ids)` | Which conversations have a transcript, i.e. can be resumed (M66) |

**Git** (`git.rs`): `git_status` (with `workdir`, the repo root), `git_diff`, `git_stage`, `git_unstage`,
`git_commit`, `git_discard`, `git_branches`, `git_checkout_branch`, `git_create_branch`, `git_log`,
`git_show`, `git_graph` (all branches in topological order, with parents and refs; the frontend computes
the lanes), `git_upstream` (ahead/behind, computed locally and memoized per commit pair).
- libgit2 is built without network support, so there's no OpenSSL or libssh2. Fetch, pull, push and
  merge run the `git` CLI in a terminal tab, with your credentials.
- `git::ignored(repo, path)` (not a command) is the "ignored by git" test shared by the symbol index,
  references, search, Quick Open and the watcher.

**Code** (`symbols.rs`, `refs.rs`): `scan_symbols(root, knownSymbols?, knownRefs?)`, `ref_list(root,
name)`.

**Activity** (`activity.rs`): `scan_activity(limit?)`, `watch_activity`.

**Watcher** (`watcher.rs`): `watch_start(root, recursive?)`, non-recursive for the light window.

**Solutions** (`solution.rs`, M70), all async:

| Command | What it does |
|---|---|
| `sln_find(root)` | The `.sln` and `.slnx` files of the repository, down to three levels, the shallowest first; skips hidden folders, `bin`, `obj`, `node_modules`, `packages` |
| `sln_load(path, root?)` | Solution folders (with their solution items) and projects, with parents; with `root`, also the folders that *Other files* doesn't repeat: the project folders and the ones holding nothing but project folders |
| `proj_load(path, showAll, sln?)` | What the Solution Explorer shows for a project: items with their path in the view (`Link`, C++ filter or path on disk), linked/missing/excluded flags and `DependentUpon`; plus frameworks, packages, project references and assemblies, the output type and target frameworks |
| `msbuild_path()` | Visual Studio's `MSBuild.exe` (through `vswhere`), or none; cached |

- **A small MSBuild evaluation**, not MSBuild itself. Properties come from `Directory.Build.props`,
  `Directory.Packages.props`, NuGet's `obj/<project>.nuget.g.props|targets`, the project, its local
  `Import`s, `<project>.user` and `Directory.Build.targets`, as Visual Studio reads them, with
  `Configuration=Debug` and `BuildingInsideVisualStudio=true`. On top of that:
  - simple conditions (comparisons, `Exists`, `and`/`or`/`!`) and the common property functions
    (`[MSBuild]::NormalizeDirectory`, `GetDirectoryNameOfFileAbove`, `Path.Combine`, string methods…);
    what it can't evaluate counts as true;
  - SDK default items (the project folder minus `DefaultItemExcludes`, bin, obj and hidden folders),
    then `Include`/`Exclude`/`Remove`/`Update` in document order, wildcards and `%(RecursiveDir)`;
  - only the item types the Solution Explorer shows (Compile, None, Content, Page…, the C++ ones), plus
    those declared with `AvailableItemName` or present in the `.vcxproj.filters`;
  - several target frameworks: evaluated for the first, as Visual Studio does.
- **Checked against MSBuild** on a 45-project solution (M70): the same files for every project, the
  same view path for every linked file, and the same references except one added by a NuGet package's
  own build files, which aren't read.
- Files are UTF-8 or UTF-16 with a BOM; XML through `quick-xml`'s event reader (the version `plist`
  already brings into the dependency tree).

**Updates** (`updater.rs`): `update_check` (from the latest GitHub release's `latest.json`),
`update_download` (progress events), `update_install` (verifies the signature, starts the installer).

## Events

| Event | From | Payload, purpose |
|---|---|---|
| `pty-data-<id>` | `pty.rs` | Terminal output (base64), coalesced in ~8 ms batches under heavy output |
| `pty-exit-<id>` | `pty.rs` | The shell ended |
| `fs-changed` | `watcher.rs` | `{ paths, ignoredOnly }`, debounced: the frontend refreshes only the tree folders involved, git (unless `ignoredOnly`), open files, `.orbit/` configs, the Docs index if visible, and schedules a symbol rescan |
| `activity-changed` | `activity.rs` | A transcript changed (debounced): Activity reloads |
| `update-progress` | `updater.rs` | `[received, total]` while downloading an update |
| `orbit-quit-request` | `winsession.rs` | Another window asked everyone to close (close all, update) |
| `term-redock` | floating window (frontend) | A floating terminal goes back to the panel |

The watcher ignores `.orbit/index`, so writing the symbol cache never triggers itself.

## Permissions

`capabilities/default.json` applies to `main` and `term-float-*`:
- core defaults;
- dialog open and confirm;
- clipboard read and write;
- creating webview windows;
- the window operations the custom title bars need (drag, minimize, maximize, close, always on top,
  title);
- `event:allow-emit`.

Orbit's own commands need no entry; only plugin commands do.

## Adding a command

1. Write `#[tauri::command] pub fn foo(...) -> Result<T, String>` in the right module. Make it `(async)`,
   or `async fn` + `spawn_blocking`, if it can take more than a few milliseconds.
2. Add it to `generate_handler!` in `lib.rs` (`module::foo`).
3. Call it from a state module: `invoke<T>("foo", { … })`. Tauri converts camelCase arguments to
   snake_case.
4. Put a unit test next to it (`#[cfg(test)] mod tests`), and keep its pure part separate so the test
   doesn't need Tauri.
