import { describe, expect, it } from "vitest";
import { DocumentSchema } from "@arq/schema";
import { layoutDocument, renderSvg, METRICS, DEFAULT_NODE_SIZE, STYLE_DEFAULTS } from "../src/index";
import fixture from "./fixtures/two-nodes.json";

const doc = DocumentSchema.parse(fixture);
const ICON = '<svg viewBox="0 0 72 72"><defs><linearGradient id="g"/></defs><rect id="r" fill="url(#g)" width="72" height="72"/></svg>';
const resolveIcon = (id: string | undefined) => (id === "test/broker" ? ICON : undefined);
const opts = { resolveIcon, font: "system" } as const;

/** The inner markup of one `<g class="arq-node">`. No node group nests another `<g …>` unless
 *  it has a missing icon, so the first `</g>` closes the node we asked for. */
function nodeGroup(svg: string, id: string): string {
  const m = new RegExp(`<g class="arq-node" data-id="${id}"[^>]*>([\\s\\S]*?)</g>`).exec(svg);
  if (!m?.[1]) throw new Error(`no node group for ${id}`);
  return m[1];
}

/** The full-canvas background rect's own fill — the one right after `<title>`, distinct from
 *  any node/label fill that might coincidentally share the same color. */
function canvasFillOf(svg: string): string {
  const m = /<title>[^<]*<\/title><rect[^>]*\bfill="([^"]+)"/.exec(svg);
  if (!m?.[1]) throw new Error("no canvas background rect found");
  return m[1];
}

const defsOf = (svg: string) => svg.slice(svg.indexOf("<defs>"), svg.indexOf("</defs>") + 7);

describe("layoutDocument", () => {
  it("computes node rects, group rects and padded bounds", () => {
    const l = layoutDocument(doc);
    // rect1 has no pinned w/h, so it takes the real default size, icon and all.
    expect(l.nodes.get("rect1")).toEqual({ x: 40, y: 60, w: DEFAULT_NODE_SIZE.w, h: DEFAULT_NODE_SIZE.h });
    expect(l.nodes.get("ell")).toEqual({ x: 260, y: 160, w: 120, h: DEFAULT_NODE_SIZE.h });
    // A text-shaped node takes DEFAULT_TEXT_SIZE, not the box size.
    expect(l.nodes.get("txt")).toEqual({ x: 40, y: 340, w: 120, h: 24 });
    expect(l.groups.get("dc")).toEqual({ x: 0, y: 0, w: 680, h: 260 });
    // Bounds stretch to the free-floating endpoints at y=440, past every node and the group.
    expect(l.bounds).toEqual({ x: -40, y: -40, w: 760, h: 520 });
  });
});

