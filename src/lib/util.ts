/** Nome finale di un percorso (gestisce separatori sia `/` che `\`). */
export function basename(p: string): string {
  const parts = p.split(/[\\/]/);
  return parts[parts.length - 1] || p;
}

/** Cartella contenitrice di un percorso (mantiene il separatore originale). */
export function dirname(p: string): string {
  const i = Math.max(p.lastIndexOf("/"), p.lastIndexOf("\\"));
  return i <= 0 ? p : p.slice(0, i);
}

/** Unisce un percorso a un nome figlio usando il separatore già presente nel padre. */
export function joinPath(dir: string, name: string): string {
  const sep = dir.includes("\\") && !dir.includes("/") ? "\\" : "/";
  return dir.endsWith(sep) ? dir + name : dir + sep + name;
}

/** Normalizza i separatori a "/" e rimuove l'eventuale slash finale. */
export function normSlash(p: string): string {
  return p.replace(/\\/g, "/").replace(/\/+$/, "");
}

/** Percorso di `abs` relativo a `root` (separatori "/"): "" se coincide con root,
 *  l'assoluto normalizzato se `abs` non è sotto `root`. */
export function relTo(abs: string, root: string | null): string {
  const a = abs.replace(/\\/g, "/");
  if (!root) return a;
  const r = normSlash(root);
  if (a === r) return "";
  return a.startsWith(r + "/") ? a.slice(r.length + 1) : a;
}

export interface FileIcon {
  glyph: string;
  color: string;
}

// Icona per nome file specifico (vince sull'estensione).
const BY_NAME: Record<string, FileIcon> = {
  "package.json": { glyph: "braces", color: "#cb3837" },
  "package-lock.json": { glyph: "lock", color: "#cb3837" },
  "tsconfig.json": { glyph: "gear", color: "#3178c6" },
  "tsconfig.node.json": { glyph: "gear", color: "#3178c6" },
  "cargo.toml": { glyph: "gear", color: "#dea584" },
  "cargo.lock": { glyph: "lock", color: "#dea584" },
  "vite.config.ts": { glyph: "gear", color: "#bd34fe" },
  "svelte.config.js": { glyph: "gear", color: "#ff3e00" },
  ".gitignore": { glyph: "git-branch", color: "#f05133" },
  ".gitattributes": { glyph: "git-branch", color: "#f05133" },
  "readme.md": { glyph: "doc", color: "#6ea8fe" },
  "license": { glyph: "doc", color: "#9da0a8" },
  dockerfile: { glyph: "database", color: "#2496ed" },
};

