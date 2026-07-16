// Stato "Uso": legge da Rust (scan_usage) l'aggregato token per {giorno, repo, modello} dai transcript
// di Claude Code e ne deriva i totali per oggi / 7g / 30g + le ripartizioni per progetto e per modello.
// Il costo in $ è una STIMA calcolata QUI da una tabella prezzi per modello (i transcript non contengono
// il costo). Si aggiorna live sull'evento `activity-changed` (stesso watcher della vista Attività).
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { basename } from "../util";

export interface UsageRow {
  date: string; // "YYYY-MM-DD" (UTC)
  repo: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  cacheCreationTokens: number;
  cacheReadTokens: number;
  messages: number;
}

// Uso per modello in una finestra mobile (ultime 5h / 7g). Vedi scan_usage_windows.
export interface WindowModel {
  model: string;
  inputTokens: number;
  outputTokens: number;
  cacheCreationTokens: number;
  cacheReadTokens: number;
  messages: number;
}
export interface UsageWindows {
  now: number; // epoch (s) usato dal backend per calcolare le finestre
  window5h: WindowModel[];
  window7d: WindowModel[];
}

// Ancora "limiti reali": il % 5h/settimana che l'utente legge su claude.ai (ToS-safe, manuale). Da lì
// deriviamo la capacità effettiva (token per 100%) e poi estrapoliamo il % live col consumo dai transcript.
export interface Anchor {
  syncedAt: number; // epoch ms del sync
  h5: { pct: number; cap: number }; // % al sync + capacità derivata (token totali per 100%)
  d7: { pct: number; cap: number };
}
export interface LiveLimit {
  pct: number; // % estrapolato "adesso"
  syncedAt: number;
  hoursToFull: number | null; // ore al 100% al ritmo medio della finestra (null se non stimabile)
}

// Budget opzionali (STIMA "quanto sono vicino al limite"): per unità attiva (costo/token) e finestra.
export type BudgetUnit = "cost" | "tokens";
export type BudgetWindow = "h5" | "d7";

export const usage = $state({
  rows: [] as UsageRow[],
  windows: null as UsageWindows | null,
  loading: false,
  loaded: false,
  showCost: true, // toggle: mostra $ stimato (true) oppure token grezzi (false)
  budgets: { cost: { h5: 0, d7: 0 }, tokens: { h5: 0, d7: 0 } },
  planCost: 0, // costo mensile del piano ($) impostato dall'utente → confronto "conviene?"
  anchor: null as Anchor | null, // ancora dei limiti reali (sync manuale da claude.ai)
});

// Persistenza del solo toggle $/token (preferenza leggera, come activityPrefs).
const COST_KEY = "orbit.usage.showCost";
try {
  const v = localStorage.getItem(COST_KEY);
  if (v !== null) usage.showCost = v === "1";
} catch {
  /* localStorage non disponibile */
}
export function setShowCost(v: boolean): void {
  usage.showCost = v;
  try {
    localStorage.setItem(COST_KEY, v ? "1" : "0");
  } catch {
    /* no-op */
  }
}

// Persistenza dei budget (per unità e finestra).
const BUDGET_KEY = "orbit.usage.budgets";
try {
  const raw = localStorage.getItem(BUDGET_KEY);
  if (raw) {
    const b = JSON.parse(raw);
    for (const u of ["cost", "tokens"] as BudgetUnit[])
      for (const w of ["h5", "d7"] as BudgetWindow[])
        if (typeof b?.[u]?.[w] === "number" && b[u][w] >= 0) usage.budgets[u][w] = b[u][w];
  }
} catch {
  /* no-op */
}
export function setBudget(unit: BudgetUnit, win: BudgetWindow, v: number): void {
  usage.budgets[unit][win] = Number.isFinite(v) && v > 0 ? v : 0;
  try {
    localStorage.setItem(BUDGET_KEY, JSON.stringify(usage.budgets));
  } catch {
    /* no-op */
  }
}

