import { describe, expect, it } from "vitest";
import { migrate, MigrationError } from "../src/migrate";
import { DocumentSchema } from "../src/document";

const v1 = {
  version: 1,
  title: "Old",
  nodes: [
    { id: "pr", type: "broker", label: "PR", props: { vpn: "default", role: "primary" } },
    { id: "oms", type: "app", label: "OMS", props: {} },
    { id: "s", type: "shape", label: "Box", props: {} },
    { id: "q", type: "queue", label: "Q", props: { durable: true } },
  ],
  edges: [
    { id: "e1", from: "oms", to: "pr", kind: "publish", props: { qos: "guaranteed" } },
    { id: "e2", from: "pr", to: "oms", kind: "bind", props: {} },
    { id: "e3", from: "pr", to: "oms", kind: "replication", props: { durable: true, retries: 3 } },
  ],
  layout: { pinned: { pr: { x: 10, y: 20 } } },
};

describe("migrate v1 -> v2", () => {
  it("produces a document the v2 schema accepts", () => {
    expect(DocumentSchema.safeParse(migrate(v1)).success).toBe(true);
  });

  it("turns domain types into rects carrying a solace icon id", () => {
    const d = DocumentSchema.parse(migrate(v1));
    const pr = d.nodes.find((n) => n.id === "pr")!;
    expect(pr.shape).toBe("rect");
    expect(pr.icon).toBe("solace/broker");
  });

  it("leaves a v1 shape node without an icon", () => {
    const d = DocumentSchema.parse(migrate(v1));
    expect(d.nodes.find((n) => n.id === "s")!.icon).toBeUndefined();
  });

  it("preserves props in meta rather than dropping them", () => {
    const d = DocumentSchema.parse(migrate(v1));
    expect(d.nodes.find((n) => n.id === "pr")!.meta).toEqual({ vpn: "default", role: "primary" });
  });

  it("omits meta entirely when props were empty", () => {
    const d = DocumentSchema.parse(migrate(v1));
    expect(d.nodes.find((n) => n.id === "oms")!.meta).toBeUndefined();
  });

  it("stringifies a boolean node prop rather than dropping it", () => {
    const d = DocumentSchema.parse(migrate(v1));
    expect(d.nodes.find((n) => n.id === "q")!.meta).toEqual({ durable: "true" });
  });

  it("preserves edge kind and maps its visual treatment to style", () => {
    const d = DocumentSchema.parse(migrate(v1));
    const e1 = d.edges.find((e) => e.id === "e1")!;
    const e2 = d.edges.find((e) => e.id === "e2")!;
    expect(e1.kind).toBe("publish");
    expect(e1.style?.endArrow).toBe("arrow");
    expect(e2.kind).toBe("bind");
    expect(e2.style?.strokeDash).toBe("dashed");
    expect(e2.style?.endArrow).toBe("none");
  });

  it("preserves edge props in meta rather than dropping them", () => {
    const d = DocumentSchema.parse(migrate(v1));
    expect(d.edges.find((e) => e.id === "e1")!.meta).toEqual({ qos: "guaranteed" });
  });

  it("omits edge meta entirely when props were empty", () => {
    const d = DocumentSchema.parse(migrate(v1));
    expect(d.edges.find((e) => e.id === "e2")!.meta).toBeUndefined();
  });

  it("stringifies non-string edge prop values (booleans, numbers) rather than dropping them", () => {
    const d = DocumentSchema.parse(migrate(v1));
    expect(d.edges.find((e) => e.id === "e3")!.meta).toEqual({ durable: "true", retries: "3" });
  });

  it("keeps layout untouched", () => {
    const d = DocumentSchema.parse(migrate(v1));
    expect(d.layout.pinned["pr"]).toEqual({ x: 10, y: 20 });
  });

  it("passes a v2 document through unchanged", () => {
    const v2 = { version: 2, title: "New", nodes: [], edges: [] };
    expect(migrate(v2)).toBe(v2);
  });

  it("throws on an unknown version", () => {
    expect(() => migrate({ version: 99 })).toThrow(MigrationError);
    expect(() => migrate({})).toThrow(MigrationError);
  });
});
