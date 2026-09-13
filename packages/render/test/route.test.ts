import { describe, expect, it } from "vitest";
import {
  beginLegDrag, dragLeg, edgePath, edgePolyline, edgeTangents, legHandles, legPoints, legsFromPoints, viaInsertPoints,
} from "../src/edge-path";

const s = { x: 0, y: 0 };
const e = { x: 200, y: 100 };

describe("hand-shaped right-angled routes", () => {
  it("legs alternate x and y, and always finish onto the end", () => {
    expect(legPoints(s, e, [])).toEqual([s, { x: 200, y: 0 }, e]);
    expect(legPoints(s, e, [80])).toEqual([s, { x: 80, y: 0 }, { x: 80, y: 100 }, e]);
    expect(legPoints(s, e, [80, 40, 150])).toEqual([s, { x: 80, y: 0 }, { x: 80, y: 40 }, { x: 150, y: 40 }, { x: 150, y: 100 }, e]);
  });

  it("an automatic route turns into legs that draw exactly the same line", () => {
    for (const end of [e, { x: -100, y: 60 }, { x: 300, y: -40 }]) {
      const auto = edgePolyline(s, end, "orthogonal");
      const legs = legsFromPoints(auto);
      expect(edgePath(s, end, "orthogonal", { legs }).d).toBe(edgePath(s, end, "orthogonal").d);
    }
  });

  it("grabbing a middle leg moves it; grabbing an end leg adds a turn without moving anything yet", () => {
    expect(beginLegDrag(s, e, [80], 1)).toEqual({ legs: [80], index: 0 });
    const front = beginLegDrag(s, e, [80], 0);
    expect(front).toEqual({ legs: [40, 0, 80], index: 1 });
    expect(edgePath(s, e, "orthogonal", { legs: front.legs }).d).toBe(edgePath(s, e, "orthogonal", { legs: [80] }).d);
    const back = beginLegDrag(s, e, [80], 2);
    expect(back.index).toBe(1);
    expect(edgePath(s, e, "orthogonal", { legs: back.legs }).d).toBe(edgePath(s, e, "orthogonal", { legs: [80] }).d);
  });

  it("a dragged leg follows the pointer across its axis and snaps level with an end", () => {
    expect(dragLeg(s, e, [40, 0, 80], 1, { x: 999, y: 37.4 })).toEqual([40, 37, 80]);
    expect(dragLeg(s, e, [40, 0, 80], 1, { x: 0, y: 97 })).toEqual([40, 100, 80]);
  });

  it("offers a handle per leg long enough to grab, across the right axis", () => {
    const hs = legHandles(s, e, [80]);
    expect(hs.map((h) => [h.segment, h.horizontal])).toEqual([[0, true], [1, false], [2, true]]);
    expect(legHandles(s, e, [5])).toHaveLength(2); // the 5px first leg is too short to offer one
  });

  it("the arrowhead follows the last real leg, not a zero-length one", () => {
    expect(edgeTangents(s, e, "orthogonal", { legs: [40, 0, 80] }).endDir).toEqual({ x: 1, y: 0 });
  });
});

describe("via points", () => {
  it("a straight line runs through them, and a curve passes through each one", () => {
    expect(edgePath(s, { x: 200, y: 0 }, "straight", { via: [{ x: 100, y: 50 }] }).d).toBe("M0 0 L100 50 L200 0");
    const curve = edgePolyline(s, { x: 200, y: 0 }, "curved", { via: [{ x: 100, y: 50 }] });
    expect(curve).toContainEqual({ x: 100, y: 50 });
  });

  it("offers an add-a-bend handle between each pair of neighbours", () => {
    expect(viaInsertPoints(s, { x: 200, y: 0 }, "straight", [{ x: 100, y: 50 }])).toEqual([{ x: 50, y: 25 }, { x: 150, y: 25 }]);
  });

  it("an edge with nothing shaped draws exactly what it always did", () => {
    expect(edgePath(s, e, "curved", { via: [] })).toEqual(edgePath(s, e, "curved"));
    expect(edgePath(s, e, "orthogonal", { bend: 0.3 })).toEqual(edgePath(s, e, "orthogonal", 0.3));
  });
});
