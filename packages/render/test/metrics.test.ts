import { describe, expect, it } from "vitest";
import {
  DEFAULT_NODE_SIZE,
  METRICS,
  resolveEdgeStyle,
  resolveNodeStyle,
  shapeOutline,
  shapeRect,
  STYLE_DEFAULTS,
  wrapLabel,
} from "../src/metrics";

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

describe("shapeRect", () => {
  it("uses the default size when pinned has no w/h", () => {
    expect(shapeRect({ x: 5, y: 6 }, "rect")).toEqual({ x: 5, y: 6, w: DEFAULT_NODE_SIZE.w, h: DEFAULT_NODE_SIZE.h });
  });

  it("honours an explicit size", () => {
    expect(shapeRect({ x: 0, y: 0, w: 200, h: 90 }, "ellipse")).toEqual({ x: 0, y: 0, w: 200, h: 90 });
  });

  it("gives text a shorter default box", () => {
    expect(shapeRect({ x: 0, y: 0 }, "text").h).toBeLessThan(DEFAULT_NODE_SIZE.h);
  });

  it("treats a missing pinned entry as the origin", () => {
    expect(shapeRect(undefined, "rect")).toEqual({ x: 0, y: 0, w: DEFAULT_NODE_SIZE.w, h: DEFAULT_NODE_SIZE.h });
  });

  it("is tall enough for an icon-bearing node's icon, gap and one label line", () => {
    expect(DEFAULT_NODE_SIZE.h).toBeGreaterThanOrEqual(
      METRICS.padding * 2 + METRICS.iconSize + METRICS.gap + METRICS.labelLineHeight,
    );
  });
});

describe("shapeOutline", () => {
  const r = { x: 0, y: 0, w: 100, h: 50 };

  it("emits a rect with the given corner radius", () => {
    expect(shapeOutline("rect", r, 8)).toContain('rx="8"');
  });

  it("emits an ellipse inscribed in the box", () => {
    const out = shapeOutline("ellipse", r, 0);
    expect(out).toContain('cx="50"');
    expect(out).toContain('cy="25"');
    expect(out).toContain('rx="50"');
    expect(out).toContain('ry="25"');
  });

  it("emits the diamond points top,right,bottom,left in conventional x,y form", () => {
    expect(shapeOutline("diamond", r, 0)).toBe('<polygon points="50,0 100,25 50,50 0,25"/>');
  });

  it("emits the triangle points apex,bottom-right,bottom-left in conventional x,y form", () => {
    expect(shapeOutline("triangle", r, 0)).toBe('<polygon points="50,0 100,50 0,50"/>');
  });

  it("emits nothing for text", () => {
    expect(shapeOutline("text", r, 0)).toBe("");
  });
});

describe("style resolution", () => {
  it("falls back to built-in constants, not to anything machine-local", () => {
    const s = resolveNodeStyle(undefined);
    expect(s.fill).toBe(STYLE_DEFAULTS.node.fill);
    expect(s.stroke).toBe(STYLE_DEFAULTS.node.stroke);
    expect(s.strokeWidth).toBe(STYLE_DEFAULTS.node.strokeWidth);
  });

  it("lets an explicit value win over the default", () => {
    expect(resolveNodeStyle({ fill: "#123456" }).fill).toBe("#123456");
    expect(resolveEdgeStyle({ routing: "curved" }).routing).toBe("curved");
  });

  it("keeps an explicit value that happens to equal the default", () => {
    expect(resolveNodeStyle({ fill: STYLE_DEFAULTS.node.fill }).fill).toBe(STYLE_DEFAULTS.node.fill);
  });
});
