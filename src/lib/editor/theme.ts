// Tema dell'editor (coerente con i token della shell) + highlight della sintassi.
// Scritto a mano invece di importare un theme-package: più leggero e coerente.
// Selezione / riga attiva / bracket sono guidati da variabili --cm-* (impostate per tema da
// settings.svelte.ts), così l'editor si adatta a tutti i temi — incluso Orbit Light, per cui
// esiste anche una HighlightStyle chiara (la palette VS Dark+ non regge sul bianco).
import { EditorView } from "@codemirror/view";
import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import type { Extension } from "@codemirror/state";
import { tags as t } from "@lezer/highlight";

// Spec condivisa fra tema scuro e chiaro: i colori vengono da var() (token della shell + --cm-*),
// quindi l'unica differenza fra le due istanze è il flag `dark`.
const THEME_SPEC = {
  "&": {
    color: "var(--color-ink)",
    backgroundColor: "transparent",
    height: "100%",
    fontSize: "var(--editor-font-size, 13px)",
  },
  ".cm-content": {
    fontFamily: "var(--font-mono)",
    padding: "8px 0",
    caretColor: "var(--color-accent)",
  },
  ".cm-scroller": {
    fontFamily: "var(--font-mono)",
    lineHeight: "1.55",
  },
  "&.cm-focused": { outline: "none" },
  // cursore "fluido": anima lo spostamento del caret mentre si scrive/cancella
  ".cm-cursor, .cm-dropCursor": {
    borderLeftColor: "var(--color-accent)",
    transition: "var(--caret-transition, left 55ms ease-out, top 55ms ease-out)",
  },
  "&.cm-focused .cm-selectionBackground, .cm-selectionBackground": {
    backgroundColor: "var(--cm-selection)",
  },
  ".cm-selectionMatch": { backgroundColor: "var(--cm-selection-match)" },
  ".cm-gutters": {
    backgroundColor: "transparent",
    color: "var(--color-ink-subtle)",
    border: "none",
  },
  ".cm-activeLineGutter": {
    backgroundColor: "transparent",
    color: "var(--color-ink-muted)",
  },
  ".cm-activeLine": { backgroundColor: "var(--cm-active-line)" },
  ".cm-lineNumbers .cm-gutterElement": {
    padding: "0 8px 0 16px",
    minWidth: "34px",
  },
  ".cm-foldGutter .cm-gutterElement": { color: "var(--color-ink-subtle)" },
  // marcatori di modifica git nel gutter (stile Visual Studio)
  ".cm-gitgutter": { width: "3px" },
  ".cm-gitgutter .cm-gutterElement": { display: "flex" },
  ".cm-gitmark": { width: "3px", borderRadius: "1px" },
  ".cm-gitmark-add": { alignSelf: "stretch", background: "#3fb950" },
  ".cm-gitmark-mod": { alignSelf: "stretch", background: "#3b9dff" },
  ".cm-gitmark-del": {
    alignSelf: "flex-start",
    height: "5px",
    background: "#f14c4c",
    borderRadius: "0 0 2px 2px",
  },
  ".cm-matchingBracket, &.cm-focused .cm-matchingBracket": {
    backgroundColor: "var(--cm-bracket-bg)",
    outline: "1px solid var(--cm-bracket-outline)",
  },
  ".cm-tooltip": {
    backgroundColor: "var(--color-surface-3)",
    border: "1px solid var(--color-line-strong)",
    color: "var(--color-ink)",
  },
  // pannello find/replace (@codemirror/search), coerente col tema
  ".cm-panels": {
    backgroundColor: "var(--color-surface-2)",
    color: "var(--color-ink)",
  },
  ".cm-panels.cm-panels-top": { borderBottom: "1px solid var(--color-line)" },
  ".cm-panel.cm-search": { padding: "6px 8px", fontFamily: "var(--font-sans)" },
  ".cm-panel.cm-search label": { fontSize: "11px", color: "var(--color-ink-muted)" },
  ".cm-textfield": {
    backgroundColor: "var(--color-surface-1)",
    border: "1px solid var(--color-line-strong)",
    borderRadius: "4px",
    color: "var(--color-ink)",
    padding: "3px 6px",
    fontFamily: "var(--font-sans)",
  },
  ".cm-textfield:focus": { outline: "none", borderColor: "var(--color-accent)" },
  ".cm-button": {
    backgroundColor: "var(--color-surface-3)",
    backgroundImage: "none",
    border: "1px solid var(--color-line-strong)",
    borderRadius: "4px",
    color: "var(--color-ink)",
    padding: "3px 8px",
    cursor: "pointer",
  },
  ".cm-button:hover": { backgroundColor: "var(--color-surface-4)" },
  ".cm-search button[name='close']": {
    color: "var(--color-ink-muted)",
    fontSize: "16px",
    cursor: "pointer",
  },
  ".cm-search button[name='close']:hover": { color: "var(--color-ink)" },
};

