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
  ".gitmodules": { glyph: "git-branch", color: "#f05133" },
  ".editorconfig": { glyph: "gear", color: "#9da0a8" },
  ".npmrc": { glyph: "braces", color: "#cb3837" },
  ".nvmrc": { glyph: "gear", color: "#5fa04e" },
  ".prettierrc": { glyph: "gear", color: "#f7b93e" },
  "readme.md": { glyph: "doc", color: "#6ea8fe" },
  "license": { glyph: "doc", color: "#9da0a8" },
  dockerfile: { glyph: "box", color: "#2496ed" },
  ".dockerignore": { glyph: "box", color: "#2496ed" },
  "docker-compose.yml": { glyph: "box", color: "#2496ed" },
  "docker-compose.yaml": { glyph: "box", color: "#2496ed" },
  "compose.yml": { glyph: "box", color: "#2496ed" },
  "compose.yaml": { glyph: "box", color: "#2496ed" },
  "pom.xml": { glyph: "gear", color: "#e76f00" }, // Maven (Java)
  "angular.json": { glyph: "gear", color: "#dd0031" },
  makefile: { glyph: "gear", color: "#9da0a8" },
  mvnw: { glyph: "terminal", color: "#4eaa25" }, // Maven wrapper (shell)
};

// Icona per estensione.
// Approccio IBRIDO per i linguaggi (vedi FileGlyph.svelte):
//  - `lang:<id>`  → simbolo SVG dedicato e colorato (identità visiva forte).
//  - `tile:<XX>`  → tile monogramma (≤2 caratteri) per i linguaggi senza simbolo.
//  - glifo normale → line-art monocroma/tinta (Icon.svelte) per i tipi non-codice.
const BY_EXT: Record<string, FileIcon> = {
  ts: { glyph: "tile:TS", color: "#3178c6" },
  mts: { glyph: "tile:TS", color: "#3178c6" },
  cts: { glyph: "tile:TS", color: "#3178c6" },
  tsx: { glyph: "tile:TS", color: "#3178c6" },
  js: { glyph: "tile:JS", color: "#f0db4f" },
  mjs: { glyph: "tile:JS", color: "#f0db4f" },
  cjs: { glyph: "tile:JS", color: "#f0db4f" },
  jsx: { glyph: "tile:JS", color: "#f0db4f" },
  svelte: { glyph: "lang:svelte", color: "#ff3e00" },
  vue: { glyph: "lang:vue", color: "#41b883" },
  rs: { glyph: "lang:rust", color: "#e6915b" },
  py: { glyph: "lang:python", color: "#4b8bbe" },
  go: { glyph: "lang:go", color: "#00add8" },
  c: { glyph: "tile:C", color: "#5b8dbe" },
  h: { glyph: "tile:C", color: "#5b8dbe" },
  cpp: { glyph: "tile:C+", color: "#9c6ab0" },
  hpp: { glyph: "tile:C+", color: "#9c6ab0" },
  cc: { glyph: "tile:C+", color: "#9c6ab0" },
  cxx: { glyph: "tile:C+", color: "#9c6ab0" },
  cs: { glyph: "tile:C#", color: "#9b6cc0" },
  java: { glyph: "tile:Ja", color: "#e76f00" },
  rb: { glyph: "tile:Rb", color: "#cc342d" },
  php: { glyph: "tile:PH", color: "#8a8fc0" },
  json: { glyph: "tile:{}", color: "#f0db4f" },
  jsonc: { glyph: "tile:{}", color: "#f0db4f" },
  html: { glyph: "code", color: "#e34c26" },
  htm: { glyph: "code", color: "#e34c26" },
  xml: { glyph: "code", color: "#8bc34a" },
  css: { glyph: "paintbrush", color: "#3d8eff" },
  scss: { glyph: "paintbrush", color: "#cd6799" },
  sass: { glyph: "paintbrush", color: "#cd6799" },
  less: { glyph: "paintbrush", color: "#5a86c4" },
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
  // build / config / dati
  properties: { glyph: "gear", color: "#9da0a8" },
  iml: { glyph: "code", color: "#8bc34a" }, // IntelliJ module (XML)
  gradle: { glyph: "gear", color: "#02303a" },
  groovy: { glyph: "braces", color: "#4298b8" },
  jsonl: { glyph: "tile:{}", color: "#f0db4f" },
  map: { glyph: "braces", color: "#9da0a8" }, // source map
  log: { glyph: "doc", color: "#9da0a8" },
  csv: { glyph: "database", color: "#21a366" },
  // script
  bat: { glyph: "terminal", color: "#c0c0c0" },
  cmd: { glyph: "terminal", color: "#c0c0c0" },
  // certificati / chiavi
  pem: { glyph: "lock", color: "#e3b341" },
  key: { glyph: "lock", color: "#e3b341" },
  crt: { glyph: "lock", color: "#e3b341" },
  cert: { glyph: "lock", color: "#e3b341" },
  p12: { glyph: "lock", color: "#e3b341" },
  pfx: { glyph: "lock", color: "#e3b341" },
  // archivi
  zip: { glyph: "archive", color: "#b0855f" },
  gz: { glyph: "archive", color: "#b0855f" },
  tgz: { glyph: "archive", color: "#b0855f" },
  tar: { glyph: "archive", color: "#b0855f" },
  "7z": { glyph: "archive", color: "#b0855f" },
  rar: { glyph: "archive", color: "#b0855f" },
  xz: { glyph: "archive", color: "#b0855f" },
  jar: { glyph: "archive", color: "#e76f00" },
  // documenti
  pdf: { glyph: "doc", color: "#e5484d" },
  doc: { glyph: "doc", color: "#2b7cd3" },
  docx: { glyph: "doc", color: "#2b7cd3" },
  xls: { glyph: "doc", color: "#21a366" },
  xlsx: { glyph: "doc", color: "#21a366" },
  ppt: { glyph: "doc", color: "#d24726" },
  pptx: { glyph: "doc", color: "#d24726" },
  // font
  woff: { glyph: "type", color: "#b48ead" },
  woff2: { glyph: "type", color: "#b48ead" },
  ttf: { glyph: "type", color: "#b48ead" },
  otf: { glyph: "type", color: "#b48ead" },
  eot: { glyph: "type", color: "#b48ead" },
};

