import { useEffect, useRef, useState } from "react";
import { basicSetup } from "codemirror";
import { json, jsonParseLinter } from "@codemirror/lang-json";
import { setDiagnostics, type Diagnostic } from "@codemirror/lint";
import { HighlightStyle, ensureSyntaxTree, syntaxHighlighting, syntaxTree } from "@codemirror/language";
import { Annotation, EditorState, RangeSetBuilder, StateEffect, StateField } from "@codemirror/state";
import { Decoration, EditorView, type DecorationSet } from "@codemirror/view";
import { tags } from "@lezer/highlight";
import type { SyntaxNode } from "@lezer/common";
import { serializeDocument, type Document, type ParseIssue } from "@arq/schema";
import { useEditor, useEditorStore, usePlatform } from "../store/context";
import { fileSlug } from "../commands/export-commands";
import { JsonTree } from "./JsonTree";
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

/** A property's value node, or its name when it has no value yet. */
function propertyValue(p: SyntaxNode): SyntaxNode | null {
  const name = p.getChild("PropertyName");
  return p.lastChild && p.lastChild !== name && p.lastChild.name !== ":" ? p.lastChild : name;
}

function propertyKey(state: EditorState, p: SyntaxNode): unknown {
  const name = p.name === "Property" ? p.getChild("PropertyName") : null;
  if (!name) return undefined;
  try {
    return JSON.parse(state.sliceDoc(name.from, name.to));
  } catch {
    return undefined;
  }
}

/** The `"id"` an element object in the text declares, if it declares a readable one. */
function objectId(state: EditorState, obj: SyntaxNode): string | undefined {
  for (let p = obj.firstChild; p; p = p.nextSibling) {
    if (propertyKey(state, p) !== "id") continue;
    const v = propertyValue(p);
    if (!v || v.name !== "String") return undefined;
    try {
      return JSON.parse(state.sliceDoc(v.from, v.to)) as string;
    } catch {
      return undefined;
    }
  }
  return undefined;
}

type ElementKind = "nodes" | "edges";

/** Every shape and line object written in the text, with the id it declares and where it sits. */
export function elementObjects(state: EditorState): { kind: ElementKind; id: string; from: number; to: number }[] {
  const tree = ensureSyntaxTree(state, state.doc.length, 500) ?? syntaxTree(state);
  const root = tree.topNode.firstChild;
  if (!root || root.name !== "Object") return [];
  const out: { kind: ElementKind; id: string; from: number; to: number }[] = [];
  for (let p = root.firstChild; p; p = p.nextSibling) {
    const key = propertyKey(state, p);
    if (key !== "nodes" && key !== "edges") continue;
    const arr = propertyValue(p);
    if (!arr || arr.name !== "Array") continue;
    for (let o = arr.firstChild; o; o = o.nextSibling) {
      if (o.name !== "Object") continue;
      const id = objectId(state, o);
      if (id !== undefined) out.push({ kind: key, id, from: o.from, to: o.to });
    }
  }
  return out;
}

/** The shape or line whose object the position is inside, if any. */
export function elementAt(state: EditorState, pos: number): { kind: ElementKind; id: string } | null {
  const hit = elementObjects(state).find((e) => pos > e.from && pos < e.to);
  return hit ? { kind: hit.kind, id: hit.id } : null;
}

