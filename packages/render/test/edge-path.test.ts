import { describe, expect, it } from "vitest";
import { edgePath } from "../src/index";

describe("edgePath", () => {
  it("draws a straight line when the endpoints are horizontally aligned", () => {
    expect(edgePath({ x: 0, y: 50 }, { x: 200, y: 50 })).toEqual({ d: "M0 50 L200 50", mid: { x: 100, y: 50 } });
  });
  it("routes forward with two rounded corners at the horizontal midpoint", () => {
    const { d, mid } = edgePath({ x: 0, y: 0 }, { x: 200, y: 100 });
    expect(d).toBe("M0 0 L92 0 Q100 0 100 8 L100 92 Q100 100 108 100 L200 100");
    expect(mid).toEqual({ x: 100, y: 50 });
  });
  it("routes backward below both nodes when the target is left of the source", () => {
    const { d } = edgePath({ x: 300, y: 48 }, { x: 0, y: 48 });
    expect(d.startsWith("M300 48 L")).toBe(true);
    expect(d.endsWith("L0 48")).toBe(true);
    expect(d).toMatch(/L-20 /);
    expect(d).toMatch(/L320 /);
  });
  it("skips corner rounding when the vertical run is too short", () => {
    const { d } = edgePath({ x: 0, y: 0 }, { x: 200, y: 6 });
    expect(d).toBe("M0 0 L100 0 L100 6 L200 6");
  });
});