// Icona per pattern di nome (controllata dopo BY_NAME, prima dell'estensione).
const BY_PATTERN: [RegExp, FileIcon][] = [
  [/^tsconfig\..+\.json$/, { glyph: "gear", color: "#3178c6" }], // tsconfig.app.json, tsconfig.spec.json…
  [/\.(config|conf)\.(c|m)?[jt]s$/, { glyph: "gear", color: "#bd34fe" }], // vite/karma/jest.config.js…
  [/^\.env(\.|$)/, { glyph: "gear", color: "#e3b341" }], // .env, .env.local, .env.production
];

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
  properties: "Properties", iml: "XML", jsonl: "JSON", map: "JSON", csv: "CSV",
  bat: "Batch", cmd: "Batch", log: "Log", gradle: "Gradle", groovy: "Groovy", conf: "Config",
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

// Estensioni mostrabili inline come immagine (il WebView le renderizza nativamente).
const IMAGE_EXT = new Set(["png", "jpg", "jpeg", "gif", "webp", "bmp", "ico", "svg", "avif"]);

/** Tipo di asset visualizzabile inline (immagine o PDF), o null se è testo/altro. */
export function assetKind(name: string): "image" | "pdf" | null {
  const lower = name.toLowerCase();
  const ext = lower.includes(".") ? lower.slice(lower.lastIndexOf(".") + 1) : "";
  if (IMAGE_EXT.has(ext)) return "image";
  if (ext === "pdf") return "pdf";
  return null;
}

/** Glifo + colore per un file, in base al nome/pattern/estensione. */
export function fileIcon(name: string): FileIcon {
  const lower = name.toLowerCase();
  if (BY_NAME[lower]) return BY_NAME[lower];
  for (const [re, icon] of BY_PATTERN) if (re.test(lower)) return icon;
  const ext = lower.includes(".") ? lower.slice(lower.lastIndexOf(".") + 1) : "";
  return BY_EXT[ext] ?? { glyph: "file", color: "#8b929e" };
}
