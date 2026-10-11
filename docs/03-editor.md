# Editor

CodeMirror 6 inside `Editor.svelte`, loaded on demand by `LazyEditor.svelte` with the first file you open.
Around it, `EditorArea.svelte` manages the editor groups (split view), the tabs and the viewers for what
isn't text.

## Documents and groups

- **One document pool, many groups.** `workspace.openFiles` holds each open document once, with its
  content, dirty flag and kind:
  - `file`;
  - `diff`, `image`, `pdf`;
  - the boards `activity` and `gitgraph`.
- Each entry of `workspace.groups` is a pane of the split view: an ordered list of tab paths, its active
  path and its own previews. The same file can be open in two groups and share one buffer.
- A document leaves the pool only when no group references it any more (`pruneDocs`).
- **Canonical paths** (M59): paths enter the workspace through `util.canonPath` (`\` on Windows) and are
  compared with `samePath`/`pathKey`. Go to definition, terminal links and the tree therefore reach the
  same document; before, one file could open as two documents and saving one overwrote the other.
- **Tabs move with the pointer**, not HTML5 drag and drop. `dragDropEnabled: true` (needed so OS file
  drops carry real paths) disables in-page HTML5 DnD on Windows, so `EditorArea` hit-tests with
  `elementFromPoint` to:
  - reorder tabs;
  - move them to another group;
  - split by dropping on an edge.
- **Tab menu** (M58): close, close others, close to the right, close saved, close all; then copy path,
  copy relative path, reveal in Explorer. Every close goes through `requestClose(targets)`: the dirty
  documents that would disappear entirely get one Save all / Don't save / Cancel question, and a failed
  save keeps its tab.

## The CodeMirror view

`Editor.svelte` builds one view per visible document, with:

| Extension | File | What it does |
|---|---|---|
| Theme + syntax colors | `editor/theme.ts` | `editorTheme(light)`: colors from CSS variables (`--cm-*`), so every theme adapts; a light highlight style for Orbit Light |
| Cursor | `editor/caret.ts` | Cursor styles (M63): shape, glide, blink, trail, glow — see below |
| Git gutter | `editor/gitGutter.ts` | Added/changed/deleted markers, reloaded only when this file is among the changed ones |
| Semantic overlay | `editor/semanticHighlight.ts` | Colors the project's own types and functions (C# and C/C++ included) from the symbol index |
| Code lens | `editor/codeLens.ts` | "N references · M implementations" above declarations |
| Indent guides | `editor/indentGuides.ts` | Vertical guides on the indentation |
| Core | `@codemirror/*` | line numbers, folding, history, bracket matching, selection matches, find/replace (`Ctrl+F`, panel on top), soft line wrapping |

- **Languages load on demand** from `@codemirror/language-data` by file name. Svelte has its own
  language pack, and a few extensions are mapped to known grammars.
- **Compartments** let settings apply live without recreating the view: theme, cursor style, language.
  Font and size changes call `requestMeasure`.
- **Saving**: `Mod-S` calls `savePath`, which writes the file and bumps `diskRev`.
- **External changes**: the watcher reloads the open file and bumps `rev`; the editor replaces the text
  but keeps the view, and the reload doesn't mark the file as modified.
- **`Ctrl+click`** runs go to definition at the clicked word; F12 does the same at the cursor, through
  the keyboard registry ([Code navigation](06-code-navigation.md)).
- `editor/activeEditor.ts` remembers the focused view, for *Go to symbol* and the context menu.
- The **context menu** (cut, copy, paste, select all, go to symbol) acts on the view. Copy and paste go
  through `lib/clipboard.ts`, so a failed copy is reported and *Cut* copies before deleting.

## Positions in files

The editor is recreated whenever its tab changes (`{#key}` on group and path). Since M66 it comes back
where you were:
- **What's kept**: cursor (anchor and head) and the first line in view, per tab (group + file), in a
  non-reactive map in `workspace` (`rememberView`/`recallView`).
- **When it's recorded**: the cursor at every change; the top line after a scroll, debounced, and only
  while the editor is still in the page (a detached view would measure 0).
- **When it's restored**: at creation, clamped to the current text, unless a jump (`gotoLine`) is pending.
- **Saved with the session** as `views`, so it also survives a restart.
- A file moved to another group, or closed and reopened, falls back to its last position anywhere
  (`viewByPath`, bounded to 300 files).

## The cursor

`caretStyles.ts` defines the five styles (Smooth, Classic, Comet, Elastic, Blaze) and the *Customize*
options; `editor/caret.ts` applies them (M63):
- CodeMirror's own layer blink is turned off; the plugin blinks the `.cm-cursor` itself through
  `data-caret-*` attributes, so the blink can fade or stretch;
- it stops while you type and after 15 s of rest;
- *glide on jumps only* sets `data-caret-snap` for two frames after a text change;
- trails are drawn by `caretTrail.ts` on a canvas created at the first trail, animated only while a
  trail is alive.

## Viewers and previews

- **Markdown** — `markdown.ts` renders sanitized HTML (`marked` + DOMPurify, both lazy): the WebView has
  IPC access, so a malicious README must not run scripts.
  - `MarkdownView.svelte` adds a heading TOC, task lists that write back to the source, and internal
    links and anchors.
  - Source ⇄ preview is per group (`EditorGroup.previews`), with the initial mode from `settings.mdMode`
    (preview for READMEs only, by default).
  - *Open preview to the side* splits source and live preview.
- **HTML** — `HtmlView.svelte` shows the file from disk in a sandboxed `<iframe>` served by the asset
  protocol. Anchors and relative assets work, page scripts never run (no `allow-scripts`), and the
  preview refreshes on save and on external changes (`diskRev`).
- **Images and PDF** — `assetKind` tags them, and `AssetView.svelte` shows them through the asset
  protocol (no base64): images in `<img>`, PDFs in WebView2's viewer.
  - Image zoom (M58): `Ctrl+wheel` steps through round levels around the pointer, a double-click toggles
    fit ⇄ 100%, dragging pans. Rendering turns pixelated from 300%.
  - Zoom and scroll are remembered per path while Orbit runs.
- **Diff, Git Graph, Activity** are editor tabs of their own kinds (`DiffView`, `GitGraph`,
  `ActivityBoard`).

## Opening and saving

- **Drop files from the OS**: `EditorArea` listens to the webview drag-and-drop events and opens the
  dropped paths.
- **Autosave** (on by default, IntelliJ-style) saves dirty files on window blur and when you switch tab.
  `savePath(path, { auto: true })` is silent and skips files changed on disk, so an external edit (Claude
  writing the same file) is never overwritten.
- **Unsaved changes** are never lost silently: closing tabs, closing the window, switching repo and
  updating all go through `unsaved.resolveUnsaved` ([Persistence](07-persistence.md#closing)).
