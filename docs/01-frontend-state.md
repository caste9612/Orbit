# Frontend state

Every piece of application state lives in a module under `src/lib/state/`. A module exports a `$state`
object (Svelte 5 runes) plus the actions that change it and the `invoke` calls to the backend; components
read the object and call the actions, and re-render on their own when what they read changes.

## Patterns shared by the modules

- **`$state` for UI state, `$state.raw` for big data.** A deep proxy over thousands of objects is slow to
  build and to read: the symbol index (`codeIndex.symbols`/`refs`) and the Activity units are `$state.raw`
  and replaced whole when they change, with the lookups going through maps rebuilt once per change
  (M62).
- **Module-level effects** run inside `$effect.root`: the session autosave (`persist.startAutosave`), the
  terminal store (`terminalPersist.startTerminalPersistence`), the settings autosave
  (`settings.startSettingsAutosave`). Each serializes what it needs inside the effect, so every field it
  reads becomes a dependency, and debounces the write.
- **Hooks instead of import cycles.** When a lower module must call a higher one, the higher one
  registers a callback:
  - `workspace.setBeforeNavigate`: `codeIndex` records the navigation history;
  - `persist.onBeforeQuit`: `terminalPersist` saves the chats before the window closes.
  - Where a cycle is unavoidable at call time, a dynamic `import()` breaks it (folders → persist).
- **Non-reactive maps for high-frequency data.** Cursor and scroll positions per tab
  (`workspace.rememberView`) and image zoom per path (`AssetView`) change continuously and must not
  re-run effects; the session reads them when it saves.
- **Pure logic in a plain `.ts`** next to the module, unit-tested with vitest:
  - `editorTabs.ts`, `terminalLayout.ts`, `symbolMaps.ts`, `shelfRules.ts`;
  - in `lib/`: `searchText.ts`, `caretStyles.ts`, `util.ts`.

## Workspace and window

### `workspace` — documents, editor groups, the open folder
- **Owns**:
  - the open folder (`rootPath`, `rootName`, `branch`) and `ready`, true once the session is restored;
  - `switching`, true while a repo switch is in flight;
  - the light-window flags (`light`, `lightProject`);
  - the **document pool** `openFiles`, with kinds `file`, `diff`, `image`, `pdf`, `activity`, `gitgraph`;
  - the **editor groups** (split view), each with its tabs, active tab and per-group previews;
  - `editorStatus` (line and column for the status bar).
- **Open**: `openFile`, `openFileAt`, `openDiff`, `openActivityBoard`, `openGitGraphBoard`,
  `openInNewGroup`, `openPreviewToSide`.
- **Tabs and groups**: `setActiveTab`, `setActiveGroup`, `closeTab`/`closeTabs`/`closeFile`, `moveTab`,
  `reorderTab`, `splitWithTab`, `togglePreview`/`setPreview`.
- **Saving and reloading**: `updateContent`, `savePath`, `saveActive`, `autosaveAll`, `reloadOpenFiles`
  (external changes), `renameOpenPaths`/`closeUnder` (files renamed or deleted in the tree).
- **Session support**: `restoreGroups`, `resetDocs`.
- **Positions in files** (M66): `rememberView`, `recallView`, `tabView`.
- See [Editor](03-editor.md) for the model.

### `folders` — the repository tabs of the window
- **Owns** the window's repo list. It's kept per window in memory and persisted in the active folder's
  session as `repos`; it's never in `localStorage`, which all instances share (M39).
- `setFolders`, `addFolder`, `removeFolder`, `moveFolder` (drag to reorder), `openFromList`, `cycleRepo`,
  `selectRepoIndex` (Ctrl+1…9).
- Switching goes through `persist.switchFolder`.

### `explorer` — the file tree
- **Owns** `tree` (lazy per folder) and the `reveal` signal for "follow the active file".
- `openRoot`: the one path that opens a folder. It reads the first level, sets `rootPath`, rebuilds the
  saved expansion, starts the watcher and git status, loads `.orbit/` configs and resets the per-repo
  views.
