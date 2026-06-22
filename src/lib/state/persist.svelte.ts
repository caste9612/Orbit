// Persistenza di sessione: salva/ripristina ultima cartella, gruppi editor (split view) con
// le rispettive tab e tab attiva, gruppo attivo e stato dei pannelli, in un JSON nella config
// dir dell'app (comandi Rust load_state/save_state). Zero dipendenze.
import { invoke } from "@tauri-apps/api/core";
import { confirm } from "@tauri-apps/plugin-dialog";
import { workspace, fileByPath, restoreGroups, resetDocs } from "./workspace.svelte";
import { openRoot } from "./explorer.svelte";
import { layout, type SidebarView } from "./layout.svelte";
import { syncActiveTerminalToRoot } from "./terminals.svelte";

interface SavedGroup {
  tabs: string[];
  active: string | null;
}

interface Session {
  v: number;
  root: string | null;
  groups?: SavedGroup[]; // v2: split view
  activeGroup?: number;
  files?: string[]; // v1 (legacy): un solo gruppo
  active?: string | null;
  layout: {
    sidebarView: SidebarView;
    sidebarVisible: boolean;
    sidebarWidth: number;
    terminalVisible: boolean;
    terminalWidth: number;
  };
}

function serialize(): string {
  const groups: SavedGroup[] = [];
  let activeGroup = 0;
  for (const g of workspace.groups) {
    const tabs = g.tabs.filter((p) => fileByPath(p)?.kind === "file"); // i diff non si persistono
    if (tabs.length === 0) continue;
    if (g.id === workspace.activeGroupId) activeGroup = groups.length;
    const active = g.activePath && tabs.includes(g.activePath) ? g.activePath : tabs[0];
    groups.push({ tabs, active });
  }
  const data: Session = {
    v: 2,
    root: workspace.rootPath,
    groups,
    activeGroup,
    layout: {
      sidebarView: layout.sidebarView,
      sidebarVisible: layout.sidebarVisible,
      sidebarWidth: layout.sidebarWidth,
      terminalVisible: layout.terminalVisible,
      terminalWidth: layout.terminalWidth,
    },
  };
  return JSON.stringify(data);
}

/** Ripristina una sessione. Con `rootHint` carica quella della cartella indicata (e la
 *  apre comunque se non c'è sessione salvata); senza, ripristina l'ultima cartella usata.
 *  Sessioni keyed per-cartella → due istanze su progetti diversi non si sovrascrivono. */
export async function loadSession(rootHint?: string): Promise<boolean> {
  let raw: string | null = null;
  try {
    raw = await invoke<string | null>("load_state", { key: rootHint ?? null });
  } catch {
    raw = null;
  }
  if (!raw) {
    if (rootHint) {
      try {
        await openRoot(rootHint);
        return true;
      } catch {
        return false;
      }
    }
    return false;
  }
  let s: Session;
  try {
    s = JSON.parse(raw);
  } catch {
    if (rootHint) await openRoot(rootHint).catch(() => {});
    return false;
  }

  if (s.layout) {
    layout.sidebarView = s.layout.sidebarView ?? layout.sidebarView;
    layout.sidebarVisible = s.layout.sidebarVisible ?? layout.sidebarVisible;
    layout.sidebarWidth = s.layout.sidebarWidth ?? layout.sidebarWidth;
    layout.terminalVisible = s.layout.terminalVisible ?? layout.terminalVisible;
    layout.terminalWidth = s.layout.terminalWidth ?? layout.terminalWidth;
  }

  const root = s.root ?? rootHint ?? null;
  if (!root) return false;
  try {
    await openRoot(root);
  } catch {
    return false;
  }

  if (Array.isArray(s.groups) && s.groups.length) {
    await restoreGroups(s.groups, s.activeGroup ?? 0);
  } else if (Array.isArray(s.files) && s.files.length) {
    // sessione v1: un solo gruppo
    await restoreGroups([{ tabs: s.files, active: s.active ?? s.files[0] }], 0);
  }
  return true;
}

/** Salva subito (senza debounce) la sessione della cartella attualmente aperta. */
export async function saveSessionNow() {
  const root = workspace.rootPath;
  if (!root) return;
  await invoke("save_state", { key: root, data: serialize() }).catch((e) =>
    console.error("save_state", e),
  );
}

/** Cambia la cartella del workspace nella finestra corrente: salva la sessione attuale,
 *  azzera i documenti della cartella precedente e ripristina la sessione della nuova (o la
 *  apre vuota). Mette `rootPath` a null durante lo scambio così l'autosave non sovrascrive
 *  la sessione appena salvata con uno stato vuoto. */
export async function switchFolder(path: string) {
  if (!path || path === workspace.rootPath) return;
  // avvisa se ci sono modifiche non salvate: cambiare cartella le scarterebbe (resetDocs)
  const dirty = workspace.openFiles.filter((f) => f.dirty).length;
  if (dirty > 0) {
    const ok = await confirm(
      `${dirty === 1 ? "1 file has" : `${dirty} files have`} unsaved changes that switching folder will discard. Continue?`,
      { title: "Unsaved changes", kind: "warning" },
    );
    if (!ok) return;
  }
  await saveSessionNow(); // 1. preserva le tab della cartella corrente (sotto la sua chiave)
  workspace.rootPath = null; // 2. sospende l'autosave (niente clobber durante lo scambio)
  resetDocs(); // 3. via i documenti della cartella precedente
  await loadSession(path); // 4. ripristina la nuova cartella (apre comunque se senza sessione)
  // 5. al CAMBIO repo mostra sempre l'Explorer: deterministico, niente Docs/Chat "a sorpresa"
  //    ereditati dalla vista salvata di quel repo. (Lo startup invece rispetta la vista salvata.)
  layout.sidebarView = "explorer";
  layout.sidebarVisible = true; // e mostra la sidebar (se quel repo l'aveva nascosta)
  syncActiveTerminalToRoot(workspace.rootPath); // 6. mostra le schede terminale di QUESTA repo
}

/** Attiva il salvataggio automatico (debounced) a ogni cambio di sessione/layout.
 *  La sessione è salvata sotto chiave = cartella aperta (per le istanze multiple). */
export function startAutosave() {
  $effect.root(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    $effect(() => {
      const root = workspace.rootPath; // dipendenza + chiave
      const data = serialize(); // legge i campi reattivi → dipendenze tracciate
      if (!root) return; // niente cartella aperta → niente da persistere
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        void invoke("save_state", { key: root, data }).catch((e) => console.error("save_state", e));
      }, 400);
    });
  });
}
