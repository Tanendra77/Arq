import { describe, expect, it } from "vitest";
import { collectDefs, colorKey, glowId, markerId } from "../src/defs";
import { DocumentSchema } from "@arq/schema";

const doc = (edges: unknown[], nodes: unknown[] = []) =>
  DocumentSchema.parse({ version: 2, title: "T", nodes, edges });

describe("ids", () => {
  it("normalises colour to a lowercase hex key", () => {
    expect(colorKey("#A1B2C3")).toBe("a1b2c3");
    expect(colorKey("#abc")).toBe("abc");
  });

  it("builds stable ids", () => {
    expect(markerId("arrow", "#000000")).toBe("arq-mk-arrow-000000");
    expect(glowId("#00FFFF")).toBe("arq-glow-00ffff");
  });
});

describe("collectDefs", () => {
  it("emits one marker per distinct arrow and colour pair", () => {
    const d = collectDefs(doc([
      { id: "e1", from: { x: 0, y: 0 }, to: { x: 1, y: 1 }, style: { endArrow: "arrow", stroke: "#000000" } },
      { id: "e2", from: { x: 0, y: 0 }, to: { x: 1, y: 1 }, style: { endArrow: "arrow", stroke: "#000000" } },
      { id: "e3", from: { x: 0, y: 0 }, to: { x: 1, y: 1 }, style: { endArrow: "arrow", stroke: "#ff0000" } },
    ]));
    expect(d.match(/<marker /g)?.length).toBe(2);
  });

  it("never emits a marker for the none arrow", () => {
    const d = collectDefs(doc([{ id: "e1", from: { x: 0, y: 0 }, to: { x: 1, y: 1 }, style: { startArrow: "none", endArrow: "none" } }]));
    expect(d).not.toContain("<marker ");
  });

  it("emits one filter per distinct glow colour, from nodes and edges alike", () => {
    const d = collectDefs(doc(
      [{ id: "e1", from: { x: 0, y: 0 }, to: { x: 1, y: 1 }, style: { glow: { color: "#00ffff" } } }],
      [{ id: "n1", shape: "rect", label: "A", style: { glow: { color: "#00ffff" } } },
       { id: "n2", shape: "rect", label: "B", style: { glow: { color: "#ff00ff" } } }],
    ));
    expect(d.match(/<filter /g)?.length).toBe(2);
  });

  it("is byte-identical regardless of authoring order", () => {
    const a = [
      { id: "e1", from: { x: 0, y: 0 }, to: { x: 1, y: 1 }, style: { endArrow: "arrow", stroke: "#ff0000" } },
      { id: "e2", from: { x: 0, y: 0 }, to: { x: 1, y: 1 }, style: { endArrow: "diamond", stroke: "#00ff00" } },
    ];
    expect(collectDefs(doc(a))).toBe(collectDefs(doc([...a].reverse())));
  });

  it("is byte-identical when nodes and edges interleave glow colours in reverse order", () => {
    const edges = [
      { id: "e1", from: { x: 0, y: 0 }, to: { x: 1, y: 1 }, style: { glow: { color: "#111111" } } },
      { id: "e2", from: { x: 0, y: 0 }, to: { x: 1, y: 1 }, style: { glow: { color: "#333333" } } },
    ];
    const nodes = [
      { id: "n1", shape: "rect", label: "A", style: { glow: { color: "#222222" } } },
      { id: "n2", shape: "rect", label: "B", style: { glow: { color: "#444444" } } },
    ];
    const forward = collectDefs(doc(edges, nodes));
    const shuffled = collectDefs(doc([...edges].reverse(), [...nodes].reverse()));
    expect(forward).toBe(shuffled);
    // and prove it's actually sorted, not coincidentally equal: filter ids appear in ascending order
    const ids = [...forward.matchAll(/<filter id="([^"]+)"/g)].map((m) => m[1]);
    expect(ids).toEqual([...ids].sort());
  });
});
