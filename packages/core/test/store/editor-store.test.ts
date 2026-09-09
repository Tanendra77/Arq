import { describe, expect, it } from "vitest";
import { emptyDocument } from "@arq/schema";
import { createEditorStore } from "../../src/store/editor-store";

const setup = () => createEditorStore(emptyDocument("T"));

describe("editor store", () => {
  it("adds a node with a pinned position and marks dirty", () => {
    const s = setup();
    const id = s.getState().addNode({ type: "broker", label: "B", position: { x: 10, y: 20 } });
    const st = s.getState();
    expect(st.document.nodes.map((n) => n.id)).toEqual([id]);
    expect(st.document.layout.pinned[id]).toEqual({ x: 10, y: 20 });
    expect(st.dirty).toBe(true);
  });

  it("generates unique ids from the type prefix", () => {
    const s = setup();
    const a = s.getState().addNode({ type: "queue", label: "a", position: { x: 0, y: 0 } });
    const b = s.getState().addNode({ type: "queue", label: "b", position: { x: 0, y: 0 } });
    expect(a).not.toBe(b);
    expect(a.startsWith("queue")).toBe(true);
  });

  it("removing a node removes its edges and pinned entry", () => {
    const s = setup();
    const a = s.getState().addNode({ type: "app", label: "a", position: { x: 0, y: 0 } });
    const b = s.getState().addNode({ type: "broker", label: "b", position: { x: 0, y: 0 } });
    s.getState().addEdge({ from: a, to: b, kind: "publish" });
    s.getState().removeNodes([a]);
    const d = s.getState().document;
    expect(d.nodes).toHaveLength(1);
    expect(d.edges).toHaveLength(0);
    expect(d.layout.pinned[a]).toBeUndefined();
  });

  it("undo and redo restore exact documents", () => {
    const s = setup();
    const before = s.getState().document;
    s.getState().addNode({ type: "topic", label: "t", position: { x: 1, y: 1 } });
    const after = s.getState().document;
    s.getState().undo();
    expect(s.getState().document).toEqual(before);
    s.getState().redo();
    expect(s.getState().document).toEqual(after);
  });

  it("a new mutation clears the redo stack", () => {
    const s = setup();
    s.getState().addNode({ type: "topic", label: "t", position: { x: 1, y: 1 } });
    s.getState().undo();
    expect(s.getState().canRedo()).toBe(true);
    s.getState().addNode({ type: "topic", label: "u", position: { x: 1, y: 1 } });
    expect(s.getState().canRedo()).toBe(false);
  });

  it("mutations with the same mergeKey collapse into one undo entry", () => {
    const s = setup();
    const id = s.getState().addNode({ type: "app", label: "a", position: { x: 0, y: 0 } });
    s.getState().setPinned(id, { x: 1, y: 0 }, { mergeKey: "nudge:" + id });
    s.getState().setPinned(id, { x: 2, y: 0 }, { mergeKey: "nudge:" + id });
    s.getState().setPinned(id, { x: 3, y: 0 }, { mergeKey: "nudge:" + id });
    expect(s.getState().past).toHaveLength(2);
    s.getState().undo();
    expect(s.getState().document.layout.pinned[id]).toEqual({ x: 0, y: 0 });
  });

  it("rejects an edge to a missing node", () => {
    const s = setup();
    const a = s.getState().addNode({ type: "app", label: "a", position: { x: 0, y: 0 } });
    expect(() => s.getState().addEdge({ from: a, to: "ghost", kind: "generic" })).toThrow(/ghost/);
  });

  it("loadDocument resets history, dirty and path", () => {
    const s = setup();
    s.getState().addNode({ type: "app", label: "a", position: { x: 0, y: 0 } });
    s.getState().loadDocument(emptyDocument("X"), "C:/x.arq");
    const st = s.getState();
    expect(st.document.title).toBe("X");
    expect(st.past).toHaveLength(0);
    expect(st.dirty).toBe(false);
    expect(st.filePath).toBe("C:/x.arq");
  });

  it("markSaved clears dirty and records the path", () => {
    const s = setup();
    s.getState().addNode({ type: "app", label: "a", position: { x: 0, y: 0 } });
    s.getState().markSaved("C:/y.arq");
    expect(s.getState().dirty).toBe(false);
    expect(s.getState().filePath).toBe("C:/y.arq");
  });

  it("selection survives undo but pruned ids are dropped", () => {
    const s = setup();
    const a = s.getState().addNode({ type: "app", label: "a", position: { x: 0, y: 0 } });
    s.getState().setSelection({ nodes: [a], edges: [] });
    s.getState().undo();
    expect(s.getState().selection.nodes).toEqual([]);
  });
});