// Costo mensile del piano ($) — per il confronto "conviene l'abbonamento?".
const PLAN_KEY = "orbit.usage.planCost";
try {
  const v = localStorage.getItem(PLAN_KEY);
  if (v !== null) {
    const n = Number(v);
    if (Number.isFinite(n) && n >= 0) usage.planCost = n;
  }
} catch {
  /* no-op */
}
export function setPlanCost(v: number): void {
  usage.planCost = Number.isFinite(v) && v > 0 ? v : 0;
  try {
    localStorage.setItem(PLAN_KEY, String(usage.planCost));
  } catch {
    /* no-op */
  }
}

/** Confronto "conviene?": costo API-equivalent negli ultimi 30g vs prezzo del piano. null se non impostato. */
export function planValue(): { plan: number; apiEq: number; ratio: number } | null {
  if (usage.planCost <= 0) return null;
  const apiEq = windowTotals(30).cost;
  return { plan: usage.planCost, apiEq, ratio: apiEq / usage.planCost };
}

// ---- ancora limiti reali (sync manuale ToS-safe) ---------------------------
const ANCHOR_KEY = "orbit.usage.anchor";
try {
  const raw = localStorage.getItem(ANCHOR_KEY);
  if (raw) {
    const a = JSON.parse(raw);
    if (a && typeof a.syncedAt === "number" && a.h5 && a.d7) usage.anchor = a as Anchor;
  }
} catch {
  /* no-op */
}
function persistAnchor(): void {
  try {
    if (usage.anchor) localStorage.setItem(ANCHOR_KEY, JSON.stringify(usage.anchor));
    else localStorage.removeItem(ANCHOR_KEY);
  } catch {
    /* no-op */
  }
}
const clampPct = (x: number): number => Math.max(0, Math.min(100, Number.isFinite(x) ? x : 0));

/** Registra un sync dei limiti reali: dai % correnti (letti dall'utente su claude.ai) deriva la
 *  capacità effettiva (token per 100%) usando i token attuali della finestra. */
export function setAnchor(pct5h: number, pct7d: number): void {
  const w = usage.windows;
  if (!w) return;
  const tok5 = windowTotal(w.window5h).tokens;
  const tok7 = windowTotal(w.window7d).tokens;
  const p5 = clampPct(pct5h);
  const p7 = clampPct(pct7d);
  usage.anchor = {
    syncedAt: Date.now(),
    h5: { pct: p5, cap: p5 > 0 ? tok5 / (p5 / 100) : 0 },
    d7: { pct: p7, cap: p7 > 0 ? tok7 / (p7 / 100) : 0 },
  };
  persistAnchor();
}
export function clearAnchor(): void {
  usage.anchor = null;
  persistAnchor();
}

/** % live estrapolato per una finestra: token correnti / capacità derivata al sync. null se non ancorata. */
export function liveLimit(win: BudgetWindow): LiveLimit | null {
  const a = usage.anchor;
  const w = usage.windows;
  if (!a || !w) return null;
  const anc = win === "h5" ? a.h5 : a.d7;
  if (anc.cap <= 0) return null;
  const tok = windowTotal(win === "h5" ? w.window5h : w.window7d).tokens;
  const pct = (tok / anc.cap) * 100;
  const winHours = win === "h5" ? 5 : 24 * 7;
  let hoursToFull: number | null = null;
  if (pct >= 100) hoursToFull = 0;
  else if (pct > 0) hoursToFull = winHours * (100 / pct - 1); // ritmo medio della finestra
  return { pct, syncedAt: a.syncedAt, hoursToFull };
}

let lastDays: number | undefined; // ricordato per i reload live

/** Carica/ricarica gli aggregati d'uso. `days`: finestra in giorni (default: tutto lo storico). */
export async function loadUsage(days?: number): Promise<void> {
  if (usage.loading) return; // evita scansioni sovrapposte (i burst del watcher)
  lastDays = days;
  usage.loading = true;
  try {
    const [rows, windows] = await Promise.all([
      invoke<UsageRow[]>("scan_usage", { days }),
      invoke<UsageWindows>("scan_usage_windows"),
    ]);
    usage.rows = rows;
    usage.windows = windows;
    usage.loaded = true;
  } catch (e) {
    console.error("scan_usage", e);
  } finally {
    usage.loading = false;
  }
}

