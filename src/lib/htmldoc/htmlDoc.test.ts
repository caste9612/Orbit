import { describe, expect, it } from "vitest";
import {
  analyze,
  addBlock,
  acceptableInline,
  cssTokens,
  deleteBlock,
  deleteItem,
  duplicateBlock,
  duplicateItem,
  frameDoc,
  insertRuntime,
  isDocProfile,
  itemOf,
  itemPosition,
  moveBlock,
  moveItem,
  parseCell,
  replaceInner,
  renameColumn,
  setDataset,
  setLayout,
  setToken,
  textOf,
  templateMeta,
  templateFields,
  fillTemplate,
  fileNameFrom,
} from "./htmlDoc";

const DOC = `<!doctype html>
<html lang="it">
<head>
<meta charset="utf-8">
<meta name="doc-profile" content="0.2">
<title>Prova &amp; test</title>
<style>
/* tema */
:root { --bg: #ffffff; --fg: #111111; --accent: #2f6fde; --gap: 1rem; }
@media screen and (prefers-color-scheme: dark) { :root { --bg: #000000; } }
@media (max-width: 600px) { :root { --gap: .5rem; } }
.card { padding: var(--gap); }
</style>
</head>
<body>
<header><h1>Titolo</h1><p class="sub">Sotto <em>titolo</em></p></header>
<nav data-generated="toc"></nav>
<main>
  <section data-block id="intro">
    <h2>Introduzione</h2>
    <p>Primo &amp; <strong>importante</strong>.</p>
    <ul>
      <li>uno</li>
      <li>due</li>
    </ul>
  </section>
  <section data-block id="vendite" data-layout="split">
    <h2>Vendite</h2>
    <div><p>Testo</p></div>
    <figure data-chart="bar" data-source="vendite">
      <div data-generated="chart"></div>
      <figcaption>Didascalia</figcaption>
    </figure>
    <script type="application/json" data-dataset="vendite">
    {"columns": ["Trimestre", "Vendite"],
     "rows": [
      ["Q1", 12],
      ["Q2", 18]
     ]}
    </script>
    <table>
      <thead><tr><th>A</th><th>B</th></tr></thead>
      <tbody>
        <tr><td>1</td><td>2</td></tr>
        <tr><td>3</td><td>4</td></tr>
      </tbody>
    </table>
  </section>
  <section data-block id="fine">
    <h2>Fine</h2>
    <div class="cards">
      <div class="card" data-item><h3>A</h3><p>alfa</p></div>
      <div class="card" data-item><h3>B</h3><p>beta</p></div>
    </div>
  </section>
</main>
<!-- doc-runtime -->
</body>
</html>
`;

const ids = (src: string) => analyze(src).blocks.map((b) => b.id);
const edText = (src: string) => {
  const m = analyze(src);
  return m.editables.map((e) => textOf(src, e.el));
};

