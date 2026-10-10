// Aggiornamenti dalle release GitHub (M59). Controllo poco dopo l'avvio e poi ogni 6 ore (spegnibile
// dalle Impostazioni; mai nei build di sviluppo); con una versione nuova: un avviso cliccabile, una volta
// per versione, e il pulsante "Update" nella barra in alto finché non si aggiorna. Installare salva le
// modifiche (o chiede), fa uscire le altre finestre di Orbit e le riapre dopo il riavvio: i passi lato
// Rust sono in updater.rs (download con firma verificata, installer) e winsession.rs (finestre).
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { settings } from "./settings.svelte";
import { notify, notifyAttention, dismissByKey } from "./toast.svelte";
import { prepareQuit } from "./persist.svelte";

export interface UpdateInfo {
  version: string;
  current: string;
  notes: string | null;
  date: string | null;
}

export type UpdatePhase = "idle" | "downloading" | "closing" | "installing" | "error";

export const updates = $state({
  available: null as UpdateInfo | null,
  checking: false,
  checked: false, // almeno un controllo riuscito in questa sessione (per "Up to date")
  open: false, // dialog dell'aggiornamento
  phase: "idle" as UpdatePhase,
  received: 0, // byte scaricati
  total: null as number | null,
  others: 0, // altre finestre di Orbit ancora aperte (fase closing)
  error: "",
});

const RELEASES = "https://github.com/caste9612/Orbit/releases";
const EVERY = 6 * 60 * 60 * 1000;
const FIRST = 30 * 1000; // dopo l'avvio: sessione, terminali e indice hanno la precedenza
let notified = ""; // versione già annunciata con l'avviso in questa sessione
let timer: ReturnType<typeof setInterval> | undefined;

/** Controlla se c'è una versione nuova. `manual`: dalle Impostazioni → dice anche "aggiornato"/errori. */
export async function checkForUpdates(manual = false) {
  if (updates.checking) return;
  updates.checking = true;
  try {
    const info = await invoke<UpdateInfo | null>("update_check");
    updates.available = info;
    updates.checked = true;
    if (info && notified !== info.version) {
      notified = info.version;
      notifyAttention({
        key: "orbit-update",
        message: `Orbit ${info.version} is available — click to update`,
        onClick: openUpdateDialog,
        icon: "download",
      });
    } else if (!info && manual) {
      notify("Orbit is up to date", "success");
    }
  } catch (e) {
    console.error("update_check", e);
    if (manual) notify(`Couldn't check for updates: ${e}`, "error", 5000);
  } finally {
    updates.checking = false;
  }
}

/** Controlli automatici (App, a sessione caricata). Rispetta l'impostazione anche se cambia dopo. */
export function startUpdateChecks() {
  if (import.meta.env.DEV || timer) return; // in sviluppo solo "Check now"
  const tick = () => {
    if (settings.checkUpdates) void checkForUpdates();
  };
  setTimeout(tick, FIRST);
  timer = setInterval(tick, EVERY);
}

export function openUpdateDialog() {
  dismissByKey("orbit-update");
  if (updates.phase === "error") updates.phase = "idle";
  updates.open = true;
}

export function closeUpdateDialog() {
  if (updates.phase === "downloading" || updates.phase === "installing") return; // non a metà
  if (updates.phase === "closing") cancelled = true; // smette di aspettare le altre finestre
  updates.open = false;
  updates.phase = "idle";
}

let cancelled = false;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Scarica, salva (o chiede), fa uscire le altre finestre e installa. Su Windows Orbit esce qui e
 *  l'installer lo riapre con tutte le finestre; in caso di errore si resta dove si era. */
export async function installUpdate() {
  if (!updates.available || updates.phase !== "idle") return;
  cancelled = false;
  updates.error = "";
  updates.received = 0;
  updates.total = null;
  updates.phase = "downloading";
  const off = await listen<[number, number | null]>("update-progress", (e) => {
    [updates.received, updates.total] = e.payload;
  });
  try {
    await invoke("update_download");
  } catch (e) {
    return fail(`Download failed: ${e}`);
  } finally {
    off();
  }
  // le modifiche di QUESTA finestra (le altre chiedono da sé quando ricevono la richiesta d'uscita)
  if (!(await prepareQuit({ discardLabel: "Discard and update" }))) {
    updates.phase = "idle";
    return;
  }
  updates.phase = "closing";
  updates.others = await invoke<number>("quit_others").catch(() => 0);
  while (updates.others > 0) {
    await sleep(400);
    if (cancelled) return;
    updates.others = await invoke<number>("other_instances").catch(() => 0);
  }
  updates.phase = "installing";
  try {
    await invoke("update_install"); // Windows: non ritorna (l'installer prende il posto di Orbit)
  } catch (e) {
    fail(`Install failed: ${e}`);
  }
}

function fail(message: string) {
  updates.phase = "error";
  updates.error = message;
}

/** Dopo il riavvio dell'installer: avviso con il link alle novità della versione. */
export function announceUpdated(version: string) {
  notifyAttention({
    key: "orbit-updated",
    message: `Orbit updated to ${version} — see what's new`,
    onClick: () => void invoke("open_url", { url: `${RELEASES}/tag/v${version}` }),
    icon: "check",
  });
}

export function openReleaseNotes(version: string) {
  void invoke("open_url", { url: `${RELEASES}/tag/v${version}` });
}
