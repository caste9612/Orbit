# Settings, keyboard and themes

User preferences, the Settings window, keyboard presets, themes and their *look*, cursor styles, icons.

## The settings model

`state/settings.svelte.ts` holds one `$state` object, saved in `localStorage["orbit.settings"]`:

| Group | Fields (default) |
|---|---|
| Appearance | `theme` (`vs2026`), `accent` (`auto` = the theme's), `motion` (on) |
| Editor | `fontMono` (JetBrains Mono, shared with the terminal), `editorFontSize` (13), `editorCaret` (Smooth, line), `codeLens` (on), `autosave` (on), `mdMode` (`readme`: preview for READMEs only), `revealActive` (off: the ⌖ toggle in the Explorer) |
| Terminal | `terminalFontSize` (13), `termCaret` (Smooth without blink; block in shells, bar in chats), `webgl` (on), `terminalScrollback` (3,000) |
| Claude | `claudeTerminal` (on: the first terminal at startup is a chat), `bellNotify` (on) |
| Keyboard | `keymap` (`orbit` / `vs` / `intellij` / `custom`), `customKeys` |
| Updates & logs | `checkUpdates` (on), `logging` (off since M62) |

- **Applying**: `applySettings` writes CSS variables on the document root, and the components read them:
  - fonts and sizes (`--font-mono`, `--editor-font-size`);
  - the theme palette and *look*;
  - the accent and `--accent-rgb`;
  - `--motion-ms`, `--caret-transition`.
  - Editor and terminal pick the changes up live through effects.
- **Saving**: `startSettingsAutosave` saves on every change. Load-time sanitizing fixes unknown values
  (e.g. `sanitizeEditorCaret`).
- **Migrations** run once, marked in the saved object ([Persistence](07-persistence.md#migrations)).
- `nudgeFontSize` is behind `Ctrl+wheel` over the editor or the terminal (10–24 px).

## The Settings window

`Settings.svelte`, loaded on demand, is a large modal (M64). It has a search box on top, six categories
on the left (Appearance, Editor, Terminal, Claude, Keyboard, Updates & logs) and the version with *Check
now* in the footer.
- **Rows are data.** `ROWS` describes each setting: category, name, a hint with `code` in backticks, and
  search keywords. The `control` snippet draws its control (switch, select, slider, swatches, theme
  thumbnails, buttons).
- **Search** is over that data, not the markup. `searchText.ts` (`queryTerms`, `matchesAll`: every word,
  in any order; `segments` for highlighting) filters rows and keyboard shortcuts across all categories.
  `MatchText.svelte` highlights the hits, and the categories with no hits are dimmed.
- **Keys**:
  - `Ctrl+F` focuses the search;
  - `Esc` clears it first, then closes (the search stops the event before `Backdrop` sees it);
  - while a key is being captured for a custom shortcut, `Esc` cancels the capture without closing.
- **Live cursor previews** (loaded on demand):
  - `EditorCaretPreview.svelte` is a real CodeMirror view with the editor theme and cursor;
  - `TerminalCaretPreview.svelte` is an xterm with no process behind it: the component echoes text,
    arrows, Home/End and Enter. It has *Shell* and *Claude chat* tabs.
  - Both follow the settings live.
- The window opens on the last category (`settingsUI.section`), or on a given one with
  `openSettings(section)`.
- It's centered on whole pixels with CSS `round()`: a transform or `margin: auto` lands on half a pixel
  when the window width is odd, and the text blurs.

**Adding a setting**:
1. Add the field with its default to `settings`. If it's not a primitive, sanitize it on load.
2. If CSS needs it, write the variable in `applySettings`.
3. Add a row to `ROWS` (category, name, hint, keywords) and its control in the `control` snippet;
   `SWITCHES` maps simple on/off rows.
4. Update [README](../README.md) (Settings bullet) and this page.

## Keyboard

`state/keybindings.svelte.ts` is the single registry:
- **`COMMANDS`**: each command has an id, a label, a category and a key per preset (Orbit, Visual
  Studio, IntelliJ).
- **`FIXED`**: the shortcuts that aren't configurable (editor and mouse), shown in the reference.
- **Dispatch**: `App.svelte`'s window `keydown` calls `matchCommand(e)`. `Ctrl` also matches `Cmd`. Keys
  are letters, digits, F-keys and arrows, never symbols that change with Shift.
- **Custom keymap**: `createCustom(base)` copies a preset into `settings.customKeys`; *Edit custom*
  resumes it.
  - In Settings → Keyboard (`SettingsKeyboard.svelte`), each command is click-to-rebind.
  - The capture listens in the capture phase on the window, so rebinding `Ctrl+P` doesn't open Quick Open.
  - `keyStringFromEvent` rejects bare non-function keys, and `conflictKeys` marks duplicates.
- `keyForId` gives the active key of a command, for tooltips.

## Themes

- **Tokens** live in `src/app.css`:
  - surfaces, ink, lines and accent in a Tailwind `@theme` block (the pre-JS defaults are Orbit Dark);
  - runtime variables in `:root`: `--color-bg`, `--color-panel`, `--accent-rgb`, the editor's `--cm-*`,
    the radius scale `--r-*`, `--h-tabs`/`--h-head`, `--icon-stroke`, shadows.
  - Components never hard-code a color, a radius or a bar height.
- **`THEMES`** (`settings.svelte.ts`): Visual Studio 2026 Dark (the default since 0.9), Orbit Dark,
  Eclipse, Slate, Orbit Light.
  - Each theme is a full set of variables.
  - Variables only some themes define are removed when switching to one without them, so nothing
    sticks.
  - The VS 2026 colors were sampled from a real VS 2026 screenshot (M55).
- **`look`**: a theme can also change the *shape* of the UI:
  - `fontSans`;
  - `radii` (the `--r-xs…--r-xxl` scale every `border-radius` uses);
  - `heights` (tab bar and panel headers);
  - `iconStroke`;
  - `iconSet: "fluent"` (squarer glyphs in `Icon.svelte`);
  - `flatGlyphs` (outline file tiles).
- **Accent**: *Auto* follows the theme; a preset (blue, purple, green, teal, amber) overrides it.
- **Editor**: `editorTheme(light)` picks a dark or light highlight style through a compartment;
  selection, active line and brackets read `--cm-*`.
- **Terminal**: `terminalTheme.ts` builds xterm's colors from the theme (editor surface, ink, selection,
  a dark or light ANSI set), re-applied live.

## Cursor styles

`caretStyles.ts` (pure, tested) holds the shared definitions (M63):
- **Styles**:
  - *Smooth* (the default): a 100 ms glide and a soft, fading blink;
  - *Classic*: no glide, hard blink;
  - *Comet*: Smooth plus a Kitty-like trail;
  - *Elastic*: Smooth plus a Neovide-like smear: the head lands at once, the tail follows;
  - *Blaze*: Smooth plus a warm trail with a glow.
- **Customize**: shape, glide (off, on jumps only, always), blink style, trail and its length, glow
  (steady or breathing). A changed option makes the style *Custom* unless it matches a preset again
  (`styleOf`).
- **Fixed for everyone**: the accent color, the 100 ms glide, blink stopping after 15 s of rest, a hollow
  block in an unfocused terminal.
- **Defaults**: the editor is Smooth with a 2 px line; the terminal is Smooth without blink, with a block
  in shells and a bar in Claude chats.
- How each side draws it: [Editor](03-editor.md#the-cursor), [Terminal](04-terminal.md#the-cursor).

## Icons, file glyphs, logo

- `Icon.svelte`: inline line-art icons (Lucide style, `currentColor`), with a Fluent variant set used by
  the VS 2026 look.
- `FileGlyph.svelte` renders the file icons from `util.fileIcon()`:
  - a dedicated SVG symbol for languages with a strong identity;
  - otherwise a colored monogram tile;
  - otherwise a line-art fallback.
- `Logo.svelte` draws the brand mark inline: a planet with a gradient, a tilted ring and a satellite.
  `app-icon.svg` is the single source of the OS icons: run `npx tauri icon app-icon.svg`, then keep only
  the six files already tracked in `src-tauri/icons`.