describe("analyze", () => {
  const m = analyze(DOC);

  it("recognizes the profile", () => {
    expect(isDocProfile(DOC)).toBe(true);
    expect(isDocProfile("<html><head><meta name=description></head></html>")).toBe(false);
    expect(m.profile).toBe("0.2");
    expect(m.title).toBe("Prova & test");
    expect(m.lang).toBe("it");
  });

  it("finds the blocks with title and layout", () => {
    expect(m.blocks.map((b) => [b.id, b.title, b.layout])).toEqual([
      ["intro", "Introduzione", null],
      ["vendite", "Vendite", "split"],
      ["fine", "Fine", null],
    ]);
  });

  it("finds the text leaves, skipping generated content and code", () => {
    expect(edText(DOC)).toEqual([
      "Titolo",
      "Sotto titolo",
      "Introduzione",
      "Primo & importante.",
      "uno",
      "due",
      "Vendite",
      "Testo",
      "Didascalia",
      "A",
      "B",
      "1",
      "2",
      "3",
      "4",
      "Fine",
      "A",
      "alfa",
      "B",
      "beta",
    ]);
  });

  it("reads datasets and charts", () => {
    expect(m.datasets).toHaveLength(1);
    expect(m.datasets[0].name).toBe("vendite");
    expect(m.datasets[0].block).toBe("vendite");
    expect(m.datasets[0].data).toEqual({ columns: ["Trimestre", "Vendite"], rows: [["Q1", 12], ["Q2", 18]] });
    expect(m.charts.map((c) => [c.type, c.source, c.block])).toEqual([["bar", "vendite", "vendite"]]);
  });

  it("reads light and dark tokens, not the other media", () => {
    expect(m.tokens.map((t) => [t.scheme, t.name, t.value])).toEqual([
      ["light", "--bg", "#ffffff"],
      ["light", "--fg", "#111111"],
      ["light", "--accent", "#2f6fde"],
      ["light", "--gap", "1rem"],
      ["dark", "--bg", "#000000"],
    ]);
    for (const t of m.tokens) expect(DOC.slice(t.from, t.to)).toBe(t.value);
  });

  it("reports only what the missing runtime breaks on a clean document", () => {
    expect(m.problems.map((p) => `${p.rule}: ${p.message}`)).toEqual([
      "R7: Block “vendite” has a layout, but the runtime that draws layouts is missing",
      "Runtime: The runtime isn't inserted yet: charts, table of contents and layouts don't show",
    ]);
  });

  it("reports profile problems", () => {
    const bad = DOC.replace('id="fine"', 'id="intro"')
      .replace('data-source="vendite"', 'data-source="nope"')
      .replace("<main>", '<main>\n  <div>stray</div>')
      .replace('<div data-generated="chart"></div>', '<div data-generated="chart"><svg></svg></div>')
      .replace("<style>", '<link rel="stylesheet" href="https://cdn.example/x.css"><style>');
    const rules = analyze(bad).problems.map((p) => `${p.level}:${p.rule}`);
    expect(rules).toContain("warning:R2"); // div in main
    expect(rules).toContain("error:R2"); // id duplicato
    expect(rules).toContain("error:R5"); // grafico senza dataset
    expect(rules).toContain("warning:R6"); // generato non vuoto
    expect(rules).toContain("warning:R1"); // risorsa remota
  });
});

describe("edits", () => {
  it("replaces the content of a text leaf only", () => {
    const m = analyze(DOC);
    const p = m.editables.find((e) => textOf(DOC, e.el) === "Primo & importante.")!;
    const out = replaceInner(DOC, p.el, "Primo <em>vero</em>.");
    expect(out).toContain("<p>Primo <em>vero</em>.</p>");
    expect(out.length - DOC.length).toBe("Primo <em>vero</em>.".length - "Primo &amp; <strong>importante</strong>.".length);
  });

  it("moves blocks with their lines", () => {
    const m = analyze(DOC);
    const down = moveBlock(m, 0, 2);
    expect(ids(down)).toEqual(["vendite", "fine", "intro"]);
    expect(down).toContain('  </section>\n  <section data-block id="intro">');
    const up = moveBlock(analyze(down), 2, 0);
    expect(up).toBe(DOC);
  });

  it("deletes a block without leaving empty lines", () => {
    const out = deleteBlock(analyze(DOC), 1);
    expect(ids(out)).toEqual(["intro", "fine"]);
    expect(out).not.toContain("vendite");
    expect(out).toContain("  </section>\n  <section data-block id=\"fine\">");
  });

  it("duplicates a block with new id and dataset names", () => {
    const { src, id } = duplicateBlock(analyze(DOC), 1);
    expect(id).toBe("vendite-2");
    const m = analyze(src);
    expect(m.blocks.map((b) => b.id)).toEqual(["intro", "vendite", "vendite-2", "fine"]);
    expect(m.datasets.map((d) => [d.name, d.block])).toEqual([
      ["vendite", "vendite"],
      ["vendite-2", "vendite-2"],
    ]);
    expect(m.charts.map((c) => c.source)).toEqual(["vendite", "vendite-2"]);
    expect(m.problems.filter((p) => p.level === "error")).toEqual([]);
  });

  it("adds a block after another one, in the document's language", () => {
    const { src, id } = addBlock(analyze(DOC), 0);
    expect(id).toBe("new-section-2");
    expect(ids(src)).toEqual(["intro", "new-section-2", "vendite", "fine"]);
    expect(src).toContain('  <section data-block id="new-section-2">\n    <h2>Nuova sezione</h2>\n    <p>Scrivi qui.</p>\n  </section>\n');
    expect(ids(addBlock(analyze(DOC), -1).src)[0]).toBe("new-section-2");
    expect(ids(addBlock(analyze(DOC), null).src).at(-1)).toBe("new-section-2");
  });

  it("adds the first block to an empty main", () => {
    const empty = DOC.replace(/<main>[\s\S]*<\/main>/, "<main>\n</main>");
    const { src } = addBlock(analyze(empty), null);
    expect(ids(src)).toEqual(["new-section-2"]);
  });

  it("sets, changes and removes a layout", () => {
    let m = analyze(DOC);
    let out = setLayout(m, 0, "grid-2");
    expect(out).toContain('<section data-block id="intro" data-layout="grid-2">');
    out = setLayout(analyze(out), 1, "stack");
    expect(out).toContain('id="vendite" data-layout="stack"');
    m = analyze(out);
    out = setLayout(m, 1, null);
    expect(out).toContain('<section data-block id="vendite">');
  });

  it("sets a token value", () => {
    const m = analyze(DOC);
    const acc = m.tokens.find((t) => t.name === "--accent")!;
    const out = setToken(DOC, acc, "#ff0000");
    expect(out).toContain("--accent: #ff0000;");
    expect(analyze(out).tokens.find((t) => t.name === "--accent")!.value).toBe("#ff0000");
  });
});

