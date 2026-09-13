import { describe, expect, it } from "vitest";
import { ColorSchema, EdgeStyleSchema, NodeStyleSchema, NODE_SHAPES } from "../src/shapes";

describe("ColorSchema", () => {
  it("accepts 3 and 6 digit hex, rejects everything else", () => {
    expect(ColorSchema.safeParse("#abc").success).toBe(true);
    expect(ColorSchema.safeParse("#A1B2C3").success).toBe(true);
    expect(ColorSchema.safeParse("red").success).toBe(false);
    expect(ColorSchema.safeParse("#abcd").success).toBe(false);
    expect(ColorSchema.safeParse("rgb(0,0,0)").success).toBe(false);
  });
});

describe("style schemas", () => {
  it("keeps the original five shapes first, in their original order", () => {
    // Appending rather than inserting keeps every existing document's shape name meaning what it did.
    expect(NODE_SHAPES.slice(0, 5)).toEqual(["rect", "ellipse", "diamond", "triangle", "text"]);
    for (const s of ["polygon", "star", "parallelogram", "cylinder", "cloud", "note", "bubble", "freehand"]) {
      expect(NODE_SHAPES).toContain(s);
    }
  });

  it("accepts an empty style and a fully populated one", () => {
    expect(NodeStyleSchema.safeParse({}).success).toBe(true);
    const full = { fill: "#fff", stroke: "#000", strokeWidth: 2, strokeDash: "dashed",
                   radius: 8, fontSize: 14, textAlign: "center", glow: { color: "#0ff" } };
    expect(NodeStyleSchema.safeParse(full).success).toBe(true);
  });

  it("rejects unknown style keys and bad enums", () => {
    expect(NodeStyleSchema.safeParse({ shadow: true }).success).toBe(false);
    expect(EdgeStyleSchema.safeParse({ routing: "wiggly" }).success).toBe(false);
    expect(EdgeStyleSchema.safeParse({ endArrow: "star" }).success).toBe(false);
  });

  it("accepts every arrow style on either end", () => {
    for (const a of ["none", "arrow", "triangle", "diamond", "circle"]) {
      expect(EdgeStyleSchema.safeParse({ startArrow: a, endArrow: a }).success).toBe(true);
    }
  });

  it("rejects a non-positive stroke width", () => {
    expect(NodeStyleSchema.safeParse({ strokeWidth: 0 }).success).toBe(false);
    expect(NodeStyleSchema.safeParse({ strokeWidth: -1 }).success).toBe(false);
  });
});