describe("renderSvg", () => {
  it("matches the golden snapshot", () => {
    expect(renderSvg(doc, opts)).toMatchSnapshot();
  });

  it("is a standalone svg with prefixed inlined icons and no external references", () => {
    const svg = renderSvg(doc, opts);
    expect(svg.startsWith('<svg xmlns="http://www.w3.org/2000/svg"')).toBe(true);
    expect(svg).toContain('id="icon-rect1-g"');
    expect(svg).toContain('fill="url(#icon-rect1-g)"');
    expect(svg).not.toMatch(/href="(?!#)/);
    expect(svg).not.toContain("<script");
  });

  it("renders a placeholder for a missing icon and escapes text", () => {
    const d = structuredClone(doc);
    d.nodes[0]!.label = "A <b> & \"c\"";
    const svg = renderSvg(d, opts);
    expect(svg).toContain("test/missing");
    expect(svg).toContain('class="arq-icon-missing"');
    expect(svg).toContain("A &lt;b&gt; &amp; &quot;c&quot;");
  });

  it("draws no icon at all for a node without one", () => {
    const svg = renderSvg(doc, opts);
    expect(nodeGroup(svg, "ell")).not.toContain("arq-icon-missing");
    expect(nodeGroup(svg, "ell")).not.toContain("<svg");
  });

  it("renders every shape outline", () => {
    const svg = renderSvg(doc, opts);
    expect(svg).toContain("<ellipse");
    expect(svg).toContain("<polygon");
    expect(svg).toContain("<rect");
    expect(nodeGroup(svg, "dia")).toContain("<polygon");
    expect(nodeGroup(svg, "tri")).toContain("<polygon");
    // A text node is its label; it has no outline element of its own.
    expect(nodeGroup(svg, "txt")).not.toMatch(/<(rect|ellipse|polygon)\b/);
  });

  it("carries a color attribute on the node group for currentColor icons to inherit", () => {
    const svg = renderSvg(doc, opts);
    expect(svg).toMatch(/<g class="arq-node" data-id="rect1"[^>]*\bcolor="#1a1a1a"/);
  });

  it("applies resolved style to a node", () => {
    const svg = renderSvg(doc, opts);
    expect(svg).toContain('fill="#ffffff"');
    expect(svg).toContain('stroke-width="1.5"');
    const ell = nodeGroup(svg, "ell");
    expect(ell).toContain('fill="#e0f2fe"');
    expect(ell).toContain('stroke="#0284c7"');
    expect(ell).toContain('stroke-width="2"');
    expect(ell).toContain('text-anchor="end"');
    expect(nodeGroup(svg, "txt")).toContain('text-anchor="start"');
    expect(nodeGroup(svg, "txt")).toContain('font-size="16"');
    expect(nodeGroup(svg, "dia")).toContain('stroke-dasharray="8 4"');
  });

  it("references a marker by its content-derived id", () => {
    const svg = renderSvg(doc, opts);
    expect(svg).toContain('marker-end="url(#arq-mk-arrow-1a1a1a)"');
    expect(svg).toContain('marker-start="url(#arq-mk-diamond-0284c7)"');
    expect(svg).toContain('marker-end="url(#arq-mk-triangle-0284c7)"');
    expect(defsOf(svg)).toContain('id="arq-mk-circle-1a1a1a"');
    // endArrow: none must not emit a marker reference.
    expect(svg).not.toMatch(/marker-(start|end)="url\(#arq-mk-none/);
  });

  it("references a glow filter rather than using a CSS shadow", () => {
    const svg = renderSvg(doc, opts);
    expect(svg).toContain('filter="url(#arq-glow-');
    expect(svg).not.toContain("box-shadow");
    expect(svg).toContain('data-id="dia" data-shape="diamond" color="#1a1a1a" filter="url(#arq-glow-f59e0b)"');
    expect(svg).toContain('data-id="e3" filter="url(#arq-glow-22c55e)"');
    expect(defsOf(svg)).toContain('id="arq-glow-f59e0b"');
    expect(defsOf(svg)).toContain('id="arq-glow-22c55e"');
  });

  it("routes each edge with its own routing mode", () => {
    const svg = renderSvg(doc, opts);
    const edge = (id: string) => / d="([^"]+)"/.exec(svg.slice(svg.indexOf(`data-id="${id}"`)))![1]!;
    expect(edge("e1")).toContain("Q"); // orthogonal: rounded corners
    expect(edge("e2")).toContain("C"); // curved: one cubic bezier
    expect(edge("e3")).toMatch(/^M[\d. ]+L[\d. ]+$/); // straight
    expect(svg).toContain('stroke-dasharray="2 4"'); // e4, dotted
  });

  it("renders a free-floating line with no nodes present", () => {
    const d = DocumentSchema.parse({
      version: 2,
      title: "T",
      nodes: [],
      edges: [{ id: "e1", from: { x: 0, y: 0 }, to: { x: 100, y: 0 } }],
    });
    const svg = renderSvg(d, opts);
    expect(svg).toContain("<path");
    expect(svg).toContain('d="M0 0');
  });

  it("is byte-identical across two renders of the same document", () => {
    expect(renderSvg(doc, opts)).toBe(renderSvg(doc, opts));
  });

  it("emits defs from content, not from authoring order", () => {
    const reversed = DocumentSchema.parse({
      ...fixture,
      nodes: [...fixture.nodes].reverse(),
      edges: [...fixture.edges].reverse(),
    });
    expect(defsOf(renderSvg(reversed, opts))).toBe(defsOf(renderSvg(doc, opts)));
    expect(defsOf(renderSvg(doc, opts))).toContain("<marker");
  });

  it("embeds a font-face only when the font is available", async () => {
    const { INTER_WOFF2_BASE64 } = await import("../src/font.generated");
    const svg = renderSvg(doc, { resolveIcon, font: "embed" });
    expect(svg.includes("@font-face")).toBe(INTER_WOFF2_BASE64 !== null);
  });

  it("uses STYLE_DEFAULTS.canvasBackground for the canvas rect when the document doesn't set one", () => {
    expect(canvasFillOf(renderSvg(doc, opts))).toBe(STYLE_DEFAULTS.canvasBackground);
  });

  it("paints the canvas rect with the document's own canvasBackground when set", () => {
    const custom = DocumentSchema.parse({ ...fixture, canvasBackground: "#123456" });
    expect(canvasFillOf(renderSvg(custom, opts))).toBe("#123456");
  });

  it("keeps the edge-label plate on the default background even with a custom canvasBackground", () => {
    const custom = DocumentSchema.parse({ ...fixture, canvasBackground: "#123456" });
    const svg = renderSvg(custom, opts);
    // e1 is the only edge with a label ("orders/new"); its plate must still contrast against a
    // non-default canvas, so it keeps the default fill rather than following canvasBackground.
    const labelPlate = /<g><rect[^>]*\bfill="([^"]+)"[^>]*\/><text/.exec(svg);
    expect(labelPlate?.[1]).toBe(STYLE_DEFAULTS.canvasBackground);
    expect(canvasFillOf(svg)).toBe("#123456");
  });
});
