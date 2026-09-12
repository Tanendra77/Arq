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

/**
 * The same document with every element pinned to roughness 0.
 *
 * Rendering is hand-drawn by default, which turns every outline into rough.js paths. Tests about
 * *geometry* — which primitive a shape uses, which routing a given mode produces — assert against
 * this crisp variant, so they keep testing the thing they are named for rather than the sketching.
 */
const crisp = DocumentSchema.parse({
  ...fixture,
  nodes: fixture.nodes.map((n) => ({ ...n, style: { ...(n.style ?? {}), roughness: 0 } })),
  edges: fixture.edges.map((e) => ({ ...e, style: { ...(e.style ?? {}), roughness: 0 } })),
});

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
    const svg = renderSvg(crisp, opts);
    expect(svg).toContain("<ellipse");
    expect(svg).toContain("<polygon");
    expect(svg).toContain("<rect");
    expect(nodeGroup(svg, "dia")).toContain("<polygon");
    expect(nodeGroup(svg, "tri")).toContain("<polygon");
    // A text node is its label; it has no outline element of its own.
    expect(nodeGroup(svg, "txt")).not.toMatch(/<(rect|ellipse|polygon)\b/);
  });

  it("draws hand-drawn by default, and the exact primitive only when roughness is 0", () => {
    // Default: no geometric primitive survives — rough.js replaces each outline with paths.
    expect(renderSvg(doc, opts)).not.toContain("<ellipse");
    expect(renderSvg(crisp, opts)).toContain("<ellipse");
  });

  it("gives two same-shaped nodes different wobble, and the same node the same wobble twice", () => {
    const svg = renderSvg(doc, opts);
    // Seeded off the node id, so a re-render is identical...
    expect(renderSvg(doc, opts)).toBe(svg);
    // ...but two nodes never trace the same hand-drawn outline.
    expect(nodeGroup(svg, "dia")).not.toBe(nodeGroup(svg, "tri"));
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

  it("draws arrowheads as geometry in the edge group, referencing no markers", () => {
    const svg = renderSvg(doc, opts);
    expect(svg).not.toContain("<marker");
    expect(svg).not.toMatch(/marker-(start|end)=/);
    // e1 has the default single end arrow, so its group holds the line plus one head; e4 has
    // neither arrow, so it is the line alone. Both are drawn from the document, not stamped.
    const group = (id: string) => /<g class="arq-edge" data-id="[^"]*"[^>]*>[\s\S]*?<\/g>/.exec(svg.slice(svg.indexOf(`data-id="${id}"`) - 40))![0];
    expect((group("e1").match(/<path /g) ?? []).length).toBeGreaterThan((group("e4").match(/<path /g) ?? []).length);
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
    const svg = renderSvg(crisp, opts);
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
    // Glow filters are all that `<defs>` carries now; arrowheads are drawn inline.
    expect(defsOf(renderSvg(doc, opts))).toContain("<filter");
  });

  it("embeds a font-face only when the font is available", async () => {
    const { SKETCH_WOFF2_BASE64 } = await import("../src/font.generated");
    const svg = renderSvg(doc, { resolveIcon, font: "embed" });
    expect(svg.includes("@font-face")).toBe(SKETCH_WOFF2_BASE64 !== null);
    // The embedded face is the one the text actually asks for, or the export silently falls back.
    if (SKETCH_WOFF2_BASE64 !== null) expect(svg).toContain("font-family:Excalifont");
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

describe("arrowheads", () => {
  const arrowDoc = (style: Record<string, unknown>) =>
    DocumentSchema.parse({
      version: 2, title: "T", nodes: [],
      edges: [{ id: "e1", from: { x: 0, y: 0 }, to: { x: 100, y: 0 }, style: { routing: "straight", ...style } }],
    });

  /** Every coordinate pair inside the edge group's own path data — deliberately not the whole
   *  SVG, whose viewBox and background rect also look like coordinate pairs. */
  function headPoints(svg: string): { x: number; y: number }[] {
    const group = /<g class="arq-edge"[\s\S]*?<\/g>/.exec(svg)![0];
    // The first path is the line itself; the heads are whatever follows it.
    const ds = [...group.matchAll(/ d="([^"]+)"/g)].map((m) => m[1]!).slice(1);
    return ds.flatMap((d) =>
      [...d.matchAll(/(-?\d+(?:\.\d+)?) (-?\d+(?:\.\d+)?)/g)].map((m) => ({ x: Number(m[1]), y: Number(m[2]) })),
    );
  }

  it("puts the head at the target end, opening back along the line", () => {
    const p = headPoints(renderSvg(arrowDoc({ endArrow: "arrow", startArrow: "none", roughness: 0 }), opts));
    expect(p.length).toBeGreaterThan(0);
    // The tip reaches the endpoint...
    expect(p.some((q) => Math.abs(q.x - 100) < 0.5 && Math.abs(q.y) < 0.5)).toBe(true);
    // ...and every part of the head trails behind it rather than overshooting into empty canvas.
    expect(p.every((q) => q.x <= 100)).toBe(true);
    // The barbs open away from the line, which is what makes it a head and not a dot.
    expect(p.some((q) => Math.abs(q.y) > 2)).toBe(true);
  });

  it("puts a start arrow at the source end instead, facing the other way", () => {
    const p = headPoints(renderSvg(arrowDoc({ startArrow: "arrow", endArrow: "none", roughness: 0 }), opts));
    expect(p.length).toBeGreaterThan(0);
    expect(p.some((q) => Math.abs(q.x) < 0.5 && Math.abs(q.y) < 0.5)).toBe(true);
    // A head at the source trails forward from x=0, nowhere near the target.
    expect(p.every((q) => q.x < 40)).toBe(true);
  });

  it("draws no head at all when both arrows are none", () => {
    const svg = renderSvg(arrowDoc({ startArrow: "none", endArrow: "none", roughness: 0 }), opts);
    expect(headPoints(svg)).toEqual([]);
  });

  it("turns the head with the line: a downward edge gets a downward head", () => {
    const down = DocumentSchema.parse({
      version: 2, title: "T", nodes: [],
      edges: [{ id: "e1", from: { x: 0, y: 0 }, to: { x: 0, y: 100 }, style: { routing: "straight", endArrow: "arrow", roughness: 0 } }],
    });
    const p = headPoints(renderSvg(down, opts));
    expect(p.some((q) => Math.abs(q.x) < 0.5 && Math.abs(q.y - 100) < 0.5)).toBe(true); // tip
    expect(p.every((q) => q.y <= 100)).toBe(true); // barbs trail back up the line
    expect(p.some((q) => Math.abs(q.x) > 2)).toBe(true); // and open sideways
  });
});

describe("flow animation", () => {
  const flowDoc = (style: Record<string, unknown>) =>
    DocumentSchema.parse({
      version: 2, title: "T", nodes: [],
      edges: [{ id: "e1", from: { x: 0, y: 0 }, to: { x: 100, y: 0 }, style: { routing: "straight", roughness: 0, ...style } }],
    });

  it("marches a solid line's dashes, borrowing a pattern it does not otherwise have", () => {
    const svg = renderSvg(flowDoc({ animate: "flow" }), opts);
    expect(svg).toContain("@keyframes arq-flow");
    const line = /<g class="arq-edge"[\s\S]*?<\/g>/.exec(svg)![0];
    expect(line).toContain('class="arq-flow"');
    expect(line).toMatch(/stroke-dasharray="8 6"/);
    // The period drives the keyframe, so any pattern loops seamlessly.
    // With a unit. As a CSS property (which is what a keyframe sets) stroke-dashoffset needs a
    // length, so a bare number made `calc(var(...) * -2)` invalid and the line sat perfectly still.
    expect(line).toContain("--arq-flow-period:14px");
  });

  it("keeps the author's own dash pattern when one is set", () => {
    const svg = renderSvg(flowDoc({ animate: "flow", strokeDash: "dotted" }), opts);
    const line = /<g class="arq-edge"[\s\S]*?<\/g>/.exec(svg)![0];
    expect(line).toMatch(/stroke-dasharray="2 4"/);
    expect(line).toContain("--arq-flow-period:6px");
  });

  it("animates the stroke only, never the arrowhead", () => {
    const svg = renderSvg(flowDoc({ animate: "flow", endArrow: "triangle" }), opts);
    const line = /<g class="arq-edge"[\s\S]*?<\/g>/.exec(svg)![0];
    const paths = [...line.matchAll(/<path [^>]*\/>/g)].map((m) => m[0]);
    expect(paths.length).toBeGreaterThan(1);
    expect(paths.filter((p) => p.includes("arq-flow"))).toHaveLength(1);
  });

  it("leaves a still edge with no animation class at all", () => {
    const svg = renderSvg(flowDoc({}), opts);
    expect(/<g class="arq-edge"[\s\S]*?<\/g>/.exec(svg)![0]).not.toContain("arq-flow");
  });
});

describe("packets, pulse and rotation", () => {
  const doc1 = (nodes: unknown[], edges: unknown[]) =>
    DocumentSchema.parse({ version: 2, title: "T", nodes, edges });

  it("sends several dots along the routed path, staggered around one loop", () => {
    const svg = renderSvg(
      doc1([], [{ id: "e1", from: { x: 0, y: 0 }, to: { x: 100, y: 0 }, style: { routing: "straight", animate: "packets", roughness: 0 } }]),
      opts,
    );
    const group = /<g class="arq-edge"[\s\S]*?<\/g>/.exec(svg)![0];
    const dots = [...group.matchAll(/class="arq-packet"[^/]*/g)].map((m) => m[0]);
    expect(dots).toHaveLength(3);
    // Each rides the line itself, and they start at different points in the loop.
    expect(dots.every((d) => d.includes("offset-path:path('M0 0 L100 0')"))).toBe(true);
    expect(new Set(dots.map((d) => /animation-delay:([^;"]+)/.exec(d)![1])).size).toBe(3);
    expect(svg).toContain("@keyframes arq-packet");
  });

  it("follows an orthogonal route's corners, not the straight line between the ends", () => {
    const svg = renderSvg(
      doc1([], [{ id: "e1", from: { x: 0, y: 0 }, to: { x: 200, y: 100 }, style: { animate: "packets", roughness: 0 } }]),
      opts,
    );
    expect(svg).toMatch(/offset-path:path\('M0 0 L92 0 Q100 0/);
  });

  it("pulses a shape without touching its geometry", () => {
    const svg = renderSvg(doc1([{ id: "n1", shape: "rect", label: "A", style: { animate: "pulse" } }], []), opts);
    expect(svg).toMatch(/<g class="arq-node arq-pulse"/);
    expect(svg).toContain("@keyframes arq-pulse");
  });

  it("rotates a shape about its own centre, and writes nothing when it is upright", () => {
    const turned = renderSvg(doc1([{ id: "n1", shape: "rect", label: "A", style: { rotate: 45 } }], []), opts);
    expect(turned).toMatch(/transform="rotate\(45 \d+(\.\d+)? \d+(\.\d+)?\)"/);
    const upright = renderSvg(doc1([{ id: "n1", shape: "rect", label: "A" }], []), opts);
    expect(upright).not.toContain("rotate(");
  });
});

describe("animation speed, direction and marching borders", () => {
  const one = (nodes: unknown[], edges: unknown[]) =>
    DocumentSchema.parse({ version: 2, title: "T", nodes, edges });
  const edgeGroup = (svg: string) => /<g class="arq-edge"[\s\S]*?<\/g>/.exec(svg)![0];

  it("marches dashes on a clean overlay over a faded rail, so a sketched line visibly moves", () => {
    const svg = renderSvg(
      one([], [{ id: "e1", from: { x: 0, y: 0 }, to: { x: 100, y: 0 }, style: { routing: "straight", animate: "flow" } }]),
      opts,
    );
    const group = edgeGroup(svg);
    // Exactly one animated path, and it is the routed line — not one of rough's many fragments,
    // where stroke-dashoffset restarts at every sub-path and the dashes never travel.
    const flowing = [...group.matchAll(/<path [^>]*arq-flow[^>]*\/>/g)].map((m) => m[0]);
    expect(flowing).toHaveLength(1);
    expect(flowing[0]).toContain('d="M0 0 L100 0"');
    // The sketched stroke underneath is dimmed and carries no dash of its own.
    expect(group).toContain('stroke-opacity="0.3"');
  });

  it("sets duration from speed and reverses direction per element", () => {
    const fast = edgeGroup(renderSvg(
      one([], [{ id: "e1", from: { x: 0, y: 0 }, to: { x: 100, y: 0 }, style: { animate: "flow", animateSpeed: "fast", animateDirection: "reverse" } }]),
      opts,
    ));
    expect(fast).toContain("animation-duration:0.45s");
    expect(fast).toContain("animation-direction:reverse");

    const slow = edgeGroup(renderSvg(
      one([], [{ id: "e1", from: { x: 0, y: 0 }, to: { x: 100, y: 0 }, style: { animate: "flow", animateSpeed: "slow" } }]),
      opts,
    ));
    expect(slow).toContain("animation-duration:1.8s");
    expect(slow).not.toContain("animation-direction");
  });

  it("spaces packets across whatever loop the chosen speed gives them", () => {
    const svg = renderSvg(
      one([], [{ id: "e1", from: { x: 0, y: 0 }, to: { x: 100, y: 0 }, style: { animate: "packets", animateSpeed: "fast" } }]),
      opts,
    );
    const delays = [...edgeGroup(svg).matchAll(/animation-delay:(-?[\d.]+)s/g)].map((m) => Number(m[1]));
    // One 1.2s loop shared by three dots, each starting a third of the way further in.
    expect(delays.map(Math.abs)).toEqual([0, 0.4, 0.8]);
  });

  it("marches a shape's border on an unbroken outline, not the sketched one", () => {
    const svg = renderSvg(one([{ id: "n1", shape: "rect", label: "A", style: { animate: "flow" } }], []), opts);
    const group = /<g class="arq-node"[\s\S]*?<\/g>/.exec(svg)![0];
    // A <rect>, so the dash runs the whole perimeter without restarting.
    expect(group).toMatch(/<rect[^>]*class="arq-flow"/);
    expect(group).toMatch(/<rect[^>]*fill="none"/);
  });

  it("gives a text node no border to march", () => {
    const svg = renderSvg(one([{ id: "n1", shape: "text", label: "A", style: { animate: "flow" } }], []), opts);
    // The keyframes are always in the stylesheet; what matters is that nothing references them.
    expect(/<g class="arq-node"[\s\S]*?<\/g>/.exec(svg)![0]).not.toContain("arq-flow");
  });
});
