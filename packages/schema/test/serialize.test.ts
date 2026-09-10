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
  // Unskip in task 3: parseDocument runs migrate() first, and migrate still only admits
  // version 1, so no version 2 document can reach DocumentSchema through this path yet.
  it.skip("parses valid JSON text", () => {
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
  // Routed through DocumentSchema.parse instead of parseDocument (see the skip note above) —
  // Task 3 should route this back through parseDocument once migrate() understands version 2.
  it("round-trips and ends with a newline", () => {
    const doc = DocumentSchema.parse(fixture);
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
  it("returns version 1 input unchanged", () => {
    const v1 = { version: 1, title: "old" };
    expect(migrate(v1)).toBe(v1);
  });
  it("throws MigrationError for other versions", () => {
    expect(() => migrate({ version: 0 })).toThrow(MigrationError);
  });
});
