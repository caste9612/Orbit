// Persistenza di sessione: salva/ripristina ultima cartella, tab aperte, tab
// attiva e stato dei pannelli in un JSON nella config dir dell'app (comandi Rust
// load_state/save_state). Zero dipendenze: niente plugin esterni.
import { invoke } from "@tauri-apps/api/core";
import { workspace, openFile } from "./workspace.svelte";
import { openRoot } from "./explorer.svelte";
import { layout, type SidebarView } from "./layout.svelte";

interface Session {
  v: number;
  root: string | null;
  files: string[];
  active: string | null;
  layout: {
    sidebarView: SidebarView;
    sidebarVisible: boolean;
    sidebarWidth: number;
    terminalVisible: boolean;
    terminalWidth: number;
  };
}

function serialize(): string {
  const files = workspace.openFiles.filter((f) => f.kind === "file").map((f) => f.path);
  const active = files.includes(workspace.activePath ?? "") ? workspace.activePath : null;
  const data: Session = {
    v: 1,
    root: workspace.rootPath,
    files,
    active,
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

/** Ripristina l'ultima sessione salvata. Ritorna true se ha riaperto una cartella. */
export async function loadSession(): Promise<boolean> {
  let raw: string | null;
  try {
    raw = await invoke<string | null>("load_state");
  } catch {
    return false;
  }
  if (!raw) return false;
  let s: Session;
  try {
    s = JSON.parse(raw);
  } catch {
    return false;
  }

  if (s.layout) {
    layout.sidebarView = s.layout.sidebarView ?? layout.sidebarView;
    layout.sidebarVisible = s.layout.sidebarVisible ?? layout.sidebarVisible;
    layout.sidebarWidth = s.layout.sidebarWidth ?? layout.sidebarWidth;
    layout.terminalVisible = s.layout.terminalVisible ?? layout.terminalVisible;
    layout.terminalWidth = s.layout.terminalWidth ?? layout.terminalWidth;
  }

  if (!s.root) return false;
  try {
    await openRoot(s.root);
  } catch {
    return false;
  }
  for (const p of s.files ?? []) {
    await openFile(p);
  }
  if (s.active) workspace.activePath = s.active;
  return true;
}

/** Attiva il salvataggio automatico (debounced) a ogni cambio di sessione/layout. */
export function startAutosave() {
  $effect.root(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    $effect(() => {
      const data = serialize(); // legge i campi reattivi → dipendenze tracciate
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        void invoke("save_state", { data }).catch((e) => console.error("save_state", e));
      }, 400);
    });
  });
}
