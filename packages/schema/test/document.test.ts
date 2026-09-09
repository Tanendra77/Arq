import { describe, expect, it } from "vitest";
import { DocumentSchema, emptyDocument, NODE_TYPES, EDGE_KINDS } from "../src/index";
import fixture from "./fixtures/event-flow.json";

const clone = () => JSON.parse(JSON.stringify(fixture)) as Record<string, unknown>;

describe("DocumentSchema", () => {
  it("accepts the event-flow fixture", () => {
    const r = DocumentSchema.safeParse(fixture);
    expect(r.success).toBe(true);
  });

  it("applies the queue durable default", () => {
    const doc = DocumentSchema.parse(fixture);
    const q = doc.nodes.find((n) => n.id === "q-orders");
    expect(q?.type === "queue" && q.props.durable).toBe(true);
  });

  it("lists the eleven node types and eight edge kinds", () => {
    expect(NODE_TYPES).toHaveLength(11);
    expect(EDGE_KINDS).toHaveLength(8);
  });

  it("rejects an unknown prop on a typed node with the node id in the message", () => {
    const d = clone();
    (d.nodes as Array<{ id: string; props: Record<string, unknown> }>)[1]!.props.colour = "red";
    const r = DocumentSchema.safeParse(d);
    expect(r.success).toBe(false);
    if (!r.success) expect(JSON.stringify(r.error.issues)).toMatch(/colour/);
  });

  it("accepts anything on a shape node", () => {
    const d = clone();
    (d.nodes as unknown[]).push({ id: "s1", type: "shape", label: "Thing", props: { anything: "goes" } });
    (d.layout as { pinned: Record<string, unknown> }).pinned.s1 = { x: 0, y: 0 };
    expect(DocumentSchema.safeParse(d).success).toBe(true);
  });

  it("rejects an edge that references a missing node", () => {
    const d = clone();
    (d.edges as Array<{ to: string }>)[0]!.to = "nope";
    const r = DocumentSchema.safeParse(d);
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues[0]?.message).toMatch(/nope/);
  });

  it("rejects a node whose group does not exist", () => {
    const d = clone();
    (d.nodes as Array<{ group?: string }>)[0]!.group = "ghost";
    expect(DocumentSchema.safeParse(d).success).toBe(false);
  });

  it("rejects a group parent cycle", () => {
    const d = clone();
    d.groups = [
      { id: "a", label: "A", kind: "region", parent: "b" },
      { id: "b", label: "B", kind: "region", parent: "a" },
      { id: "mumbai-dc", label: "Mumbai DC", kind: "dc" }
    ];
    const r = DocumentSchema.safeParse(d);
    expect(r.success).toBe(false);
    if (!r.success) expect(JSON.stringify(r.error.issues)).toMatch(/cycle/i);
  });

  it("rejects tuple-form pinned entries", () => {
    const d = clone();
    (d.layout as { pinned: Record<string, unknown> }).pinned.oms = [40, 80];
    expect(DocumentSchema.safeParse(d).success).toBe(false);
  });

  it("rejects duplicate node ids", () => {
    const d = clone();
    (d.nodes as unknown[]).push({ id: "oms", type: "app", label: "dup", props: {} });
    expect(DocumentSchema.safeParse(d).success).toBe(false);
  });

  it("emptyDocument validates", () => {
    expect(DocumentSchema.safeParse(emptyDocument("New")).success).toBe(true);
  });
});
