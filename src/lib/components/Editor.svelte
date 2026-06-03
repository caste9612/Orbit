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
    syntaxHighlighting,
    indentOnInput,
    bracketMatching,
    foldGutter,
    foldKeymap,
    indentUnit,
    LanguageDescription,
  } from "@codemirror/language";
  import { languages } from "@codemirror/language-data";
  import { lumeTheme, lumeHighlight } from "../editor/theme";
  import { indentGuides } from "../editor/indentGuides";
  import { gitGutter, setGitMarks, parseGitMarks } from "../editor/gitGutter";
  import { settings } from "../state/settings.svelte";
  import { git } from "../state/git.svelte";
  import { workspace } from "../state/workspace.svelte";
  import { invoke } from "@tauri-apps/api/core";
  import { basename, normSlash, relTo } from "../util";

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

  onMount(() => {
    const state = EditorState.create({
      doc,
      extensions: [
        lineNumbers(),
        gitGutter(),
        foldGutter(),
        highlightActiveLineGutter(),
        highlightSpecialChars(),
        history(),
        drawSelection(),
        indentOnInput(),
        bracketMatching(),
        highlightActiveLine(),
        highlightSelectionMatches(),
        search({ top: true }),
        indentGuides,
        indentUnit.of("  "),
        langConf.of([]),
        syntaxHighlighting(lumeHighlight),
        lumeTheme,
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
    onCursor?.(1, 1); // posizione iniziale del cursore
    void loadLanguage();
    void loadGutter();
    return () => view?.destroy();
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

  // ricarica i marcatori git quando lo stato git cambia (refresh / save / modifica esterna)
  $effect(() => {
    git.tick;
    if (view) void loadGutter();
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
    const desc = LanguageDescription.matchFilename(languages, basename(path));
    if (!desc || !view) return;
    try {
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
      return;
    }
    try {
      const patch = await invoke<string>("git_diff", { root: workspace.rootPath, path: rel, staged: false });
      view?.dispatch({ effects: setGitMarks.of(parseGitMarks(patch)) });
    } catch {
      view?.dispatch({ effects: setGitMarks.of([]) });
    }
  }
</script>

<div class="cm-host" bind:this={host}></div>

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
