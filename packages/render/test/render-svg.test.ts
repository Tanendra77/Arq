import { describe, expect, it } from "vitest";
import { DocumentSchema } from "@arq/schema";
import { layoutDocument, renderSvg, METRICS } from "../src/index";
import fixture from "./fixtures/two-nodes.json";

const doc = DocumentSchema.parse(fixture);
const ICON = '<svg viewBox="0 0 72 72"><defs><linearGradient id="g"/></defs><rect id="r" fill="url(#g)" width="72" height="72"/></svg>';
const resolveIcon = (id: string | undefined, t: string) => (id === "test/broker" ? ICON : id === undefined ? `<svg viewBox="0 0 72 72"><circle id="c" r="30" data-type="${t}"/></svg>` : undefined);

describe("layoutDocument", () => {
  it("computes node rects, group rects and padded bounds", () => {
    const l = layoutDocument(doc);
    expect(l.nodes.get("oms")).toEqual({ x: 40, y: 80, w: METRICS.nodeWidth, h: 96 });
    expect(l.groups.get("dc")).toEqual({ x: 0, y: 0, w: 500, h: 260 });
    expect(l.bounds).toEqual({ x: -40, y: -40, w: 580, h: 476 });
  });
});

describe("renderSvg", () => {
  it("matches the golden snapshot", () => {
    expect(renderSvg(doc, { resolveIcon, font: "system" })).toMatchSnapshot();
  });
  it("is a standalone svg with prefixed inlined icons and no external references", () => {
    const svg = renderSvg(doc, { resolveIcon, font: "system" });
    expect(svg.startsWith('<svg xmlns="http://www.w3.org/2000/svg"')).toBe(true);
    expect(svg).toContain('id="icon-pr-g"');
    expect(svg).toContain('id="icon-oms-c"');
    expect(svg).not.toMatch(/href="(?!#)/);
    expect(svg).not.toContain("<script");
  });
  it("renders a placeholder for a missing icon and escapes text", () => {
    const d = structuredClone(doc);
    d.nodes[0]!.label = "A <b> & \"c\"";
    const svg = renderSvg(d, { resolveIcon, font: "system" });
    expect(svg).toContain("test/missing");
    expect(svg).toContain('class="arq-icon-missing"');
    expect(svg).toContain("A &lt;b&gt; &amp; &quot;c&quot;");
  });
  it("is deterministic", () => {
    expect(renderSvg(doc, { resolveIcon })).toBe(renderSvg(doc, { resolveIcon }));
  });
  it("embeds a font-face only when the font is available", async () => {
    const { INTER_WOFF2_BASE64 } = await import("../src/font.generated");
    const svg = renderSvg(doc, { resolveIcon, font: "embed" });
    expect(svg.includes("@font-face")).toBe(INTER_WOFF2_BASE64 !== null);
  });
});
