# Persistence

What Orbit remembers, where it keeps it, and the sequences that read and write it: startup, switching
repository, closing. The app config folder (`app_config_dir`) is `%APPDATA%\com.visialab.lume` on Windows.
The name is historical, and a test build with another identifier gets its own folder.

## What is saved where

| What | Where | Scope | Written by |
|---|---|---|---|
| Settings | `localStorage["orbit.settings"]` | app (per WebView origin: dev and installed app differ) | `settings.svelte.ts` |
| Activity choices | `localStorage["orbit.activity.hidden"]`, `["orbit.activity.dismissed"]` | app | `activity.svelte.ts` |
| Repo colors picked by hand | `localStorage["orbit.repoColors"]`, keyed by `pathKey` (M69) | app | `repoColors.svelte.ts` |
| Session of a folder | `sessions/<hash>.json`, key `<winKey>\|<folder>` | window + folder | `persist.svelte.ts` |
| Terminals of a window | `sessions/<hash>.json`, key `<winKey>\|#terminals` | window | `terminalPersist.svelte.ts` (M66) |
| Last folder (fallback) | `last_session.txt` | app | `save_state` (not for the terminals) |
| Window registry | `windows/<id>.json`, `windows-restore.json`, `windows-control.json`, `update-restart.json` | app | `winsession.rs` |
| Diagnostic logs | `logs/orbit-<pid>.log` (~2 MB, rotated) | process | `append_log` |
| Project config | `.orbit/run.json`, `.orbit/claude.json` (committed); `.orbit/shelf.json`, `.orbit/index/` (git-ignored); `.orbit/scratch.txt` | project | run, claude, shelf, codeIndex, scratch |
| Claude's bell | `.claude/settings.local.json` (`preferredNotifChannel`) | project, local | `claude.svelte.ts` |

Orbit also **reads** Claude Code's own files, never writing them:
- `~/.claude/projects/*/*.jsonl`: the transcripts, for Activity and to check that a chat can be resumed;
- `~/.claude/sessions/<pid>.json`: the running chats, for restoring the terminals.

`CLAUDE_CONFIG_DIR` replaces `~/.claude` for both (for Activity since M68; see [Claude](05-claude.md)).

**File names**:
- The `sessions/` file name is a hash of the key (`save_state`/`load_state` in `lib.rs`). The key carries
  the window's **stable key** (`winKey`), so the same folder open in two windows keeps two sessions (M39).
- The hash is pinned in `session_hash` (M68): SipHash-1-3 with zero keys over the key's bytes plus
  `0xFF`. That's what Rust's `DefaultHasher` produced when the files were created, so names didn't
  change. The standard library doesn't promise `DefaultHasher` stays the same across Rust versions, and
  a change would have made every window lose its sessions after an update.
- Two tests guard it: one compares with `DefaultHasher`, one checks fixed values.

## The session of a folder

```
{ "v": 2, "root": "<folder>", "repos": ["<folder>", …],          // the window's repo tabs
  "groups": [{ "tabs": [...], "active": "...", "previews": [...],
               "views": { "<path>": [anchor, head, firstLine] } }],   // M66
  "activeGroup": 0,
  "expanded": ["src", "src/lib"],                                    // M66, relative paths
  "layout": { "sidebarView", "sidebarVisible", "sidebarWidth",
              "terminalVisible", "terminalWidth", "terminalMaximized" } }
```

- **Saving**: `persist.startAutosave` serializes inside an effect, so a change to tabs, layout or the tree
  saves after 400 ms.