// Icona per estensione.
const BY_EXT: Record<string, FileIcon> = {
  ts: { glyph: "braces", color: "#3178c6" },
  mts: { glyph: "braces", color: "#3178c6" },
  cts: { glyph: "braces", color: "#3178c6" },
  tsx: { glyph: "code", color: "#3178c6" },
  js: { glyph: "braces", color: "#f0db4f" },
  mjs: { glyph: "braces", color: "#f0db4f" },
  cjs: { glyph: "braces", color: "#f0db4f" },
  jsx: { glyph: "code", color: "#f0db4f" },
  svelte: { glyph: "code", color: "#ff3e00" },
  vue: { glyph: "code", color: "#41b883" },
  rs: { glyph: "braces", color: "#e6915b" },
  py: { glyph: "braces", color: "#4b8bbe" },
  go: { glyph: "braces", color: "#00add8" },
  c: { glyph: "braces", color: "#5b8dbe" },
  h: { glyph: "braces", color: "#5b8dbe" },
  cpp: { glyph: "braces", color: "#9c6ab0" },
  hpp: { glyph: "braces", color: "#9c6ab0" },
  java: { glyph: "braces", color: "#e76f00" },
  rb: { glyph: "braces", color: "#cc342d" },
  php: { glyph: "braces", color: "#777bb4" },
  json: { glyph: "braces", color: "#f0db4f" },
  jsonc: { glyph: "braces", color: "#f0db4f" },
  html: { glyph: "code", color: "#e34c26" },
  htm: { glyph: "code", color: "#e34c26" },
  xml: { glyph: "code", color: "#8bc34a" },
  css: { glyph: "hash", color: "#3d8eff" },
  scss: { glyph: "hash", color: "#cd6799" },
  sass: { glyph: "hash", color: "#cd6799" },
  less: { glyph: "hash", color: "#1d365d" },
  md: { glyph: "doc", color: "#6ea8fe" },
  markdown: { glyph: "doc", color: "#6ea8fe" },
  txt: { glyph: "doc", color: "#9da0a8" },
  toml: { glyph: "gear", color: "#9c7c5b" },
  yaml: { glyph: "gear", color: "#cb171e" },
  yml: { glyph: "gear", color: "#cb171e" },
  ini: { glyph: "gear", color: "#9da0a8" },
  conf: { glyph: "gear", color: "#9da0a8" },
  env: { glyph: "gear", color: "#e3b341" },
  sh: { glyph: "terminal", color: "#4eaa25" },
  bash: { glyph: "terminal", color: "#4eaa25" },
  ps1: { glyph: "terminal", color: "#5391fe" },
  lock: { glyph: "lock", color: "#9da0a8" },
  sql: { glyph: "database", color: "#e38c00" },
  png: { glyph: "image", color: "#5bc88a" },
  jpg: { glyph: "image", color: "#5bc88a" },
  jpeg: { glyph: "image", color: "#5bc88a" },
  gif: { glyph: "image", color: "#5bc88a" },
  webp: { glyph: "image", color: "#5bc88a" },
  bmp: { glyph: "image", color: "#5bc88a" },
  ico: { glyph: "image", color: "#7aa2f7" },
  svg: { glyph: "image", color: "#ffb13b" },
};

// Etichetta del linguaggio per estensione/nome (per la status bar).
const LANG_BY_EXT: Record<string, string> = {
  ts: "TypeScript", mts: "TypeScript", cts: "TypeScript", tsx: "TypeScript React",
  js: "JavaScript", mjs: "JavaScript", cjs: "JavaScript", jsx: "JavaScript React",
  svelte: "Svelte", vue: "Vue", rs: "Rust", py: "Python", go: "Go", rb: "Ruby",
  php: "PHP", java: "Java", c: "C", h: "C", cpp: "C++", hpp: "C++", cs: "C#",
  json: "JSON", jsonc: "JSON", html: "HTML", htm: "HTML", xml: "XML",
  css: "CSS", scss: "SCSS", sass: "Sass", less: "Less", md: "Markdown", markdown: "Markdown",
  toml: "TOML", yaml: "YAML", yml: "YAML", ini: "INI", sh: "Shell", bash: "Shell",
  ps1: "PowerShell", sql: "SQL", txt: "Testo", svg: "SVG",
};

/** Nome del linguaggio per un file (fallback "Testo"). */
export function langLabel(name: string): string {
  const lower = name.toLowerCase();
  const ext = lower.includes(".") ? lower.slice(lower.lastIndexOf(".") + 1) : "";
  return LANG_BY_EXT[ext] ?? "Testo";
}

/** Tempo relativo compatto in italiano (es. "5 min fa", "2 h fa", "3 g fa"). */
export function relativeTime(unixSeconds: number): string {
  const diff = Date.now() / 1000 - unixSeconds;
  if (diff < 60) return "ora";
  if (diff < 3600) return `${Math.floor(diff / 60)} min fa`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} h fa`;
  if (diff < 2592000) return `${Math.floor(diff / 86400)} g fa`;
  const d = new Date(unixSeconds * 1000);
  return d.toLocaleDateString("it-IT", { day: "2-digit", month: "short", year: "numeric" });
}

/** Glifo + colore per un file, in base al nome/estensione. */
export function fileIcon(name: string): FileIcon {
  const lower = name.toLowerCase();
  if (BY_NAME[lower]) return BY_NAME[lower];
  const ext = lower.includes(".") ? lower.slice(lower.lastIndexOf(".") + 1) : "";
  return BY_EXT[ext] ?? { glyph: "file", color: "#8b929e" };
}
