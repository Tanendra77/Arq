import { useEffect } from "react";
import { useReactFlow } from "@xyflow/react";
import { useEditorStore, usePlatform } from "../store/context";
import { confirmDiscard, newDocument, openDocument, reportCommandError, saveDocument } from "./file-commands";
import { buildClip, parseClip, serializeClip } from "../store/clipboard";
import type { EditorStore } from "../store/editor-store";
import { parseEndpointNodeId } from "../flow/endpoint-id";
import { getActiveToolKey, setActiveTool } from "../components/Palette";

const isEditable = (t: EventTarget | null) =>
  t instanceof HTMLElement &&
  (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable);

const NUDGE: Record<string, [number, number]> = {
  ArrowLeft: [-1, 0],
  ArrowRight: [1, 0],
  ArrowUp: [0, -1],
  ArrowDown: [0, 1],
};

/** How far a paste or a duplicate lands from what it copied, so it never hides exactly on top. */
const PASTE_OFFSET = 20;

/** Selected document nodes, without the hidden stand-ins for loose edge ends. */
const realNodes = (ids: string[]) => ids.filter((id) => parseEndpointNodeId(id) === null);

/** Duplicate the selection in place: the same as copy then paste, without touching the clipboard. */
export function duplicateSelection(store: EditorStore): void {
  const s = store.getState();
  const clip = buildClip(s.document, s.selection);
  if (!clip) return;
  s.setSelection(s.insertClip(clip, PASTE_OFFSET, PASTE_OFFSET));
}

export function useShortcuts(): void {
  const store = useEditorStore();
  const platform = usePlatform();
  // Requires a ReactFlowProvider ancestor; see the call site in Canvas.tsx.
  const { zoomIn, zoomOut, zoomTo, fitView } = useReactFlow();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isEditable(e.target)) return;
      const s = store.getState();
      const mod = e.ctrlKey || e.metaKey;
      const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;

      if (mod && key === "z" && !e.shiftKey) { e.preventDefault(); s.undo(); return; }
      if (mod && (key === "y" || (key === "z" && e.shiftKey))) { e.preventDefault(); s.redo(); return; }
      if (mod && key === "s") {
        e.preventDefault();
        void saveDocument(store, platform, { as: e.shiftKey }).catch((err: unknown) => reportCommandError(store, err));
        return;
      }
      if (mod && key === "o") {
        e.preventDefault();
        if (confirmDiscard(store)) {
          void openDocument(store, platform)
            .then((r) => {
              if (!r.ok && "errors" in r) store.getState().setNotice(r.errors);
            })
            .catch((err: unknown) => reportCommandError(store, err));
        }
        return;
      }
      if (mod && key === "n") { e.preventDefault(); if (confirmDiscard(store)) newDocument(store); return; }
      if (mod && key === "a") {
        e.preventDefault();
        s.setSelection({ nodes: s.document.nodes.map((n) => n.id), edges: s.document.edges.map((x) => x.id) });
        return;
      }
      if (mod && key === "d") {
        e.preventDefault();
        duplicateSelection(store);
        return;
      }
      if (mod && (key === "=" || key === "+")) { e.preventDefault(); zoomIn(); return; }
      if (mod && key === "-") { e.preventDefault(); zoomOut(); return; }
      if (mod && key === "0") { e.preventDefault(); zoomTo(1); return; }
      if (mod && key === "1") { e.preventDefault(); fitView(); return; }
      // H picks up the hand, V (or Escape, handled by the canvas) puts it down again.
      if (!mod && !e.altKey && key === "h") { setActiveTool(getActiveToolKey() === "hand" ? null : "hand"); return; }
      if (!mod && !e.altKey && key === "v") { setActiveTool(null); return; }
      const delta = NUDGE[key];
      const nodes = realNodes(s.selection.nodes);
      if (delta && (nodes.length || s.selection.edges.length)) {
        e.preventDefault();
        const step = e.shiftKey ? 10 : 1;
        // One constant merge key: a run of arrow presses (whatever their direction) collapses
        // into a single undo entry, so undo reverts the whole nudge gesture rather than one step.
        s.moveBy(nodes, s.selection.edges, delta[0] * step, delta[1] * step, { mergeKey: "nudge" });
      }
    };

    // Copy and paste ride the browser's own clipboard events rather than the async Clipboard API:
    // they need no permission prompt, work in the desktop webview too, and carry the diagram between
    // tabs and windows. Anything that is not ours — text in a field, a page selection — is left alone.
    let pasted = { text: "", count: 0 };
    const leaveAlone = (e: ClipboardEvent) =>
      isEditable(e.target) || isEditable(document.activeElement) || (window.getSelection()?.toString() ?? "") !== "";
    const onCopy = (e: ClipboardEvent) => {
      if (leaveAlone(e) || !e.clipboardData) return;
      const s = store.getState();
      const clip = buildClip(s.document, s.selection);
      if (!clip) return;
      e.preventDefault();
      e.clipboardData.setData("text/plain", serializeClip(clip));
      pasted = { text: "", count: 0 };
      if (e.type === "cut") s.removeElements(realNodes(s.selection.nodes), s.selection.edges);
    };
    const onPaste = (e: ClipboardEvent) => {
      if (isEditable(e.target) || isEditable(document.activeElement) || !e.clipboardData) return;
      const text = e.clipboardData.getData("text/plain");
      const clip = parseClip(text);
      if (!clip) return;
      e.preventDefault();
      // Pasting the same thing again steps each copy further along instead of stacking them.
      pasted = { text, count: pasted.text === text ? pasted.count + 1 : 1 };
      const off = PASTE_OFFSET * pasted.count;
      const s = store.getState();
      s.setSelection(s.insertClip(clip, off, off));
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("copy", onCopy);
    window.addEventListener("cut", onCopy);
    window.addEventListener("paste", onPaste);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("copy", onCopy);
      window.removeEventListener("cut", onCopy);
      window.removeEventListener("paste", onPaste);
    };
  }, [store, platform, zoomIn, zoomOut, zoomTo, fitView]);
}
