import { describe, expect, it } from "vitest";
import { emptyDocument } from "@arq/schema";
import { createEditorStore } from "../../src/store/editor-store";
import { eraserHits } from "../../src/flow/eraser";

function scene() {
  const s = createEditorStore(emptyDocument());
  const a = s.getState().addNode({ shape: "rect", label: "A", position: { x: 0, y: 0 }, size: { w: 100, h: 100 } });
  const e = s.getState().addEdge({ from: { x: 0, y: 300 }, to: { x: 400, y: 300 }, style: { routing: "straight" } });
  return { s, a, e };
}

describe("eraserHits", () => {
  it("takes a shape the eraser passes over", () => {
    const { s, a } = scene();
    expect(eraserHits(s.getState().document, { x: 50, y: 50 }).nodes).toEqual([a]);
  });

  it("takes a line anywhere along its length, not only at its ends", () => {
    const { s, e } = scene();
    expect(eraserHits(s.getState().document, { x: 200, y: 304 }).edges).toEqual([e]);
    expect(eraserHits(s.getState().document, { x: 200, y: 340 }).edges).toEqual([]);
  });

  it("takes nothing from empty canvas", () => {
    const { s } = scene();
    expect(eraserHits(s.getState().document, { x: 900, y: 900 })).toEqual({ nodes: [], edges: [] });
  });
});

describe("removeElements", () => {
  it("removes nodes and edges together as a single undo step", () => {
    const { s, a, e } = scene();
    const before = s.getState().past.length;
    s.getState().removeElements([a], [e]);
    expect(s.getState().document.nodes).toHaveLength(0);
    expect(s.getState().document.edges).toHaveLength(0);
    expect(s.getState().past.length).toBe(before + 1);
    s.getState().undo();
    expect(s.getState().document.nodes).toHaveLength(1);
    expect(s.getState().document.edges).toHaveLength(1);
  });

  it("takes a line attached to an erased shape with it", () => {
    const s = createEditorStore(emptyDocument());
    const a = s.getState().addNode({ shape: "rect", label: "A", position: { x: 0, y: 0 } });
    s.getState().addEdge({ from: a, to: { x: 500, y: 500 } });
    s.getState().removeElements([a], []);
    expect(s.getState().document.edges).toHaveLength(0);
  });

  it("does nothing, and records nothing, when nothing was hit", () => {
    const { s } = scene();
    const before = s.getState().past.length;
    s.getState().removeElements([], []);
    expect(s.getState().past.length).toBe(before);
  });
});

describe("eraser on overlapping shapes", () => {
  it("takes every shape under it, not only the one on top", () => {
    const s = createEditorStore(emptyDocument());
    const under = s.getState().addNode({ shape: "rect", label: "A", position: { x: 0, y: 0 }, size: { w: 100, h: 100 } });
    const over = s.getState().addNode({ shape: "rect", label: "B", position: { x: 40, y: 40 }, size: { w: 100, h: 100 } });
    // (60, 60) is inside both.
    expect(eraserHits(s.getState().document, { x: 60, y: 60 }).nodes.sort()).toEqual([under, over].sort());
  });
});
