import { describe, expect, it } from "vitest";
import { emptyDocument } from "@arq/schema";
import { createEditorStore } from "../../src/store/editor-store";
import { DEFAULT_EXPORT, animationLoop, exportDiagram, exportDocument, exportFileName, fileSlug, recordingLength } from "../../src/commands/export-commands";
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

describe("recording length", () => {
  const withAnimations = (edges: { speed: "slow" | "normal" | "fast"; animate: "flow" | "packets" }[]) => {
    const store = createEditorStore(emptyDocument());
    for (const e of edges) {
      store.getState().addEdge({ from: { x: 0, y: 0 }, to: { x: 100, y: 0 }, style: { animate: e.animate, animateSpeed: e.speed } });
    }
    return store.getState().document;
  };

  it("is one seamless loop: the least common multiple of every period", () => {
    expect(animationLoop(emptyDocument())).toBe(0);
    expect(animationLoop(withAnimations([{ animate: "flow", speed: "normal" }]))).toBe(0.9);
    // flow 0.9s with packets 2.4s: both are back at the start after 7.2s
    expect(animationLoop(withAnimations([{ animate: "flow", speed: "normal" }, { animate: "packets", speed: "normal" }]))).toBe(7.2);
  });

  it("falls back to the longest period when a seamless loop would be too long", () => {
    // 0.45, 2.4 and 4.2 only line up after 50.4s.
    const doc = withAnimations([{ animate: "flow", speed: "fast" }, { animate: "packets", speed: "normal" }, { animate: "packets", speed: "slow" }]);
    expect(animationLoop(doc)).toBe(4.2);
  });

  it("counts frames from the length and rate, with a chosen length winning", () => {
    const doc = withAnimations([{ animate: "packets", speed: "normal" }]);
    expect(recordingLength(doc, { fps: 20, seconds: 0 })).toEqual({ seconds: 2.4, frames: 48 });
    expect(recordingLength(doc, { fps: 10, seconds: 3 })).toEqual({ seconds: 3, frames: 30 });
    expect(recordingLength(emptyDocument(), { fps: 10, seconds: 0 })).toEqual({ seconds: 2, frames: 20 });
  });

  it("names the file for the format", () => {
    expect(exportFileName("flow.gif", "T", "mp4")).toBe("flow.mp4");
    expect(exportFileName("flow", "T", "animated-svg")).toBe("flow.svg");
  });
});
