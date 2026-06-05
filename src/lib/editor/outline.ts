// Estrae i "simboli" (definizioni nominate) di un file dall'albero sintattico di CodeMirror
// (lezer), senza LSP. Copre le definizioni nominate dei linguaggi principali; le funzioni
// anonime / arrow assegnate a const non sono incluse (scelta v1, per non fare rumore).
import { ensureSyntaxTree, syntaxTree } from "@codemirror/language";
import type { EditorState } from "@codemirror/state";

export interface OutlineSymbol {
  name: string;
  kind: string; // function | method | class | interface | type | enum | struct | impl | module | property
  from: number; // offset nel documento
  line: number; // 1-based
  depth: number; // annidamento (es. metodi dentro classi)
}

// tipo di nodo lezer → "kind" (JS/TS, Python, Java, C#, Rust, Go, C/C++, PHP, Ruby…)
const DEF: Record<string, string> = {
  FunctionDeclaration: "function",
  FunctionDefinition: "function",
  FunctionItem: "function",
  FunctionDecl: "function",
  MethodDeclaration: "method",
  MethodDefinition: "method",
  MethodDecl: "method",
  ConstructorDeclaration: "method",
  ClassDeclaration: "class",
  ClassDefinition: "class",
  ClassSpecifier: "class",
  InterfaceDeclaration: "interface",
  TraitItem: "interface",
  TypeAliasDeclaration: "type",
  TypeSpec: "type",
  EnumDeclaration: "enum",
  EnumItem: "enum",
  StructItem: "struct",
  StructSpecifier: "struct",
  ImplItem: "impl",
  ModItem: "module",
  NamespaceDeclaration: "module",
  FieldDeclaration: "property",
  PropertyDeclaration: "property",
};

const NAME_TYPES = new Set([
  "VariableDefinition", "Definition", "VariableName", "PropertyDefinition", "PropertyName",
  "TypeName", "TypeDefinition", "TypeIdentifier", "Identifier", "FieldIdentifier", "Name", "DefName",
]);

function nameOf(state: EditorState, node: any): string | null {
  let c = node.firstChild;
  while (c) {
    if (NAME_TYPES.has(c.type.name)) {
      const s = state.doc.sliceString(c.from, c.to).trim();
      if (s) return s;
    }
    c = c.nextSibling;
  }
  return null;
}

/** Estrae i simboli (definizioni nominate) del documento. */
export function extractSymbols(state: EditorState): OutlineSymbol[] {
  const out: OutlineSymbol[] = [];
  // prova a completare il parse fino in fondo entro un budget di tempo, altrimenti usa il parziale
  const tree = ensureSyntaxTree(state, state.doc.length, 150) ?? syntaxTree(state);
  let depth = 0;
  tree.iterate({
    enter: (ref) => {
      const kind = DEF[ref.name];
      if (!kind) return;
      const name = nameOf(state, ref.node);
      if (name) {
        out.push({ name, kind, from: ref.from, line: state.doc.lineAt(ref.from).number, depth });
      }
      depth++;
    },
    leave: (ref) => {
      if (DEF[ref.name]) depth--;
    },
  });
  return out;
}
