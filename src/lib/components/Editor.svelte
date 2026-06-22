<script lang="ts">
  import { onMount, untrack } from "svelte";
  import { EditorState, Compartment } from "@codemirror/state";
  import {
    EditorView,
    keymap,
    lineNumbers,
    highlightActiveLine,
    highlightActiveLineGutter,
    drawSelection,
    highlightSpecialChars,
  } from "@codemirror/view";
  import { defaultKeymap, history, historyKeymap, indentWithTab } from "@codemirror/commands";
  import { search, searchKeymap, highlightSelectionMatches } from "@codemirror/search";
  import {
    indentOnInput,
    bracketMatching,
    foldGutter,
    foldKeymap,
    indentUnit,
    LanguageDescription,
  } from "@codemirror/language";
  import { languages } from "@codemirror/language-data";
  import { editorTheme } from "../editor/theme";
  import { indentGuides } from "../editor/indentGuides";
  import { gitGutter, setGitMarks, parseGitMarks } from "../editor/gitGutter";
  import { semanticHighlight } from "../editor/semanticHighlight";
  import { setActiveEditor, clearActiveEditor } from "../editor/activeEditor";
  import { settings, isLightTheme } from "../state/settings.svelte";
  import { git } from "../state/git.svelte";
  import { workspace } from "../state/workspace.svelte";
  import { invoke } from "@tauri-apps/api/core";
  import { basename, normSlash, relTo } from "../util";
  import ContextMenu, { type MenuItem } from "./ContextMenu.svelte";
  import { openSymbols } from "../state/symbols.svelte";
  import { goToDefinition, semIndex } from "../state/codeIndex.svelte";

  interface Props {
    doc: string;
    path: string;
    readonly?: boolean;
    rev?: number;
    gotoLine?: number | null;
    onChange: (doc: string) => void;
    onSave: () => void;
    onGotoHandled?: () => void;
    onCursor?: (line: number, col: number) => void;
  }
  let {
    doc,
    path,
    readonly = false,
    rev = 0,
    gotoLine = null,
    onChange,
    onSave,
    onGotoHandled,
    onCursor,
  }: Props = $props();

  let host: HTMLDivElement;
  let view: EditorView | undefined;
  let applyingExternal = false; // evita di marcare dirty durante un reload programmatico
  let lastRev = untrack(() => rev); // baseline iniziale (volutamente non reattivo)
  const langConf = new Compartment();
  const themeConf = new Compartment(); // EditorView.theme + HighlightStyle (chiaro/scuro)

  onMount(() => {
    const state = EditorState.create({
      doc,
      extensions: [
        lineNumbers(),
        gitGutter(),
        semanticHighlight,
        foldGutter(),
        highlightActiveLineGutter(),
        highlightSpecialChars(),
        history(),
        drawSelection(),
        EditorView.lineWrapping, // le righe lunghe vanno a capo (gutter come VS Code)
        indentOnInput(),
        bracketMatching(),
        highlightActiveLine(),
        highlightSelectionMatches(),
        search({ top: true }),
        EditorView.domEventHandlers({
          mousedown(e, v) {
            // Ctrl/Cmd+click = Vai alla definizione del simbolo cliccato
            if ((e.ctrlKey || e.metaKey) && e.button === 0) {
              const pos = v.posAtCoords({ x: e.clientX, y: e.clientY });
              if (pos != null) {
                const w = v.state.wordAt(pos);
                if (w) {
                  e.preventDefault();
                  void goToDefinition(v.state.sliceDoc(w.from, w.to));
                  return true;
                }
              }
            }
            return false;
          },
        }),
        indentGuides,
        indentUnit.of("  "),
        langConf.of([]),
        themeConf.of(editorTheme(isLightTheme())),
        EditorState.readOnly.of(readonly),
        EditorView.editable.of(!readonly),
        keymap.of([
          {
            key: "Mod-s",
            preventDefault: true,
            run: () => {
              onSave();
              return true;
            },
          },
          indentWithTab,
          ...searchKeymap,
          ...defaultKeymap,
          ...historyKeymap,
          ...foldKeymap,
        ]),
        EditorView.updateListener.of((u) => {
          if (u.docChanged && !applyingExternal) onChange(u.state.doc.toString());
          if ((u.docChanged || u.selectionSet) && onCursor) {
            const head = u.state.selection.main.head;
            const line = u.state.doc.lineAt(head);
            onCursor(line.number, head - line.from + 1);
          }
        }),
      ],
    });
    view = new EditorView({ state, parent: host });
    view.focus();
    setActiveEditor(view); // editor attivo (per "Vai al simbolo")
    view.dom.addEventListener("focusin", () => view && setActiveEditor(view));
    onCursor?.(1, 1); // posizione iniziale del cursore
    void loadLanguage();
    void loadGutter();
    return () => {
      if (view) clearActiveEditor(view);
      view?.destroy();
    };
  });

  // reload esterno (rev cambiato): rimpiazza il doc preservando la vista, senza dirty
  $effect(() => {
    const r = rev;
    if (!view || r === lastRev) return;
    lastRev = r;
    const text = untrack(() => doc);
    if (text === view.state.doc.toString()) return;
    applyingExternal = true;
    view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: text } });
    applyingExternal = false;
  });

  // cambio font/dimensione (dalle Impostazioni): re-misura la geometria di CodeMirror
  $effect(() => {
    settings.fontSize;
    settings.fontMono;
    view?.requestMeasure();
  });

  // cambio tema (Impostazioni): ricarica EditorView.theme + HighlightStyle (chiaro/scuro)
  $effect(() => {
    const light = isLightTheme();
    view?.dispatch({ effects: themeConf.reconfigure(editorTheme(light)) });
  });

  // ricarica i marcatori git quando lo stato git cambia (refresh / save / modifica esterna),
  // ma solo se QUESTO file è tra i cambiati (o lo era: per ripulire i marcatori al ritorno a
  // "pulito"). Evita un git_diff per ogni editor aperto a ogni evento FS (hot path con Claude).
  let hadMarks = false;
  $effect(() => {
    git.tick;
    if (!view) return;
    const rel = relPath();
    const relN = rel ? normSlash(rel) : null;
    const changed =
      !!relN &&
      (git.unstaged.some((e) => normSlash(e.path) === relN) ||
        git.staged.some((e) => normSlash(e.path) === relN));
    if (!changed && !hadMarks) return; // pulito e nessun marcatore da ripulire: niente IPC
    void loadGutter();
  });

  // overlay semantico: quando l'indice simboli cambia (scan/cambio cartella), "tocca" l'editor con
  // una transazione vuota così il ViewPlugin ricostruisce le decorazioni anche senza scroll/modifica.
  $effect(() => {
    semIndex.version;
    untrack(() => view?.dispatch({}));
  });

  // salto a una riga (da ricerca)
  $effect(() => {
    const gl = gotoLine;
    if (!view || gl == null || gl <= 0) return;
    const ln = Math.min(gl, view.state.doc.lines);
    const info = view.state.doc.line(ln);
    view.dispatch({ selection: { anchor: info.from }, scrollIntoView: true });
    view.focus();
    onGotoHandled?.();
  });

  async function loadLanguage() {
    if (!view) return;
    const name = basename(path);
    try {
      // Svelte non è in @codemirror/language-data: language-pack dedicato (lazy).
      if (name.toLowerCase().endsWith(".svelte")) {
        const { svelte } = await import("@replit/codemirror-lang-svelte");
        view.dispatch({ effects: langConf.reconfigure(svelte()) });
        return;
      }
      // alias estensione → grammatica già installata (contenuto noto, non in language-data)
      const ext = name.toLowerCase().split(".").pop() ?? "";
      const alias: Record<string, string> = { iml: "x.xml", jsonl: "x.json", map: "x.json" };
      const desc = LanguageDescription.matchFilename(languages, alias[ext] ?? name);
      if (!desc) return;
      const support = await desc.load();
      view.dispatch({ effects: langConf.reconfigure(support) });
    } catch {
      /* grammatica non disponibile: resta testo semplice */
    }
  }

  // path relativo alla radice del repo (per git_diff); null se fuori dal workspace
  function relPath(): string | null {
    const root = workspace.rootPath;
    if (!root) return null;
    const rel = relTo(path, root);
    return rel && rel !== normSlash(path) ? rel : null;
  }

  async function loadGutter() {
    if (!view) return;
    const rel = relPath();
    if (!rel) {
      view.dispatch({ effects: setGitMarks.of([]) });
      hadMarks = false;
      return;
    }
    try {
      const patch = await invoke<string>("git_diff", { root: workspace.rootPath, path: rel, staged: false });
      const marks = parseGitMarks(patch);
      view?.dispatch({ effects: setGitMarks.of(marks) });
      hadMarks = marks.length > 0;
    } catch {
      view?.dispatch({ effects: setGitMarks.of([]) });
      hadMarks = false;
    }
  }
  // ---- menu contestuale dell'editor (Taglia/Copia/Incolla/Seleziona tutto/Vai al simbolo) ----
  let menu = $state<{ x: number; y: number } | null>(null);
  function openCtxMenu(e: MouseEvent) {
    e.preventDefault();
    menu = { x: e.clientX, y: e.clientY };
  }
  function selectedText(): string {
    if (!view) return "";
    const s = view.state.selection.main;
    return s.empty ? view.state.doc.lineAt(s.head).text : view.state.sliceDoc(s.from, s.to);
  }
  function doCopy() {
    const t = selectedText();
    if (t) void navigator.clipboard.writeText(t).catch(() => {});
  }
  function doCut() {
    if (!view || readonly) return;
    const s = view.state.selection.main;
    if (s.empty) {
      const line = view.state.doc.lineAt(s.head);
      void navigator.clipboard.writeText(line.text).catch(() => {});
      view.dispatch({ changes: { from: line.from, to: Math.min(line.to + 1, view.state.doc.length) } });
    } else {
      void navigator.clipboard.writeText(view.state.sliceDoc(s.from, s.to)).catch(() => {});
      view.dispatch(view.state.replaceSelection(""));
    }
    view.focus();
  }
  async function doPaste() {
    if (!view || readonly) return;
    const t = await navigator.clipboard.readText().catch(() => "");
    if (t) view.dispatch(view.state.replaceSelection(t));
    view.focus();
  }
  function doSelectAll() {
    if (!view) return;
    view.dispatch({ selection: { anchor: 0, head: view.state.doc.length } });
    view.focus();
  }
  function editorMenu(): MenuItem[] {
    const items: MenuItem[] = [];
    if (!readonly) items.push({ label: "Cut", icon: "scissors", onClick: doCut });
    items.push({ label: "Copy", icon: "copy", onClick: doCopy });
    if (!readonly) items.push({ label: "Paste", icon: "clipboard", onClick: () => void doPaste() });
    items.push({ label: "Select all", separatorBefore: true, onClick: doSelectAll });
    items.push({
      label: "Go to symbol…",
      icon: "search",
      separatorBefore: true,
      onClick: () => {
        if (view) setActiveEditor(view);
        openSymbols();
      },
    });
    return items;
  }
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="cm-host" bind:this={host} oncontextmenu={openCtxMenu}></div>
{#if menu}
  <ContextMenu x={menu.x} y={menu.y} items={editorMenu()} onClose={() => (menu = null)} />
{/if}

<style>
  .cm-host {
    height: 100%;
    min-height: 0;
    overflow: hidden;
  }
  :global(.cm-host > .cm-editor) {
    height: 100%;
  }
</style>
