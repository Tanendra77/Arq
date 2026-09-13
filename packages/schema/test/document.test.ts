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
    // shape is present and valid, so .strict() rejecting the unknown `type` key is the only
    // thing that can fail this — without a valid shape it would fail for a missing key instead.
    expect(
      DocumentSchema.safeParse({ ...base, nodes: [{ id: "a", shape: "rect", type: "broker", label: "A" }] }).success,
    ).toBe(false);
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

describe("document-level refinements", () => {
  it("rejects duplicate node ids", () => {
    const r = DocumentSchema.safeParse({ ...base, nodes: [node("a"), node("a")] });
    expect(r.success).toBe(false);
    if (!r.success) expect(JSON.stringify(r.error.issues)).toContain("duplicate node id");
  });

  it("rejects a node whose group does not exist", () => {
    const doc = { ...base, nodes: [{ id: "a", shape: "rect", label: "A", group: "ghost" }] };
    const r = DocumentSchema.safeParse(doc);
    expect(r.success).toBe(false);
    if (!r.success) expect(JSON.stringify(r.error.issues)).toContain("missing group");
  });

  it("rejects a group parent cycle", () => {
    const doc = {
      ...base,
      groups: [
        { id: "g1", label: "G1", kind: "generic", parent: "g2" },
        { id: "g2", label: "G2", kind: "generic", parent: "g1" },
      ],
    };
    const r = DocumentSchema.safeParse(doc);
    expect(r.success).toBe(false);
    if (!r.success) expect(JSON.stringify(r.error.issues)).toContain("cycle");
  });

  it("rejects a node id using the reserved __ep: prefix", () => {
    const doc = { ...base, nodes: [{ id: "__ep:e1:from", shape: "rect", label: "A" }] };
    const r = DocumentSchema.safeParse(doc);
    expect(r.success).toBe(false);
    if (!r.success) expect(JSON.stringify(r.error.issues)).toContain("reserved");
  });

  it("rejects an edge or group id using the reserved __ep: prefix", () => {
    const edgeDoc = { ...base, nodes: [node("a"), node("b")], edges: [{ id: "__ep:x", from: "a", to: "b" }] };
    const groupDoc = { ...base, groups: [{ id: "__ep:g", label: "G", kind: "generic" }] };
    const edgeResult = DocumentSchema.safeParse(edgeDoc);
    const groupResult = DocumentSchema.safeParse(groupDoc);
    expect(edgeResult.success).toBe(false);
    expect(groupResult.success).toBe(false);
    if (!edgeResult.success) expect(JSON.stringify(edgeResult.error.issues)).toContain("reserved");
    if (!groupResult.success) expect(JSON.stringify(groupResult.error.issues)).toContain("reserved");
  });

  it("still accepts an ordinary id containing _ or : elsewhere", () => {
    const doc = { ...base, nodes: [{ id: "my_node:1", shape: "rect", label: "A" }] };
    expect(DocumentSchema.safeParse(doc).success).toBe(true);
  });

  it("rejects tuple-form pinned entries", () => {
    // Node "a" exists so the pinned-orphan check can't be what fails this — only PinnedSchema's
    // object shape can.
    const doc = { ...base, nodes: [node("a")], layout: { pinned: { a: [10, 20] } } };
    const r = DocumentSchema.safeParse(doc);
    expect(r.success).toBe(false);
    if (!r.success) {
      const issue = r.error.issues.find((i) => i.path.join(".") === "layout.pinned.a");
      expect(issue).toBeDefined();
      expect(issue?.message).not.toMatch(/matches no node or group/);
    }
  });
});

describe("canvasBackground", () => {
  it("accepts a valid hex background", () => {
    expect(DocumentSchema.safeParse({ ...base, canvasBackground: "#112233" }).success).toBe(true);
  });

  it("rejects a non-hex value", () => {
    const r = DocumentSchema.safeParse({ ...base, canvasBackground: "blue" });
    expect(r.success).toBe(false);
  });

  it("still parses without the field", () => {
    const r = DocumentSchema.safeParse(base);
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.canvasBackground).toBeUndefined();
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