describe("items", () => {
  const m = analyze(DOC);
  const leaf = (text: string, nth = 0) => m.editables.filter((e) => textOf(DOC, e.el) === text)[nth].el;

  it("finds the item around a text", () => {
    expect(itemOf(leaf("due"))?.kind).toBe("list");
    expect(itemOf(leaf("3"))?.kind).toBe("row");
    expect(itemOf(leaf("A"))).toBeNull(); // th: riga d'intestazione
    expect(itemOf(leaf("beta"))?.kind).toBe("item");
    expect(itemOf(leaf("Testo"))).toBeNull();
    expect(itemPosition(itemOf(leaf("beta"))!)).toEqual({ index: 1, count: 2 });
  });

  it("duplicates, moves and deletes rows", () => {
    const row = itemOf(leaf("1"))!;
    const dup = duplicateItem(DOC, row);
    expect(dup).toContain("<tr><td>1</td><td>2</td></tr>\n        <tr><td>1</td><td>2</td></tr>\n        <tr><td>3</td>");
    const moved = moveItem(DOC, row, 1);
    expect(moved).toContain("<tr><td>3</td><td>4</td></tr>\n        <tr><td>1</td><td>2</td></tr>");
    expect(moveItem(DOC, row, -1)).toBe(DOC);
    const del = deleteItem(DOC, row);
    expect(del).toContain("<tbody>\n        <tr><td>3</td>");
  });

  it("moves cards back and forth", () => {
    const card = itemOf(leaf("alfa"))!;
    const out = moveItem(DOC, card, 1);
    expect(out.indexOf("beta")).toBeLessThan(out.indexOf("alfa"));
    const back = moveItem(out, itemOf(analyze(out).editables.find((e) => textOf(out, e.el) === "alfa")!.el)!, -1);
    expect(back).toBe(DOC);
  });
});