export const orbitThemeDark = EditorView.theme(THEME_SPEC, { dark: true });
export const orbitThemeLight = EditorView.theme(THEME_SPEC, { dark: false });

// Palette ispirata a VS Code Dark+, ben leggibile su fondo scuro.
export const orbitHighlight = HighlightStyle.define([
  { tag: [t.comment, t.lineComment, t.blockComment], color: "#6b7480", fontStyle: "italic" },
  { tag: t.keyword, color: "#569cd6" },
  { tag: [t.controlKeyword, t.moduleKeyword], color: "#c586c0" },
  { tag: [t.string, t.special(t.string)], color: "#ce9178" },
  { tag: t.number, color: "#b5cea8" },
  { tag: [t.bool, t.null, t.atom], color: "#569cd6" },
  { tag: t.variableName, color: "#9cdcfe" },
  { tag: t.definition(t.variableName), color: "#9cdcfe" },
  { tag: [t.function(t.variableName), t.function(t.definition(t.variableName))], color: "#dcdcaa" },
  { tag: t.propertyName, color: "#9cdcfe" },
  { tag: t.function(t.propertyName), color: "#dcdcaa" },
  { tag: [t.typeName, t.namespace], color: "#4ec9b0" },
  { tag: t.className, color: "#4ec9b0" },
  { tag: t.tagName, color: "#569cd6" },
  { tag: t.attributeName, color: "#9cdcfe" },
  { tag: [t.operator, t.operatorKeyword], color: "#d4d4d4" },
  { tag: t.regexp, color: "#d16969" },
  { tag: t.escape, color: "#d7ba7d" },
  { tag: [t.meta, t.documentMeta], color: "#9aa4b2" },
  { tag: t.heading, color: "#569cd6", fontWeight: "700" },
  { tag: [t.link, t.url], color: "#6ea8fe", textDecoration: "underline" },
  { tag: t.strong, fontWeight: "700" },
  { tag: t.emphasis, fontStyle: "italic" },
  { tag: t.strikethrough, textDecoration: "line-through" },
  { tag: [t.processingInstruction, t.inserted], color: "#5bc88a" },
  { tag: t.invalid, color: "#f0626f" },
]);

// Palette ispirata a VS Code Light+, per il tema Orbit Light (leggibile su bianco).
export const orbitHighlightLight = HighlightStyle.define([
  { tag: [t.comment, t.lineComment, t.blockComment], color: "#008000", fontStyle: "italic" },
  { tag: t.keyword, color: "#0000ff" },
  { tag: [t.controlKeyword, t.moduleKeyword], color: "#af00db" },
  { tag: [t.string, t.special(t.string)], color: "#a31515" },
  { tag: t.number, color: "#098658" },
  { tag: [t.bool, t.null, t.atom], color: "#0000ff" },
  { tag: t.variableName, color: "#001080" },
  { tag: t.definition(t.variableName), color: "#001080" },
  { tag: [t.function(t.variableName), t.function(t.definition(t.variableName))], color: "#795e26" },
  { tag: t.propertyName, color: "#001080" },
  { tag: t.function(t.propertyName), color: "#795e26" },
  { tag: [t.typeName, t.namespace], color: "#267f99" },
  { tag: t.className, color: "#267f99" },
  { tag: t.tagName, color: "#800000" },
  { tag: t.attributeName, color: "#e50000" },
  { tag: [t.operator, t.operatorKeyword], color: "#000000" },
  { tag: t.regexp, color: "#811f3f" },
  { tag: t.escape, color: "#ee0000" },
  { tag: [t.meta, t.documentMeta], color: "#545454" },
  { tag: t.heading, color: "#800000", fontWeight: "700" },
  { tag: [t.link, t.url], color: "#0000ee", textDecoration: "underline" },
  { tag: t.strong, fontWeight: "700" },
  { tag: t.emphasis, fontStyle: "italic" },
  { tag: t.strikethrough, textDecoration: "line-through" },
  { tag: [t.processingInstruction, t.inserted], color: "#098658" },
  { tag: t.invalid, color: "#cd3131" },
]);

// Colori dell'overlay semantico (vedi editor/semanticHighlight.ts): tipi in teal, funzioni/metodi
// in oro, come VS Code. `!important` perché devono prevalere sul colore lessicale dell'highlighter
// (es. in C# un nome di classe sarebbe altrimenti un identificatore azzurro generico).
function semanticTheme(light: boolean) {
  return EditorView.theme({
    ".cm-sem-type": { color: `${light ? "#267f99" : "#4ec9b0"} !important` },
    ".cm-sem-func": { color: `${light ? "#795e26" : "#dcdcaa"} !important` },
  });
}

/** Estensioni di tema (EditorView.theme + HighlightStyle) per la modalità chiaro/scuro attiva. */
export function editorTheme(light: boolean): Extension {
  return light
    ? [orbitThemeLight, syntaxHighlighting(orbitHighlightLight), semanticTheme(true)]
    : [orbitThemeDark, syntaxHighlighting(orbitHighlight), semanticTheme(false)];
}
