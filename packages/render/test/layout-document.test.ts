import { DocumentSchema } from "@arq/schema";
import { describe, expect, it } from "vitest";
import { layoutDocument } from "../src/layout-document";

describe("layoutDocument bounds", () => {
  it("falls back to the empty-canvas default when there are no nodes, groups or edges", () => {
    const doc = DocumentSchema.parse({ version: 2 });
    const { bounds } = layoutDocument(doc);
    expect(bounds).toEqual({ x: -40, y: -40, w: 80, h: 80 });
  });

  it("includes a free-floating edge's endpoints so the line is not clipped, even with no nodes or groups", () => {
    const doc = DocumentSchema.parse({
      version: 2,
      edges: [{ id: "e1", from: { x: 500, y: 500 }, to: { x: 600, y: 550 } }],
    });
    const { bounds } = layoutDocument(doc);
    expect(bounds.x).toBeLessThanOrEqual(500 - 40);
    expect(bounds.y).toBeLessThanOrEqual(500 - 40);
    expect(bounds.x + bounds.w).toBeGreaterThanOrEqual(600 + 40);
    expect(bounds.y + bounds.h).toBeGreaterThanOrEqual(550 + 40);
  });
});
