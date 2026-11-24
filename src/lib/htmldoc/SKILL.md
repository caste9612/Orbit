---
name: editable-html
description: Write documents (specs, reports, plans, reviews, technical explainers) as one self-contained HTML file that people can later edit by hand in Orbit's visual editor - text, sections, data and style - without asking Claude again. Use it whenever a document is to be produced as HTML ("an HTML report", "a spec as a web page", "an editable document"), whenever you change an HTML file that has <meta name="doc-profile">, and when asked to turn a form or a model document into a template for Orbit.
---

# Editable HTML documents (profile 0.2)

HTML is a better output than Markdown for rich documents: layout, tables, diagrams, charts, navigation. Its weak
point is that a generated HTML file is hard to edit by hand. This profile keeps your freedom over the look and adds a
few fixed **hooks**, so an editor (Orbit) can change text, move sections, edit data and restyle the document safely.
A document that follows it is still plain HTML that opens in any browser.

**The rules constrain the hooks, not the look.** Design as well as you would without them: typography, density,
color, callouts, diagrams, layout. A plain or generic-looking document is a failure of this skill too.

## Rules

1. **One offline file.** All CSS and JS inline. No network resources at all: no CDN scripts, no web fonts, no remote
   images, no `@import`. Images as `data:` URIs or inline SVG; system font stacks. (The editor runs the page under a
   Content Security Policy that blocks everything else, so a remote resource simply won't load.) Links to the web
   (`<a href="https://…">`) are fine.
2. **Blocks.** The content lives in one `<main>`: every part of the document is a `<section data-block id="…">`
   that is a **direct child of `<main>`**, and nothing else goes directly inside `<main>`. Ids are unique, stable,
   kebab-case. A block stands alone: it can be moved, duplicated or deleted without breaking the others (no wrappers
   spanning several blocks, no numbers written into headings - number them with a CSS counter if needed, so moving a
   block renumbers them). Outside `<main>` is page chrome -
   a `<header>` with title and subtitle, a `<nav>` with a heading and the table of contents, a `<footer>`: its text
   is editable, it just doesn't move.
3. **Text is static markup.** Every visible word is written in the HTML. Scripts never create or change text outside
   generated elements (rule 6). Text inside an `<svg>` is part of a drawing and isn't editable as text: keep the
   words people may want to change (captions, legends, explanations) in HTML next to the drawing. Put text in text elements - `p`, `h1`-`h6`, `li`, `td`, `th`, `figcaption`, `dt`,
   `dd`, `blockquote`, `summary`, or a `div`/`span` holding only text and inline tags (`strong`, `em`, `code`, `a`,
   `span`, `br`…). Don't mix bare text with block elements inside the same element.
4. **Repeated things are items.** Cards, steps, timeline entries, KPI tiles and other repeated elements carry
   `data-item` and sit side by side in the same parent, so they can be duplicated, reordered and deleted. List items
   (`li`) and table rows (`tr`) are items already.
5. **Data.** Tables are static `<table>` markup (`thead` + `tbody`). Any other data - what a chart shows - is a JSON
   dataset **inside the block that uses it**, always in this shape, one row per line, numbers as numbers:
   ```html
   <script type="application/json" data-dataset="revenue">
   {"columns": ["Quarter", "Revenue", "Costs"],
    "rows": [
     ["Q1", 120, 80],
     ["Q2", 180, 95]
    ]}
   </script>
   ```
   Dataset names are unique in the document.
6. **Generated content.** Whatever is built at runtime (table of contents, charts, anything a script draws) goes only
   into elements marked `data-generated`, which are **empty in the source**. Scripts write nowhere else and may run
   more than once (clear the element first). Behavior is fine: a script may toggle classes or `hidden`, highlight the
   current section in the table of contents, add copy-to-clipboard to code blocks, switch tabs - as long as it never
   creates or changes text outside generated elements and never moves or removes elements. (The editor never saves
   the live page, so classes a script toggles never end up in the file.)
7. **Style through tokens, light and dark.** Put the theme on `:root` as custom properties and use them everywhere:
   at least `--bg`, `--fg`, `--muted`, `--accent`, `--line`, `--surface`, `--font-body`, `--font-heading`,
   `--font-mono`, `--gap`, `--radius`, plus chart colors `--c1`…`--c6` when there are charts. Write colors as hex. All
   other CSS is free. **Every document has a dark theme**: redefine the same tokens in **one**
   `@media screen and (prefers-color-scheme: dark) { :root {…} }` block (`screen`, so printing stays light), with
   colors designed for dark - not an inversion. The few rules tokens can't express (a logo variant for dark
   backgrounds, an image that needs a light card) go in that same block. Check both themes before you finish. No
   `style=""` attributes for theming - use classes (a one-off value such as `style="--pct: 42%"` is fine).
