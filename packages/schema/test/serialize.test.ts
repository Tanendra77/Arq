import { describe, expect, it } from "vitest";
import { parseDocument, serializeDocument, migrate, MigrationError, emptyDocument } from "../src/index";
import fixture from "./fixtures/event-flow.json";

describe("parseDocument", () => {
  it("parses valid JSON text", () => {
    const r = parseDocument(JSON.stringify(fixture));
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.document.title).toBe("Order ingestion");
  });

  it("reports malformed JSON as a single error", () => {
    const r = parseDocument("{ not json");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors[0]).toMatch(/JSON/);
  });

  it("formats zod issues as path: message lines", () => {
    const bad = JSON.parse(JSON.stringify(fixture));
    bad.nodes[1].props.colour = "red";
    const r = parseDocument(JSON.stringify(bad));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors).toContainEqual(expect.stringMatching(/^nodes\[1\]\.props: .*colour/));
  });

  it("rejects an unsupported version", () => {
    const r = parseDocument(JSON.stringify({ ...fixture, version: 2 }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors[0]).toMatch(/version 2/);
  });
});

describe("serializeDocument", () => {
  it("round-trips and ends with a newline", () => {
    const r = parseDocument(JSON.stringify(fixture));
    if (!r.ok) throw new Error("fixture invalid");
    const text = serializeDocument(r.document);
    expect(text.endsWith("\n")).toBe(true);
    expect(text.startsWith("{\n  \"version\": 1,")).toBe(true);
    const again = parseDocument(text);
    expect(again.ok && again.document).toEqual(r.document);
  });

  it("keeps node order as authored", () => {
    const doc = emptyDocument();
    doc.nodes.push({ id: "z", type: "shape", label: "Z", props: {} }, { id: "a", type: "shape", label: "A", props: {} });
    doc.layout.pinned.z = { x: 0, y: 0 };
    doc.layout.pinned.a = { x: 0, y: 0 };
    const ids = (JSON.parse(serializeDocument(doc)) as { nodes: { id: string }[] }).nodes.map((n) => n.id);
    expect(ids).toEqual(["z", "a"]);
  });
});

describe("migrate", () => {
  it("returns version 1 input unchanged", () => {
    expect(migrate(fixture)).toBe(fixture);
  });
  it("throws MigrationError for other versions", () => {
    expect(() => migrate({ version: 0 })).toThrow(MigrationError);
  });
});
