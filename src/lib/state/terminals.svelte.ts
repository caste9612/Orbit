// Sessioni del pannello terminale: lista di tab + tab attiva. Ogni sessione ha un
// id univoco usato dal PTY (backend). Le tab restano tutte montate (visibilità CSS)
// così scrollback e shell si conservano quando si cambia tab.
import { invoke } from "@tauri-apps/api/core";
import { layout } from "./layout.svelte";
import { settings } from "./settings.svelte";
import { notify } from "./toast.svelte";

export interface TermSession {
  id: string;
  title: string;
  shell: string | null; // null = shell default di piattaforma
  cwd: string | null; // cartella di lavoro (null = radice del workspace)
  initCommand: string | null; // comando lanciato all'avvio (run config)
  started: boolean; // initCommand già inviato (evita ri-esecuzione al remount)
  attach: boolean; // true = si collega a un PTY esistente (terminale reincollato dalla finestra flottante)
  needsAttention: boolean; // la bell ha suonato (Claude ha finito / aspetta input) mentre non lo guardavi
}

let counter = 0;

export const terminals = $state({
  list: [] as TermSession[],
  activeId: null as string | null,
});

export interface NewTerminal {
  shell?: string | null;
  title?: string;
  cwd?: string | null;
  initCommand?: string | null;
}

/** Crea una nuova tab terminale e la rende attiva. Ritorna l'id. */
export function addTerminal(opts: NewTerminal = {}): string {
  counter += 1;
  const id = `term-${counter}`;
  terminals.list.push({
    id,
    title: opts.title ?? `Terminal ${counter}`,
    shell: opts.shell ?? null,
    cwd: opts.cwd ?? null,
    initCommand: opts.initCommand ?? null,
    started: false,
    attach: false,
    needsAttention: false,
  });
  terminals.activeId = id;
  return id;
}

/** Rimuove la tab all'indice `i` e sistema la tab attiva. Dopo lo splice l'indice `i` è il
 *  vicino di destra (e `i-1` quello di sinistra). Nasconde il pannello se non resta nulla. */
function removeAt(i: number) {
  const removed = terminals.list[i];
  terminals.list.splice(i, 1);
  if (removed && terminals.activeId === removed.id) {
    terminals.activeId = terminals.list[i]?.id ?? terminals.list[i - 1]?.id ?? null;
  }
  if (terminals.list.length === 0) layout.terminalVisible = false;
}

/** Toglie una tab dalla lista SENZA uccidere il PTY (per estrarla in finestra flottante). */
export function removeTerminalKeepPty(id: string) {
  const i = terminals.list.findIndex((t) => t.id === id);
  if (i !== -1) removeAt(i);
}

/** Reincolla un terminale estratto: si ricollega al PTY esistente (attach), senza rispawn.
 *  Non reincolla una tab morta: verifica prima che il PTY esista ancora nel backend. */
export async function redockTerminal(s: { id: string; title: string; shell: string | null }) {
  if (terminals.list.some((t) => t.id === s.id)) {
    terminals.activeId = s.id;
    layout.terminalVisible = true;
    return;
  }
  const alive = await invoke<boolean>("pty_alive", { id: s.id }).catch(() => false);
  if (!alive) return; // PTY morto → niente tab zombie
  terminals.list.push({
    id: s.id,
    title: s.title,
    shell: s.shell,
    cwd: null,
    initCommand: null,
    started: true,
    attach: true,
    needsAttention: false,
  });
  terminals.activeId = s.id;
  layout.terminalVisible = true;
}

export function setActiveTerminal(id: string) {
  terminals.activeId = id;
  clearAttention(id); // guardare la scheda azzera la richiesta d'attenzione
}

/** Azzera il pallino "attenzione" di una scheda (quando la guardi davvero). */
export function clearAttention(id: string | null) {
  if (!id) return;
  const t = terminals.list.find((s) => s.id === id);
  if (t) t.needsAttention = false;
}

/** La bell (BEL) del terminale `id` ha suonato: tipicamente Claude ha finito un turno o aspetta
 *  input. Segnala attenzione (pallino sulla scheda + toast) SOLO se non stai già guardando quel
 *  terminale; anti-spam: se è già segnalato non ripete il toast. Disattivabile da Impostazioni. */
export function notifyTerminalBell(id: string) {
  if (!settings.bellNotify) return;
  const t = terminals.list.find((s) => s.id === id);
  if (!t) return;
  // stai già guardando QUESTO terminale? (scheda attiva + pannello visibile + finestra a fuoco)
  const watching = terminals.activeId === id && layout.terminalVisible && document.hasFocus();
  if (watching || t.needsAttention) return; // niente da segnalare / già segnalato
  t.needsAttention = true;
  // toast solo se la finestra è a fuoco: se non lo è non lo vedresti (lì servirebbe una notifica OS)
  if (document.hasFocus()) notify(`${t.title} is waiting for you`, "info");
}

/** Chiude una tab: uccide il PTY e attiva un vicino; se era l'ultima nasconde il pannello. */
export async function closeTerminal(id: string) {
  await invoke("pty_kill", { id }).catch(() => {});
  const i = terminals.list.findIndex((t) => t.id === id);
  if (i !== -1) removeAt(i);
}

/** Garantisce almeno una tab (chiamata quando il pannello diventa visibile). */
export function ensureTerminal() {
  if (terminals.list.length === 0) addTerminal();
}
