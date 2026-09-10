import type { Document } from "@arq/schema";
import { isNodeRef } from "@arq/schema";
import { METRICS, shapeRect, type Point, type Rect } from "./metrics";

export interface DocumentLayout {
  nodes: Map<string, Rect>;
  groups: Map<string, Rect>;
  bounds: Rect;
}

export function layoutDocument(doc: Document): DocumentLayout {
  const nodes = new Map<string, Rect>();
  for (const n of doc.nodes) nodes.set(n.id, shapeRect(doc.layout.pinned[n.id], n.shape));
  const groups = new Map<string, Rect>();
  for (const g of doc.groups) {
    const p = doc.layout.pinned[g.id];
    if (p?.w !== undefined && p.h !== undefined) groups.set(g.id, { x: p.x, y: p.y, w: p.w, h: p.h });
  }
  const all = [...nodes.values(), ...groups.values()];
  // Free-floating endpoints are real content. Without this a line drawn outside every node
  // box would be clipped out of the exported SVG.
  const points: Point[] = [];
  for (const e of doc.edges) {
    for (const ep of [e.from, e.to]) if (!isNodeRef(ep)) points.push({ x: ep.x, y: ep.y });
  }
  const pad = METRICS.canvasPadding;
  if (all.length === 0 && points.length === 0) {
    return { nodes, groups, bounds: { x: -pad, y: -pad, w: 2 * pad, h: 2 * pad } };
  }
  const xs = [...all.map((r) => r.x), ...points.map((p) => p.x)];
  const ys = [...all.map((r) => r.y), ...points.map((p) => p.y)];
  const xe = [...all.map((r) => r.x + r.w), ...points.map((p) => p.x)];
  const ye = [...all.map((r) => r.y + r.h), ...points.map((p) => p.y)];
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  const maxX = Math.max(...xe);
  const maxY = Math.max(...ye);
  return { nodes, groups, bounds: { x: minX - pad, y: minY - pad, w: maxX - minX + 2 * pad, h: maxY - minY + 2 * pad } };
}
