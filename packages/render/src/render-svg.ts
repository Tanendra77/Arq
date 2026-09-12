import type { ArrowStyle, Document } from "@arq/schema";
import { collectDefs, glowId, markerId } from "./defs";
import { edgeEnds, edgeLabelPoint, edgePath } from "./edge-path";
import { FONT_STACK, fontFaceCss } from "./font";
import { escapeXml, inlineIcon, placeholderBox } from "./inline-icon";
import { layoutDocument } from "./layout-document";
import {
  METRICS, STYLE_DEFAULTS, resolveEdgeStyle, resolveNodeStyle, wrapLabel,
  type Rect,
} from "./metrics";
import { edgeMarkup, seedFromId, shapeMarkup } from "./sketch";

/**
 * A node's icon is whatever the document names, or nothing. There is no per-type fallback:
 * node types are gone and a node without an `icon` is drawn as its shape alone.
 */
export type RenderIconResolver = (id: string | undefined) => string | undefined;

export interface RenderOptions {
  resolveIcon: RenderIconResolver;
  font?: "embed" | "system";
}

/**
 * The same two-decimal rounding metrics.ts and edge-path.ts use. Every number this module
 * interpolates into the output goes through it, so a coordinate can never reach the SVG as
 * `70.99999999999999` in one engine and `71` in another — the export is compared byte for byte
 * between a Node render and a browser render.
 */
const r2 = (n: number): number => Math.round(n * 100) / 100;
const fmt = (n: number): string => String(r2(n));

const FG = STYLE_DEFAULTS.edge.stroke;
// The edge-label plate's background — always the default, regardless of the document's own
// canvas background, because a label plate needs to contrast with the canvas, not match it.
const BG = STYLE_DEFAULTS.canvasBackground;
const LINE = STYLE_DEFAULTS.node.stroke;

function renderGroup(id: string, label: string, r: Rect): string {
  const m = METRICS;
  return `<g class="arq-group" data-id="${escapeXml(id)}"><rect x="${fmt(r.x)}" y="${fmt(r.y)}" width="${fmt(r.w)}" height="${fmt(r.h)}" rx="${m.groupRadius}" fill="#f3f4f6" stroke="${LINE}"/><text x="${fmt(r.x + m.groupPadding)}" y="${fmt(r.y + m.groupHeaderHeight / 2)}" font-size="${m.labelFontSize}" font-weight="600" dominant-baseline="middle" fill="${FG}">${escapeXml(label)}</text></g>`;
}

function renderNode(doc: Document, id: string, r: Rect, resolveIcon: RenderIconResolver): string {
  const n = doc.nodes.find((x) => x.id === id)!;
  const s = resolveNodeStyle(n.style);
  const m = METRICS;
  const filter = s.glow ? ` filter="url(#${glowId(s.glow.color)})"` : "";
  // One shared painter for the outline, hand-drawn or crisp, seeded off the node's own id so the
  // export wobbles exactly the way the editor drew it.
  const shaped = shapeMarkup(n.shape, r, s, seedFromId(id));

  const iconBox: Rect = {
    x: r2(r.x + (r.w - m.iconSize) / 2), y: r2(r.y + m.padding), w: m.iconSize, h: m.iconSize,
  };
  const svgText = n.icon !== undefined ? resolveIcon(n.icon) : undefined;
  const icon =
    n.icon === undefined ? ""
    : svgText !== undefined ? inlineIcon(svgText, `icon-${id}`, iconBox)
    : placeholderBox(iconBox, n.icon);

  const anchor = s.textAlign === "left" ? "start" : s.textAlign === "right" ? "end" : "middle";
  const tx =
    s.textAlign === "left" ? r.x + m.padding
    : s.textAlign === "right" ? r.x + r.w - m.padding
    : r.x + r.w / 2;
  const lines = wrapLabel(n.label);
  // With an icon the label sits under it; without one it is centred in the box, which is what
  // makes a `text` node (no outline, no icon) read as a plain label at its own position.
  const labelTop =
    n.icon !== undefined ? iconBox.y + iconBox.h + m.gap : r.y + (r.h - lines.length * m.labelLineHeight) / 2;
  const text = lines
    .map((line, i) => `<tspan x="${fmt(tx)}" y="${fmt(labelTop + i * m.labelLineHeight + m.labelLineHeight * 0.75)}">${escapeXml(line)}</tspan>`)
    .join("");

  return `<g class="arq-node" data-id="${escapeXml(id)}" data-shape="${n.shape}" color="${STYLE_DEFAULTS.edge.stroke}"${filter}>${shaped}${icon}<text font-size="${fmt(s.fontSize)}" font-weight="500" text-anchor="${anchor}" fill="${FG}">${text}</text></g>`;
}

