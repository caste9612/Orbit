# Development

Setting up, running, testing and debugging Orbit, and recipes for the most common changes.

## Requirements

- Node ≥ 20, Rust stable, and the [Tauri prerequisites](https://tauri.app/start/prerequisites/) for your
  platform:
  - Windows: WebView2 (preinstalled on Windows 11) and the MSVC build tools;
  - Linux: WebKitGTK 4.1 and libsoup3;
  - macOS: the Xcode command line tools.
- Built and verified end to end on Windows. The code is cross-platform by construction (Tauri 2,
  standard crates, `cfg`-gated platform code); a Linux/macOS validation build is still an open item.

## Running and building

```bash
npm install
npm run tauri dev       # Vite with hot reload + the Rust core in debug
npm run tauri build     # release binary + installers in src-tauri/target/release
```

- In `tauri dev`, Svelte components hot-reload. A change to a widely shared module or to
  `package.json`, or to a Markdown file the app imports (`README.md`, `docs/`), reloads the whole page.
  - The terminals' PTYs live in the backend and survive the reload.
  - The new page starts its own tabs, so the old PTYs are left without a tab. Kill them with
    `invoke('pty_kill', { id })` or restart the app.
- `npm run tauri build` needs no signing key: the signed updater artifacts are produced only by the
  release script ([Release](11-release.md)).

## Tests

```bash
npm run check                                    # svelte-check: types of TS and Svelte
npm run test                                     # vitest: pure frontend logic
cargo test --manifest-path src-tauri/Cargo.toml  # Rust unit tests
```

- **Frontend tests** live in `*.test.ts` next to the module: `util`, `caretStyles`, `searchText`,
  `editorTabs`, `shelfRules`, `symbolMaps`, `terminalLayout`. Only pure logic is tested (no runes, no
  DOM): keep the logic of a new feature in a plain `.ts` so it can be.
- **Rust tests** sit in each module (`#[cfg(test)] mod tests`). They cover:
  - the window plan and key resolution (`winsession`);
  - the symbol parsers, the incremental index against a full scan, and folders ignored by git
    (`symbols`);
  - the reference lexer (`refs`);
  - Activity's segmentation, including incremental reads against a from-scratch parse (`activity`);
  - the process walk for Claude chats (`claudeproc`).
- **Benchmarks** are tests marked `#[ignore]`: `symbols::scan_timing` (set `ORBIT_SCAN_ROOTS` to the
  projects to scan), `activity::scan_timing`, `activity::scan_live_bench`. Run them with
  `cargo test --release -- --ignored --nocapture <name>`.

## Debugging

- **Diagnostic logs**: turn them on in Settings → Updates & logs. They go to a ring buffer and to
  `logs/orbit-<pid>.log` in the app config folder; *Open logs…* shows, filters and exports them. The
  clipboard, paste and terminal paths are instrumented.
- **DevTools** — the context menu is suppressed, so open DevTools from outside:
  1. Start Orbit with `WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS=--remote-debugging-port=9333`.
  2. Open `edge://inspect`, or drive the page over the Chrome DevTools Protocol.
  - From the console you can import the state modules (`await import("/src/lib/state/…")`) to read or
    change the state.
  - Import the module URL the app actually loaded. After a hot update that's the one with `?t=`; a plain
    import would create a second, empty instance.
- **An isolated instance** for experiments that must not touch your installed Orbit (its settings,
  sessions, WebView2 profile):

  ```bash
  npx vite --port 1420 --strictPort &
  CARGO_TARGET_DIR=<scratch>/target-devtest TAURI_CONFIG='{"identifier":"com.visialab.lume.devtest"}' \
    cargo build --manifest-path src-tauri/Cargo.toml
  ```

  Then start `<scratch>/target-devtest/debug/orbit.exe` with the DevTools variable above. Rules that
  keep tests honest and harmless:
  - **One test instance at a time**: two instances on the same profile share the WebView2 browser and
    the debugging port, so input and measurements go to the wrong page.
  - **A clone, never the working tree**: an instance writes into the files it opens (autosave), so open
    a clone of the repo.
  - **No real Claude sessions**, which cost tokens:
    - set `"command": "Write-Host"` in the clone's `.orbit/claude.json`, so a chat prints its arguments.
      Not `echo`: PowerShell's `echo` with no arguments waits for input;
    - point `CLAUDE_CONFIG_DIR` to a scratch folder, to fake Claude Code's registry of running chats.
  - **Turn off what fires on its own**: on a fresh profile, set *Launch Claude in the default terminal*
    and autosave off before opening a folder.
- **Reproducing races**: `__TAURI_INTERNALS__.invoke` can't be replaced, but Tauri 2's IPC goes through
  `window.fetch` to `http://ipc.localhost/<command>`. Wrapping `fetch` to delay one command (e.g.
  `read_file`) makes a timing bug deterministic (M65).
- **Measuring** (Windows): `scripts/measure-orbit.ps1` reports RAM (private working set of the core and
  of Orbit's WebView2 processes), idle CPU, threads and handles, and the size of the binary, installers
  and `dist/`. `measure-orbit-ram.ps1` reports RAM only. Close other instances first: they share the
  WebView2 processes.

## Recipes

**Add a command** — see [Backend](08-backend.md#adding-a-command).

**Add a setting** — see [Settings](09-settings.md#the-settings-window).

**Add a feature end to end**
1. Backend, if needed: a command (async if it can be slow) registered in `lib.rs`.
2. State: fields and actions in the right `lib/state/*.svelte.ts`, or a new module. Pure logic goes in a
   `.ts` with a test.
3. UI: a component that reads the state and calls the actions. Reuse `Backdrop`, `Switch`, `Icon`,
   `ContextMenu`, `Splitter`. A rarely shown overlay or viewer goes through `Lazy` to stay out of the
   startup chunk.
4. Persist it: a preference goes in `settings`, session data in `persist`.
5. Run `npm run check`, `npm run test`, `cargo test`, then try it in `tauri dev`. Measure what can be
   slow, before and after.
6. Docs: update the page of the area and the README if it's visible to users, and write the milestone in
   `NOTES.md` (the why, the numbers, how it was verified).

**Add an editor extension** — write it in `lib/editor/`, add it to the extension list in
`Editor.svelte`, behind a `Compartment` if a setting changes it, and give it a base theme for its CSS.

**Add a sidebar view** — a component loaded through `Lazy` in `Sidebar.svelte`, an entry in
`layout.SidebarView` and in the top bar's views, and a strip icon in `PanelStrip.svelte`.
