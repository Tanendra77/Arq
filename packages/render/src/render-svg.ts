import type { Document, EdgeKind, NodeType } from "@arq/schema";
import { edgePath } from "./edge-path";
import { FONT_STACK, fontFaceCss } from "./font";
import { escapeXml, inlineIcon, placeholderBox } from "./inline-icon";
import { layoutDocument } from "./layout-document";
import { METRICS, edgeAnchors, wrapLabel, type Rect } from "./metrics";

export type RenderIconResolver = (id: string | undefined, nodeType: NodeType) => string | undefined;

export interface RenderOptions {
  resolveIcon: RenderIconResolver;
  font?: "embed" | "system";
}

const EDGE_DASH: Record<EdgeKind, string | undefined> = {
  publish: undefined, subscribe: undefined, bind: "2 4", bridge: "8 4", dmr: "8 4 2 4",
  replication: "6 6", "request-reply": undefined, generic: undefined,
};
const EDGE_MARKERS: Record<EdgeKind, { start: boolean; end: boolean }> = {
  publish: { start: false, end: true }, subscribe: { start: false, end: true }, bind: { start: false, end: false },
  bridge: { start: true, end: true }, dmr: { start: true, end: true }, replication: { start: false, end: true },
  "request-reply": { start: true, end: true }, generic: { start: false, end: true },
};

const FG = "#1a1a1a";
const BG = "#ffffff";
const LINE = "#d0d0d0";

function renderGroup(id: string, label: string, r: Rect): string {
  const m = METRICS;
  return `<g class="arq-group" data-id="${escapeXml(id)}"><rect x="${r.x}" y="${r.y}" width="${r.w}" height="${r.h}" rx="${m.groupRadius}" fill="#f3f4f6" stroke="${LINE}"/><text x="${r.x + m.groupPadding}" y="${r.y + m.groupHeaderHeight / 2}" font-size="${m.labelFontSize}" font-weight="600" dominant-baseline="middle" fill="${FG}">${escapeXml(label)}</text></g>`;
}

function renderNode(doc: Document, id: string, r: Rect, resolveIcon: RenderIconResolver): string {
  const n = doc.nodes.find((x) => x.id === id)!;
  const m = METRICS;
  const iconBox: Rect = { x: r.x + (r.w - m.iconSize) / 2, y: r.y + m.padding, w: m.iconSize, h: m.iconSize };
  const svgText = resolveIcon(n.icon, n.type);
  const icon = svgText !== undefined ? inlineIcon(svgText, `icon-${id}`, iconBox) : placeholderBox(iconBox, n.icon ?? "");
  const lines = wrapLabel(n.label);
  const labelTop = iconBox.y + iconBox.h + m.gap;
  const text = lines
    .map((line, i) => `<tspan x="${r.x + r.w / 2}" y="${labelTop + i * m.labelLineHeight + m.labelLineHeight * 0.75}">${escapeXml(line)}</tspan>`)
    .join("");
  const badgeY = labelTop + lines.length * m.labelLineHeight + m.gap + m.badgeHeight * 0.8;
  return `<g class="arq-node" data-id="${escapeXml(id)}" data-type="${n.type}" color="${FG}"><rect x="${r.x}" y="${r.y}" width="${r.w}" height="${r.h}" rx="${m.nodeRadius}" fill="${BG}" stroke="${LINE}"/>${icon}<text font-size="${m.labelFontSize}" font-weight="500" text-anchor="middle" fill="${FG}">${text}</text><text x="${r.x + r.w / 2}" y="${badgeY}" font-size="${m.badgeFontSize}" text-anchor="middle" fill="${FG}" opacity="0.6" letter-spacing="0.04em">${n.type.toUpperCase()}</text></g>`;
}

function renderEdge(doc: Document, id: string, nodes: Map<string, Rect>): string {
  const e = doc.edges.find((x) => x.id === id)!;
  const from = nodes.get(e.from);
  const to = nodes.get(e.to);
  if (!from || !to) return "";
  const { start, end } = edgeAnchors(from, to);
  const { d, mid } = edgePath(start, end);
  const dash = EDGE_DASH[e.kind];
  const mk = EDGE_MARKERS[e.kind];
  const path = `<path d="${d}" fill="none" stroke="${FG}" stroke-width="1.5"${dash ? ` stroke-dasharray="${dash}"` : ""}${mk.end ? ' marker-end="url(#arq-arrow)"' : ""}${mk.start ? ' marker-start="url(#arq-arrow-start)"' : ""}/>`;
  const label = e.label
    ? `<g><rect x="${mid.x - e.label.length * 3.2 - 4}" y="${mid.y - 8}" width="${e.label.length * 6.4 + 8}" height="16" rx="3" fill="${BG}" stroke="${LINE}"/><text x="${mid.x}" y="${mid.y}" font-size="11" text-anchor="middle" dominant-baseline="middle" fill="${FG}">${escapeXml(e.label)}</text></g>`
    : "";
  return `<g class="arq-edge" data-id="${escapeXml(id)}" data-kind="${e.kind}">${path}${label}</g>`;
}

export function renderSvg(doc: Document, opts: RenderOptions): string {
  const font = opts.font ?? "embed";
  const layout = layoutDocument(doc);
  const b = layout.bounds;
  const style = `<style>${fontFaceCss(font)}text{font-family:${FONT_STACK}}</style>`;
  const defs = `<defs><marker id="arq-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" fill="${FG}"/></marker><marker id="arq-arrow-start" viewBox="0 0 10 10" refX="1" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse"><path d="M10 0L0 5L10 10z" fill="${FG}"/></marker></defs>`;
  const groups = doc.groups.map((g) => { const r = layout.groups.get(g.id); return r ? renderGroup(g.id, g.label, r) : ""; }).join("");
  const edges = doc.edges.map((e) => renderEdge(doc, e.id, layout.nodes)).join("");
  const nodes = doc.nodes.map((n) => renderNode(doc, n.id, layout.nodes.get(n.id)!, opts.resolveIcon)).join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="${b.x} ${b.y} ${b.w} ${b.h}" width="${b.w}" height="${b.h}">${style}${defs}<title>${escapeXml(doc.title)}</title><rect x="${b.x}" y="${b.y}" width="${b.w}" height="${b.h}" fill="${BG}"/>${groups}${edges}${nodes}</svg>`;
}
