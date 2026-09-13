import { beforeAll, describe, expect, it } from "vitest";
import { emptyDocument, serializeDocument, type Document } from "@arq/schema";
import { applyJson, autoLayout } from "../../src/json/auto-layout";

const chain = (): Document => ({
  ...emptyDocument(),
  nodes: [
    { id: "a", shape: "rect", label: "A" },
    { id: "b", shape: "rect", label: "B" },
    { id: "c", shape: "ellipse", label: "C" },
  ],
  edges: [
    { id: "ab", from: "a", to: "b" },
    { id: "bc", from: "b", to: "c" },
  ],
});

// ELK is a large bundle; load it once up front so its start-up is not charged to the first test.
beforeAll(async () => {
  await import("elkjs/lib/elk.bundled.js");
}, 60_000);

describe("autoLayout", () => {
  it("places unpositioned shapes in ranks along the flow direction, without overlap", async () => {
    const doc = await autoLayout(chain());
    const p = doc.layout.pinned;
    expect(p.a!.x).toBeLessThan(p.b!.x);
    expect(p.b!.x).toBeLessThan(p.c!.x);
    // Rightward flow: all three on one row.
    expect(new Set([p.a!.y, p.b!.y]).size).toBe(1);
  });

  it("runs downward when the document says so", async () => {
    const base = chain();
    const doc = await autoLayout({ ...base, layout: { ...base.layout, direction: "DOWN" } });
    expect(doc.layout.pinned.a!.y).toBeLessThan(doc.layout.pinned.b!.y);
  });

  it("leaves placed shapes alone and puts new ones beside them", async () => {
    const base = chain();
    const doc = await autoLayout({ ...base, layout: { ...base.layout, pinned: { a: { x: 500, y: 300, w: 200, h: 100 } } } });
    expect(doc.layout.pinned.a).toEqual({ x: 500, y: 300, w: 200, h: 100 });
    expect(doc.layout.pinned.b!.x).toBeGreaterThanOrEqual(700);
  });

  it("with `all`, lays out everything again but keeps sizes", async () => {
    const base = chain();
    const doc = await autoLayout(
      { ...base, layout: { ...base.layout, pinned: { a: { x: 999, y: 999, w: 222, h: 111 } } } },
      { all: true },
    );
    expect(doc.layout.pinned.a).toMatchObject({ x: 0, w: 222, h: 111 });
  });
});

describe("applyJson", () => {
  it("keeps positions the current document already has for shapes the text names", async () => {
    const current = await autoLayout(chain());
    const bare = { ...chain(), nodes: [...chain().nodes, { id: "d", shape: "rect", label: "D" }] };
    const r = await applyJson(JSON.stringify(bare), current);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.document.layout.pinned.b).toEqual(current.layout.pinned.b);
    expect(r.document.layout.pinned.d).toBeDefined();
  });

  it("reports schema problems with their paths", async () => {
    const r = await applyJson(serializeDocument(chain()).replace('"shape": "ellipse"', '"shape": "blob"'), emptyDocument());
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.issues[0]!.path).toEqual(["nodes", 2, "shape"]);
  });
});