/** Marks the lines of whatever is selected on the canvas. */
const setSelected = StateEffect.define<{ from: number; to: number }[]>();
const selectedLines = StateField.define<DecorationSet>({
  create: () => Decoration.none,
  update(deco, tr) {
    let next = deco.map(tr.changes);
    for (const e of tr.effects) {
      if (!e.is(setSelected)) continue;
      const builder = new RangeSetBuilder<Decoration>();
      const mark = Decoration.line({ class: "cm-arq-selected" });
      const lines = new Set<number>();
      for (const r of e.value) {
        const first = tr.state.doc.lineAt(r.from).number;
        const last = tr.state.doc.lineAt(r.to).number;
        for (let n = first; n <= last; n += 1) lines.add(n);
      }
      for (const n of [...lines].sort((a, b) => a - b)) {
        const line = tr.state.doc.line(n);
        builder.add(line.from, line.from, mark);
      }
      next = builder.finish();
    }
    return next;
  },
  provide: (f) => EditorView.decorations.from(f),
});

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
  ".cm-arq-selected": { backgroundColor: "color-mix(in srgb, var(--arq-accent) 14%, transparent)" },
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
  const selection = useEditor((s) => s.selection);
  /** Set while the editor's own cursor is what changed the selection, so the text is not scrolled under it. */
  const selectedFromText = useRef(false);
  const host = useRef<HTMLDivElement>(null);
  const view = useRef<EditorView | null>(null);
  /** The document this panel's own last apply produced; any other document came from elsewhere. */
  const applied = useRef<Document | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>();
  const seq = useRef(0);
  /** Whether the text on screen is exactly what the diagram shows — false while typing or broken. */
  const inSync = useRef(true);
  const [status, setStatus] = useState<Status>({ kind: "ok" });
  const [copied, setCopied] = useState<string | null>(null);
  const [tree, setTree] = useState(false);
  const platform = usePlatform();

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
          selectedLines,
          // Putting the cursor inside a shape's or a line's object selects that element on the canvas.
          EditorView.updateListener.of((u) => {
            // A click or arrow key moving the cursor, or typing — not the text being rewritten from the diagram.
            // (Focus is not a reliable signal: a click moves the cursor before the editor reports focus.)
            const byUser = u.transactions.some((t) => t.isUserEvent("select") || t.isUserEvent("input"));
            if (!u.selectionSet || !byUser) return;
            const hit = elementAt(u.state, u.state.selection.main.head);
            if (!hit) return;
            const s = store.getState();
            const exists = hit.kind === "nodes" ? s.document.nodes.some((n) => n.id === hit.id) : s.document.edges.some((e) => e.id === hit.id);
            if (!exists) return;
            selectedFromText.current = true;
            s.setSelection(hit.kind === "nodes" ? { nodes: [hit.id], edges: [] } : { nodes: [], edges: [hit.id] });
          }),
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

  // Whatever is selected on the canvas is marked in the text — and scrolled to, unless the cursor put it there.
  useEffect(() => {
    const v = view.current;
    if (!v) return;
    const nodes = new Set(selection.nodes);
    const edges = new Set(selection.edges);
    const ranges = elementObjects(v.state)
      .filter((e) => (e.kind === "nodes" ? nodes : edges).has(e.id))
      .map(({ from, to }) => ({ from, to }));
    const first = ranges[0];
    v.dispatch({
      effects: [
        setSelected.of(ranges),
        ...(first && !selectedFromText.current ? [EditorView.scrollIntoView(first.from, { y: "center" })] : []),
      ],
    });
    selectedFromText.current = false;
  }, [selection, doc]);

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

  /** Copy text to the clipboard, and say so on the button that did it for a moment. */
  const copy = (what: string, text: string) => {
    void navigator.clipboard.writeText(text).then(
      () => {
        setCopied(what);
        setTimeout(() => setCopied((c) => (c === what ? null : c)), 1500);
      },
      (e: unknown) => reportCommandError(store, e),
    );
  };
  const editorText = () => view.current?.state.doc.toString() ?? serializeDocument(store.getState().document);
  const downloadJson = () => {
    void platform
      .exportFile(editorText(), `${fileSlug(store.getState().document.title)}.json`, "application/json")
      .catch((e: unknown) => reportCommandError(store, e));
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
        <label className="arq-json-toggle" title="Show the JSON as a collapsible outline">
          <input type="checkbox" checked={tree} onChange={(e) => setTree(e.target.checked)} /> Tree
        </label>
        <span className="arq-json-spacer" />
        <button type="button" onClick={tidy} title="Lay out every shape again, following layout.direction">Tidy layout</button>
        <button type="button" onClick={() => copy("ai", aiInstructions())} title="Copy a prompt that teaches an AI this JSON format">
          {copied === "ai" ? "Copied ✓" : "Copy AI instructions"}
        </button>
        <button type="button" onClick={() => copy("json", editorText())} title="Copy all of the JSON">
          {copied === "json" ? "Copied ✓" : "Copy JSON"}
        </button>
        <button type="button" onClick={downloadJson} title="Save the JSON as a .json file">Download JSON</button>
      </div>
      {/* The text editor stays mounted under the outline, so its sync and its problems carry on. */}
      <div className="arq-json-editor" ref={host} hidden={tree} />
      {tree ? (
        <div className="arq-json-tree-wrap">
          <JsonTree
            doc={doc}
            selection={selection}
            onSelect={(kind, id) =>
              store.getState().setSelection(kind === "nodes" ? { nodes: [id], edges: [] } : { nodes: [], edges: [id] })}
          />
        </div>
      ) : null}
      {status.kind === "error" ? (
        <ul className="arq-json-problems" data-testid="json-problems">
          <li className="arq-json-problems-head">
            <button type="button" className="arq-json-copy-errors" onClick={() =>
              copy("errors", status.problems.map((p) => p.message).join("\n"))} title="Copy every problem, to fix or to paste to an AI">
              {copied === "errors" ? "Copied ✓" : "Copy errors"}
            </button>
          </li>
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
