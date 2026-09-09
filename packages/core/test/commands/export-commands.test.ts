import { describe, expect, it } from "vitest";
import { emptyDocument } from "@arq/schema";
import { createEditorStore } from "../../src/store/editor-store";
import { exportSvg, fileSlug } from "../../src/commands/export-commands";
import { createIconResolver } from "../../src/icons/resolver";
import { createFakePlatform } from "../platform-fake";

describe("fileSlug", () => {
  it("lowercases, strips punctuation and collapses dashes", () => {
    expect(fileSlug("Order ingestion: v2 / prod!")).toBe("order-ingestion-v2-prod");
    expect(fileSlug("   ")).toBe("diagram");
  });
});

describe("exportSvg", () => {
  it("renders the current document and hands it to the platform", async () => {
    const store = createEditorStore(emptyDocument("My Flow"));
    store.getState().addNode({ type: "broker", label: "PR", position: { x: 0, y: 0 } });
    const p = createFakePlatform();
    await exportSvg(store, p, createIconResolver([]));
    expect(p.exported).toHaveLength(1);
    expect(p.exported[0]).toMatchObject({ name: "my-flow.svg", mime: "image/svg+xml" });
    expect(String(p.exported[0]?.data)).toContain("<svg");
    expect(String(p.exported[0]?.data)).toContain(">PR<");
  });
});
