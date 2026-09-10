import { describe, expect, it } from "vitest";
import { edgeEnds, edgePath, resolveEndpoint } from "../src/edge-path";

const boxes = new Map([["a", { x: 0, y: 0, w: 100, h: 50 }], ["b", { x: 300, y: 0, w: 100, h: 50 }]]);

describe("resolveEndpoint", () => {
  it("returns a point endpoint verbatim", () => {
    expect(resolveEndpoint({ x: 7, y: 9 }, boxes)).toEqual({ x: 7, y: 9 });
  });

  it("anchors a node endpoint on its box edge", () => {
    expect(resolveEndpoint("a", boxes)).toEqual({ x: 100, y: 25 });
  });

  it("returns undefined for a node that is not laid out", () => {
    expect(resolveEndpoint("ghost", boxes)).toBeUndefined();
  });
});

describe("edgeEnds", () => {
  it("resolves a fully free edge", () => {
    const e = { id: "e", from: { x: 0, y: 0 }, to: { x: 10, y: 0 } };
    expect(edgeEnds(e, boxes)).toEqual({ start: { x: 0, y: 0 }, end: { x: 10, y: 0 } });
  });

  it("resolves a half-attached edge", () => {
    const e = { id: "e", from: "a", to: { x: 200, y: 25 } };
    expect(edgeEnds(e, boxes)?.end).toEqual({ x: 200, y: 25 });
  });

  it("returns undefined when a referenced node is missing", () => {
    expect(edgeEnds({ id: "e", from: "ghost", to: "b" }, boxes)).toBeUndefined();
  });
});

describe("edgePath routing", () => {
  const s = { x: 0, y: 0 };
  const e = { x: 100, y: 40 };

  it("straight is a single line segment", () => {
    const { d } = edgePath(s, e, "straight");
    expect(d).toBe("M0 0 L100 40");
  });

  it("straight puts the label at the geometric midpoint", () => {
    expect(edgePath(s, e, "straight").mid).toEqual({ x: 50, y: 20 });
  });

  it("curved emits a cubic bezier", () => {
    expect(edgePath(s, e, "curved").d).toMatch(/^M0 0 C/);
  });

  it("orthogonal keeps the v1 rounded polyline", () => {
    const { d } = edgePath(s, e, "orthogonal");
    expect(d.startsWith("M0 0")).toBe(true);
    expect(d).toContain("Q");
  });

  it("every mode is deterministic for the same input", () => {
    for (const mode of ["straight", "curved", "orthogonal"] as const) {
      expect(edgePath(s, e, mode)).toEqual(edgePath(s, e, mode));
    }
  });
});

describe("orthogonal routing parity with v1 (no drift)", () => {
  it("matches the captured v1 baseline for horizontal, diagonal, backward and short-vertical cases", () => {
    expect(edgePath({ x: 0, y: 50 }, { x: 200, y: 50 }, "orthogonal")).toEqual({
      d: "M0 50 L200 50",
      mid: { x: 100, y: 50 },
    });
    expect(edgePath({ x: 0, y: 0 }, { x: 200, y: 100 }, "orthogonal")).toEqual({
      d: "M0 0 L92 0 Q100 0 100 8 L100 92 Q100 100 108 100 L200 100",
      mid: { x: 100, y: 50 },
    });
    expect(edgePath({ x: 300, y: 48 }, { x: 0, y: 48 }, "orthogonal")).toEqual({
      d: "M300 48 L312 48 Q320 48 320 56 L320 100 Q320 108 312 108 L-12 108 Q-20 108 -20 100 L-20 56 Q-20 48 -12 48 L0 48",
      mid: { x: 150, y: 108 },
    });
    expect(edgePath({ x: 500, y: 10 }, { x: 100, y: 200 }, "orthogonal")).toEqual({
      d: "M500 10 L512 10 Q520 10 520 18 L520 252 Q520 260 512 260 L88 260 Q80 260 80 252 L80 208 Q80 200 88 200 L100 200",
      mid: { x: 395, y: 260 },
    });
    expect(edgePath({ x: -50, y: 0 }, { x: -300, y: 0 }, "orthogonal")).toEqual({
      d: "M-50 0 L-38 0 Q-30 0 -30 8 L-30 52 Q-30 60 -38 60 L-312 60 Q-320 60 -320 52 L-320 8 Q-320 0 -312 0 L-300 0",
      mid: { x: -175, y: 60 },
    });
    expect(edgePath({ x: 0, y: 0 }, { x: 200, y: 6 }, "orthogonal")).toEqual({
      d: "M0 0 L100 0 L100 6 L200 6",
      mid: { x: 100, y: 3 },
    });
  });
});
