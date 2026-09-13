import { describe, expect, it } from "vitest";
import {
  DocumentSchema,
  formatIssues,
  parseDocument,
  serializeDocument,
  migrate,
  MigrationError,
  emptyDocument,
} from "../src/index";
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

  it("rejects an unsupported version", () => {
    const r = parseDocument(JSON.stringify({ ...fixture, version: 3 }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors[0]).toMatch(/version 3/);
  });
});

describe("formatIssues", () => {
  it("formats zod issues as path: message lines", () => {
    const bad = JSON.parse(JSON.stringify(fixture)) as { nodes: Array<Record<string, unknown>> };
    bad.nodes[1]!.style = { fill: "red" };
    const r = DocumentSchema.safeParse(bad);
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(formatIssues(r.error)).toContainEqual(expect.stringMatching(/^nodes\[1\]\.style\.fill: /));
    }
  });
});

describe("serializeDocument", () => {
  it("round-trips and ends with a newline", () => {
    const parsed = parseDocument(JSON.stringify(fixture));
    if (!parsed.ok) throw new Error(`fixture failed to parse: ${parsed.errors.join(", ")}`);
    const doc = parsed.document;
    const text = serializeDocument(doc);
    expect(text.endsWith("\n")).toBe(true);
    expect(text.startsWith("{\n  \"version\": 2,")).toBe(true);
    expect(DocumentSchema.parse(JSON.parse(text))).toEqual(doc);
  });

  it("keeps node order as authored", () => {
    const doc = emptyDocument();
    doc.nodes.push({ id: "z", shape: "rect", label: "Z" }, { id: "a", shape: "rect", label: "A" });
    doc.layout.pinned.z = { x: 0, y: 0 };
    doc.layout.pinned.a = { x: 0, y: 0 };
    const ids = (JSON.parse(serializeDocument(doc)) as { nodes: { id: string }[] }).nodes.map((n) => n.id);
    expect(ids).toEqual(["z", "a"]);
  });
});

describe("migrate", () => {
  // Full migration coverage lives in migrate.test.ts; this just smoke-tests that
  // parseDocument's dependency on migrate() still behaves as expected.
  it("migrates version 1 input to version 2", () => {
    const v1 = { version: 1, title: "old", nodes: [], edges: [] };
    expect(migrate(v1)).toEqual({ version: 2, title: "old", nodes: [], edges: [] });
  });
  it("passes version 2 input through unchanged", () => {
    const v2 = { version: 2, title: "old" };
    expect(migrate(v2)).toBe(v2);
  });
  it("throws MigrationError for other versions", () => {
    expect(() => migrate({ version: 0 })).toThrow(MigrationError);
  });
});
