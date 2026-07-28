/**
 * Editor Mermaid com CodeMirror 6 (highlight + lint).
 */

import { basicSetup, EditorView } from "codemirror";
import { EditorState } from "@codemirror/state";
import { keymap } from "@codemirror/view";
import { indentWithTab } from "@codemirror/commands";
import {
  StreamLanguage,
  HighlightStyle,
  syntaxHighlighting,
  indentUnit,
} from "@codemirror/language";
import { tags as t } from "@lezer/highlight";
import { linter, lintGutter } from "@codemirror/lint";

const KEYWORDS = new Set([
  "graph",
  "flowchart",
  "sequenceDiagram",
  "classDiagram",
  "stateDiagram",
  "stateDiagram-v2",
  "erDiagram",
  "journey",
  "gantt",
  "pie",
  "mindmap",
  "timeline",
  "quadrantChart",
  "gitGraph",
  "C4Context",
  "C4Container",
  "C4Component",
  "C4Dynamic",
  "C4Deployment",
  "subgraph",
  "end",
  "participant",
  "actor",
  "loop",
  "alt",
  "else",
  "opt",
  "par",
  "and",
  "rect",
  "critical",
  "break",
  "activate",
  "deactivate",
  "Note",
  "note",
  "over",
  "TB",
  "TD",
  "BT",
  "RL",
  "LR",
  "direction",
  "classDef",
  "class",
  "click",
  "style",
  "linkStyle",
  "title",
  "section",
  "dateFormat",
  "axisFormat",
]);

/** Highlight leve para sintaxe Mermaid (keywords, comentários, setas, strings). */
const mermaidLanguage = StreamLanguage.define({
  name: "mermaid",
  startState() {
    return {};
  },
  token(stream) {
    if (stream.match("%%")) {
      stream.skipToEnd();
      return "comment";
    }

    if (stream.match(/"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*"/u)) {
      return "string";
    }

    if (stream.match(/[{[}\]]/u)) {
      return "bracket";
    }

    if (stream.match(/-->|---|-\.-|==>|==|o--|x--|->>|-->>|-\)|-x|~|:::/u)) {
      return "operator";
    }

    if (stream.match(/\|[^|\n]*\|/u)) {
      return "string";
    }

    if (stream.match(/[A-Za-z_«»][\w\-«»]*/u)) {
      const word = stream.current();
      if (KEYWORDS.has(word)) return "keyword";
      return "variableName";
    }

    if (stream.match(/[#:;,&]/u)) {
      return "punctuation";
    }

    stream.next();
    return null;
  },
  languageData: {
    commentTokens: { line: "%%" },
  },
});

const mermaidHighlight = HighlightStyle.define([
  { tag: t.keyword, color: "#0b6e4f", fontWeight: "600" },
  { tag: t.comment, color: "#5c6b7a", fontStyle: "italic" },
  { tag: t.string, color: "#9a5b00" },
  { tag: t.operator, color: "#1a4a7a" },
  { tag: t.bracket, color: "#5c6b7a" },
  { tag: t.variableName, color: "#1a2332" },
  { tag: t.punctuation, color: "#5c6b7a" },
]);

const editorTheme = EditorView.theme({
  "&": {
    height: "100%",
    fontSize: "0.85rem",
    backgroundColor: "transparent",
  },
  ".cm-scroller": {
    fontFamily: '"IBM Plex Mono", ui-monospace, monospace',
    lineHeight: "1.5",
    overflow: "auto",
  },
  ".cm-content": {
    padding: "1rem 0",
    caretColor: "#1a2332",
  },
  ".cm-gutters": {
    backgroundColor: "rgba(255,255,255,0.55)",
    borderRight: "1px solid #c5ced8",
    color: "#5c6b7a",
  },
  ".cm-activeLineGutter": {
    backgroundColor: "rgba(11, 110, 79, 0.08)",
  },
  ".cm-activeLine": {
    backgroundColor: "rgba(11, 110, 79, 0.04)",
  },
  "&.cm-focused .cm-selectionBackground, .cm-selectionBackground": {
    backgroundColor: "rgba(11, 110, 79, 0.18)",
  },
  ".cm-cursor, .cm-dropCursor": {
    borderLeftColor: "#0b6e4f",
  },
  ".cm-lintRange-error": {
    backgroundImage: "none",
    backgroundColor: "rgba(163, 32, 32, 0.08)",
  },
});

/**
 * @param {object} options
 * @param {HTMLElement} options.parent
 * @param {string} [options.doc]
 * @param {(value: string) => void} [options.onChange]
 * @param {(code: string) => Promise<{ ok: boolean, error?: string }>} [options.parse]
 */
export function createMermaidEditor({ parent, doc = "", onChange, parse }) {
  let suppressChange = false;

  const lintExtension = linter(
    async (view) => {
      const code = view.state.doc.toString();
      if (!code.trim() || typeof parse !== "function") return [];
      try {
        const result = await parse(code);
        if (result?.ok) return [];
        return [
          {
            from: 0,
            to: code.length,
            severity: "error",
            message: result?.error || "Diagrama Mermaid inválido.",
          },
        ];
      } catch (error) {
        return [
          {
            from: 0,
            to: code.length,
            severity: "error",
            message: error?.message || String(error),
          },
        ];
      }
    },
    { delay: 700 },
  );

  const view = new EditorView({
    parent,
    state: EditorState.create({
      doc,
      extensions: [
        basicSetup,
        keymap.of([indentWithTab]),
        indentUnit.of("    "),
        mermaidLanguage,
        syntaxHighlighting(mermaidHighlight),
        editorTheme,
        EditorView.lineWrapping,
        lintGutter(),
        lintExtension,
        EditorView.updateListener.of((update) => {
          if (!update.docChanged || suppressChange) return;
          onChange?.(update.state.doc.toString());
        }),
      ],
    }),
  });

  return {
    getValue() {
      return view.state.doc.toString();
    },
    setValue(value) {
      const next = value ?? "";
      if (next === view.state.doc.toString()) return;
      suppressChange = true;
      try {
        view.dispatch({
          changes: { from: 0, to: view.state.doc.length, insert: next },
        });
      } finally {
        suppressChange = false;
      }
    },
    focus() {
      view.focus();
    },
    destroy() {
      view.destroy();
    },
  };
}
