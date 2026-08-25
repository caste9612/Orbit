// Persistenza di sessione: salva/ripristina ultima cartella, gruppi editor (split view) con
// le rispettive tab e tab attiva, gruppo attivo e stato dei pannelli, in un JSON nella config
// dir dell'app (comandi Rust load_state/save_state). Zero dipendenze.
import { invoke } from "@tauri-apps/api/core";
import { confirm } from "@tauri-apps/plugin-dialog";
import { workspace, fileByPath, restoreGroups, resetDocs, autosaveAll } from "./workspace.svelte";
import { settings } from "./settings.svelte";
import { openRoot, snapshotExpanded } from "./explorer.svelte";
import { layout, type SidebarView } from "./layout.svelte";
import { syncActiveTerminalToRoot } from "./terminals.svelte";
import { folders, setFolders } from "./folders.svelte";
import { notify } from "./toast.svelte";
import { basename } from "../util";

// Chiave di sessione PER-FINESTRA: la sessione è keyed `<winKey>|<folder>` invece che `<folder>`, così
// due finestre sulla STESSA cartella non si sovrascrivono tab/layout/repos. `winKey` è la chiave
// stabile della finestra (dal backend, vedi winsession::WinKey), impostata da App allo startup.
let winKey = "";
export function setWinKey(k: string) {
  winKey = k || "";
}
function sessionKey(folder: string): string {
  return winKey ? `${winKey}|${folder}` : folder; // fallback legacy se winKey non disponibile
}

interface SavedGroup {
  tabs: string[];
  active: string | null;
  previews?: string[]; // tab in anteprima (md/html) del gruppo
}

interface Session {
  v: number;
  root: string | null;
  repos?: string[]; // lista repo della FINESTRA (selettore top bar) — per-finestra, non globale
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
    groups.push({ tabs, active, previews: g.previews.filter((p) => tabs.includes(p)) });
  }
  const data: Session = {
    v: 2,
    root: workspace.rootPath,
    repos: folders.list.map((f) => f.path), // la lista repo della finestra vive nella sua sessione
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
 *  Sessioni keyed per-cartella → due istanze su progetti diversi non si sovrascrivono.
 *  `opts.repos`: rinsemina la lista repo della finestra dai `repos` salvati (SOLO all'avvio
 *  finestra; uno switch di cartella NON deve sostituire la lista repo della finestra corrente). */
export async function loadSession(
  rootHint?: string,
  opts: { repos?: boolean } = {},
): Promise<boolean> {
  let raw: string | null = null;
  try {
    raw = await invoke<string | null>("load_state", { key: rootHint ? sessionKey(rootHint) : null });
  } catch {
    raw = null;
  }
  if (!raw) {
    if (rootHint) {
      try {
        await openRoot(rootHint);
        if (opts.repos) setFolders([rootHint]); // nessuna sessione → lista = solo questa cartella
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
    if (rootHint) {
      await openRoot(rootHint).catch(() => {});
      if (opts.repos) setFolders([rootHint]);
    }
    return false;
  }

  if (s.layout) {
    const sv = s.layout.sidebarView;
    layout.sidebarView = (["explorer", "git", "search", "docs", "activity"] as SidebarView[]).includes(sv)
      ? sv
      : "explorer"; // migra una vista salvata non più valida (es. la vecchia "claude") → Explorer
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
  if (opts.repos) setFolders(s.repos?.length ? s.repos : [root]); // lista repo della finestra

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
  await invoke("save_state", { key: sessionKey(root), data: serialize() }).catch((e) =>
    console.error("save_state", e),
  );
}

/** Esito di `switchFolder`: `switched` = ora siamo su `path`; `cancelled` = l'utente ha annullato
 *  (edit non salvati) e siamo rimasti dov'eravamo; `failed` = la cartella non si è aperta (spostata/
 *  eliminata) e abbiamo ripristinato la precedente. Il chiamante distingue "annullato" da "morta". */
export type SwitchResult = "switched" | "cancelled" | "failed";

/** Cambia la cartella del workspace nella finestra corrente: salva la sessione attuale,
 *  azzera i documenti della cartella precedente e ripristina la sessione della nuova (o la
 *  apre vuota). Mette `rootPath` a null durante lo scambio così l'autosave non sovrascrive
 *  la sessione appena salvata con uno stato vuoto. Se la nuova cartella non è apribile,
 *  ripristina quella precedente (niente finestra vuota) e ritorna `failed`. */
export async function switchFolder(path: string): Promise<SwitchResult> {
  if (!path || path === workspace.rootPath) return "switched";
  const prev = workspace.rootPath; // per tornare indietro se la nuova non si apre
  const keepView = layout.sidebarView; // "mantieni la vista corrente" allo switch (scelta utente)
  const keepVisible = layout.sidebarVisible;
  if (prev) snapshotExpanded(prev); // salva l'albero espanso del repo che stai lasciando
  // modifiche non salvate: con l'autosave ON le salviamo subito (come su blur/cambio-tab) invece di
  // chiedere conferma. Resta `dirty` solo ciò che l'autosave NON tocca — i file in conflitto (cambiati
  // anche su disco): per QUELLI si chiede comunque conferma prima di scartarli con resetDocs.
  if (settings.autosave) await autosaveAll();
  const dirty = workspace.openFiles.filter((f) => f.dirty).length;
  if (dirty > 0) {
    const ok = await confirm(
      `${dirty === 1 ? "1 file has" : `${dirty} files have`} unsaved changes that switching folder will discard. Continue?`,
      { title: "Unsaved changes", kind: "warning" },
    );
    if (!ok) return "cancelled";
  }
  await saveSessionNow(); // 1. preserva le tab della cartella corrente (sotto la sua chiave)
  workspace.rootPath = null; // 2. sospende l'autosave (niente clobber durante lo scambio)
  resetDocs(); // 3. via i documenti della cartella precedente
  const ok = await loadSession(path); // 4. ripristina la nuova cartella (apre comunque se senza sessione)
  if (!ok) {
    // cartella spostata/eliminata: openRoot ha lanciato senza toccare rootPath → niente stato a metà.
    // Torniamo alla cartella precedente (così non resta una finestra vuota) e segnaliamo l'errore;
    // il chiamante toglierà la voce morta dal selettore.
    if (prev) await loadSession(prev).catch(() => {});
    notify(`Can't open "${basename(path)}" — the folder may have been moved or deleted.`, "error");
    return "failed";
  }
  // 5. "mantieni la vista corrente" (scelta utente): NON forziamo Explorer e NON lasciamo vincere la
  //    vista salvata del repo di destinazione — resti sulla vista che stavi usando (comportamento a
  //    schede). Lo startup invece rispetta la vista salvata (qui siamo solo nello switch).
  layout.sidebarView = keepView;
  layout.sidebarVisible = keepVisible;
  syncActiveTerminalToRoot(workspace.rootPath); // 6. mostra le schede terminale di QUESTA repo
  return "switched";
}

/** Attiva il salvataggio automatico (debounced) a ogni cambio di sessione/layout.
 *  La sessione è salvata sotto chiave = cartella aperta (per le istanze multiple). */
export function startAutosave() {
  $effect.root(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    $effect(() => {
      const root = workspace.rootPath; // dipendenza
      const data = serialize(); // legge i campi reattivi → dipendenze tracciate
      if (!root) return; // niente cartella aperta → niente da persistere
      const key = sessionKey(root); // chiave per-finestra (<winKey>|<folder>)
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        void invoke("save_state", { key, data }).catch((e) => console.error("save_state", e));
      }, 400);
    });
  });
}