- **When it doesn't save**:
  - with no folder open;
  - in a light window;
  - in the middle of a repo switch (M66: the new folder is open but its tabs and tree aren't yet).
- **Restoring** (`loadSession`) applies the layout first, decides the editor collapse from the saved
  tabs, seeds the expanded folders, opens the folder, then the tabs.
- Old single-group sessions (v1) still load. Paths saved in two forms (`src/x` and `src\x`) are merged.

## The terminals of a window

`{ "v": 1, "repos": [{ "root", "tabs": [{ kind, title, shortName, customTitle, autoTitle, color, shell,
cwd, chat: { id, cwd } }], "active", "layout": [[tab indexes]], "auto", "sizes" }] }`

- Saved 800 ms after any change, and once more before closing, after re-reading the chats.
- Restored dormant at startup, for the repos still in the window.
- See [Terminal](04-terminal.md#restore-after-a-restart).

## The window registry

Each Orbit window is a process. `winsession.rs` lets them cooperate through files, with no IPC (M36).
- **Live set**: every window writes `windows/<id>.json` (`id` = pid + time) with its folder, geometry and
  stable `key`.
  - One file per window, written atomically through a per-process temp file, so processes never race.
  - Geometry is recorded on blur and before snapshots: the last normal (non-maximized) position, kept
    on a connected monitor.
- **Restore set** `windows-restore.json`: what a **bare launch** reopens.
  - A window closing on its own snapshots the live set (itself included), then leaves it. So after
    closing windows one by one, only the last one comes back, as in VS Code.
  - **Close all** snapshots everything first.
- **Bare launch**: this process opens the first entry and respawns the others. Each gets its geometry and
  key through `ORBIT_WIN_*` / `ORBIT_WIN_KEY`, so each window finds **its** session. A launch with a
  folder or a file opens only that.
- **Close all**: snapshot, then a token in `windows-control.json`. Every instance watches the config
  folder; when the token grows, it emits `orbit-quit-request`, saves or asks, and calls `quit_now`.
- **Crash recovery**: at startup, `prune_dead` drops the entries of dead processes, so a crash never
  blocks "reopen all".
- **After an update**: `update-restart.json` (valid 10 minutes) makes the relaunched process reopen every
  window ([Release](11-release.md#the-in-app-update)).
- **The `ORBIT_WIN_*` variables** (geometry and `ORBIT_WIN_KEY`) are for the child they're meant for.
  Since M69 `open_new_window` and the terminals' shells drop them from what they inherit. Before, a
  window reopened by "reopen all" passed its own key to a plain *New window*: the two windows shared
  their sessions and terminal stores, and the new one opened right on top of the old one.
- Light windows aren't registered. Floating terminals aren't windows of the registry.

## A repo moved to a new window

Dragging a repo tab down out of the top bar, or *Move to new window* in its menu, moves the repo to a new
window (M69, `repoWindow.ts`). Each window is a process and a PTY can't change process, so the terminals
close here and the new window brings them back as after a restart:
1. If the repo has live Claude chats, a confirmation says that a reply in progress would stop.
2. If it's the active repo, unsaved files are settled first (Save all / Don't save / Cancel).
3. A new window key is generated, and under it:
   - `exportSession` writes the repo's session: the current state if it's the active repo, otherwise the
     saved one, with `repos` set to just this repo;
   - `exportRepoTerminals` writes its terminals, after reading the chats from Claude Code's registry.
4. The repo leaves this window's list (switching to a neighbor first if it was active), and its PTYs are
   killed, floating windows included, before anything resumes the same chats.
5. `open_new_window(dir, key, place)` starts the new process with `ORBIT_WIN_KEY` and a geometry:
   `"cursor"` puts its title bar under the pointer (the drop point), `"beside"` offsets it from this
   window. The size is this window's normal size.
6. The new window starts like a respawned one: it finds the session and the terminals under its key and
   restores them dormant; the visible chat resumes with `claude --resume`.

## Startup

1. **Rust** (`winsession::init`):
   - prune dead entries;
   - decide between restore and explicit open (`plan`, pure and tested);
   - resolve the window key;
   - position the hidden window, then show it.
2. **Frontend** (`App.svelte`, on mount):
   1. `loadSettings` applies theme, fonts and CSS variables.
   2. The backend events and the window close request get their listeners.
   3. `startup` returns `dir`, `file`, `search`, `light`, `winKey`, `updatedTo`.
   4. `setWinKey` and `setTerminalsKey`; the "updated" notice if `updatedTo` is set.
   5. The light window path (`openLight`), or `loadSession(dir?, { repos: true })`, then the file or the
      search requested on the command line.
   6. `startAutosave`.
   7. `restoreTerminals` (dormant tabs), then `startTerminalPersistence`.
   8. The default chat, only if the repo has no tabs and the setting is on.
   9. `workspace.ready = true`, then the update checks.
3. **Background**: the symbol index (cache, then rescan), git status, the file watcher, the Activity scan
   when its view opens.

## Switching repository

`persist.switchFolder(path)`:
1. **Settle unsaved files**: autosave if on, then ask about what's left. *Cancel* stops here.
2. **Open one layout motion** and set `workspace.switching`.
3. **Swap out the current repo**: save its session (serialized at once, written in parallel with reading
   the target's), suspend autosave with `rootPath = null`, drop its documents.
4. **Load the target**: `loadSession(target)` applies layout and editor collapse, opens the folder,
   shows that repo's terminal tabs as soon as the root is open, then restores the tabs. The sidebar view
   and visibility stay as they were.
5. **Finish**: `settleEditorCollapsed` and the end of `switching` (the effects that waited run now),
   then the motion closes and terminals refit once.
6. **If the folder can't be opened**: the previous one comes back and the caller drops the dead entry.

## Closing

- **Every way out goes through `prepareQuit`**:
  - the window's ✕, `Alt+F4` and the taskbar (`onCloseRequested`);
  - "close all" from any window (`orbit-quit-request`);
  - an update.
- `prepareQuit` does, in order:
  1. autosave, if it's on;
  2. the unsaved question, bringing the window to the front if needed (*Cancel* keeps it open);
  3. the `onBeforeQuit` hooks: the terminals save their chats;
  4. the session, written at once.
- **Rust**: `CloseRequested` records the geometry; `Destroyed` leaves the live set (`finish_close`, with
  the snapshot unless a close-all is in progress) and exits the process. The PTYs are killed on exit.
  - Exiting there matters (M66): a floating terminal would otherwise keep the process alive with nowhere
    to dock back.

## Migrations

Settings carry one-time markers, so a migration runs once and later choices stick:
- `uiV09`: the VS 2026 theme becomes the default;
- `webglM62`: GPU rendering is turned on;
- the old *Smooth caret* becomes the editor cursor style, keeping the glide off if you had turned it
  off.
