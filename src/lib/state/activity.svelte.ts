// Vista "Attività": le UNITÀ DI LAVORO di Claude Code, lette da TUTTI i progetti in
// ~/.claude/projects (comando Rust `scan_activity`). L'atomo è l'unità di lavoro, non la sessione:
// la segmentazione (ibrida: prompt fusi fino al commit / cambio branch) avviene nel backend.
import { invoke } from "@tauri-apps/api/core";
import { layout } from "./layout.svelte";
import { openActivityBoard } from "./workspace.svelte";

export interface UnitFile {
  op: "A" | "M"; // A = creato, M = modificato
  path: string;
  add: number;
  del: number;
  userModified: boolean;
}

export interface WorkUnit {
  id: string;
  sessionId: string;
  sessionTitle: string;
  repo: string; // cwd reale del repo
  branch: string;
  kind: string; // feat | fix | docs | refactor | perf | chore
  label: string; // messaggio di commit, altrimenti il primo prompt
  prompts: string[];
  files: UnitFile[];
  cmds: string[];
  committed: boolean;
  commit: string | null; // hash breve (best-effort)
  start: string;
  end: string;
  add: number;
  del: number;
  live: boolean; // ultima unità di una sessione il cui transcript è stato scritto da poco
}

export const activity = $state({
  units: [] as WorkUnit[],
  loading: false,
  loaded: false,
});

// token anti-stale: una loadActivity più recente invalida i risultati di quelle precedenti.
let token = 0;

export async function loadActivity() {
  const my = ++token;
  activity.loading = true;
  try {
    const units = await invoke<WorkUnit[]>("scan_activity", { limit: 500 });
    if (my !== token) return; // scartato: ne è partita una più recente
    activity.units = units;
    activity.loaded = true;
  } catch (e) {
    console.error("scan_activity", e);
    if (my === token) activity.units = [];
  } finally {
    if (my === token) activity.loading = false;
  }
}

/** Nome breve del repo (ultimo segmento del cwd). */
export function repoName(path: string): string {
  const p = (path || "").replace(/[\\/]+$/, "");
  const segs = p.split(/[\\/]/).filter(Boolean);
  return segs[segs.length - 1] || path || "?";
}

// Colore per tipo di unità (conventional-commit): l'accento blu per feat, semantici per gli altri.
export const KIND_COLOR: Record<string, string> = {
  feat: "#3b9dff",
  fix: "#d8b65e",
  docs: "#b89bf0",
  refactor: "#4bc0c8",
  perf: "#e0954e",
  chore: "#8a9099",
};
export function kindColor(k: string): string {
  return KIND_COLOR[k] ?? KIND_COLOR.chore;
}

// Colore per stato git del file (coerente col gutter dell'editor): A verde, M oro, D rosso.
export const OP_COLOR: Record<string, string> = { A: "#5bc88a", M: "#d8b65e", D: "#e0707a" };

// ---- progetti accesi/spenti (per togliere rumore), persistito globalmente -------------------
// La scelta vale per TUTTA la vista Attività (lista, timeline, pannello). Persistenza in localStorage
// (app-global, come le impostazioni): non dipende dalla cartella aperta.
const HIDE_KEY = "orbit.activity.hidden";
const DISMISS_KEY = "orbit.activity.dismissed";
function loadHidden(): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(HIDE_KEY) || "[]");
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}
function loadDismissed(): Record<string, string> {
  try {
    const v = JSON.parse(localStorage.getItem(DISMISS_KEY) || "{}");
    return v && typeof v === "object" ? v : {};
  } catch {
    return {};
  }
}
// hidden: progetti col toggle OFF (esclusi dalla board ma restano elencati nel pannello).
// dismissed: progetti TOLTI dalla lista (repo → timestamp dell'ultima attività alla rimozione); restano
//   nascosti finché non arriva attività più recente (allora riappaiono). Non distruttivo: i file restano.
export const activityPrefs = $state({ hidden: loadHidden() as string[], dismissed: loadDismissed() });

export function isRepoEnabled(repo: string): boolean {
  return !activityPrefs.hidden.includes(repo);
}
export function toggleRepo(repo: string) {
  const i = activityPrefs.hidden.indexOf(repo);
  if (i >= 0) activityPrefs.hidden.splice(i, 1);
  else activityPrefs.hidden.push(repo);
  try {
    localStorage.setItem(HIDE_KEY, JSON.stringify(activityPrefs.hidden));
  } catch {
    /* localStorage non disponibile: la scelta resta solo in memoria */
  }
}

function latestEndFor(repo: string): string {
  let m = "";
  for (const u of activity.units) if (u.repo === repo && u.end > m) m = u.end;
  return m;
}
/** Progetto tolto dalla lista e senza attività nuova dalla rimozione → resta nascosto. */
export function isDismissed(repo: string): boolean {
  const at = activityPrefs.dismissed[repo];
  return at != null && latestEndFor(repo) <= at;
}
/** Toglie un progetto dalla lista Activity (NON distruttivo: i transcript restano su disco). */
export function dismissProject(repo: string) {
  activityPrefs.dismissed[repo] = latestEndFor(repo) || new Date().toISOString();
  try {
    localStorage.setItem(DISMISS_KEY, JSON.stringify(activityPrefs.dismissed));
  } catch {
    /* niente localStorage: resta in memoria */
  }
}

/** Mini-statistiche di un progetto per il pannello (unità totali, di oggi, live). */
export function repoStats(repo: string): { total: number; today: number; live: number } {
  const now = new Date();
  const t0 = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  let total = 0,
    today = 0,
    live = 0;
  for (const u of activity.units) {
    if (u.repo !== repo) continue;
    total++;
    if (u.live) live++;
    const ms = Date.parse(u.end);
    if (!isNaN(ms) && ms >= t0) today++;
  }
  return { total, today, live };
}

/** Apre la vista Attività: pannello controlli a sinistra + board (timeline) nell'area editor. */
export function openActivity() {
  layout.sidebarView = "activity";
  layout.sidebarVisible = true;
  openActivityBoard();
}
