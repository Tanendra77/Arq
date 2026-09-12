import { describe, expect, it } from "vitest";
import { emptyDocument } from "@arq/schema";
import { createEditorStore } from "../../src/store/editor-store";
import { endpointNodeId } from "../../src/flow/endpoint-id";

const setup = () => createEditorStore(emptyDocument("T"));

describe("editor store", () => {
  it("adds a node with a pinned position and marks dirty", () => {
    const s = setup();
    const id = s.getState().addNode({ shape: "rect", label: "B", position: { x: 10, y: 20 } });
    const st = s.getState();
    expect(st.document.nodes.map((n) => n.id)).toEqual([id]);
    expect(st.document.layout.pinned[id]).toEqual({ x: 10, y: 20 });
    expect(st.dirty).toBe(true);
  });

  it("adds a node with a shape and an explicit size", () => {
    const s = createEditorStore(emptyDocument());
    const id = s.getState().addNode({ shape: "ellipse", label: "E", position: { x: 5, y: 6 }, size: { w: 200, h: 90 } });
    expect(s.getState().document.nodes[0]?.shape).toBe("ellipse");
    expect(s.getState().document.layout.pinned[id]).toEqual({ x: 5, y: 6, w: 200, h: 90 });
  });

  it("generates unique ids from the shape prefix", () => {
    const s = setup();
    const a = s.getState().addNode({ shape: "diamond", label: "a", position: { x: 0, y: 0 } });
    const b = s.getState().addNode({ shape: "diamond", label: "b", position: { x: 0, y: 0 } });
    expect(a).not.toBe(b);
    expect(a.startsWith("diamond")).toBe(true);
  });

  it("adds a free-floating edge with two point endpoints", () => {
    const s = createEditorStore(emptyDocument());
    const id = s.getState().addEdge({ from: { x: 0, y: 0 }, to: { x: 120, y: 0 } });
    expect(s.getState().document.edges.find((e) => e.id === id)?.from).toEqual({ x: 0, y: 0 });
  });

  it("rejects a string endpoint that names no node", () => {
    const s = createEditorStore(emptyDocument());
    expect(() => s.getState().addEdge({ from: "ghost", to: { x: 1, y: 1 } })).toThrow(/ghost/);
  });

  it("rejects an edge to a missing node", () => {
    const s = setup();
    const a = s.getState().addNode({ shape: "rect", label: "a", position: { x: 0, y: 0 } });
    expect(() => s.getState().addEdge({ from: a, to: "ghost" })).toThrow(/ghost/);
  });

  it("removing a node removes its edges and pinned entry", () => {
    const s = setup();
    const a = s.getState().addNode({ shape: "rect", label: "a", position: { x: 0, y: 0 } });
    const b = s.getState().addNode({ shape: "rect", label: "b", position: { x: 0, y: 0 } });
    s.getState().addEdge({ from: a, to: b });
    s.getState().removeNodes([a]);
    const d = s.getState().document;
    expect(d.nodes).toHaveLength(1);
    expect(d.edges).toHaveLength(0);
    expect(d.layout.pinned[a]).toBeUndefined();
  });

  it("removing a node drops edges attached to it but keeps free lines", () => {
    const s = createEditorStore(emptyDocument());
    const n = s.getState().addNode({ shape: "rect", label: "A", position: { x: 0, y: 0 } });
    s.getState().addEdge({ from: n, to: { x: 50, y: 0 } });
    const free = s.getState().addEdge({ from: { x: 0, y: 0 }, to: { x: 10, y: 0 } });
    s.getState().removeNodes([n]);
    expect(s.getState().document.edges.map((e) => e.id)).toEqual([free]);
  });

  it("undo and redo restore exact documents", () => {
    const s = setup();
    const before = s.getState().document;
    s.getState().addNode({ shape: "text", label: "t", position: { x: 1, y: 1 } });
    const after = s.getState().document;
    s.getState().undo();
    expect(s.getState().document).toEqual(before);
    s.getState().redo();
    expect(s.getState().document).toEqual(after);
  });

  it("a new mutation clears the redo stack", () => {
    const s = setup();
    s.getState().addNode({ shape: "text", label: "t", position: { x: 1, y: 1 } });
    s.getState().undo();
    expect(s.getState().canRedo()).toBe(true);
    s.getState().addNode({ shape: "text", label: "u", position: { x: 1, y: 1 } });
    expect(s.getState().canRedo()).toBe(false);
  });

  it("mutations with the same mergeKey collapse into one undo entry", () => {
    const s = setup();
    const id = s.getState().addNode({ shape: "rect", label: "a", position: { x: 0, y: 0 } });
    s.getState().setPinned(id, { x: 1, y: 0 }, { mergeKey: "nudge:" + id });
    s.getState().setPinned(id, { x: 2, y: 0 }, { mergeKey: "nudge:" + id });
    s.getState().setPinned(id, { x: 3, y: 0 }, { mergeKey: "nudge:" + id });
    expect(s.getState().past).toHaveLength(2);
    s.getState().undo();
    expect(s.getState().document.layout.pinned[id]).toEqual({ x: 0, y: 0 });
  });

  it("setStyle patches many elements as one undo entry", () => {
    const s = createEditorStore(emptyDocument());
    const a = s.getState().addNode({ shape: "rect", label: "A", position: { x: 0, y: 0 } });
    const b = s.getState().addNode({ shape: "rect", label: "B", position: { x: 0, y: 0 } });
    const before = s.getState().past.length;
    s.getState().setStyle([a, b], { fill: "#ff0000" });
    expect(s.getState().past.length).toBe(before + 1);
    expect(s.getState().document.nodes.every((n) => n.style?.fill === "#ff0000")).toBe(true);
    s.getState().undo();
    expect(s.getState().document.nodes.every((n) => n.style?.fill === undefined)).toBe(true);
  });

  it("merges a run of setStyle calls sharing a mergeKey into one entry", () => {
    const s = createEditorStore(emptyDocument());
    const a = s.getState().addNode({ shape: "rect", label: "A", position: { x: 0, y: 0 } });
    const before = s.getState().past.length;
    for (const fill of ["#111111", "#222222", "#333333"]) {
      s.getState().setStyle([a], { fill }, { mergeKey: "style:fill" });
    }
    expect(s.getState().past.length).toBe(before + 1);
    expect(s.getState().document.nodes[0]?.style?.fill).toBe("#333333");
  });

  it("setStyle on an unknown id creates no undo entry", () => {
    const s = createEditorStore(emptyDocument());
    const before = s.getState().past.length;
    s.getState().setStyle(["ghost"], { fill: "#ff0000" });
    expect(s.getState().past.length).toBe(before);
  });

  it("setStyle with an undefined value deletes the key instead of storing undefined", () => {
    const s = createEditorStore(emptyDocument());
    const a = s.getState().addNode({ shape: "rect", label: "A", position: { x: 0, y: 0 } });
    s.getState().setStyle([a], { fill: "#ff0000", stroke: "#00ff00" });
    s.getState().setStyle([a], { fill: undefined });
    const style = s.getState().document.nodes[0]?.style ?? {};
    // `toBeUndefined()` would pass for a stored `undefined` too, so assert on key presence and on
    // the serialised bytes: "unset" has to keep meaning "fall back to the renderer default".
    expect("fill" in style).toBe(false);
    expect(Object.keys(style)).toEqual(["stroke"]);
    expect(JSON.stringify(s.getState().document)).not.toContain("fill");
  });

  it("setStyle applies only the keys the target's style supports", () => {
    const s = createEditorStore(emptyDocument());
    const a = s.getState().addNode({ shape: "rect", label: "A", position: { x: 0, y: 0 } });
    const e = s.getState().addEdge({ from: a, to: { x: 50, y: 0 } });
    s.getState().setStyle([a, e], { fill: "#ff0000", stroke: "#00ff00" });
    expect(s.getState().document.nodes[0]?.style).toEqual({ fill: "#ff0000", stroke: "#00ff00" });
    // `fill` is a node-only key; storing it on an edge would make the document fail its own
    // strict schema on save.
    expect(s.getState().document.edges[0]?.style).toEqual({ stroke: "#00ff00" });
  });

  it("setEndpoint reattaches a loose end to a node", () => {
    const s = createEditorStore(emptyDocument());
    const n = s.getState().addNode({ shape: "rect", label: "A", position: { x: 0, y: 0 } });
    const e = s.getState().addEdge({ from: { x: 0, y: 0 }, to: { x: 50, y: 0 } });
    s.getState().setEndpoint(e, "to", n);
    expect(s.getState().document.edges.find((x) => x.id === e)?.to).toBe(n);
  });

  it("setEndpoint rejects a node id that does not exist", () => {
    const s = createEditorStore(emptyDocument());
    const e = s.getState().addEdge({ from: { x: 0, y: 0 }, to: { x: 50, y: 0 } });
    expect(() => s.getState().setEndpoint(e, "to", "ghost")).toThrow(/ghost/);
  });

  it("loadDocument resets history, dirty and path", () => {
    const s = setup();
    s.getState().addNode({ shape: "rect", label: "a", position: { x: 0, y: 0 } });
    s.getState().loadDocument(emptyDocument("X"), "C:/x.arq");
    const st = s.getState();
    expect(st.document.title).toBe("X");
    expect(st.past).toHaveLength(0);
    expect(st.dirty).toBe(false);
    expect(st.filePath).toBe("C:/x.arq");
  });

  it("markSaved clears dirty and records the path", () => {
    const s = setup();
    s.getState().addNode({ shape: "rect", label: "a", position: { x: 0, y: 0 } });
    s.getState().markSaved("C:/y.arq");
    expect(s.getState().dirty).toBe(false);
    expect(s.getState().filePath).toBe("C:/y.arq");
  });

  it("selection survives undo but pruned ids are dropped", () => {
    const s = setup();
    const a = s.getState().addNode({ shape: "rect", label: "a", position: { x: 0, y: 0 } });
    s.getState().setSelection({ nodes: [a], edges: [] });
    s.getState().undo();
    expect(s.getState().selection.nodes).toEqual([]);
  });

  it("removing ids that do not exist creates no history entry", () => {
    const s = setup();
    s.getState().addNode({ shape: "rect", label: "a", position: { x: 0, y: 0 } });
    const before = s.getState().past.length;
    s.getState().removeNodes([]);
    s.getState().removeNodes(["nope"]);
    s.getState().removeEdges(["nope"]);
    expect(s.getState().past).toHaveLength(before);
  });

  it("removing a node emits per-index patches, not whole-array snapshots", () => {
    const s = setup();
    const a = s.getState().addNode({ shape: "rect", label: "a", position: { x: 0, y: 0 } });
    s.getState().addNode({ shape: "rect", label: "b", position: { x: 0, y: 0 } });
    s.getState().removeNodes([a]);
    const entry = s.getState().past[s.getState().past.length - 1]!;
    expect(entry.patches.some((p) => p.path.length === 1 && p.path[0] === "nodes" && p.op === "replace")).toBe(false);
  });

  it("setPinned with an identical value creates no history entry", () => {
    const s = setup();
    const id = s.getState().addNode({ shape: "rect", label: "a", position: { x: 5, y: 5 } });
    const before = s.getState().past.length;
    s.getState().setPinned(id, { x: 5, y: 5 });
    expect(s.getState().past).toHaveLength(before);
  });

  it("dirty clears when undo returns to the saved state and sets again on redo", () => {
    const s = setup();
    s.getState().addNode({ shape: "rect", label: "a", position: { x: 0, y: 0 } });
    s.getState().markSaved("C:/s.arq");
    expect(s.getState().dirty).toBe(false);
    s.getState().addNode({ shape: "rect", label: "b", position: { x: 0, y: 0 } });
    expect(s.getState().dirty).toBe(true);
    s.getState().undo();
    expect(s.getState().dirty).toBe(false);
    s.getState().redo();
    expect(s.getState().dirty).toBe(true);
  });

  it("dirty is false after undoing everything on a never-saved empty document", () => {
    const s = setup();
    s.getState().addNode({ shape: "rect", label: "a", position: { x: 0, y: 0 } });
    s.getState().undo();
    expect(s.getState().dirty).toBe(false);
  });

  it("setLabel touches only the node when an edge shares the id", () => {
    const s = setup();
    const a = s.getState().addNode({ shape: "rect", label: "a", position: { x: 0, y: 0 } });
    const b = s.getState().addNode({ shape: "rect", label: "b", position: { x: 0, y: 0 } });
    s.getState().addEdge({ id: a, from: a, to: b, label: "edge" });
    s.getState().setLabel(a, "renamed");
    const d = s.getState().document;
    expect(d.nodes[0]?.label).toBe("renamed");
    expect(d.edges[0]?.label).toBe("edge");
  });
});

