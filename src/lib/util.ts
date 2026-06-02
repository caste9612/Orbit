/** Nome finale di un percorso (gestisce separatori sia `/` che `\`). */
export function basename(p: string): string {
  const parts = p.split(/[\\/]/);
  return parts[parts.length - 1] || p;
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

/** Glifo + colore per un file, in base al nome/estensione. */
export function fileIcon(name: string): FileIcon {
  const lower = name.toLowerCase();
  if (BY_NAME[lower]) return BY_NAME[lower];
  const ext = lower.includes(".") ? lower.slice(lower.lastIndexOf(".") + 1) : "";
  return BY_EXT[ext] ?? { glyph: "file", color: "#8b929e" };
}
