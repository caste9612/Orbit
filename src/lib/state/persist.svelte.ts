// Persistenza di sessione: salva/ripristina ultima cartella, gruppi editor (split view) con
// le rispettive tab e tab attiva, gruppo attivo e stato dei pannelli, in un JSON nella config
// dir dell'app (comandi Rust load_state/save_state). Zero dipendenze.
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { workspace, fileByPath, restoreGroups, resetDocs, autosaveAll, openFile, activePath } from "./workspace.svelte";
import { resolveUnsaved } from "./unsaved.svelte";
import { settings } from "./settings.svelte";
import { openRoot, snapshotExpanded } from "./explorer.svelte";
import { layout, beginMotion, type SidebarView } from "./layout.svelte";
import { syncActiveTerminalToRoot, adoptTerminals } from "./terminals.svelte";
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
    terminalMaximized?: boolean; // M54 (il vecchio `termSplit` di v0.8.11 è ignorato)
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
      terminalMaximized: layout.terminalMaximized,
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
  opts: { repos?: boolean; keepSidebar?: boolean; raw?: string | null; onRootOpened?: () => void } = {},
): Promise<boolean> {
  // `opts.raw`: sessione già letta dal chiamante (switchFolder la prefetcha in parallelo al salvataggio
  // di quella corrente, così il layout di destinazione arriva prima)
  let raw: string | null = null;
  if (opts.raw !== undefined) raw = opts.raw;
  else {
    try {
      raw = await invoke<string | null>("load_state", { key: rootHint ? sessionKey(rootHint) : null });
    } catch {
      raw = null;
    }
  }
  if (!raw) {
    if (rootHint) {
      try {
        setEditorCollapsedFor(false); // cartella senza sessione: nessuna tab → editor al minimo da subito
        await openRoot(rootHint);
        opts.onRootOpened?.();
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
    // allo switch di repo la sidebar resta com'è (keepSidebar): prima veniva applicata quella salvata e
    // poi ripristinata dal chiamante, con un lampeggio se le due differivano
    if (!opts.keepSidebar) {
      const sv = s.layout.sidebarView;
      layout.sidebarView = (["explorer", "git", "search", "docs", "activity"] as SidebarView[]).includes(sv)
        ? sv
        : "explorer"; // migra una vista salvata non più valida (es. la vecchia "claude") → Explorer
      layout.sidebarVisible = s.layout.sidebarVisible ?? layout.sidebarVisible;
    }
    layout.sidebarWidth = s.layout.sidebarWidth ?? layout.sidebarWidth;
    layout.terminalVisible = s.layout.terminalVisible ?? layout.terminalVisible;
    layout.terminalWidth = s.layout.terminalWidth ?? layout.terminalWidth;
    layout.terminalMaximized = s.layout.terminalMaximized === true;
  }
  // Editor collassato deciso SUBITO dalle tab salvate, insieme alle larghezze: un movimento solo invece
  // di "allarga, pausa, collassa dopo 400 ms" (l'effetto in App non tocca il collasso finché rootPath
  // è null, e poi conferma la stessa decisione).
  const hasTabs =
    (Array.isArray(s.groups) && s.groups.some((g) => Array.isArray(g.tabs) && g.tabs.length > 0)) ||
    (Array.isArray(s.files) && s.files.length > 0);
  setEditorCollapsedFor(hasTabs);

  const root = s.root ?? rootHint ?? null;
  if (!root) return false;
  try {
    await openRoot(root);
  } catch {
    return false;
  }
  opts.onRootOpened?.(); // es. mostrare subito le schede terminale della nuova repo, prima dei file
  if (opts.repos) setFolders(s.repos?.length ? s.repos : [root]); // lista repo della finestra

  if (Array.isArray(s.groups) && s.groups.length) {
    await restoreGroups(s.groups, s.activeGroup ?? 0);
  } else if (Array.isArray(s.files) && s.files.length) {
    // sessione v1: un solo gruppo
    await restoreGroups([{ tabs: s.files, active: s.active ?? s.files[0] }], 0);
  }
  return true;
}

/** L'area editor si stringe al minimo quando non ci sono tab e il pannello terminale è visibile
 *  (stessa regola dell'effetto in App.svelte, applicata in anticipo dalla sessione). */
function setEditorCollapsedFor(hasTabs: boolean) {
  layout.editorCollapsed = layout.terminalVisible && !hasTabs;
}

/** Salva subito (senza debounce) la sessione della cartella attualmente aperta. */
export async function saveSessionNow() {
  const root = workspace.rootPath;
  if (!root || workspace.light) return; // la finestra leggera non lascia sessioni (M57)
  await invoke("save_state", { key: sessionKey(root), data: serialize() }).catch((e) =>
    console.error("save_state", e),
  );
}

/** Prima di lasciare i documenti aperti (cambio cartella, finestra che si chiude, aggiornamento): con
 *  l'autosave ON si salvano subito; quel che resta modificato (conflitti, o autosave spento) passa dalla
 *  domanda Save all / Don't save / Cancel. false = l'utente ha annullato o un salvataggio è fallito. */
export async function settleUnsaved(opts: { discardLabel?: string } = {}): Promise<boolean> {
  if (settings.autosave) await autosaveAll();
  const dirty = workspace.openFiles.filter((f) => f.dirty && f.kind === "file");
  return resolveUnsaved(dirty, opts);
}

/** Prima che la finestra si chiuda o il processo esca ("chiudi tutte", aggiornamento — M59): nessuna
 *  modifica si perde senza chiedere, e la sessione si scrive subito (l'autosave è differito di 400 ms).
 *  Se serve una risposta, la finestra viene in primo piano (può essere un'altra a chiedere l'uscita). */
export async function prepareQuit(opts: { discardLabel?: string } = {}): Promise<boolean> {
  if (settings.autosave) await autosaveAll();
  const dirty = workspace.openFiles.filter((f) => f.dirty && f.kind === "file");
  if (dirty.length) {
    try {
      const w = getCurrentWindow();
      await w.unminimize();
      await w.setFocus();
    } catch {
      /* fuori dal contesto Tauri */
    }
    if (!(await resolveUnsaved(dirty, opts))) return false;
  }
  await saveSessionNow();
  return true;
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
  // da una finestra leggera, "apri cartella" sulla cartella stessa del file = aprila come progetto
  if (workspace.light && path === workspace.rootPath) {
    workspace.lightProject = path;
    return promoteLight();
  }
  if (!path || path === workspace.rootPath) return "switched";
  const prev = workspace.rootPath; // per tornare indietro se la nuova non si apre
  const keepView = layout.sidebarView; // "mantieni la vista corrente" allo switch (scelta utente)
  const keepVisible = layout.sidebarVisible;
  // la sessione di destinazione si legge SUBITO, in parallelo a autosave e salvataggio di quella corrente
  const rawP = invoke<string | null>("load_state", { key: sessionKey(path) }).catch(() => null);
  if (prev) snapshotExpanded(prev); // salva l'albero espanso del repo che stai lasciando
  // modifiche non salvate: con l'autosave ON le salviamo subito (come su blur/cambio-tab) invece di
  // chiedere conferma. Resta `dirty` solo ciò che l'autosave NON tocca — i file in conflitto (cambiati
  // anche su disco), o tutto ad autosave spento: per QUELLI Save all / Don't save / Cancel (M59).
  if (!(await settleUnsaved())) return "cancelled";
  // Movimento fluido: tutto il layout della nuova cartella (larghezze, pannello massimizzato, editor
  // collassato, riquadri) arriva in una transizione sola; i terminali rifittano una volta alla fine.
  const endMotion = beginMotion();
  workspace.switching = true; // la sidebar tiene l'albero vecchio invece di mostrare "Open folder…"
  try {
    // 1. preserva le tab della cartella corrente (sotto la sua chiave): serializza subito, scrive in
    //    parallelo alla lettura della destinazione (una finestra leggera non salva nulla)
    const saveP = saveSessionNow();
    // aprire un'altra cartella da una finestra leggera ne fa una finestra normale (M57)
    workspace.light = false;
    workspace.lightProject = null;
    workspace.rootPath = null; // 2. sospende l'autosave (niente clobber durante lo scambio)
    resetDocs(); // 3. via i documenti della cartella precedente
    const raw = await rawP;
    await saveP;
    // 4. ripristina la nuova cartella (apre comunque se senza sessione); la sidebar resta com'è; le
    //    schede terminale della nuova repo compaiono appena la cartella è aperta, prima dei file. Le
    //    schede aperte quando non c'era nessuna cartella passano alla prima che si apre (prima
    //    restavano vive ma nascoste, senza modo di tornarci).
    const sync = () => {
      if (!prev) adoptTerminals(null, workspace.rootPath);
      syncActiveTerminalToRoot(workspace.rootPath);
    };
    const ok = await loadSession(path, { keepSidebar: true, raw, onRootOpened: sync });
    if (!ok) {
      // cartella spostata/eliminata: openRoot ha lanciato senza toccare rootPath → niente stato a metà.
      // Torniamo alla cartella precedente (così non resta una finestra vuota) e segnaliamo l'errore;
      // il chiamante toglierà la voce morta dal selettore.
      if (prev) await loadSession(prev, { keepSidebar: true, onRootOpened: sync }).catch(() => {});
      notify(`Can't open "${basename(path)}" — the folder may have been moved or deleted.`, "error");
      return "failed";
    }
    // 5. "mantieni la vista corrente" (scelta utente): NON forziamo Explorer e NON lasciamo vincere la
    //    vista salvata del repo di destinazione — resti sulla vista che stavi usando (comportamento a
    //    schede). Lo startup invece rispetta la vista salvata (qui siamo solo nello switch).
    layout.sidebarView = keepView;
    layout.sidebarVisible = keepVisible;
    return "switched";
  } finally {
    workspace.switching = false;
    endMotion();
  }
}

/** Modalità leggera (M57): apre `file` usando la sua cartella `dir` solo come contesto — niente
 *  sessione (né letta né salvata), niente lista repo, barra laterale e pannello compressi in striscia.
 *  Il repo git che contiene il file, se c'è, è la cartella proposta da "Open … as project". */
export async function openLight(dir: string, file: string) {
  workspace.light = true;
  workspace.lightProject = null;
  layout.sidebarVisible = false;
  layout.terminalVisible = false;
  layout.terminalMaximized = false;
  layout.editorCollapsed = false;
  await openRoot(dir, { light: true });
  await openFile(file);
  const repo = await invoke<string | null>("project_root", { path: file }).catch(() => null);
  workspace.lightProject = repo ?? dir;
}

/** "Open … as project" (M57): la finestra leggera diventa un progetto normale sul repo che contiene il
 *  file (o sulla sua cartella), con la sessione salvata del progetto, la lista repo, l'indice, git e
 *  l'osservazione ricorsiva. I file aperti restano aperti, la barra laterale si riapre sull'Explorer. */
export async function promoteLight(): Promise<SwitchResult> {
  const from = workspace.rootPath;
  if (!workspace.light || !from) return "cancelled";
  const target = workspace.lightProject ?? from;
  const files = workspace.openFiles.filter((f) => f.kind === "file").map((f) => f.path);
  const active = activePath();
  if (!(await settleUnsaved())) return "cancelled";
  const rawP = invoke<string | null>("load_state", { key: sessionKey(target) }).catch(() => null);
  const endMotion = beginMotion();
  workspace.switching = true;
  try {
    workspace.light = false;
    workspace.lightProject = null;
    workspace.rootPath = null;
    resetDocs();
    // le schede aperte nella finestra leggera passano al progetto (restano vive e visibili)
    const onRootOpened = () => {
      adoptTerminals(from, workspace.rootPath);
      syncActiveTerminalToRoot(workspace.rootPath);
    };
    const ok = await loadSession(target, { repos: true, keepSidebar: true, raw: await rawP, onRootOpened });
    if (!ok) {
      notify(`Can't open "${basename(target)}" as a project.`, "error");
      if (active ?? files[0]) await openLight(from, (active ?? files[0])!);
      return "failed";
    }
    for (const f of files) await openFile(f);
    if (active) await openFile(active); // torna attivo il file che stavi guardando
    layout.sidebarView = "explorer";
    layout.sidebarVisible = true;
    return "switched";
  } finally {
    workspace.switching = false;
    endMotion();
  }
}

/** Attiva il salvataggio automatico (debounced) a ogni cambio di sessione/layout.
 *  La sessione è salvata sotto chiave = cartella aperta (per le istanze multiple). */
export function startAutosave() {
  $effect.root(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    $effect(() => {
      const root = workspace.rootPath; // dipendenza
      const light = workspace.light; // dipendenza: promossa a progetto, la sessione si salva da lì in poi
      const data = serialize(); // legge i campi reattivi → dipendenze tracciate
      if (!root || light) return; // niente cartella aperta (o finestra leggera) → niente da persistere
      const key = sessionKey(root); // chiave per-finestra (<winKey>|<folder>)
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        void invoke("save_state", { key, data }).catch((e) => console.error("save_state", e));
      }, 400);
    });
  });
}
