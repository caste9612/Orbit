<script lang="ts">
  import { onMount } from "svelte";
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
  import { basename } from "../util";

  interface Props {
    doc: string;
    path: string;
    readonly?: boolean;
    onChange: (doc: string) => void;
    onSave: () => void;
  }
  let { doc, path, readonly = false, onChange, onSave }: Props = $props();

  let host: HTMLDivElement;
  let view: EditorView | undefined;
  const langConf = new Compartment();

  onMount(() => {
    const state = EditorState.create({
      doc,
      extensions: [
        lineNumbers(),
        foldGutter(),
        highlightActiveLineGutter(),
        highlightSpecialChars(),
        history(),
        drawSelection(),
        indentOnInput(),
        bracketMatching(),
        highlightActiveLine(),
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
          ...defaultKeymap,
          ...historyKeymap,
          ...foldKeymap,
        ]),
        EditorView.updateListener.of((u) => {
          if (u.docChanged) onChange(u.state.doc.toString());
        }),
      ],
    });
    view = new EditorView({ state, parent: host });
    view.focus();
    void loadLanguage();
    return () => view?.destroy();
  });

  // Carica la grammatica giusta in base al nome file (lazy, code-split da Vite).
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
