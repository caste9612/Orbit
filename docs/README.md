# Orbit developer documentation

How Orbit is built, page by page: what each part does, how the pieces talk to each other, and where to
look in the code. The user-facing description is the [project README](../README.md); the reasons behind
every decision, milestone by milestone, are in [`NOTES.md`](../NOTES.md) (Italian). Milestones are cited
as **M*n*** throughout, so you can jump to the matching NOTES entry.

## Reading order

Start from the overview, then open the page of the area you're touching.

| Page | What it covers |
|---|---|
| [Architecture](ARCHITECTURE.md) | The big picture: stack, one process per window, frontend ⇄ backend (commands and events), module kinds, repo layout, startup, conventions |
| [01 · Frontend state](01-frontend-state.md) | The `lib/state` modules — what each one owns, its main functions, the patterns they share |
| [02 · UI shell](02-ui-shell.md) | `App.svelte` and the window frame: top bar and repo tabs, sidebar and panel strips, splitters, layout motion, editor auto-collapse, light window, the component map |
| [03 · Editor](03-editor.md) | CodeMirror and its extensions, editor groups (split view), tabs, positions in files, previews (Markdown, HTML, images, PDF), autosave, clipboard |
| [04 · Terminal](04-terminal.md) | xterm and the PTYs, the terminal panel (tabs per repo, side-by-side chats), floating windows, WebGL, the drawn cursor, attention, run configs, restore after a restart |
| [05 · Claude](05-claude.md) | Launching Claude, shortcuts and wrappers, the bell, which conversation runs in a tab, resuming chats, the Activity view |
| [06 · Code navigation](06-code-navigation.md) | The project symbol index, code lens, go to definition, project and file symbols, the related bar, semantic highlighting, Quick Open, search, folders ignored by git |
| [07 · Persistence](07-persistence.md) | Everything Orbit saves and where: settings, per-window sessions, terminals, the window registry, `.orbit/`, the files read from Claude Code; startup, switch and quit sequences |
| [08 · Backend](08-backend.md) | The Rust core: modules, every Tauri command, the events, threading, the file watcher, git, plugins and permissions |
| [09 · Settings](09-settings.md) | The settings model and window, keyboard presets, themes and their *look*, cursor styles, icons and file glyphs |
| [10 · Development](10-development.md) | Setup, running, tests, debugging (logs, DevTools over CDP, an isolated instance), recipes for common changes |
| [11 · Release](11-release.md) | Versions, the signed release script, `latest.json`, installers, the in-app update flow |

## Keeping these pages current

- A change that alters how something works updates the page of that area in the same commit, and
  [`NOTES.md`](../NOTES.md) gets the milestone entry with the why and the measurements.
- The pages describe the design and point to files and functions; they don't copy code. When a
  function moves or is renamed, search these pages for its name.
- Sizes are in KiB/MiB (base 1024), as the README Footprint table.