describe("data", () => {
  it("rewrites a dataset in the profile's shape, keeping the indentation", () => {
    const m = analyze(DOC);
    const out = setDataset(DOC, m.datasets[0], { columns: ["Trimestre", "Vendite"], rows: [["Q1", 12], ["Q2", 20], ["Q3", 7.5]] });
    expect(out).toContain(
      '<script type="application/json" data-dataset="vendite">\n    {"columns": ["Trimestre", "Vendite"],\n     "rows": [\n      ["Q1", 12],\n      ["Q2", 20],\n      ["Q3", 7.5]\n     ]}\n    </script>',
    );
    expect(analyze(out).datasets[0].data!.rows).toHaveLength(3);
  });

  it("keeps an unchanged dataset byte for byte", () => {
    const m = analyze(DOC);
    expect(setDataset(DOC, m.datasets[0], m.datasets[0].data!)).toBe(DOC);
  });

  it("escapes </script> in cells", () => {
    const m = analyze(DOC);
    const out = setDataset(DOC, m.datasets[0], { columns: ["a"], rows: [["</script><b>"]] });
    expect(analyze(out).datasets[0].data!.rows[0][0]).toBe("</script><b>");
  });

  it("parses cells", () => {
    expect(parseCell("12")).toBe(12);
    expect(parseCell("-3.5")).toBe(-3.5);
    expect(parseCell("Q1")).toBe("Q1");
    expect(parseCell("1,5")).toBe("1,5");
    expect(parseCell(" ")).toBe("");
  });
});

describe("runtime and frame", () => {
  const RT = '<!-- doc-runtime:start 0.2 -->\n<script data-doc-runtime="0.2">1</script>\n<!-- doc-runtime:end -->\n';

  it("inserts and refreshes the runtime", () => {
    const once = insertRuntime(DOC, RT);
    expect(once).not.toContain("<!-- doc-runtime -->");
    expect(analyze(once).runtime).toBe("0.2");
    expect(analyze(once).problems).toEqual([]);
    const again = insertRuntime(once, RT.replace(/0\.2/g, "0.3"));
    expect(again.match(/doc-runtime:start/g)).toHaveLength(1);
    expect(again).toContain('data-doc-runtime="0.3"');
  });

  it("builds the frame copy with CSP, refs and the shim, leaving the rest intact", () => {
    const m = analyze(DOC);
    const f = frameDoc(m, "/*shim*/</script>", { scroll: 10, x: "</b>" });
    // la CSP è il primo elemento, prima di qualunque script del documento
    expect(f.startsWith('<!doctype html><meta http-equiv="Content-Security-Policy" content="default-src \'none\';')).toBe(true);
    expect(f).toContain('<h1 data-orbit-ref="0">Titolo</h1>');
    expect(f).toContain('<li data-orbit-item="1" data-orbit-ref="5">due</li>');
    expect(f).toContain('<div data-orbit-item="5" class="card" data-item>');
    expect(f).toContain('<script>window.__orbit={"scroll":10,"x":"\\u003c/b>"};</script><script>/*shim*/<\\/script></script></body>');
    const stripped = f
      .replace(/ data-orbit-(ref|item)="\d+"/g, "")
      .replace(/<meta http-equiv="Content-Security-Policy"[^>]*>/, "")
      .replace(/<script>window\.__orbit[\s\S]*?<\/script><script>[\s\S]*?<\/script>/, "");
    expect(stripped).toBe(DOC);
  });

  it("forces the light or dark theme in the frame copy only", () => {
    const m = analyze(DOC);
    const light = frameDoc(m, "", {}, "light");
    expect(light).toContain("@media screen and (prefers-color-scheme: no-preference-orbit)");
    const dark = frameDoc(m, "", {}, "dark");
    expect(dark).toContain("@media screen and (min-width: 0px)");
    expect(dark).toContain('<meta name="color-scheme" content="dark">');
    expect(light).toContain('<meta name="color-scheme" content="light">');
    const auto = frameDoc(m, "", {}, "auto");
    expect(auto).toContain("(prefers-color-scheme: dark)");
    expect(auto).not.toContain('name="color-scheme"');
  });

  it("lists the items in document order", () => {
    const m = analyze(DOC);
    expect(m.items.map((i) => i.kind)).toEqual(["list", "list", "row", "row", "item", "item"]);
  });

  it("rejects code coming back from the visual editor", () => {
    expect(acceptableInline("Ciao <b>mondo</b><br>")).toBe(true);
    expect(acceptableInline('<img src=x onerror="alert(1)">')).toBe(false);
    expect(acceptableInline("<script>x</script>")).toBe(false);
    expect(acceptableInline('<a href="javascript:x">')).toBe(false);
    expect(acceptableInline("</p><section>")).toBe(false);
  });
});

