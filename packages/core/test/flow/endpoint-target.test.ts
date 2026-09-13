import { describe, expect, it } from "vitest";
import { emptyDocument } from "@arq/schema";
import { createEditorStore } from "../../src/store/editor-store";
import { endpointFor, SNAP_MARGIN } from "../../src/flow/endpoint-target";

function docWithShape() {
  const s = createEditorStore(emptyDocument());
  const a = s.getState().addNode({ shape: "rect", label: "A", position: { x: 0, y: 0 }, size: { w: 100, h: 200 } });
  return { doc: s.getState().document, a };
}

describe("endpointFor", () => {
  it("binds to a shape it lands on, leaving the side to the renderer", () => {
    const { doc, a } = docWithShape();
    expect(endpointFor(doc, { x: 50, y: 100 }, false)).toBe(a);
  });

  it("still binds just outside the shape, within the snap margin", () => {
    const { doc, a } = docWithShape();
    expect(endpointFor(doc, { x: 100 + SNAP_MARGIN - 1, y: 100 }, false)).toBe(a);
    expect(endpointFor(doc, { x: 100 + SNAP_MARGIN + 5, y: 100 }, false)).toEqual({ x: 105 + SNAP_MARGIN, y: 100 });
  });

  it("pins the exact spot as fractions of the shape's box when asked", () => {
    const { doc, a } = docWithShape();
    expect(endpointFor(doc, { x: 25, y: 150 }, true)).toEqual({ node: a, ax: 0.25, ay: 0.75 });
  });

  it("does not pin to a shape the pointer is only near: an accidental anchor is worse than none", () => {
    const { doc, a } = docWithShape();
    // Inside the snap margin but outside the shape — binds, but without an anchor.
    expect(endpointFor(doc, { x: 106, y: 100 }, true)).toBe(a);
  });

  it("falls back to a loose point away from every shape, pinned or not", () => {
    const { doc } = docWithShape();
    expect(endpointFor(doc, { x: 900, y: 900 }, true)).toEqual({ x: 900, y: 900 });
  });
});
