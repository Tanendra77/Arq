import { describe, expect, it } from "vitest";
import { anchorOn, bendFromPoint, bendHandlePoint, edgeEnds, edgeLabelPoint, edgePath, edgeTangents, endpointRect } from "../src/edge-path";

const boxes = new Map([["a", { x: 0, y: 0, w: 100, h: 50 }], ["b", { x: 300, y: 0, w: 100, h: 50 }]]);
const boxA = { x: 0, y: 0, w: 100, h: 50 };

describe("endpointRect", () => {
  it("gives a point endpoint a degenerate box, so one anchor rule covers both kinds", () => {
    expect(endpointRect({ x: 7, y: 9 }, boxes)).toEqual({ x: 7, y: 9, w: 0, h: 0 });
  });

  it("returns undefined for a node that is not laid out", () => {
    expect(endpointRect("ghost", boxes)).toBeUndefined();
  });
});

describe("anchorOn", () => {
  it("takes the side facing the other end, not a fixed side", () => {
    expect(anchorOn(boxA, { x: 500, y: 25 })).toEqual({ x: 100, y: 25 }); // right
    expect(anchorOn(boxA, { x: -500, y: 25 })).toEqual({ x: 0, y: 25 }); // left
    expect(anchorOn(boxA, { x: 50, y: -500 })).toEqual({ x: 50, y: 0 }); // top
    expect(anchorOn(boxA, { x: 50, y: 500 })).toEqual({ x: 50, y: 50 }); // bottom
  });

  it("breaks an exact tie the same way every time, so exports stay byte-stable", () => {
    // Dead centre: every side midpoint is a different distance only because the box is wider than
    // it is tall, so use a square to force the tie. Right wins by declaration order.
    const square = { x: 0, y: 0, w: 100, h: 100 };
    expect(anchorOn(square, { x: 50, y: 50 })).toEqual({ x: 100, y: 50 });
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

  it("mounts each end on the side facing the other node", () => {
    // b sits to the right of a, so the line leaves a's right edge and lands on b's left.
    expect(edgeEnds({ id: "e", from: "a", to: "b" }, boxes)).toEqual({
      start: { x: 100, y: 25 },
      end: { x: 300, y: 25 },
    });
    // Reversed, the anchors swap with it rather than staying pinned right-to-left.
    expect(edgeEnds({ id: "e", from: "b", to: "a" }, boxes)).toEqual({
      start: { x: 300, y: 25 },
      end: { x: 100, y: 25 },
    });
  });

  it("mounts on the top edge when the other end is above", () => {
    const e = { id: "e", from: { x: 50, y: -300 }, to: "a" } as const;
    expect(edgeEnds(e, boxes)?.end).toEqual({ x: 50, y: 0 });
  });

  it("returns undefined when a referenced node is missing", () => {
    expect(edgeEnds({ id: "e", from: "ghost", to: "b" }, boxes)).toBeUndefined();
  });
});

describe("edgeLabelPoint", () => {
  const s = { x: 0, y: 0 };
  const t = { x: 100, y: 0 };

  it("puts start, middle and end labels at different points along the path", () => {
    expect(edgeLabelPoint(s, t, "straight", "start")).toEqual({ x: 20, y: 0 });
    expect(edgeLabelPoint(s, t, "straight", "middle")).toEqual({ x: 50, y: 0 });
    expect(edgeLabelPoint(s, t, "straight", "end")).toEqual({ x: 80, y: 0 });
  });

  it("agrees with edgePath's own midpoint at the middle position, for every routing", () => {
    const a = { x: 0, y: 0 };
    const b = { x: 140, y: 60 };
    for (const routing of ["straight", "curved", "orthogonal"] as const) {
      expect(edgeLabelPoint(a, b, routing, "middle")).toEqual(edgePath(a, b, routing).mid);
    }
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

describe("edgeTangents", () => {
  it("points out of each end along the path's own first and last segment", () => {
    const s = { x: 0, y: 0 };
    const e = { x: 100, y: 0 };
    // Straight: the end faces along travel, the start faces back out of the line.
    expect(edgeTangents(s, e, "straight")).toEqual({ startDir: { x: -1, y: 0 }, endDir: { x: 1, y: 0 } });
  });

  it("follows the last orthogonal leg, not the straight line between the ends", () => {
    // This route ends with a horizontal leg into the target even though the ends differ in y,
    // so a head at the end must lie flat, not tilt toward the start.
    const t = edgeTangents({ x: 0, y: 0 }, { x: 200, y: 100 }, "orthogonal");
    expect(t.endDir).toEqual({ x: 1, y: 0 });
    expect(t.startDir).toEqual({ x: -1, y: 0 });
  });
});

describe("orthogonal bend", () => {
  const s = { x: 0, y: 0 };
  const e = { x: 200, y: 100 };

  it("slides the middle leg along the span", () => {
    // Default 0.5 keeps the captured v1 route; a smaller bend moves the vertical leg leftwards.
    expect(edgePath(s, e, "orthogonal").d).toContain("L92 0");
    expect(edgePath(s, e, "orthogonal", 0.25).d).toContain("L42 0");
    expect(edgePath(s, e, "orthogonal", 0.75).d).toContain("L142 0");
  });

  it("puts the handle on the leg it moves, and reads a dragged position back", () => {
    expect(bendHandlePoint(s, e, "orthogonal", 0.5)).toEqual({ x: 100, y: 50 });
    expect(bendHandlePoint(s, e, "orthogonal", 0.25)).toEqual({ x: 50, y: 50 });
    expect(bendFromPoint(s, e, { x: 50, y: 999 })).toBe(0.25);
  });

  it("clamps a drag past either end into the schema's range", () => {
    expect(bendFromPoint(s, e, { x: -500, y: 0 })).toBe(0.05);
    expect(bendFromPoint(s, e, { x: 5000, y: 0 })).toBe(0.95);
  });

  it("offers no handle where there is no middle leg to move", () => {
    // A straight horizontal run, and the non-orthogonal modes.
    expect(bendHandlePoint({ x: 0, y: 50 }, { x: 200, y: 50 }, "orthogonal", 0.5)).toBeUndefined();
    expect(bendHandlePoint(s, e, "straight", 0.5)).toBeUndefined();
    expect(bendHandlePoint(s, e, "curved", 0.5)).toBeUndefined();
  });

  it("turns the arrowhead with the moved leg", () => {
    // The final leg stays horizontal however the bend slides, so the head stays flat.
    expect(edgeTangents(s, e, "orthogonal", 0.2).endDir).toEqual({ x: 1, y: 0 });
  });
});

describe("anchored endpoints", () => {
  const boxes2 = new Map([["a", { x: 0, y: 0, w: 100, h: 50 }], ["b", { x: 300, y: 0, w: 100, h: 50 }]]);

  it("meets the shape exactly where the author pinned it, not on the facing side", () => {
    // Top-left corner of a, even though b lies to the right and the automatic choice would be the
    // right edge.
    const e = { id: "e", from: { node: "a", ax: 0, ay: 0 }, to: "b" } as const;
    expect(edgeEnds(e, boxes2)?.start).toEqual({ x: 0, y: 0 });
  });

  it("tracks the shape through a move and a resize, because it stores fractions", () => {
    const e = { id: "e", from: { node: "a", ax: 0.5, ay: 1 }, to: "b" } as const;
    expect(edgeEnds(e, boxes2)?.start).toEqual({ x: 50, y: 50 });
    const moved = new Map([["a", { x: 200, y: 100, w: 40, h: 20 }], ["b", { x: 600, y: 0, w: 100, h: 50 }]]);
    expect(edgeEnds(e, moved)?.start).toEqual({ x: 220, y: 120 });
  });

  it("makes the other end aim at the pinned point rather than the shape's centre", () => {
    // A wide, flat target below a wide source: which side of the target faces the line then
    // depends on *where along* the source the line leaves, which is the whole point of aiming at
    // the pinned spot instead of the source's centre.
    const wide = new Map([
      ["a", { x: 0, y: -200, w: 400, h: 100 }],
      ["b", { x: 0, y: 0, w: 400, h: 20 }],
    ]);
    const fromLeft = edgeEnds({ id: "e", from: { node: "a", ax: 0, ay: 1 }, to: "b" }, wide)!;
    const fromRight = edgeEnds({ id: "e", from: { node: "a", ax: 1, ay: 1 }, to: "b" }, wide)!;
    expect(fromLeft.start).toEqual({ x: 0, y: -100 });
    expect(fromRight.start).toEqual({ x: 400, y: -100 });
    expect(fromLeft.end).toEqual({ x: 0, y: 10 }); // b's left edge
    expect(fromRight.end).toEqual({ x: 400, y: 10 }); // b's right edge
  });

  it("still resolves nothing when the pinned shape is missing", () => {
    expect(edgeEnds({ id: "e", from: { node: "ghost", ax: 0, ay: 0 }, to: "b" }, boxes2)).toBeUndefined();
  });
});
