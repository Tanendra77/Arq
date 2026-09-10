import { useEffect } from "react";
import { useReactFlow } from "@xyflow/react";
import { useEditorStore, usePlatform } from "../store/context";
import { confirmDiscard, newDocument, openDocument, reportCommandError, saveDocument } from "./file-commands";

const isEditable = (t: EventTarget | null) =>
  t instanceof HTMLElement &&
  (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable);

const NUDGE: Record<string, [number, number]> = {
  ArrowLeft: [-1, 0],
  ArrowRight: [1, 0],
  ArrowUp: [0, -1],
  ArrowDown: [0, 1],
};

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
        const selected = new Set(s.selection.nodes);
        const created: string[] = [];
        for (const n of s.document.nodes.filter((x) => selected.has(x.id))) {
          const p = s.document.layout.pinned[n.id] ?? { x: 0, y: 0 };
          const size = p.w !== undefined && p.h !== undefined ? { w: p.w, h: p.h } : undefined;
          created.push(
            store.getState().addNode({
              shape: n.shape,
              label: n.label,
              position: { x: p.x + 20, y: p.y + 20 },
              ...(n.icon !== undefined ? { icon: n.icon } : {}),
              ...(n.style !== undefined ? { style: n.style } : {}),
              ...(size !== undefined ? { size } : {}),
            }),
          );
        }
        if (created.length) store.getState().setSelection({ nodes: created, edges: [] });
        return;
      }
      if (mod && (key === "=" || key === "+")) { e.preventDefault(); zoomIn(); return; }
      if (mod && key === "-") { e.preventDefault(); zoomOut(); return; }
      if (mod && key === "0") { e.preventDefault(); zoomTo(1); return; }
      if (mod && key === "1") { e.preventDefault(); fitView(); return; }
      const delta = NUDGE[key];
      if (delta && s.selection.nodes.length) {
        e.preventDefault();
        const step = e.shiftKey ? 10 : 1;
        for (const id of s.selection.nodes) {
          const p = store.getState().document.layout.pinned[id] ?? { x: 0, y: 0 };
          // One constant merge key: a run of arrow presses (whatever their direction) collapses
          // into a single undo entry, so undo reverts the whole nudge gesture rather than one step.
          store.getState().setPinned(
            id,
            { ...p, x: p.x + delta[0] * step, y: p.y + delta[1] * step },
            { mergeKey: "nudge" },
          );
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [store, platform, zoomIn, zoomOut, zoomTo, fitView]);
}
