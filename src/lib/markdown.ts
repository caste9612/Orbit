// Rendering Markdown -> HTML sicuro. marked + DOMPurify caricati on-demand (lazy):
// non pesano sull'avvio e l'HTML è sanitizzato (un README malevolo non esegue script).
type MarkedFn = (src: string) => string;
let _marked: MarkedFn | null = null;
let _sanitize: ((html: string) => string) | null = null;

async function ensure() {
  if (!_marked) {
    const m = await import("marked");
    const d = await import("dompurify");
    m.marked.setOptions({ gfm: true, breaks: false });
    _marked = (src: string) => m.marked.parse(src) as string;
    _sanitize = (html: string) => d.default.sanitize(html);
  }
  return { render: _marked!, sanitize: _sanitize! };
}

/** Markdown -> HTML sicuro (sanitizzato). */
export async function renderMarkdown(src: string): Promise<string> {
  const { render, sanitize } = await ensure();
  return sanitize(render(src));
}

export interface Heading {
  level: number;
  text: string;
  id: string;
}

/** Slug per gli anchor degli heading (coerente lato render e TOC). */
export function slug(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-");
}

/** Estrae gli heading (per il TOC), saltando i blocchi di codice. */
export function extractHeadings(src: string): Heading[] {
  const out: Heading[] = [];
  let inFence = false;
  for (const line of src.split("\n")) {
    if (/^\s*```/.test(line)) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;
    const m = /^(#{1,6})\s+(.+?)\s*#*$/.exec(line);
    if (m) out.push({ level: m[1].length, text: m[2].trim(), id: slug(m[2]) });
  }
  return out;
}
