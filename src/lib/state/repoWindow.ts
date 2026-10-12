// Una repo in una finestra nuova (M69): trascinata in basso fuori dalla barra in alto, o con «Move to new
// window» dal menu della sua scheda. Ogni finestra di Orbit è un processo a sé e i terminali non possono
// passare da un processo all'altro: qui si chiudono e la finestra nuova li riapre come dopo un riavvio (M66),
// con le chat che riprendono la loro conversazione (`claude --resume`) e le shell che ripartono pulite.
// Sessione e terminali della repo si scrivono PRIMA sotto una chiave nuova, che il processo figlio riceve da
// `open_new_window` (ORBIT_WIN_KEY) e usa come propria chiave di sessione.
import { invoke } from "@tauri-apps/api/core";
import { WebviewWindow } from "@tauri-apps/api/webviewWindow";
import { confirm } from "@tauri-apps/plugin-dialog";
import { workspace } from "./workspace.svelte";
import { folders, removeFolder } from "./folders.svelte";
import { exportSession, settleUnsaved } from "./persist.svelte";
import { exportRepoTerminals } from "./terminalPersist.svelte";
import { terminals, closeTerminal } from "./terminals.svelte";
import { notify } from "./toast.svelte";
import { basename } from "../util";

/** La repo si può spostare in una finestra nuova? Non se è l'unica della finestra, né da una finestra leggera. */
export function canMoveRepo(path: string): boolean {
  return !workspace.light && folders.list.length > 1 && folders.list.some((f) => f.path === path);
}

const newKey = () => `k${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

/** Chiude una scheda della repo: anche quelle estratte in una finestra flottante (che si chiude con lei). */
async function closeTab(id: string) {
  if (!terminals.floating.some((f) => f.id === id)) return closeTerminal(id);
  await invoke("pty_kill", { id }).catch(() => {});
  terminals.floating = terminals.floating.filter((f) => f.id !== id);
  const w = await WebviewWindow.getByLabel(`term-float-${id}`).catch(() => null);
  await w?.close().catch(() => {});
}

let moving = false;

/** Sposta la repo `path` in una finestra nuova: `place` = "cursor" la apre sotto il puntatore (scheda
 *  trascinata fuori dalla barra), "beside" accanto a questa (dal menu). */
export async function moveRepoToNewWindow(path: string, place: "cursor" | "beside") {
  if (moving || !canMoveRepo(path)) return;
  moving = true;
  const name = basename(path);
  try {
    const tabs = () => [...terminals.list, ...terminals.floating].filter((t) => t.root === path);
    // una chat viva si interrompe: se sta rispondendo, la risposta si perde
    const chats = tabs().filter((t) => !t.dormant && (t.kind === "claude" || t.chat)).length;
    if (chats > 0) {
      const ok = await confirm(
        `${chats === 1 ? "Its Claude chat" : `Its ${chats} Claude chats`} will close here and resume in the new window. A reply in progress would stop.`,
        { title: `Move ${name} to a new window?`, kind: "warning", okLabel: "Move", cancelLabel: "Cancel" },
      ).catch(() => false);
      if (!ok) return;
    }
    // i documenti aperti sono quelli della repo attiva: se parte lei, nessuna modifica si perde
    if (path === workspace.rootPath && !(await settleUnsaved())) return;
    const key = newKey();
    await exportSession(path, key);
    await exportRepoTerminals(path, key);
    // via dalla lista (se è l'attiva, prima si passa a una vicina); se il passaggio non riesce, non si sposta
    await removeFolder(path);
    if (folders.list.some((f) => f.path === path)) return;
    // i processi di qui si chiudono PRIMA che la finestra nuova riprenda le stesse chat
    for (const t of tabs()) await closeTab(t.id);
    await invoke("open_new_window", { dir: path, key, place });
    notify(`${name} moved to a new window`);
  } catch (e) {
    console.error("repo in una finestra nuova", e);
    notify(`Couldn't move ${name} to a new window.`, "error");
  } finally {
    moving = false;
  }
}
