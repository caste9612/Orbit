// Terminali e chat di Claude ritrovati al riavvio (M66). Ogni finestra salva le schede di tutte le sue repo
// (nome, colore, cartella, shell, riquadri affiancati e, per le chat, la conversazione) sotto la propria
// chiave, `<winKey>|#terminals`. Al riavvio tornano ADDORMENTATE e partono quando le si vede: le chat con
// `claude --resume <id>` nella loro cartella, le shell nuove (senza l'output di prima). Così all'avvio non si
// accendono processi per schede di repo che magari non riapri. Le schede di Esegui e di git (lavori) no.
// La conversazione di ogni scheda la dice il registro di Claude Code (`pty_claude_sessions`, claudeproc.rs):
// si rilegge ogni 15 s e prima di chiudere, così vale anche dopo un /clear o un claude lanciato a mano.
import { invoke } from "@tauri-apps/api/core";
import {
  terminals,
  restoreTerminal,
  restoreRepoTerminals,
  rememberedActive,
  syncActiveTerminalToRoot,
  rootKey,
  type ChatRef,
  type PaneSizes,
  type TermSession,
} from "./terminals.svelte";
import { flatten, type Layout } from "./terminalLayout";
import { chatCommand } from "./claude.svelte";
import { workspace } from "./workspace.svelte";
import { folders } from "./folders.svelte";
import { onBeforeQuit } from "./persist.svelte";

interface SavedTerm {
  kind: "shell" | "claude";
  title: string;
  shortName: string;
  customTitle: string | null;
  autoTitle: string | null;
  color: string;
  shell: string | null;
  cwd: string | null;
  chat: ChatRef | null;
}

interface SavedRepo {
  root: string;
  tabs: SavedTerm[];
  active: number; // indice della scheda attiva
  layout: number[][]; // riquadri affiancati per indice di scheda ([] = nessuno split)
  auto: boolean;
  sizes: PaneSizes | null;
}

interface SavedTerminals {
  v: 1;
  repos: SavedRepo[];
}

let key = "";
/** Chiave della finestra (la stessa delle sessioni, vedi persist.setWinKey). */
export function setTerminalsKey(winKey: string) {
  key = winKey ? `${winKey}|#terminals` : "";
}

const str = (v: unknown): string | null => (typeof v === "string" ? v : null);

function toSaved(t: TermSession): SavedTerm {
  return {
    // una shell in cui gira una chat (claude lanciato a mano) torna come chat
    kind: t.chat || t.kind === "claude" ? "claude" : "shell",
    title: t.title,
    shortName: t.shortName,
    customTitle: t.customTitle,
    autoTitle: t.autoTitle,
    color: t.color,
    shell: t.shell,
    cwd: t.cwd,
    chat: t.chat ? { id: t.chat.id, cwd: t.chat.cwd } : null,
  };
}

/** Stato da salvare (legge i campi reattivi: l'effetto di salvataggio ne dipende). */
function serialize(): string {
  const byRoot = new Map<string, TermSession[]>();
  for (const t of [...terminals.list, ...terminals.floating]) {
    if (t.kind === "run" || !t.root) continue; // lavori, e schede senza cartella
    const k = rootKey(t.root);
    if (!byRoot.has(k)) byRoot.set(k, []);
    byRoot.get(k)!.push(t);
  }
  const repos: SavedRepo[] = [];
  for (const [k, tabs] of byRoot) {
    const index = new Map(tabs.map((t, i) => [t.id, i]));
    const current = terminals.activeId && tabs.some((t) => t.id === terminals.activeId) ? terminals.activeId : null;
    const activeId = current ?? rememberedActive(k);
    const lay = (terminals.layouts[k] ?? [])
      .map((col) => col.map((id) => index.get(id)).filter((i): i is number => i !== undefined))
      .filter((col) => col.length > 0);
    repos.push({
      root: k,
      tabs: tabs.map(toSaved),
      active: Math.max(0, activeId ? (index.get(activeId) ?? 0) : 0),
      layout: lay.flat().length >= 2 ? lay : [],
      auto: terminals.autoLayout[k] ?? true,
      sizes: terminals.sizes[k] ?? null,
    });
  }
  const data: SavedTerminals = { v: 1, repos };
  return JSON.stringify(data);
}

async function save(data: string) {
  await invoke("save_state", { key, data, pointer: false }).catch((e) => console.error("terminali: save_state", e));
}

/** Ricrea le schede salvate di questa finestra (addormentate). Prima di `startTerminalPersistence`, che
 *  altrimenti salverebbe subito lo stato vuoto. Ritorna quante schede sono tornate. */
