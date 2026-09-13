import { describe, expect, it } from "vitest";
import { emptyDocument } from "@arq/schema";
import { createEditorStore } from "../../src/store/editor-store";
import { buildClip, parseClip, serializeClip } from "../../src/store/clipboard";
import { endpointNodeId } from "../../src/flow/endpoint-id";

function diagram() {
  const store = createEditorStore(emptyDocument());
  const s = store.getState();
  const a = s.addNode({ shape: "rect", label: "a", position: { x: 0, y: 0 }, size: { w: 100, h: 50 } });
  const b = s.addNode({ shape: "freehand", label: "", position: { x: 300, y: 0 }, size: { w: 40, h: 40 }, points: [[0, 0], [1, 1]] });
  const c = s.addNode({ shape: "ellipse", label: "c", position: { x: 0, y: 300 } });
  const ab = s.addEdge({ from: a, to: b, label: "ab" });
  const ac = s.addEdge({ from: { node: a, ax: 1, ay: 0.5 }, to: c });
  const loose = s.addEdge({ from: { x: 10, y: 10 }, to: { x: 90, y: 10 } });
  return { store, a, b, c, ab, ac, loose };
}

describe("clipboard", () => {
  it("copies shapes with the edges between them, and pastes them under fresh ids in one undo step", () => {
    const { store, a, b, ab } = diagram();
    const clip = buildClip(store.getState().document, { nodes: [a, b], edges: [] })!;
    expect(clip.nodes.map((n) => n.id)).toEqual([a, b]);
    expect(clip.edges.map((e) => e.id)).toEqual([ab]); // not a→c: c was not copied and the edge was not selected

    const before = store.getState().past.length;
    const added = store.getState().insertClip(parseClip(serializeClip(clip))!, 20, 20);
    const doc = store.getState().document;
    expect(store.getState().past.length).toBe(before + 1);
    expect(added.nodes).toHaveLength(2);
    expect(added.nodes).not.toContain(a);
    const [na, nb] = added.nodes;
    expect(doc.layout.pinned[na!]).toEqual({ x: 20, y: 20, w: 100, h: 50 });
    expect(doc.nodes.find((n) => n.id === nb)?.points).toEqual([[0, 0], [1, 1]]);
    const pastedEdge = doc.edges.find((e) => e.id === added.edges[0]);
    expect(pastedEdge).toMatchObject({ from: na, to: nb, label: "ab" });
  });

  it("cuts a selected edge free where it touched a shape that was not copied", () => {
    const { store, a, ac } = diagram();
    const clip = buildClip(store.getState().document, { nodes: [a], edges: [ac] })!;
    const edge = clip.edges[0]!;
    expect(edge.from).toEqual({ node: a, ax: 1, ay: 0.5 });
    expect(typeof edge.to).toBe("object");
    expect(edge.to).toHaveProperty("x");
  });

  it("copies a loose line picked by its ends and shifts those ends on paste", () => {
    const { store, loose } = diagram();
    const clip = buildClip(store.getState().document, {
      nodes: [endpointNodeId(loose, "from"), endpointNodeId(loose, "to")], edges: [],
    })!;
    const added = store.getState().insertClip(clip, 5, 5);
    const e = store.getState().document.edges.find((x) => x.id === added.edges[0]);
    expect(e).toMatchObject({ from: { x: 15, y: 15 }, to: { x: 95, y: 15 } });
  });

  it("returns nothing for an empty selection, and rejects text that is not a clip", () => {
    const { store } = diagram();
    expect(buildClip(store.getState().document, { nodes: [], edges: [] })).toBeNull();
    expect(parseClip("hello")).toBeNull();
    expect(parseClip(JSON.stringify({ type: "other", nodes: [] }))).toBeNull();
    // Invalid elements are dropped, not trusted.
    const clip = parseClip(JSON.stringify({ type: "arq/clipboard@1", nodes: [{ id: "x", shape: "nope", label: "" }], edges: [], pinned: {} }));
    expect(clip).toBeNull();
  });

  it("moveBy shifts shapes and loose line ends together, leaving bound ends to follow their shapes", () => {
    const { store, a, ab, loose } = diagram();
    store.getState().moveBy([a], [ab, loose], 3, 4);
    const doc = store.getState().document;
    expect(doc.layout.pinned[a]).toMatchObject({ x: 3, y: 4 });
    expect(doc.edges.find((e) => e.id === ab)?.from).toBe(a);
    expect(doc.edges.find((e) => e.id === loose)).toMatchObject({ from: { x: 13, y: 14 }, to: { x: 93, y: 14 } });
  });
});
