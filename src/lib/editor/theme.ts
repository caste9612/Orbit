// Tema dark dell'editor (coerente con i token della shell) + highlight della sintassi.
// Scritto a mano invece di importare un theme-package: più leggero e coerente.
import { EditorView } from "@codemirror/view";
import { HighlightStyle } from "@codemirror/language";
import { tags as t } from "@lezer/highlight";

export const lumeTheme = EditorView.theme(
  {
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
      backgroundColor: "#2a4163",
    },
    ".cm-selectionMatch": { backgroundColor: "#21344f" },
    ".cm-gutters": {
      backgroundColor: "transparent",
      color: "var(--color-ink-subtle)",
      border: "none",
    },
    ".cm-activeLineGutter": {
      backgroundColor: "transparent",
      color: "var(--color-ink-muted)",
    },
    ".cm-activeLine": { backgroundColor: "rgba(255, 255, 255, 0.03)" },
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
      backgroundColor: "rgba(110, 168, 254, 0.18)",
      outline: "1px solid rgba(110, 168, 254, 0.4)",
    },
    ".cm-tooltip": {
      backgroundColor: "var(--color-surface-3)",
      border: "1px solid var(--color-line-strong)",
      color: "var(--color-ink)",
    },
    // pannello find/replace (@codemirror/search), coerente col tema scuro
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
  },
  { dark: true },
);

// Palette ispirata a VS Code Dark+, ben leggibile.
export const lumeHighlight = HighlightStyle.define([
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