export async function restoreTerminals(): Promise<number> {
  if (!key || workspace.light) return 0;
  const raw = await invoke<string | null>("load_state", { key }).catch(() => null);
  if (!raw) return 0;
  let s: SavedTerminals;
  try {
    s = JSON.parse(raw);
  } catch {
    return 0;
  }
  if (!s || s.v !== 1 || !Array.isArray(s.repos)) return 0;
  // solo le repo ancora nella finestra: le altre non si raggiungerebbero più
  const known = new Set(folders.list.map((f) => f.path));
  if (workspace.rootPath) known.add(workspace.rootPath);
  const repos = s.repos.filter((r) => r && typeof r.root === "string" && known.has(r.root) && Array.isArray(r.tabs));
  // le chat mai usate non hanno un transcript: `--resume` fallirebbe, ripartono come chat nuove
  const chatIds = repos.flatMap((r) => r.tabs.map((t) => str(t?.chat?.id)).filter((id): id is string => !!id));
  const exists = chatIds.length
    ? await invoke<boolean[]>("claude_transcripts", { ids: chatIds }).catch(() => chatIds.map(() => true))
    : [];
  const resumable = new Set(chatIds.filter((_, i) => exists[i]));
  let n = 0;
  for (const r of repos) {
    const ids = r.tabs
      .filter((t) => t && typeof t.title === "string")
      .map((t) => {
        const chatId = str(t.chat?.id);
        return restoreTerminal(
          {
            kind: t.kind === "claude" ? "claude" : "shell",
            title: t.title,
            shortName: str(t.shortName) ?? t.title,
            customTitle: str(t.customTitle),
            autoTitle: str(t.autoTitle),
            color: str(t.color) ?? "#4c8dff",
            shell: str(t.shell),
            cwd: str(t.cwd),
            chat: chatId && resumable.has(chatId) ? { id: chatId, cwd: str(t.chat?.cwd) } : null,
          },
          r.root,
        );
      });
    const lay: Layout = (Array.isArray(r.layout) ? r.layout : [])
      .map((col) => (Array.isArray(col) ? col.map((i) => ids[i]).filter(Boolean) : []))
      .filter((col) => col.length > 0);
    const sizes = r.sizes && Array.isArray(r.sizes.cols) ? r.sizes : null;
    restoreRepoTerminals(r.root, flatten(lay).length >= 2 ? lay : [], r.auto !== false, sizes, ids[r.active] ?? ids[0] ?? null);
    n += ids.length;
  }
  syncActiveTerminalToRoot(workspace.rootPath);
  return n;
}

const waking = new Set<string>();

/** Avvia una scheda ripristinata, ora che la si vede: una chat riprende la sua conversazione (o ne apre una
 *  nuova se non ne aveva), con la configurazione Claude della sua repo; una shell parte nuova. */
export async function wakeTerminal(t: TermSession) {
  if (!t.dormant || waking.has(t.id)) return;
  waking.add(t.id);
  try {
    if (t.kind === "claude") {
      t.initCommand = await chatCommand(t.chat?.id ?? null);
      if (t.chat?.cwd) t.cwd = t.chat.cwd; // Claude cerca la sessione fra quelle della cartella corrente
    }
    t.dormant = false;
  } finally {
    waking.delete(t.id);
  }
}

/** Rilegge dal registro di Claude Code quale conversazione gira in ogni scheda viva. */
async function refreshChats() {
  const live = [...terminals.list, ...terminals.floating].filter((t) => !t.dormant && t.kind !== "run");
  if (!live.length) return;
  let found: Record<string, { sessionId: string; cwd: string | null }>;
  try {
    found = await invoke("pty_claude_sessions", { ids: live.map((t) => t.id) });
  } catch {
    return;
  }
  for (const t of live) {
    const c = found[t.id];
    if (!c) continue; // nessuna chat in corso: si tiene l'ultima vista (claude chiuso con /exit, o in avvio)
    if (t.chat?.id !== c.sessionId || t.chat?.cwd !== (c.cwd ?? null)) t.chat = { id: c.sessionId, cwd: c.cwd ?? null };
  }
}

/** Prima di chiudere: chat aggiornate e stato scritto subito (senza attendere il salvataggio differito). */
async function flush() {
  if (!key || workspace.light) return;
  await refreshChats();
  await save(serialize());
}

let started = false;
/** Salvataggio continuo (differito di 800 ms a ogni cambiamento), rilettura delle chat ogni 15 s, e un
 *  ultimo salvataggio prima che la finestra si chiuda. */
export function startTerminalPersistence() {
  if (started) return;
  started = true;
  $effect.root(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    $effect(() => {
      const data = serialize(); // dipendenze: schede, nomi, colori, riquadri, chat
      if (!key || workspace.light) return;
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => void save(data), 800);
    });
  });
  setInterval(() => void refreshChats(), 15_000);
  onBeforeQuit(flush);
}