let liveStarted = false;
/** Attiva il refresh live: ricarica su `activity-changed`. Idempotente. */
export function startUsageLive(): void {
  if (liveStarted) return;
  liveStarted = true;
  void invoke("watch_activity").catch(() => {}); // idempotente col watcher di Attività
  void listen("activity-changed", () => {
    if (usage.loaded && !usage.loading) void loadUsage(lastDays);
  });
}

// ---- prezzi (STIMA) --------------------------------------------------------
// $ per 1M token — fonte: reference ufficiale claude-api (2026). Moltiplicatori standard Anthropic:
// cache-write ≈ 1.25× input (TTL 5 min), cache-read ≈ 0.10× input. IMPORTANTE: il $ è una STIMA
// "equivalente API" (prezzo di listino), NON quanto paghi con un abbonamento Pro/Max (lì paghi una
// quota fissa, non a token). I prezzi cambiano → tabella da tenere aggiornata. Match per FAMIGLIA sul
// nome del modello; fallback su Sonnet per modelli ignoti.
interface Price {
  input: number;
  output: number;
}
const PRICES: { test: (m: string) => boolean; price: Price }[] = [
  { test: (m) => m.includes("opus"), price: { input: 5, output: 25 } },
  { test: (m) => m.includes("fable") || m.includes("mythos"), price: { input: 10, output: 50 } },
  { test: (m) => m.includes("sonnet"), price: { input: 3, output: 15 } }, // $2/$10 introduttivo fino al 2026-08-31
  { test: (m) => m.includes("haiku"), price: { input: 1, output: 5 } },
];
const FALLBACK: Price = { input: 3, output: 15 };

function priceFor(model: string): Price {
  return PRICES.find((p) => p.test(model))?.price ?? FALLBACK;
}

/** Costo stimato in $ da modello + conteggi token (input + output + cache write/read). */
export function costOfModel(
  model: string,
  input: number,
  output: number,
  cacheCreation: number,
  cacheRead: number,
): number {
  const p = priceFor(model);
  const inRate = p.input / 1e6;
  const outRate = p.output / 1e6;
  return input * inRate + output * outRate + cacheCreation * inRate * 1.25 + cacheRead * inRate * 0.1;
}

/** Costo stimato in $ di una riga giornaliera. */
export function costOf(r: UsageRow): number {
  return costOfModel(r.model, r.inputTokens, r.outputTokens, r.cacheCreationTokens, r.cacheReadTokens);
}

// ---- aggregati -------------------------------------------------------------
export interface Totals {
  input: number;
  output: number;
  cacheCreation: number;
  cacheRead: number;
  messages: number;
  tokens: number; // throughput totale (input + output + cache write + cache read)
  cost: number; // $ stimato
}

function empty(): Totals {
  return { input: 0, output: 0, cacheCreation: 0, cacheRead: 0, messages: 0, tokens: 0, cost: 0 };
}

export function sumRows(rows: UsageRow[]): Totals {
  const t = empty();
  for (const r of rows) {
    t.input += r.inputTokens;
    t.output += r.outputTokens;
    t.cacheCreation += r.cacheCreationTokens;
    t.cacheRead += r.cacheReadTokens;
    t.messages += r.messages;
    t.cost += costOf(r);
  }
  t.tokens = t.input + t.output + t.cacheCreation + t.cacheRead;
  return t;
}

/** Totali di una finestra mobile (per-modello) → token + costo stimato. */
export function windowTotal(models: WindowModel[]): Totals {
  const t = empty();
  for (const m of models) {
    t.input += m.inputTokens;
    t.output += m.outputTokens;
    t.cacheCreation += m.cacheCreationTokens;
    t.cacheRead += m.cacheReadTokens;
    t.messages += m.messages;
    t.cost += costOfModel(m.model, m.inputTokens, m.outputTokens, m.cacheCreationTokens, m.cacheReadTokens);
  }
  t.tokens = t.input + t.output + t.cacheCreation + t.cacheRead;
  return t;
}

// Giorni in UTC (coerenti con le date-chiave prodotte dal backend).
function utcToday(): string {
  return new Date().toISOString().slice(0, 10);
}
function utcDaysAgo(n: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
}

