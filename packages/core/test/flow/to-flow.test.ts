import { describe, expect, it } from "vitest";
import { DocumentSchema } from "@arq/schema";
import { toFlow } from "../../src/flow/to-flow";

const doc = DocumentSchema.parse({
  version: 2, title: "T",
  nodes: [{ id: "a", shape: "ellipse", label: "A", style: { fill: "#ff0000" } }],
  edges: [{ id: "e1", from: "a", to: { x: 200, y: 10 }, style: { routing: "curved" } }],
  layout: { pinned: { a: { x: 10, y: 20 } } },
});

describe("toFlow", () => {
  it("carries shape and style onto node data", () => {
    const { nodes } = toFlow(doc, () => undefined, { nodes: [], edges: [] });
    expect(nodes[0]?.data.shape).toBe("ellipse");
    expect(nodes[0]?.data.style?.fill).toBe("#ff0000");
  });

  it("marks selection", () => {
    const { nodes } = toFlow(doc, () => undefined, { nodes: ["a"], edges: [] });
    expect(nodes[0]?.selected).toBe(true);
  });

  it("keeps a half-attached edge, using a synthetic node for the loose end", () => {
    const { edges, nodes } = toFlow(doc, () => undefined, { nodes: [], edges: [] });
    expect(edges).toHaveLength(1);
    expect(nodes.some((n) => n.id === edges[0]?.target)).toBe(true);
  });

  it("carries a node's pinned rect onto its data, so the canvas can render it at its exported size", () => {
    const withSize = DocumentSchema.parse({
      version: 2, title: "T",
      nodes: [{ id: "a", shape: "rect", label: "A" }],
      layout: { pinned: { a: { x: 10, y: 20, w: 300, h: 150 } } },
    });
    const { nodes } = toFlow(withSize, () => undefined, { nodes: [], edges: [] });
    expect(nodes[0]?.data.pinned).toEqual({ x: 10, y: 20, w: 300, h: 150 });
  });
});
