import { useEffect, useRef } from "react";
import { basicSetup, EditorView } from "codemirror";
import { Annotation, Compartment, EditorState } from "@codemirror/state";
import { keymap } from "@codemirror/view";
import { indentWithTab } from "@codemirror/commands";
import { setDiagnostics } from "@codemirror/lint";
import { oneDark } from "@codemirror/theme-one-dark";
import { javascript } from "@codemirror/lang-javascript";
import { python } from "@codemirror/lang-python";
import { java } from "@codemirror/lang-java";
import { cpp } from "@codemirror/lang-cpp";
import { html } from "@codemirror/lang-html";
import { css } from "@codemirror/lang-css";
import { sql, SQLite } from "@codemirror/lang-sql";
import { CODE_MATRIX_MAX_CODE } from "../utils/codeMatrixWorkspace.js";

const languageSupport = { python, c: cpp, cpp, java, javascript, html, css, sql: () => sql({ dialect: SQLite }) };
const editorTheme = EditorView.theme({
  "&": { height: "100%", fontSize: "14px", background: "#10171e" },
  ".cm-scroller": { overflow: "auto", fontFamily: "'Cascadia Code', Consolas, monospace", lineHeight: "1.8" },
  ".cm-content": { padding: "18px 0" },
  ".cm-line": { padding: "0 18px 0 8px" },
  ".cm-gutters": { background: "#10171e", border: "none", color: "#617589", paddingRight: "8px" },
  ".cm-activeLine, .cm-activeLineGutter": { background: "#192630" },
  "&.cm-focused": { outline: "none" },
  ".cm-selectionBackground": { background: "#284850 !important" },
});
const lightTheme = EditorView.theme({
  "&": { color: "#152033", background: "#ffffff", colorScheme: "light" },
  ".cm-content": { caretColor: "#152033" },
  ".cm-cursor, .cm-dropCursor": { borderLeftColor: "#152033" },
  ".cm-gutters": { background: "#f8fafc", color: "#64748b" },
  ".cm-activeLine, .cm-activeLineGutter": { background: "#edf3f8" },
  ".cm-selectionBackground, &.cm-focused .cm-selectionBackground": { background: "#cce5ef !important" },
  ".cm-selectionMatch": { background: "#e1f0ea" },
  "&.cm-focused .cm-matchingBracket": { background: "#d4e9e4", outline: "1px solid #8bb9ad" },
}, { dark: false });

export default function CodeMatrixEditor({ value, language, onChange, onRun, onLimit, diagnostics = [], activeLine = 0, lineRequest = null }) {
  const hostRef = useRef(null);
  const viewRef = useRef(null);
  const languageRef = useRef(new Compartment());
  const changeRef = useRef(onChange);
  const runRef = useRef(onRun);
  const limitRef = useRef(onLimit);
  useEffect(() => { changeRef.current = onChange; runRef.current = onRun; limitRef.current = onLimit; }, [onChange, onRun, onLimit]);

  useEffect(() => {
    const appearance = new Compartment();
    let dark = document.body.classList.contains("dark");
    const view = new EditorView({
      parent: hostRef.current,
      state: EditorState.create({
        extensions: [
          basicSetup, appearance.of([dark ? oneDark : lightTheme, editorTheme]),
          languageRef.current.of([]),
          EditorState.changeFilter.of((transaction) => {
            if (!transaction.docChanged || transaction.annotation(externalUpdate)) return true;
            if (new TextEncoder().encode(transaction.newDoc.toString()).length <= CODE_MATRIX_MAX_CODE) return true;
            queueMicrotask(() => limitRef.current?.());
            return false;
          }),
          EditorView.contentAttributes.of({ "aria-label": "Code editor", "aria-describedby": "code-matrix-editor-help", spellcheck: "false" }),
          keymap.of([{ key: "Mod-Enter", run: () => { runRef.current?.(); return true; } }, indentWithTab]),
          EditorView.updateListener.of((update) => {
            if (update.docChanged && !update.transactions.some((transaction) => transaction.annotation(externalUpdate))) {
              changeRef.current?.(update.state.doc.toString());
            }
          }),
        ],
      }),
    });
    viewRef.current = view;
    // Follow the effective app theme without recreating the editor or its undo history.
    const observer = new MutationObserver(() => {
      const nextDark = document.body.classList.contains("dark");
      if (nextDark === dark) return;
      dark = nextDark;
      view.dispatch({ effects: appearance.reconfigure([dark ? oneDark : lightTheme, editorTheme]) });
    });
    observer.observe(document.body, { attributes: true, attributeFilter: ["class"] });
    return () => { observer.disconnect(); viewRef.current = null; view.destroy(); };
  }, []);

  useEffect(() => {
    const view = viewRef.current;
    if (!view || view.state.doc.toString() === value) return;
    view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: value }, annotations: externalUpdate.of(true) });
  }, [value]);
  useEffect(() => {
    viewRef.current?.dispatch({ effects: languageRef.current.reconfigure((languageSupport[language] || javascript)()) });
  }, [language]);
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    const markers = diagnostics.filter(({ line }) => line > 0 && line <= view.state.doc.lines).map((diagnostic) => {
      const line = view.state.doc.line(diagnostic.line);
      return { from: line.from, to: line.to, severity: "error", message: diagnostic.message };
    });
    view.dispatch(setDiagnostics(view.state, markers));
  }, [diagnostics, value]);
  useEffect(() => {
    const view = viewRef.current;
    if (!view || !activeLine || activeLine > view.state.doc.lines) return;
    const line = view.state.doc.line(activeLine);
    view.dispatch({ selection: { anchor: line.from, head: line.to }, effects: EditorView.scrollIntoView(line.from, { y: "center" }) });
  }, [activeLine]);

  useEffect(() => {
    const view = viewRef.current;
    if (!view || !lineRequest || lineRequest.language !== language
      || lineRequest.line < 1 || lineRequest.line > view.state.doc.lines) return;
    const line = view.state.doc.line(lineRequest.line);
    view.dispatch({ selection: { anchor: line.from, head: line.to }, effects: EditorView.scrollIntoView(line.from, { y: "center" }) });
    view.focus();
  }, [lineRequest, language]);

  return <div className="cmx-editor" ref={hostRef} />;
}

const externalUpdate = Annotation.define();
