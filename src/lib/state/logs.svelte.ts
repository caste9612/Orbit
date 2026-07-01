// Log diagnostici leggeri per indagare i problemi segnalati (es. il doppio-incolla) con DATI reali
// invece che a intuito. Ring buffer in memoria + persistenza su file (batched, lato Rust) + cattura
// degli errori globali. Tutto gated dal toggle `settings.logging` (Impostazioni): OFF → zero raccolta
// e zero I/O. L'header include la VERSIONE dell'app → disambigua quale build ha prodotto il log.
import { invoke } from "@tauri-apps/api/core";
import { settings } from "./settings.svelte";

export type LogLevel = "debug" | "info" | "warn" | "error";
export interface LogEntry {
  seq: number;
  clock: number; // ms monotoni dall'avvio (performance.now) → misura gli intervalli (es. due paste ravvicinate)
  time: string; // orario locale leggibile
  level: LogLevel;
  cat: string; // categoria: "paste" | "clipboard" | "terminal" | "window" | ...
  msg: string;
  data?: string; // già serializzato (compatto)
}

const CAP = 2000; // voci tenute in memoria (le più vecchie cadono)
let seq = 0;
let version = "?";
let wroteHeader = false; // header scritto su disco una volta per sessione (lazy, al primo flush)

export const logs = $state({ entries: [] as LogEntry[] });

let pending: string[] = []; // righe in attesa di scrittura su disco (batch)
let flushTimer: ReturnType<typeof setTimeout> | undefined;

const pad = (n: number, l = 2) => String(n).padStart(l, "0");
function nowTime(): string {
  const d = new Date(); // ok in codice app (vietato solo negli script workflow)
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}.${pad(d.getMilliseconds(), 3)}`;
}
function ser(v: unknown): string | undefined {
  if (v === undefined) return undefined;
  try {
    return typeof v === "string" ? v : JSON.stringify(v);
  } catch {
    return String(v);
  }
}
function fmtLine(e: LogEntry): string {
  return `${e.time} +${e.clock}ms [${e.level.toUpperCase()}] ${e.cat}: ${e.msg}${e.data ? " " + e.data : ""}`;
}
function header(): string {
  const ua = typeof navigator !== "undefined" ? navigator.userAgent : "";
  return `=== Orbit diagnostics — v${version} — ${nowTime()} ===\n${ua}\n`;
}

/** Registra una voce di log (no-op se la raccolta è disattivata dal toggle). */
export function log(cat: string, msg: string, data?: unknown, level: LogLevel = "info") {
  if (!settings.logging) return;
  seq += 1;
  const e: LogEntry = { seq, clock: Math.round(performance.now()), time: nowTime(), level, cat, msg, data: ser(data) };
  logs.entries.push(e);
  if (logs.entries.length > CAP) logs.entries.splice(0, logs.entries.length - CAP);
  pending.push(fmtLine(e));
  if (!flushTimer) flushTimer = setTimeout(flush, 1500);
}
export const logWarn = (cat: string, msg: string, data?: unknown) => log(cat, msg, data, "warn");
export const logError = (cat: string, msg: string, data?: unknown) => log(cat, msg, data, "error");

async function flush() {
  flushTimer = undefined;
  if (!pending.length || !settings.logging) {
    pending = [];
    return;
  }
  const text = (wroteHeader ? "" : "\n" + header()) + pending.join("\n") + "\n";
  wroteHeader = true;
  pending = [];
  await invoke("append_log", { text }).catch(() => {});
}

/** Inizializza: recupera la versione app e aggancia la cattura degli errori globali. Una volta, da App. */
export async function initLogs() {
  version = await invoke<string>("app_version").catch(() => "?");
  window.addEventListener("error", (e) =>
    logError("window", "error", { msg: e.message, src: e.filename, line: e.lineno }),
  );
  window.addEventListener("unhandledrejection", (e) =>
    logError("window", "unhandledrejection", { reason: String((e as PromiseRejectionEvent).reason) }),
  );
  log("app", "logging attivo", { version });
}

/** Testo completo per l'export (header + tutte le voci in memoria). */
export function logsText(): string {
  return header() + logs.entries.map(fmtLine).join("\n") + "\n";
}
/** Copia tutti i log negli appunti (per incollarli in una segnalazione). */
export async function copyLogs(): Promise<boolean> {
  const { writeClipboard } = await import("../clipboard");
  return writeClipboard(logsText());
}
/** Rivela il file di log su disco nel file manager dell'OS. */
export async function revealLogFile() {
  const p = await invoke<string>("log_file_path").catch(() => "");
  if (p) await invoke("reveal_path", { path: p }).catch(() => {});
}
export function clearLogs() {
  logs.entries = [];
  pending = [];
}

// Visualizzatore (overlay lazy)
export const logsUI = $state({ open: false });
export function openLogs() {
  logsUI.open = true;
}
export function closeLogs() {
  logsUI.open = false;
}
