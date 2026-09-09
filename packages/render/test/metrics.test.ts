import { describe, expect, it } from "vitest";
import { METRICS, nodeHeight, nodeRect, wrapLabel, edgeAnchors } from "../src/index";

describe("wrapLabel", () => {
  it("keeps short labels on one line", () => {
    expect(wrapLabel("OMS")).toEqual(["OMS"]);
  });
  it("wraps on spaces at labelMaxChars", () => {
    expect(wrapLabel("Primary broker in Mumbai")).toEqual(["Primary broker", "in Mumbai"]);
  });
  it("breaks a single long token", () => {
    expect(wrapLabel("Q/ORDERS/NEW/VERY/LONG/NAME")).toEqual(["Q/ORDERS/NEW/VER", "Y/LONG/NAME"]);
  });
  it("caps at three lines with an ellipsis", () => {
    const lines = wrapLabel("one two three four five six seven eight nine ten eleven twelve");
    expect(lines).toHaveLength(3);
    expect(lines[2]?.endsWith("…")).toBe(true);
  });
});

describe("nodeRect", () => {
  it("uses fixed width and a height from the wrapped label", () => {
    const r = nodeRect({ x: 10, y: 20 }, "OMS");
    expect(r).toEqual({ x: 10, y: 20, w: METRICS.nodeWidth, h: nodeHeight("OMS") });
    expect(nodeHeight("OMS")).toBe(6 + 48 + 4 + 16 + 4 + 12 + 6);
    expect(nodeHeight("Primary broker in Mumbai")).toBe(nodeHeight("OMS") + 16);
  });
  it("defaults to the origin when unpinned", () => {
    expect(nodeRect(undefined, "x")).toMatchObject({ x: 0, y: 0 });
  });
});

describe("edgeAnchors", () => {
  it("anchors at right-center and left-center", () => {
    const a = edgeAnchors({ x: 0, y: 0, w: 120, h: 96 }, { x: 300, y: 100, w: 120, h: 96 });
    expect(a).toEqual({ start: { x: 120, y: 48 }, end: { x: 300, y: 148 } });
  });
});
