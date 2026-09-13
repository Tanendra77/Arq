import { useEffect, useRef, useState } from "react";
import { basicSetup } from "codemirror";
import { json, jsonParseLinter } from "@codemirror/lang-json";
import { setDiagnostics, type Diagnostic } from "@codemirror/lint";
import { HighlightStyle, ensureSyntaxTree, syntaxHighlighting, syntaxTree } from "@codemirror/language";
import { Annotation, EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { tags } from "@lezer/highlight";
import type { SyntaxNode } from "@lezer/common";
import { serializeDocument, type Document, type ParseIssue } from "@arq/schema";
import { useEditor, useEditorStore } from "../store/context";
import { reportCommandError } from "../commands/file-commands";
import { requestFitView } from "../flow/fit-request";
import { aiInstructions } from "./ai-instructions";
import { applyJson, autoLayout } from "./auto-layout";

/** How long typing pauses before the text is applied to the diagram. */
const APPLY_DELAY_MS = 400;

/** Marks an edit that came from the document, not the keyboard, so it is never applied back. */
const fromDocument = Annotation.define<boolean>();

const PUNCTUATION = new Set(["{", "}", "[", "]", ",", ":"]);

/**
 * The span of text a document path points at, for putting an error on the right line.
 *
 * Walks the JSON syntax tree down the path as far as it exists — a missing key is reported on the
 * object that should have had it — and narrows the result to its first line, so a problem with a
 * thirty-line object underlines where it starts rather than all thirty lines.
 */
export function pathRange(state: EditorState, path: readonly (string | number)[]): { from: number; to: number } {
  const tree = ensureSyntaxTree(state, state.doc.length, 500) ?? syntaxTree(state);
  let node: SyntaxNode | null = tree.topNode.firstChild;
  let best: SyntaxNode | null = node;
  for (const seg of path) {
    if (node === null) break;
    let next: SyntaxNode | null = null;
    if (node.name === "Object" && typeof seg === "string") {
      for (let p = node.firstChild; p; p = p.nextSibling) {
        const name = p.name === "Property" ? p.getChild("PropertyName") : null;
        if (!name) continue;
        let key: unknown;
        try {
          key = JSON.parse(state.sliceDoc(name.from, name.to));
        } catch {
          continue;
        }
        if (key !== seg) continue;
        // A property's value is its last child, after the name and the colon; a property with no
        // value yet points at its name.
        next = p.lastChild && p.lastChild !== name && p.lastChild.name !== ":" ? p.lastChild : name;
        break;
      }
    } else if (node.name === "Array" && typeof seg === "number") {
      let i = 0;
      for (let c = node.firstChild; c; c = c.nextSibling) {
        if (PUNCTUATION.has(c.name)) continue;
        if (i === seg) { next = c; break; }
        i += 1;
      }
    }
    if (next === null) break;
    node = next;
    best = next;
  }
  if (best === null) return { from: 0, to: Math.min(state.doc.length, 1) };
  const line = state.doc.lineAt(best.from);
  return { from: best.from, to: Math.max(best.from + 1, Math.min(best.to, line.to)) };
}

/** `["nodes", 2, "shape"]` as `nodes[2].shape`, the way the file-open errors read. */
function formatPath(path: readonly (string | number)[]): string {
  const out = path.map((seg, i) => (typeof seg === "number" ? `[${seg}]` : i === 0 ? seg : `.${seg}`)).join("");
  return out || "document";
}

/** Colours come from CSS variables, so the highlighting follows the light and dark themes. */
const highlight = HighlightStyle.define([
  { tag: tags.propertyName, color: "var(--arq-json-key)" },
  { tag: tags.string, color: "var(--arq-json-string)" },
  { tag: tags.number, color: "var(--arq-json-number)" },
  { tag: [tags.bool, tags.null], color: "var(--arq-json-keyword)" },
  { tag: tags.punctuation, color: "var(--arq-json-punct)" },
]);

const theme = EditorView.theme({
  "&": { height: "100%", fontSize: "12px", color: "var(--arq-fg)", backgroundColor: "var(--arq-bg)" },
  ".cm-scroller": { fontFamily: "ui-monospace, 'Cascadia Code', Consolas, monospace" },
  ".cm-gutters": { backgroundColor: "var(--arq-bg)", color: "color-mix(in srgb, var(--arq-fg) 40%, transparent)", borderRight: "1px solid var(--arq-line)" },
  ".cm-activeLine, .cm-activeLineGutter": { backgroundColor: "color-mix(in srgb, var(--arq-fg) 5%, transparent)" },
  ".cm-cursor": { borderLeftColor: "var(--arq-fg)" },
  "&.cm-focused .cm-selectionBackground, .cm-selectionBackground, ::selection": { backgroundColor: "color-mix(in srgb, var(--arq-accent) 30%, transparent) !important" },
  ".cm-tooltip": { backgroundColor: "var(--arq-bg)", border: "1px solid var(--arq-line)", color: "var(--arq-fg)" },
});

type Status = { kind: "ok" } | { kind: "pending" } | { kind: "error"; problems: { message: string; from: number }[] };

/**
 * The diagram as JSON, editable in place. The two stay in step both ways: typing is applied to the
 * diagram as soon as it parses, and any change made elsewhere — the canvas, undo, opening a file —
 * rewrites the text.
 */
export default function JsonPanel() {
  const store = useEditorStore();
  const doc = useEditor((s) => s.document);
  const host = useRef<HTMLDivElement>(null);
  const view = useRef<EditorView | null>(null);
  /** The document this panel's own last apply produced; any other document came from elsewhere. */
  const applied = useRef<Document | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>();
  const seq = useRef(0);
  /** Whether the text on screen is exactly what the diagram shows — false while typing or broken. */
  const inSync = useRef(true);
  const [status, setStatus] = useState<Status>({ kind: "ok" });
  const [copied, setCopied] = useState(false);

  /** Replace the editor's text with the document's, keeping the cursor about where it was. */
  const showDocument = (d: Document) => {
    const v = view.current;
    if (!v) return;
    const text = serializeDocument(d);
    if (v.state.doc.toString() === text) return;
    const head = Math.min(v.state.selection.main.head, text.length);
    v.dispatch({
      changes: { from: 0, to: v.state.doc.length, insert: text },
      selection: { anchor: head },
      annotations: fromDocument.of(true),
    });
    v.dispatch(setDiagnostics(v.state, []));
    inSync.current = true;
    setStatus({ kind: "ok" });
  };

  const apply = async () => {
    const v = view.current;
    if (!v) return;
    const mine = ++seq.current;
    const before = store.getState().document;
    const result = await applyJson(v.state.doc.toString(), before);
    // A newer edit — applied or still waiting to be — has overtaken this one.
    if (mine !== seq.current || view.current !== v || timer.current !== undefined) return;

    if (!result.ok) {
      const state = v.state;
      // A JSON syntax error is located by the parser itself; a schema problem by its path.
      const syntax = jsonParseLinter()(v);
      const diagnostics: Diagnostic[] = syntax.length > 0
        ? syntax
        : result.issues.map((i: ParseIssue) => ({ ...pathRange(state, i.path), severity: "error", message: `${formatPath(i.path)}: ${i.message}` }));
      v.dispatch(setDiagnostics(state, diagnostics));
      inSync.current = false;
      setStatus({
        kind: "error",
        problems: diagnostics.map((d) => ({ from: d.from, message: `line ${state.doc.lineAt(d.from).number}: ${d.message}` })),
      });
      return;
    }
    v.dispatch(setDiagnostics(v.state, []));
    store.getState().replaceDocument(result.document, { mergeKey: "json" });
    applied.current = store.getState().document;
    inSync.current = true;
    setStatus({ kind: "ok" });
    // A diagram appearing on an empty canvas should be in view, not wherever the view happened to be.
    if (before.nodes.length === 0 && result.document.nodes.length > 0) requestFitView();
    // Positions the layout filled in are written back once nobody is typing.
    if (!v.hasFocus) showDocument(applied.current);
  };
  const applyRef = useRef(apply);
  applyRef.current = apply;

  useEffect(() => {
    if (!host.current) return;
    const v = new EditorView({
      parent: host.current,
      state: EditorState.create({
        doc: serializeDocument(store.getState().document),
        extensions: [
          basicSetup,
          json(),
          syntaxHighlighting(highlight),
          theme,
          EditorView.contentAttributes.of({ "aria-label": "Diagram JSON" }),
          EditorView.updateListener.of((u) => {
            if (!u.docChanged || u.transactions.some((t) => t.annotation(fromDocument))) return;
            inSync.current = false;
            setStatus({ kind: "pending" });
            clearTimeout(timer.current);
            timer.current = setTimeout(() => {
              timer.current = undefined;
              void applyRef.current();
            }, APPLY_DELAY_MS);
          }),
          EditorView.domEventHandlers({
            blur: () => {
              // Leaving the editor with nothing pending tidies the text back to the document, filled-in
              // positions included.
              // Never while the text is broken or still being applied: that would throw away the edit.
              const current = store.getState().document;
              if (timer.current === undefined && inSync.current && applied.current === current) showDocument(current);
              return false;
            },
          }),
        ],
      }),
    });
    view.current = v;
    applied.current = store.getState().document;
    return () => {
      clearTimeout(timer.current);
      v.destroy();
      view.current = null;
    };
    // The editor is built once; the document is kept in step by the effect below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // A change from anywhere else rewrites the text.
  useEffect(() => {
    if (doc === applied.current) return;
    applied.current = doc;
    clearTimeout(timer.current);
    timer.current = undefined;
    showDocument(doc);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc]);

  const tidy = () => {
    void autoLayout(store.getState().document, { all: true })
      .then((d) => {
        store.getState().replaceDocument(d);
        requestFitView();
      })
      .catch((e: unknown) => reportCommandError(store, e));
  };

  const copyInstructions = () => {
    void navigator.clipboard.writeText(aiInstructions()).then(
      () => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      },
      (e: unknown) => reportCommandError(store, e),
    );
  };

  const jump = (from: number) => {
    const v = view.current;
    if (!v) return;
    v.dispatch({ selection: { anchor: from }, scrollIntoView: true });
    v.focus();
  };

  return (
    <section className="arq-json" data-testid="json-panel" aria-label="Diagram JSON">
      <div className="arq-json-bar">
        <span className={`arq-json-status ${status.kind}`} data-testid="json-status" role="status">
          {status.kind === "ok" ? "✓ In sync" : status.kind === "pending" ? "… Typing" : `✕ ${status.problems.length} problem${status.problems.length === 1 ? "" : "s"}`}
        </span>
        <span className="arq-json-spacer" />
        <button type="button" onClick={tidy} title="Lay out every shape again, following layout.direction">Tidy layout</button>
        <button type="button" onClick={copyInstructions} title="Copy a prompt that teaches an AI this JSON format">
          {copied ? "Copied ✓" : "Copy AI instructions"}
        </button>
      </div>
      <div className="arq-json-editor" ref={host} />
      {status.kind === "error" ? (
        <ul className="arq-json-problems" data-testid="json-problems">
          {status.problems.slice(0, 6).map((p, i) => (
            <li key={i}>
              <button type="button" onClick={() => jump(p.from)}>{p.message}</button>
            </li>
          ))}
          {status.problems.length > 6 ? <li className="more">+{status.problems.length - 6} more</li> : null}
        </ul>
      ) : null}
    </section>
  );
}
