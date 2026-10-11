<script lang="ts">
  import { onMount, untrack } from "svelte";
  import { EditorState, EditorSelection, Compartment } from "@codemirror/state";
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
  import { codeLens, setLenses } from "../editor/codeLens";
  import { caretExtension } from "../editor/caret";
  import { setActiveEditor, clearActiveEditor } from "../editor/activeEditor";
  import { settings, isLightTheme } from "../state/settings.svelte";
  import { git, gitRel } from "../state/git.svelte";
  import { notify } from "../state/toast.svelte";
  import { writeClipboard, readClipboard } from "../clipboard";
  import { workspace, recallView, rememberView } from "../state/workspace.svelte";
  import { invoke } from "@tauri-apps/api/core";
  import { basename, normSlash, relTo } from "../util";
  import ContextMenu, { type MenuItem } from "./ContextMenu.svelte";
  import { openSymbols } from "../state/symbols.svelte";
  import {
    goToDefinition,
    semIndex,
    codeIndex,
    lensesFor,
    openReferences,
    openImplementations,
  } from "../state/codeIndex.svelte";

  interface Props {
    doc: string;
    path: string;
    groupId?: string; // gruppo (riquadro) della scheda: la posizione nel file è per scheda (M66)
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
    groupId = "",
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
  const caretConf = new Compartment(); // stile del cursore (Impostazioni → Editor cursor, M63)

  onMount(() => {
    // dove eri in questo file (M66): cursore e prima riga in vista, nei limiti del testo attuale (il file
    // può essere cambiato su disco nel frattempo). Un salto (gotoLine) vince: lo applica l'effetto sotto.
    const saved = recallView(groupId, path);
    const clamp = (n: number) => Math.max(0, Math.min(n, doc.length));
    const state = EditorState.create({
      doc,
      selection: saved ? EditorSelection.single(clamp(saved.anchor), clamp(saved.head)) : undefined,
      extensions: [
        lineNumbers(),
        gitGutter(),
        semanticHighlight,
        codeLens(),
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
        caretConf.of(caretExtension({ ...settings.editorCaret })),
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
          if (u.docChanged || u.selectionSet) keepView();
        }),
      ],
    });
    view = new EditorView({ state, parent: host });
    if (saved && gotoLine == null) {
      lastTop = clamp(saved.top);
      view.dispatch({ effects: EditorView.scrollIntoView(lastTop, { y: "start", yMargin: 0 }) });
    }
    view.scrollDOM.addEventListener("scroll", onScroll, { passive: true });
    view.focus();
    setActiveEditor(view); // editor attivo (per "Vai al simbolo")
    view.dom.addEventListener("focusin", () => view && setActiveEditor(view));
    {
      const head = view.state.selection.main.head; // posizione iniziale (ripristinata) del cursore
      const line = view.state.doc.lineAt(head);
      onCursor?.(line.number, head - line.from + 1);
    }
    void loadLanguage();
    void loadGutter();
    return () => {
      // uno scroll ancora da registrare: si misura ora (se l'editor è ancora nella pagina)
      if (scrollTimer) {
        clearTimeout(scrollTimer);
        keepView(true);
      }
      view?.scrollDOM.removeEventListener("scroll", onScroll);
      if (view) clearActiveEditor(view);
      view?.destroy();
      view = undefined; // i path async (doPaste/doCut dopo l'await su clipboard) vedono view assente → no-op
    };
  });

  /** Ricorda cursore e prima riga in vista di questa scheda (M66). La riga in cima si misura solo dopo uno
   *  scroll (e solo con l'editor ancora nella pagina: smontato misurerebbe 0); il cursore a ogni cambio. */
  let lastTop = 0;
  function keepView(measure = false) {
    if (!view) return;
    if (measure && view.dom.isConnected) {
      const visibleTop = view.scrollDOM.getBoundingClientRect().top - view.documentTop;
      lastTop = view.lineBlockAtHeight(Math.max(0, visibleTop)).from;
    }
    const sel = view.state.selection.main;
    rememberView(groupId, path, { anchor: sel.anchor, head: sel.head, top: lastTop });
  }
  let scrollTimer: ReturnType<typeof setTimeout> | undefined;
  function onScroll() {
    if (scrollTimer) clearTimeout(scrollTimer);
    scrollTimer = setTimeout(() => {
      scrollTimer = undefined;
      keepView(true);
    }, 120);
  }

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
    settings.editorFontSize;
    settings.fontMono;
    view?.requestMeasure();
  });

  // cambio tema (Impostazioni): ricarica EditorView.theme + HighlightStyle (chiaro/scuro)
  $effect(() => {
    const light = isLightTheme();
    view?.dispatch({ effects: themeConf.reconfigure(editorTheme(light)) });
  });

  // stile del cursore (Impostazioni): una copia nuova a ogni cambio, così l'estensione se ne accorge
  $effect(() => {
    const conf = { ...settings.editorCaret };
    untrack(() => view?.dispatch({ effects: caretConf.reconfigure(caretExtension(conf)) }));
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

  // CodeLens (M60): "N references · M implementations" sopra le dichiarazioni del file, rifatte quando
  // cambiano l'indice o i conteggi (scansione dopo un salvataggio) o l'impostazione.
  $effect(() => {
    semIndex.version;
    codeIndex.refs;
    const on = settings.codeLens;
    const root = workspace.rootPath;
    if (!view) return;
    const rel = root ? relTo(path, root) : "";
    const data = on && rel && rel !== normSlash(path) ? untrack(() => lensesFor(rel)) : [];
    const lenses = data.map((l) => ({
      line: l.line,
      items: l.items.map((it) => ({
        label: it.label,
        title: it.title,
        onClick: () => (it.kind === "refs" ? void openReferences(it.name) : openImplementations(it.name)),
      })),
    }));
    untrack(() => view?.dispatch({ effects: setLenses.of(lenses) }));
  });

  // salto a una riga (ricerca, F12/Vai-alla-definizione, Vai-al-simbolo, indietro/avanti).
  // `y: "center"` invece del default "nearest": la riga target finisce CENTRATA verticalmente, non
  // incollata al bordo alto/basso (che era l'"altezza strana"). Così il salto è prevedibile.
  $effect(() => {
    const gl = gotoLine;
    if (!view || gl == null || gl <= 0) return;
    const ln = Math.min(gl, view.state.doc.lines);
    const info = view.state.doc.line(ln);
    view.dispatch({
      selection: { anchor: info.from },
      effects: EditorView.scrollIntoView(info.from, { y: "center" }),
    });
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

  // path relativo alla radice del REPO (per git_diff, M59: non alla cartella aperta, che può esserne una
  // sottocartella); null se fuori dal repo
  function relPath(): string | null {
    return gitRel(path) || null;
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
  async function doCopy() {
    const t = selectedText();
    if (t && !(await writeClipboard(t))) notify("Copy to clipboard failed", "error", 1500);
  }
  async function doCut() {
    if (!view || readonly) return;
    const text = selectedText(); // selezione corrente (riga intera se vuota)
    if (!text) return;
    // copia PRIMA di cancellare: se la clipboard fallisce non si perde il testo (niente taglio "a vuoto")
    if (!(await writeClipboard(text))) {
      notify("Cut: clipboard write failed", "error", 1500);
      return;
    }
    if (!view) return; // editor smontato durante l'await
    // RILEGGI lo stato DOPO l'await: il doc può essere cambiato (es. reload esterno) → niente posizioni stale
    const s = view.state.selection.main;
    if (s.empty) {
      const line = view.state.doc.lineAt(s.head);
      view.dispatch({ changes: { from: line.from, to: Math.min(line.to + 1, view.state.doc.length) } });
    } else {
      view.dispatch(view.state.replaceSelection(""));
    }
    view.focus();
  }
  async function doPaste() {
    if (!view || readonly) return;
    const t = await readClipboard();
    if (!view) return; // editor smontato durante l'await
    if (t) view.dispatch(view.state.replaceSelection(t));
    else if (t === null) notify("Paste: clipboard read failed", "error", 1500);
    view.focus();
  }
  function doSelectAll() {
    if (!view) return;
    view.dispatch({ selection: { anchor: 0, head: view.state.doc.length } });
    view.focus();
  }
  function editorMenu(): MenuItem[] {
    const items: MenuItem[] = [];
    if (!readonly) items.push({ label: "Cut", icon: "scissors", onClick: () => void doCut() });
    items.push({ label: "Copy", icon: "copy", onClick: () => void doCopy() });
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
