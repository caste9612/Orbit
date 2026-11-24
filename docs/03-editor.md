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
- **Rows and columns** (M72): where each group sits is `workspace.groupLayout`, the same *columns of rows*
  model as the terminal panes (`paneLayout.ts`, see [Terminal](04-terminal.md#the-panel-and-side-by-side-chats)).
  - `groupLayout()` reads it reconciled with the groups that exist (`reconcile`): a group without a place
    goes at the end as a column, so a code path that forgets the layout can't hide a group.
  - `EditorArea` positions the groups absolutely from `paneGeometry`, with a 1 px gap that shows the line
    between them, and draws the splitters. Dragging one stores `workspace.groupSizes` (`resizePanes`, never
    below 160 px); a change of shape drops the sizes.
  - *Open to the side* (`openInNewGroup`) adds a column right of the active group. At `MAX_GROUPS` (6) the
    file opens in the next group, with a notice.
  - Closing the last tab of a group removes it, and the group next to it in the layout becomes active.
  - The layout and the sizes are saved with the session ([Persistence](07-persistence.md#the-session-of-a-folder)).
  - Before M72 the groups were equal columns in list order, and a new one always went to the far right.
- **Canonical paths** (M59): paths enter the workspace through `util.canonPath` (`\` on Windows) and are
  compared with `samePath`/`pathKey`. Go to definition, terminal links and the tree therefore reach the
  same document; before, one file could open as two documents and saving one overwrote the other.
- **Tabs move with the pointer**, not HTML5 drag and drop. `dragDropEnabled: true` (needed so OS file
  drops carry real paths) disables in-page HTML5 DnD on Windows, so `EditorArea` hit-tests with
  `elementFromPoint` to:
  - reorder tabs, or move them to another group, by dropping on a tab bar;
  - drop on the content of a group (`.group-body`, `dropZone`): on an edge, a new group on that side
    (`splitWithTab`); in the center, the tab moves into that group. The mark appears only where the drop
    does something (`dropFor`).
  - The only tab of a group dropped on another group's edge moves the whole group there. With the editor
    already split in six, an edge drop moves the tab into the target group instead.
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
- **Editable HTML documents** (M77) — an HTML file with `<meta name="doc-profile">` (the *editable-html*
  profile, see below) opens in a visual editor, `HtmlDocEditor.svelte`, instead of the plain preview: the
  toggle reads **Edit** / **Source**, and such a file opens in Edit by default.
- **Images and PDF** — `assetKind` tags them, and `AssetView.svelte` shows them through the asset
  protocol (no base64): images in `<img>`, PDFs in the WebView's viewer — WebView2's on Windows, WebKitGTK's
  PDF.js one on Linux, which `webkitgtk.rs` turns on (M75; without it the page stays blank).
  - Image zoom (M58): `Ctrl+wheel` steps through round levels around the pointer, a double-click toggles
    fit ⇄ 100%, dragging pans. Rendering turns pixelated from 300%.
  - Zoom and scroll are remembered per path while Orbit runs.
- **Diff, Git Graph, Activity** are editor tabs of their own kinds (`DiffView`, `GitGraph`,
  `ActivityBoard`).

## Editable HTML documents

HTML documents written by Claude (specs, reports) are richer than Markdown but hard to edit by hand. The
*editable-html* profile (M77) is plain HTML with a few fixed hooks, and Orbit has an editor that knows them.
The rules, the runtime and the skill that teaches them to Claude live in `src/lib/htmldoc/`:

| File | What it is |
|---|---|
| `SKILL.md` | The skill for Claude Code: the profile's rules (one offline file; `section[data-block][id]` blocks as children of `<main>`; static text; `data-item` for repeated things; datasets as `{"columns", "rows"}` JSON; generated content only in empty `[data-generated]`; theme tokens on `:root`; print), a skeleton, a checklist |
| `runtime.html` | The standard runtime (≈17.9 KiB, 6.1 gzipped): table of contents, the ☀/☾ theme switch, SVG charts (`bar`, `hbar`, `line`, `area`, `pie`, `donut`; `data-stacked`, `data-height`) from the datasets, the `data-layout` grids (`stack`, `split`, `grid-2`, `grid-3`, one column on narrow screens but not on paper), print rules |
| `inline-runtime.sh` | Replaces the `<!-- doc-runtime -->` marker with the runtime, or refreshes an older one: Claude runs it instead of copying 18 KiB by hand |
| `htmlDoc.ts` | The map of a document and every edit, as pure functions over the source text (tested in `htmlDoc.test.ts`) |
| `shim.js` | The script Orbit adds to the page shown in the editor |
| `templates/*.html` | The generic templates that ship with Orbit (English, no branding, no runtime: it's added when a document is created) |

The menu Claude → *Install the HTML documents skill* writes the first three into
`<Claude's folder>/skills/editable-html/` ([Claude](05-claude.md#the-html-documents-skill)). Duplicating a
block gives new ids to the block, its datasets and every id inside it (SVG markers included), with the
references to them in the copy.

**The source is the truth.** The editor never saves the live page:
- `analyze(src)` parses the buffer with Lezer HTML (the parser CodeMirror already has) and returns the
  blocks, the text leaves (elements holding only text and inline tags), the items (`tr`, `li`,
  `[data-item]`), the datasets and charts, the tokens of `:root` (light, and dark from a
  `prefers-color-scheme: dark` media block), and the problems against the profile.
- Every edit is the replacement of a range of the text: a paragraph's content, a block moved with its
  lines, a dataset rewritten one row per line with the source's indentation, a token's value. Diffs stay
  minimal, Claude's formatting and comments survive, and the dirty flag, autosave, the unsaved-changes
  questions and the reload when Claude rewrites the file work unchanged.
- Each edit also bumps `rev`, so a CodeMirror on the same file in another group takes the new text; a
  change from there (or from disk) reloads the page. *Open to the side* gives source and editor, live.

**The page runs sandboxed.** The plain HTML preview never runs scripts, because a page on the asset
protocol's origin could read any file (its scope is `**`). The editor needs the document's scripts (table of
contents, charts), so `frameDoc` builds a copy for an `<iframe srcdoc>` with `sandbox="allow-scripts
allow-modals"` and **without** `allow-same-origin` (an opaque origin), and with, as the very first element,
a Content Security Policy that allows only inline code: no network, no files, no IPC. The profile's first
rule (one offline file) is what makes that possible. The copy also gets `data-orbit-ref` on the text leaves,
`data-orbit-item` on the items, and `shim.js` at the end; none of it reaches the file. Two iframes take turns:
a new copy loads hidden and is shown when ready, so structural edits don't flash.

**What the shim does**: it makes the text leaves `contenteditable`; Enter confirms (Shift+Enter is a line
break), paste is plain text on one line, links don't navigate (Ctrl+click opens a web link). It posts the
inner HTML of an edited leaf (debounced, cleaned of its own marks) and the selected block and item, and
forwards Ctrl+S, Ctrl+Z, Ctrl+Y. Orbit accepts only text and inline tags back (`acceptableInline`).
Messages the other way change the page live without a reload: a token (`css`), a layout, a dataset
(re-rendered by the runtime), print.

**The panel** (`HtmlDocPanel.svelte`): *Sections* (drag to reorder, move, duplicate with new ids and
dataset names, delete, add after the selected one), the selected section (layout, the selected row, list
item or card — move, duplicate, delete — and its datasets as an editable grid; renaming a column updates
the charts' `data-x`/`data-y`), *Style* (the tokens, with a color picker for hex values, and a light/dark
preview when the document has a dark theme), *Problems* (with *Insert runtime* and *Copy prompt for Claude*).
Undo and redo keep whole snapshots of the source (typing in one text within 2 s is one step). *PDF* prints
the page from the iframe: the system dialog saves it as PDF, with the runtime's print rules.

**Light and dark.** Every document has a dark theme (the skill requires it, the validator flags a document
without one): its tokens redefined in a `@media screen and (prefers-color-scheme: dark)` block. The editor
shows the document in Orbit's theme (`isLightTheme`), and *Light*/*Dark* in the Style panel shows the other: the
frame copy rewrites the document's `prefers-color-scheme` queries and declares `<meta name="color-scheme">`, so
the frame's scrollbars and controls follow the theme too. Opened in a browser, the runtime adds a
small ☀/☾ button that turns the dark blocks on and off through the CSSOM (`media.mediaText`), remembered per
document; it isn't printed, the editor hides it, and `<html data-theme-toggle="off">` removes it.

### Templates

*New document from template…* is in the Explorer's menus: on a folder or a file (that folder), on the empty space
(the project root), and in the Solution view on projects, folders and *Other files*. The dialog
(`NewDocDialog.svelte`, state in `state/docTemplates.svelte.ts`) shows the destination with *Change…* (a folder
picker), so the command doesn't depend on where you clicked. It lists the templates of this PC, in `~/.orbit/templates` (`list_doc_templates`;
company templates live there, never in this public repository), and Orbit's own. A template is a document of
the profile with `{{key}}` or `{{key|Label}}` fields, `<meta name="doc-template">` (its name),
`description` and `doc-template-file` (the proposed file name, with fields). The dialog asks the fields
(`templateFields`: today's date for `date`/`data`), shows the filled document in a sandboxed preview, and
creates the file: fields replaced and escaped, the template's metas dropped (`fillTemplate`), and the runtime of
this Orbit inserted or refreshed. The new document opens in the visual editor. *Install the HTML documents
skill* copies every template into the skill with an index, so Claude starts from the matching one.

Your own templates are the point: anyone can turn the forms they already use into templates without them ever
entering Orbit. The skill's *Making a template* section tells Claude how to convert a form or a model document
(Word, PDF, HTML): keep its header and look, make fields only of what is known at creation (code, title, author,
date), leave the `<!-- doc-runtime -->` marker for Orbit, put a per-page footer in `@page` margin boxes, and save it
in `~/.orbit/templates`, where the dialog sees it at once.

## Opening and saving

- **Drop files from the OS**: `EditorArea` listens to the webview drag-and-drop events and opens the
  dropped paths.
- **Autosave** (on by default, IntelliJ-style) saves dirty files on window blur and when you switch tab.
  `savePath(path, { auto: true })` is silent and skips files changed on disk, so an external edit (Claude
  writing the same file) is never overwritten.
- **Unsaved changes** are never lost silently: closing tabs, closing the window, switching repo and
  updating all go through `unsaved.resolveUnsaved` ([Persistence](07-persistence.md#closing)).
