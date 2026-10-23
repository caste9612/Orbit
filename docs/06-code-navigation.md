# Code navigation

Go to definition, project and file symbols, code lens, the related bar and semantic colors, without a
language server: everything comes from a heuristic **symbol index** that the Rust core builds and keeps
up to date incrementally.

## The symbol index

**Backend** (`symbols.rs`):
- `scan_symbols(root, knownSymbols, knownRefs)` walks the project and extracts symbols with hand-written
  parsers: C#/Java, C/C++, TS/JS/JSX/Svelte, Python, Rust, Go. It takes no `regex` crate and no LSP.
  - A symbol is `{ name, kind, file, line, container, bases, isAbstract }`: types, methods, functions,
    properties, plus base types and an abstract flag.
  - The parsers are deliberately conservative:
    - C/C++ functions only from lines that open a body;
    - C#/Java members need a modifier before the name and no expression in front, so calls and `new X()`
      aren't methods;
    - TS/JS: a value built with a callback isn't a function, and functions nested in functions are local
      helpers.
- **Incremental** (M62): for the last two roots the backend keeps what each file yielded (symbols and
  per-identifier line counts, with ids from a shared dictionary), keyed on mtime + size. A save re-reads
  one file. The walk order and the 50,000-symbol cap are those of a full scan, so the result is the same.
- **Versions**: the frontend passes the versions it already has, and the backend returns symbols and refs
  only when they changed. When they change it also writes `.orbit/index/{symbols,refs}.json`, a
  rebuildable, git-ignored cache.
- **Skipped folders**: always `node_modules`, `.git`, `target` and `dist`, plus folders ignored by git
  (`git::ignored`). The git rule applies to references, search and Quick Open too.
- The watcher ignores `.orbit/index`, so writing the cache never triggers a rescan.
- It runs on a background thread.

**Frontend** (`codeIndex.svelte.ts` + `symbolMaps.ts`):
- At folder open, `initIndex` loads the cache instantly, then rescans in the background.
- `scheduleRescan` runs on `fs-changed`, debounced, and skips batches where every path is in an ignored
  folder (`ignoredOnly`).
- `symbols` and `refs` are `$state.raw`. `buildMaps` rebuilds the lookup maps once per index change: by
  file, by name, implementers, constructor counts. Moving the cursor through a large file therefore no
  longer walks every symbol of the project at each line (M62: 23 s → 0.7 s of script for 400 lines).

## Using the index

| Feature | Entry point | How |
|---|---|---|
| **Go to definition** | F12, `Ctrl+click` | `goToDefinitionAtCursor` resolves the word under the cursor; a picker when several declarations share the name |
| **Project symbols** | `Ctrl+T` | `WorkspaceSymbols.svelte`: fuzzy search over the whole index, jump to the declaration |
| **Go to symbol in file** | `Ctrl+Shift+O` | `symbols.svelte.ts` + `SymbolPalette.svelte`; the outline comes from CodeMirror's syntax tree (`editor/outline.ts`, loaded on first use), not from the index |
| **Related bar** | under the breadcrumb | `RelatedBar.svelte` shows `contextAt`: the enclosing symbol (type › method), clickable base types and implementers, `KindBadge` monograms; it reserves its height when the file has symbols, so nothing jumps |
| **Semantic colors** | editor | `editor/semanticHighlight.ts` colors the project's own types and functions (`semSets`) in the visible range, skipping strings and comments — useful where the grammar is only lexical (C#, C/C++) |
| **Back / forward** | `Alt+←/→`, top-bar arrows | `workspace` calls `beforeNavigate(dest)` before changing the active file; `codeIndex` pushes the position being left, so jumps *and* tab switches are recorded |

## Code lens

"N references · M implementations" above classes, interfaces, types, methods and functions (M60):
- **Counting**: `refs.rs` lexes each file by language family, skipping comments and strings, reading
  interpolations, and handling Rust lifetimes and raw strings and Python prefixes. It counts the
  **lines** containing each identifier, in the same walk as the symbols, so the number on the lens equals
  the rows of its list.
- **What a lens shows**: `refs − declarations − constructors`, with **≈** when the name is declared more
  than once. Constructors and Python dunders get no lens.
- `editor/codeLens.ts` draws block widgets above the declarations (a `StateField`, mapped through edits).
  `Editor.svelte` feeds it from `codeIndex.lensesFor(file)` whenever the index, the counts, the setting
  or the file change.
- *N references* calls `ref_list(root, name)`: every matching line, at most 2,000, declarations filtered
  out. The list opens in the `Ctrl+T` palette. *N implementations* lists the implementers.
- Counting by name means a common name can over-count; the ≈ marks the ambiguous cases.

## Files and text

- **Quick Open** (`Ctrl+P`, `quickopen.svelte.ts`): fuzzy match over `list_files`, cached per root in
  `projectFiles.ts` and shared with the Docs view. The list lives only while the palette is open.
- **The shelf's categories hidden from search** (M73) are left out of Quick Open and of search results
  (`shelf.hiddenFromSearch`, applied on the frontend after the walk).
- **Search** (`search.svelte.ts`, `SearchView.svelte`): `search_in_project` lowercases each file once,
  skips binaries (a NUL in the first 8 KB) and folders ignored by git. It runs on a background thread.
- **Follow the active file** (the ⌖ toggle in the Explorer): an effect calls `explorer.revealInTree`,
  which expands the file's folders (lazily) and scrolls the row into view. The call is `untrack`ed,
  because it writes the tree it would otherwise depend on.
- **Folders ignored by git** stay visible in the tree but are left out of the index, the references,
  search and Quick Open, as in VS Code. Changes inside them don't trigger git status or a rescan (M62).
