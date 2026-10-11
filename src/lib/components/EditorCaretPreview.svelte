<script lang="ts">
  // Impostazioni → Editor → Cursor (M64): un piccolo editor vero, con lo stesso tema e lo stesso
  // cursore dell'editor, per provare lo stile scelto senza chiudere la finestra (clic, frecce, testo).
  // Caricato a richiesta: CodeMirror arriva solo quando la categoria si apre.
  import { onMount, onDestroy, untrack } from "svelte";
  import { EditorState, Compartment } from "@codemirror/state";
  import {
    EditorView,
    keymap,
    lineNumbers,
    highlightActiveLine,
    highlightActiveLineGutter,
    drawSelection,
  } from "@codemirror/view";
  import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
  import { LanguageDescription } from "@codemirror/language";
  import { languages } from "@codemirror/language-data";
  import { editorTheme } from "../editor/theme";
  import { caretExtension } from "../editor/caret";
  import { settings, isLightTheme } from "../state/settings.svelte";

  const SAMPLE = [
    "// Click, use the arrow keys or type to try the cursor",
    "function orbit(radius: number, mass = 5.97e24) {",
    "  const speed = Math.sqrt((G * mass) / radius);",
    "  return { radius, speed, period: (2 * Math.PI * radius) / speed };",
    "}",
  ].join("\n");

  let host: HTMLDivElement;
  let view: EditorView | undefined;
  const langConf = new Compartment();
  const themeConf = new Compartment();
  const caretConf = new Compartment();

  onMount(() => {
    view = new EditorView({
      parent: host,
      state: EditorState.create({
        doc: SAMPLE,
        selection: { anchor: SAMPLE.indexOf("(radius") }, // dentro la firma: frecce e Home/End fanno subito strada
        extensions: [
          lineNumbers(),
          highlightActiveLineGutter(),
          history(),
          drawSelection(),
          EditorView.lineWrapping,
          highlightActiveLine(),
          langConf.of([]),
          themeConf.of(editorTheme(isLightTheme())),
          caretConf.of(caretExtension({ ...settings.editorCaret })),
          keymap.of([...defaultKeymap, ...historyKeymap]),
        ],
      }),
    });
    void LanguageDescription.matchFilename(languages, "orbit.ts")
      ?.load()
      .then((lang) => view?.dispatch({ effects: langConf.reconfigure(lang) }));
  });

  // tema e stile del cursore cambiati nelle Impostazioni: l'anteprima li segue subito
  $effect(() => {
    const light = isLightTheme();
    untrack(() => view?.dispatch({ effects: themeConf.reconfigure(editorTheme(light)) }));
  });
  $effect(() => {
    const conf = { ...settings.editorCaret };
    untrack(() => view?.dispatch({ effects: caretConf.reconfigure(caretExtension(conf)) }));
  });

  onDestroy(() => view?.destroy());
</script>

<div class="prev" bind:this={host}></div>

<style>
  .prev {
    background: var(--color-surface-1);
    border: 1px solid var(--color-line-strong);
    border-radius: var(--r-md);
    overflow: hidden;
    cursor: text;
  }
  .prev :global(.cm-content) {
    padding: 6px 0;
  }
</style>