export function rowsSince(cutoff: string): UsageRow[] {
  return usage.rows.filter((r) => r.date >= cutoff);
}
export function todayRows(): UsageRow[] {
  const t = utcToday();
  return usage.rows.filter((r) => r.date === t);
}
export function windowTotals(days: number): Totals {
  return sumRows(days <= 1 ? todayRows() : rowsSince(utcDaysAgo(days - 1)));
}
export function allTotals(): Totals {
  return sumRows(usage.rows);
}

/** Efficienza cache: quota di input servita dalla cache (cache_read / (input + cache_read)), 0..1. */
export function cacheHitRate(t: Totals): number {
  const base = t.input + t.cacheRead;
  return base > 0 ? t.cacheRead / base : 0;
}

export interface Slice {
  key: string; // repo path o nome modello
  label: string; // etichetta mostrata (basename repo o modello)
  tokens: number;
  cost: number;
}

function group(rows: UsageRow[], keyOf: (r: UsageRow) => string, labelOf: (k: string) => string): Slice[] {
  const map = new Map<string, Slice>();
  for (const r of rows) {
    const key = keyOf(r);
    let s = map.get(key);
    if (!s) {
      s = { key, label: labelOf(key), tokens: 0, cost: 0 };
      map.set(key, s);
    }
    s.tokens += r.inputTokens + r.outputTokens + r.cacheCreationTokens + r.cacheReadTokens;
    s.cost += costOf(r);
  }
  return [...map.values()];
}

export function byProject(rows: UsageRow[]): Slice[] {
  return group(rows, (r) => r.repo || "—", (k) => (k === "—" ? "—" : basename(k))).sort((a, b) => b.cost - a.cost);
}
export function byModel(rows: UsageRow[]): Slice[] {
  return group(rows, (r) => r.model, (k) => modelLabel(k)).sort((a, b) => b.cost - a.cost);
}

/** Serie giornaliera (asc per data) su una finestra di `days` giorni, per lo sparkline. */
export function daily(days: number): { date: string; tokens: number; cost: number }[] {
  const start = utcDaysAgo(days - 1);
  const byDate = new Map<string, { tokens: number; cost: number }>();
  for (let i = 0; i < days; i++) byDate.set(utcDaysAgo(days - 1 - i), { tokens: 0, cost: 0 });
  for (const r of usage.rows) {
    if (r.date < start) continue;
    const d = byDate.get(r.date);
    if (!d) continue;
    d.tokens += r.inputTokens + r.outputTokens + r.cacheCreationTokens + r.cacheReadTokens;
    d.cost += costOf(r);
  }
  return [...byDate.entries()].map(([date, v]) => ({ date, ...v }));
}

// ---- formattazione ---------------------------------------------------------
export function fmtTokens(n: number): string {
  if (n >= 1e9) return (n / 1e9).toFixed(2) + "B";
  if (n >= 1e6) return (n / 1e6).toFixed(2) + "M";
  if (n >= 1e3) return (n / 1e3).toFixed(1) + "k";
  return String(Math.round(n));
}
export function fmtCost(n: number): string {
  return "$" + n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
/** Valore compatto secondo il toggle attivo (per l'indicatore in status bar). */
export function fmtValue(t: Totals): string {
  return usage.showCost ? fmtCost(t.cost) : fmtTokens(t.tokens);
}

// Nome modello leggibile: "claude-opus-4-8" → "Opus 4.8", "claude-sonnet-5" → "Sonnet 5".
// Best-effort per i modelli correnti; fallback = nome grezzo.
export function modelLabel(model: string): string {
  const m = model.toLowerCase();
  const fam = m.includes("opus") ? "Opus" : m.includes("sonnet") ? "Sonnet" : m.includes("haiku") ? "Haiku" : "";
  if (!fam) return model;
  const pair = m.match(/(\d+)-(\d+)/); // "4-8" → "4.8" (major-minor)
  if (pair) return `${fam} ${pair[1]}.${pair[2]}`;
  const single = m.match(new RegExp(`${fam.toLowerCase()}-(\\d+)`)); // "sonnet-5" → "5"
  return single ? `${fam} ${single[1]}` : fam;
}