- `toggle`, `collapseAll`, `refreshTreeFor` (only the folders holding changed paths, M62), `revealInTree`.
- Inline file operations: `startCreate`, `startRename`, `commitEdit`, `deleteEntry`.
- `copyPath`, `copyRelPath`, `revealPath`.
- Expanded folders: `snapshotExpanded` (in memory, across repo switches); `expandedRel`/`seedExpanded`
  (saved in the session, M66). Keys are `pathKey`.

### `persist` — sessions
- `loadSession`, `saveSessionNow`, `startAutosave`.
- `switchFolder`, `openLight`, `promoteLight`.
- `settleUnsaved`, `prepareQuit` + `onBeforeQuit`.
- Everything about what is saved and when is in [Persistence](07-persistence.md).

### `layout` — panels and motion
- **Owns**:
  - sidebar view, visibility and width; terminal panel visibility and width;
  - `editorCollapsed` (no tabs → the editor shrinks, decided at runtime);
  - `terminalMaximized` (chats full width);
  - `focusPanel`;
  - `animating`.
- `selectView`, `toggleSidebar`, `toggleTerminal`, `toggleTerminalMaximized`, `resizeSidebar`/`resizeTerminal`.
- Motion: `beginMotion`, `animate`, `motionUntil`, `motionMs` ([UI shell](02-ui-shell.md#layout-motion)).

### `unsaved` and `toast`
- `unsaved`: the one "unsaved changes" question of the app (M59). `askUnsaved(files)` resolves to `save` /
  `discard` / `cancel`, and `resolveUnsaved` asks and saves; `UnsavedDialog.svelte` is mounted once in
  `App`. Tab closing, window closing, "close all", repo switch, "open as project" and updates all use it.
- `toast`: transient notifications (`notify`) plus a **sticky, clickable** kind (`notifyAttention`,
  coalesced by `key`, removed with `dismissByKey`). The Claude-waiting and update notices use it.

## Code and files

### `codeIndex` + `symbolMaps` — the project symbol index
- `initIndex`, `rescan`, `scheduleRescan`.
- Go to definition: `goToDefinition`, `goToDefinitionAtCursor`, `defsFor`, `openPicker`.
- Related bar: `contextAt`.
- Code lens: `lensesFor`, `openReferences`, `openImplementations`, `showImplementers`.
- Semantic highlighting: `semSets`, `semIndex`.
- Navigation history: `nav`, `navBack`, `navForward`, `jumpTo`.
- Project symbols palette: `wsPalette` and its actions.
- `symbolMaps.ts` (pure) builds the lookup maps once per index version: by file, by name, implementers,
  constructor counts.
- See [Code navigation](06-code-navigation.md).

### `symbols`, `quickopen`, `search`, `projectFiles`, `docs`
- `symbols`: the **Go to symbol in file** palette (Ctrl+Shift+O). It loads `editor/outline.ts` dynamically
  on first use, because the outline pulls in CodeMirror.
- `quickopen`: Ctrl+P fuzzy file finder. Its file list is held at module level and released on close.
- `projectFiles`: a cached `list_files` per root, shared by Quick Open and Docs (`invalidateFiles` on
  folder change).
- `search`: project text search, debounced (`search_in_project`).
- `docs`: the Docs view tree (root `README` + `docs/**`). The index comes first, then numeric prefixes,
  with titles cleaned from file names.

### `git`
- Status (`refreshStatus`, coalesced), tree decorations (`decorations`), the gutter `tick`, diff
  (`showDiff`), staging and commit, branches (`loadBranches`, `checkout`, `createBranch`), discard, log
  and Git Graph, upstream ahead/behind.
- Fetch, pull, push and merge run the `git` CLI in a terminal tab (your credentials, no network code in
  Orbit).
- `gitRel(path)`: git paths are relative to the repo root, which is above the open folder when a
  subfolder is opened (M59).

### `dotorbit`, `shelf` + `shelfRules`, `scratch`, `run`
- `dotorbit.ts`: reads and creates `.orbit/` files (`readOrbitConfig` tells *absent* from *invalid* JSON:
  an invalid file warns and keeps the current menu), and `teachClaudeSection` writes a marked section into
  `CLAUDE.md`.
- `shelf`: folders put aside by category, both per path and by name (e.g. every `bin`/`obj`), in
  `.orbit/shelf.json`. The hide and group logic is in `shelfRules.ts`.
- `scratch`: the one-click scratchpad, `.orbit/scratch.txt`.
- `run`: run configurations from `.orbit/run.json` (`runConfig`), running a script file (`runFile`,
  `isRunnable`), `openConfig`, `teachClaude`.

## Terminals and Claude

### `terminals` + `terminalLayout`
- **Owns**:
  - the terminal tabs of every repo: id, names, color, shell, cwd, `root`;
  - `kind` (`shell`/`claude`/`run`), `chat` (the Claude conversation), `dormant`, attention;
  - the active tab and the real focus;
  - the side-by-side panes per repo (`layouts`, `autoLayout`, `sizes`, `zoomId`);
  - the tabs popped out into floating windows (`floating`).
- `addTerminal`, `closeTerminal`, `setActiveTerminal`, `syncActiveTerminalToRoot`.
- Side-by-side panes: `splitWith`, `showInPane`, `closePane`, `toggleZoom`, `setArrangement`, `setSizes`.
- Attention: `notifyTerminalBell`, `clearAttention`, `goToTerminal`, `waitingTerminals`.
- Restore: `restoreTerminal`, `restoreRepoTerminals`, `tabWithChat`.
- Floating windows: `removeTerminalKeepPty`, `redockTerminal`.
- `terminalLayout.ts` (pure, tested) is the pane model: columns of rows, with insert, remove, replace,
  auto arrangement and drop zones.
- See [Terminal](04-terminal.md).

### `terminalPersist`
- Saves each window's terminal tabs and restores them dormant at startup (M66): `restoreTerminals`,
  `wakeTerminal`, `startTerminalPersistence`.
- See [Terminal](04-terminal.md#restore-after-a-restart).

### `claude`
- **Owns** the Claude config of the repo (`.orbit/claude.json`: command, flags, shortcuts, wrappers).
- `launchClaude`, `runShortcut`, `resumeClaude` (goes to an open tab if the chat is already there).
- `chatCommand`: the command line of a restored chat.
- Wrappers: `openWrapper`, `composeWrapper`.
- Quick edits from the prompts panel: `addShortcut`/`removeShortcut`, `addWrapper`/`removeWrapper`.
- `openClaudeConfig`, `teachClaudeConfig`.
- See [Claude](05-claude.md).

### `activity`
- **Owns**:
  - the work units from all Claude transcripts (`loadActivity`, `$state.raw`);
  - which projects are shown (`activityPrefs`, `toggleRepo`, `dismissProject`);
  - session colors and labels (`sessionColor`, `sessionLabel`).
- `openActivity` opens the panel and the board.

## Preferences and app

### `settings`
- **Owns** every user preference (`settings`, saved in `localStorage`) and applies them as CSS variables.
  It also defines the themes (`THEMES`), accents and fonts.
- `loadSettings`, `startSettingsAutosave`, `openSettings(section?)`.
- See [Settings](09-settings.md).

### `keybindings`
- The command registry (`COMMANDS`, one key per preset), the fixed shortcuts (`FIXED`) and `matchCommand`
  for the window-level dispatch.
- Custom keymap: `createCustom`, `setCustomKey`, `conflictKeys`, `keyStringFromEvent`.
- `mergedGroups` feeds the Keyboard page of Settings.

### `updater`
- In-app updates (M59):
  - `checkForUpdates`: automatic about 30 s after start and every 6 h, never in dev builds;
  - `updates`: the state of the check and of the dialog;
  - `installUpdate`, `announceUpdated`.
- See [Release](11-release.md#the-in-app-update).

### `logs`
- Diagnostic logs (`log`, `logWarn`, `logError`): an in-memory buffer plus batched writes to
  `logs/orbit-<pid>.log` (`append_log`), and global error capture.
- Everything is gated by `settings.logging`, off by default since M62.
- `LogViewer.svelte` shows, filters and exports them.