describe("setSelection", () => {
  it("keeps a loose edge endpoint selected: it is canvas-selectable, just not a document node", () => {
    const s = createEditorStore(emptyDocument());
    const e = s.getState().addEdge({ from: { x: 0, y: 0 }, to: { x: 100, y: 0 } });
    const ep = endpointNodeId(e, "to");
    s.getState().setSelection({ nodes: [ep], edges: [] });
    // Dropping it here is what looped the canvas: React Flow kept reporting the selection, the
    // store kept discarding it, and the two re-rendered each other until React unmounted the tree.
    expect(s.getState().selection.nodes).toEqual([ep]);
  });

  it("drops a loose endpoint once its edge is gone", () => {
    const s = createEditorStore(emptyDocument());
    const e = s.getState().addEdge({ from: { x: 0, y: 0 }, to: { x: 100, y: 0 } });
    s.getState().setSelection({ nodes: [endpointNodeId(e, "to")], edges: [] });
    s.getState().removeEdges([e]);
    s.getState().setSelection({ nodes: [endpointNodeId(e, "to")], edges: [] });
    expect(s.getState().selection.nodes).toEqual([]);
  });

  it("is a no-op for an unchanged selection, object identity included", () => {
    const s = createEditorStore(emptyDocument());
    const a = s.getState().addNode({ shape: "rect", label: "A", position: { x: 0, y: 0 } });
    s.getState().setSelection({ nodes: [a], edges: [] });
    const first = s.getState().selection;
    s.getState().setSelection({ nodes: [a], edges: [] });
    // Same value must mean the same object: a fresh one re-runs `toFlow`, which hands React Flow
    // new nodes, which makes it report its selection again — the cycle this guard exists to stop.
    expect(s.getState().selection).toBe(first);
  });

  it("still publishes a genuine change", () => {
    const s = createEditorStore(emptyDocument());
    const a = s.getState().addNode({ shape: "rect", label: "A", position: { x: 0, y: 0 } });
    s.getState().setSelection({ nodes: [a], edges: [] });
    s.getState().setSelection({ nodes: [], edges: [] });
    expect(s.getState().selection.nodes).toEqual([]);
  });
});