8. **Print.** The document prints to PDF: the runtime adds page rules; mark anything that shouldn't print with
   `data-print="hide"`, a block that should start a new page with `data-print="break"`, and avoid fixed heights that
   would clip content on paper.
9. **Profile marker.** `<html lang="…">` with the document's language, a real `<title>`, and in `<head>`:
   `<meta name="doc-profile" content="0.2">`.

## The runtime

A standard runtime (`runtime.html`, in this skill's directory) draws the table of contents, the charts and the
layouts, and adds the print rules. **Don't write it yourself, and don't copy it by hand** - insert it:

1. Put the line `<!-- doc-runtime -->` on its own line just before `</body>`.
2. When the file is written, run `sh "<this skill's directory>/inline-runtime.sh" "<path of the document>"`. It
   replaces the marker with the runtime (and refreshes an older runtime if there is one).

Hooks it understands:

- `<div data-generated="toc"></div>` (any element, typically inside a `<nav>` with its own heading) - table of
  contents: an `<ol>` of links to the blocks, from the first heading of each one.
- **Charts**: a `figure` with `data-chart` and the name of a dataset of the same block:
  ```html
  <figure data-chart="bar" data-source="revenue" data-x="Quarter" data-y="Revenue,Costs" data-unit=" k€">
    <div data-generated="chart"></div>
    <figcaption>Revenue and costs per quarter.</figcaption>
  </figure>
  ```
  Types: `bar`, `hbar`, `line`, `area`, `pie`, `donut`. `data-x` defaults to the first column, `data-y` to every
  numeric column; `pie` and `donut` use the first `data-y` column. `data-stacked` stacks the series of a `bar` or
  `hbar` (positive values), `data-height="260"` fixes the height in pixels of a `bar`, `line` or `area` chart. Series
  colors are `--c1`…`--c6` (falling back to `--accent` and a built-in palette). Long `hbar` labels are cut with
  "…" (the full label is in the tooltip): keep category names short.
- **Layouts**: `data-layout="stack|split|grid-2|grid-3"` on a block. In a layout block the heading spans the whole
  width and **every other direct child is one cell**: wrap a column's content in a `<div>`, give cards `data-item`,
  use `data-span="full"` for a child that takes a whole row, and put a kicker or a lead together with the heading
  in a `<header>` (which spans the row too). `split` is two columns 3:2, the grids are equal columns; on narrow
  screens all collapse to one column, on paper they keep their columns. Without `data-layout` a block is free.
- `data-print="hide"` and `data-print="break"`, as in rule 8.
- A small ☀/☾ button (top right, not printed) lets the reader switch between the two themes; without a choice the
  document follows the system. It works by turning your dark block on and off, so write nothing for it.
  `<html data-theme-toggle="off">` removes it.

Visuals the runtime doesn't draw (architecture diagrams, timelines, flows): prefer **static inline SVG** written in
the source - it prints and needs no script. Use a script of your own only when it must be computed, and then it
renders into its own empty `<div data-generated="…">` and follows rules 3 and 6.

## Skeleton

```html
<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="doc-profile" content="0.2">
<title>Quarterly review</title>
<style>
:root {
  --bg: #ffffff; --fg: #1b1d21; --muted: #5d6470; --accent: #2f6fde; --line: #e3e6ea; --surface: #f5f6f8;
  --font-body: system-ui, "Segoe UI", Roboto, sans-serif; --font-heading: var(--font-body);
  --font-mono: ui-monospace, "Cascadia Code", Consolas, monospace;
  --gap: 1rem; --radius: 8px; --c1: #2f6fde; --c2: #e07b39;
}
@media screen and (prefers-color-scheme: dark) {
  :root { --bg: #16181c; --fg: #e6e8eb; --muted: #9aa1ad; --line: #2c3038; --surface: #1e2126; }
}
/* free CSS from here on, using the tokens */
</style>
</head>
<body>
<header><h1>Quarterly review</h1><p class="subtitle">…</p></header>
<nav><h2>Contents</h2><div data-generated="toc"></div></nav>
<main>
  <section data-block id="summary">
    <h2>Summary</h2>
    <p>…</p>
  </section>
  <section data-block id="revenue" data-layout="split">
    <h2>Revenue</h2>
    <div>
      <p>…</p>
    </div>
    <figure data-chart="bar" data-source="revenue">
      <div data-generated="chart"></div>
      <figcaption>…</figcaption>
    </figure>
    <script type="application/json" data-dataset="revenue">
    {"columns": ["Quarter", "Revenue"],
     "rows": [
      ["Q1", 120],
      ["Q2", 180]
     ]}
    </script>
  </section>
</main>
<!-- doc-runtime -->
</body>
</html>
```

## Templates

If the skill's directory has a `templates/` folder, read `templates/INDEX.md` first. When the request matches a
template (a procedure, a verification protocol, a test report…), **start from it**: copy it, replace every
`{{field}}` or `{{field|Label}}` with real content (ask for what you can't know, such as document codes or names),
delete the `doc-template` and `doc-template-file` meta tags, and keep its structure, ids, classes and styling -
fill the sections, add rows and blocks as needed, but don't restyle it. A template's company header and module code
are part of the document.

## Making a template

When asked to turn a form, a model document or an existing document (Word, PDF, HTML) into a template:
- Write a document of this profile that keeps the original's structure and look: its header (logo, document code,
  revision, signatures), its sections and its tables. A logo goes in as a small `data:` image (a few KiB; SVG if
  you can), with a variant for the dark theme when the original is dark on white.
- Turn into fields only what changes from one document to the next and is known when it's created: code, title,
  author, date. Write `{{key}}`, or `{{key|Label}}` the first time a field appears: the label is what Orbit asks.
  `{{date}}` comes filled with today's date. Everything else is content: leave short placeholder text, and one
  sample row in each table.
- In `<head>`, add `<meta name="doc-template" content="…">` (the name in Orbit's list),
  `<meta name="description" content="…">` (one line: what's in it) and
  `<meta name="doc-template-file" content="{{code}}-{{title}}">` (the file name Orbit proposes, fields allowed).
- Don't insert the runtime: leave the `<!-- doc-runtime -->` marker, and Orbit inserts its own when it creates a
  document.
- Keep every rule of the profile, dark theme and print included. If the original has a footer on every page
  (module code, revision, page X of Y), put it in `@page` margin boxes.
- Save it as `~/.orbit/templates/<name>.html` (ask before overwriting one). Orbit lists it at once under
  *New document from template…*; Orbit's *Install the HTML documents skill* passes it on to Claude as well.

## Changing an existing document

When asked to change a document that has `<meta name="doc-profile">`: keep the profile, change only what was asked,
keep the ids, and don't reformat the parts you don't touch - people review the diff. If its runtime is older than
`runtime.html`, run the inline script again.

## Before you finish

- No `http(s)://` resources (`<a href>` links excepted), no web fonts.
- Every child of `<main>` is a `section[data-block][id]`; ids are unique (inside SVGs too).
- No text created by scripts; every `data-generated` element is empty in the source.
- Datasets in `{columns, rows}` form, inside their block, names unique; every `data-source` names one of them.
- Tokens on `:root`; a real dark theme in one `screen` media block (checked, not inverted).
- The runtime is inserted (the `<!-- doc-runtime -->` marker is gone), except in a template.
