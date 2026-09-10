import { describe, expect, it } from "vitest";
import { DocumentSchema, emptyDocument, isNodeRef } from "../src/document";

const base = { version: 2, title: "T" };
const node = (id: string) => ({ id, shape: "rect", label: id });

describe("nodes", () => {
  it("accepts every shape and rejects an unknown one", () => {
    for (const shape of ["rect", "ellipse", "diamond", "triangle", "text"]) {
      expect(DocumentSchema.safeParse({ ...base, nodes: [{ id: "a", shape, label: "A" }] }).success).toBe(true);
    }
    expect(DocumentSchema.safeParse({ ...base, nodes: [{ id: "a", shape: "hexagon", label: "A" }] }).success).toBe(false);
  });

  it("rejects a leftover v1 type field", () => {
    expect(DocumentSchema.safeParse({ ...base, nodes: [{ id: "a", type: "broker", label: "A" }] }).success).toBe(false);
  });

  it("carries optional style and meta", () => {
    const r = DocumentSchema.safeParse({
      ...base,
      nodes: [{ id: "a", shape: "rect", label: "A", style: { fill: "#eee" }, meta: { vpn: "default" } }],
    });
    expect(r.success).toBe(true);
  });
});

describe("edge endpoints", () => {
  it("accepts a node id, a point, and a mix", () => {
    const doc = {
      ...base,
      nodes: [node("a"), node("b")],
      edges: [
        { id: "e1", from: "a", to: "b" },
        { id: "e2", from: { x: 0, y: 0 }, to: { x: 10, y: 10 } },
        { id: "e3", from: "a", to: { x: 5, y: 5 } },
      ],
    };
    expect(DocumentSchema.safeParse(doc).success).toBe(true);
  });

  it("rejects a string endpoint naming a missing node", () => {
    const r = DocumentSchema.safeParse({ ...base, nodes: [node("a")], edges: [{ id: "e1", from: "a", to: "ghost" }] });
    expect(r.success).toBe(false);
    expect(JSON.stringify(r)).toContain("ghost");
  });

  it("does not treat a point endpoint as a missing reference", () => {
    const r = DocumentSchema.safeParse({ ...base, nodes: [], edges: [{ id: "e1", from: { x: 1, y: 2 }, to: { x: 3, y: 4 } }] });
    expect(r.success).toBe(true);
  });

  it("still rejects duplicate edge ids", () => {
    const doc = { ...base, nodes: [node("a"), node("b")],
                  edges: [{ id: "e1", from: "a", to: "b" }, { id: "e1", from: "b", to: "a" }] };
    expect(DocumentSchema.safeParse(doc).success).toBe(false);
  });

  it("accepts an optional free-text kind", () => {
    const doc = { ...base, nodes: [node("a"), node("b")], edges: [{ id: "e1", from: "a", to: "b", kind: "publish" }] };
    expect(DocumentSchema.safeParse(doc).success).toBe(true);
  });

  it("carries optional meta so v1 edge props survive migration", () => {
    const doc = {
      ...base,
      nodes: [node("a"), node("b")],
      edges: [{ id: "e1", from: "a", to: "b", meta: { qos: "guaranteed" } }],
    };
    expect(DocumentSchema.safeParse(doc).success).toBe(true);
  });

  it("rejects a non-string edge meta value", () => {
    const doc = {
      ...base,
      nodes: [node("a"), node("b")],
      edges: [{ id: "e1", from: "a", to: "b", meta: { qos: 1 } }],
    };
    expect(DocumentSchema.safeParse(doc).success).toBe(false);
  });
});

describe("isNodeRef", () => {
  it("distinguishes ids from points", () => {
    expect(isNodeRef("a")).toBe(true);
    expect(isNodeRef({ x: 0, y: 0 })).toBe(false);
  });
});

describe("emptyDocument", () => {
  it("is version 2 and valid", () => {
    const d = emptyDocument("Hello");
    expect(d.version).toBe(2);
    expect(d.title).toBe("Hello");
    expect(d.nodes).toEqual([]);
  });
});