function renderEdge(doc: Document, id: string, nodes: Map<string, Rect>): string {
  const e = doc.edges.find((x) => x.id === id)!;
  const ends = edgeEnds(e, nodes);
  if (!ends) return "";
  const s = resolveEdgeStyle(e.style);
  const { d, mid } = edgePath(ends.start, ends.end, s.routing);
  const filter = s.glow ? ` filter="url(#${glowId(s.glow.color)})"` : "";
  // resolveEdgeStyle widens the arrow fields to string via STYLE_DEFAULTS; the schema has
  // already constrained them to ArrowStyle, so this narrows rather than asserts.
  const mk = (kind: "start" | "end", arrow: string) =>
    arrow === "none" ? "" : ` marker-${kind}="url(#${markerId(arrow as ArrowStyle, s.stroke)})"`;
  const path = edgeMarkup(d, s, seedFromId(id), `${mk("end", s.endArrow)}${mk("start", s.startArrow)}`);
  // `mid` is the path's own midpoint; the label sits wherever the style says, which is only the
  // same point when labelPos is "middle".
  const lp = s.labelPos === "middle" ? mid : edgeLabelPoint(ends.start, ends.end, s.routing, s.labelPos);
  const label = e.label
    ? `<g><rect x="${fmt(lp.x - e.label.length * 3.2 - 4)}" y="${fmt(lp.y - 8)}" width="${fmt(e.label.length * 6.4 + 8)}" height="16" rx="3" fill="${BG}" stroke="${LINE}"/><text x="${fmt(lp.x)}" y="${fmt(lp.y)}" font-size="11" text-anchor="middle" dominant-baseline="middle" fill="${FG}">${escapeXml(e.label)}</text></g>`
    : "";
  return `<g class="arq-edge" data-id="${escapeXml(id)}"${filter}>${path}${label}</g>`;
}

export function renderSvg(doc: Document, opts: RenderOptions): string {
  const font = opts.font ?? "embed";
  const layout = layoutDocument(doc);
  const b = layout.bounds;
  const style = `<style>${fontFaceCss(font)}text{font-family:${FONT_STACK}}</style>`;
  const defs = collectDefs(doc);
  const groups = doc.groups.map((g) => { const r = layout.groups.get(g.id); return r ? renderGroup(g.id, g.label, r) : ""; }).join("");
  const edges = doc.edges.map((e) => renderEdge(doc, e.id, layout.nodes)).join("");
  const nodes = doc.nodes.map((n) => renderNode(doc, n.id, layout.nodes.get(n.id)!, opts.resolveIcon)).join("");
  // The full-canvas background rect is the one place the document's own color (when set) wins
  // over the default — this is what makes screen and export agree on canvas color.
  const canvasFill = doc.canvasBackground ?? STYLE_DEFAULTS.canvasBackground;
  return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="${fmt(b.x)} ${fmt(b.y)} ${fmt(b.w)} ${fmt(b.h)}" width="${fmt(b.w)}" height="${fmt(b.h)}">${style}${defs}<title>${escapeXml(doc.title)}</title><rect x="${fmt(b.x)}" y="${fmt(b.y)}" width="${fmt(b.w)}" height="${fmt(b.h)}" fill="${canvasFill}"/>${groups}${edges}${nodes}</svg>`;
}
