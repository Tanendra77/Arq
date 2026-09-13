import { describe, expect, it } from "vitest";
import { emptyDocument } from "@arq/schema";
import { createEditorStore } from "../../src/store/editor-store";
import { DEFAULT_EXPORT, exportDiagram, exportDocument, exportFileName, fileSlug } from "../../src/commands/export-commands";
import { createIconResolver } from "../../src/icons/resolver";
import { createFakePlatform } from "../platform-fake";

describe("fileSlug", () => {
  it("lowercases, strips punctuation and collapses dashes", () => {
    expect(fileSlug("Order ingestion: v2 / prod!")).toBe("order-ingestion-v2-prod");
    expect(fileSlug("   ")).toBe("diagram");
  });
});

const GRID = { variant: "dots", size: 10 } as const;

describe("exportDiagram", () => {
  it("renders the current document as SVG and hands it to the platform under the chosen name", async () => {
    const store = createEditorStore(emptyDocument("My Flow"));
    store.getState().addNode({ shape: "rect", label: "PR", position: { x: 0, y: 0 } });
    const p = createFakePlatform();
    await exportDiagram(store, p, createIconResolver([]), { ...DEFAULT_EXPORT, format: "svg", name: "", grid: GRID });
    expect(p.exported).toHaveLength(1);
    expect(p.exported[0]).toMatchObject({ name: "my-flow.svg", mime: "image/svg+xml" });
    expect(String(p.exported[0]?.data)).toContain("<svg");
    expect(String(p.exported[0]?.data)).toContain(">PR<");
  });
});

describe("export helpers", () => {
  it("cleans a typed file name and adds the format's extension", () => {
    expect(exportFileName("  deck v2.png ", "T", "svg")).toBe("deck v2.svg");
    expect(exportFileName("a/b:c", "T", "png")).toBe("a-b-c.png");
    expect(exportFileName("", "Order flow", "png")).toBe("order-flow.png");
  });

  it("exports only the selection when asked, cutting loose lines to what was picked", () => {
    const store = createEditorStore(emptyDocument());
    const a = store.getState().addNode({ shape: "rect", label: "a", position: { x: 0, y: 0 } });
    const b = store.getState().addNode({ shape: "rect", label: "b", position: { x: 300, y: 0 } });
    store.getState().addEdge({ from: a, to: b });
    const doc = store.getState().document;
    expect(exportDocument(doc, { nodes: [a], edges: [] }, "selection").nodes.map((n) => n.id)).toEqual([a]);
    expect(exportDocument(doc, { nodes: [a], edges: [] }, "selection").edges).toHaveLength(0);
    expect(exportDocument(doc, { nodes: [a], edges: [] }, "all")).toBe(doc);
  });
});