describe("cssTokens", () => {
  it("ignores strings, comments and nested blocks", () => {
    const css = `/* :root { --x: 1 } */ .a{content:"{"} :root{--a:1;--b: 2px } @media print{:root{--c:3}}`;
    expect(cssTokens(css, 0).map((t) => `${t.name}=${t.value}`)).toEqual(["--a=1", "--b=2px"]);
  });
});

describe("renameColumn", () => {
  it("renames the column and the charts that use it", () => {
    const src = DOC.replace('data-source="vendite"', 'data-source="vendite" data-x="Trimestre" data-y="Vendite"');
    const m = analyze(src);
    const out = renameColumn(m, m.datasets[0], 1, "Ricavi");
    const m2 = analyze(out);
    expect(m2.datasets[0].data!.columns).toEqual(["Trimestre", "Ricavi"]);
    expect(out).toContain('data-x="Trimestre" data-y="Ricavi"');
  });
});

describe("duplicateBlock with inner ids", () => {
  it("renames ids inside the copy and the references to them", () => {
    const src = DOC.replace(
      '<h2>Fine</h2>',
      '<h2>Fine</h2>\n    <svg><defs><marker id="arrow"></marker></defs><path marker-end="url(#arrow)"></path></svg>\n    <a href="#arrow">x</a>',
    );
    const { src: out } = duplicateBlock(analyze(src), 2);
    const copy = out.slice(out.indexOf('id="fine-2"'));
    expect(copy).toContain('<marker id="arrow-2">');
    expect(copy).toContain('marker-end="url(#arrow-2)"');
    expect(copy).toContain('href="#arrow-2"');
    const original = out.slice(out.indexOf('id="fine"'), out.indexOf('id="fine-2"'));
    expect(original).toContain('url(#arrow)');
  });
});

describe("templates", () => {
  const TPL = `<!doctype html>
<html lang="it">
<head>
<meta name="doc-profile" content="0.2">
<meta name="doc-template" content="Protocollo di verifica">
<meta name="description" content="VP con casi di test">
<meta name="doc-template-file" content="VP-{{numero}}-{{titolo}}">
<title>VP-{{numero}} {{titolo|Titolo del protocollo}}</title>
</head>
<body><header><h1>VP-{{numero|Numero}} {{titolo}}</h1><p>{{data}} · {{autore}}</p></header><main></main></body>
</html>
`;
  it("reads name, description and file name", () => {
    expect(templateMeta(TPL)).toEqual({ name: "Protocollo di verifica", description: "VP con casi di test", fileName: "VP-{{numero}}-{{titolo}}" });
    expect(templateMeta("<title>Solo titolo</title>").name).toBe("Solo titolo");
  });
  it("lists the fields once, with labels and today's date", () => {
    const f = templateFields(TPL, new Date(2026, 10, 24));
    expect(f).toEqual([
      { key: "numero", label: "Numero", value: "" },
      { key: "titolo", label: "Titolo del protocollo", value: "" },
      { key: "data", label: "Data", value: "24/11/2026" },
      { key: "autore", label: "Autore", value: "" },
    ]);
  });
  it("fills the fields, escapes them and drops the template's metas", () => {
    const out = fillTemplate(TPL, { numero: "03", titolo: "Fuoco <auto> & luce", data: "24/11/2026", autore: "A. C." });
    expect(out).toContain("<title>VP-03 Fuoco &lt;auto&gt; &amp; luce</title>");
    expect(out).toContain("<p>24/11/2026 · A. C.</p>");
    expect(out).not.toContain("doc-template");
    expect(out).toContain('<meta name="doc-profile" content="0.2">\n<meta name="description"');
    expect(analyze(out).profile).toBe("0.2");
  });
  it("makes safe file names", () => {
    expect(fileNameFrom("VP-03-Fuoco automatico: è ok?")).toBe("VP-03-Fuoco-automatico-e-ok.html");
    expect(fileNameFrom("  ")).toBe("document.html");
    expect(fileNameFrom("report.html")).toBe("report.html");
  });
});
