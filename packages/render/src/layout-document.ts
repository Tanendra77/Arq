import type { Document } from "@arq/schema";
import { METRICS, nodeRect, type Rect } from "./metrics";

export interface DocumentLayout {
  nodes: Map<string, Rect>;
  groups: Map<string, Rect>;
  bounds: Rect;
}

export function layoutDocument(doc: Document): DocumentLayout {
  const nodes = new Map<string, Rect>();
  for (const n of doc.nodes) nodes.set(n.id, nodeRect(doc.layout.pinned[n.id], n.label));
  const groups = new Map<string, Rect>();
  for (const g of doc.groups) {
    const p = doc.layout.pinned[g.id];
    if (p?.w !== undefined && p.h !== undefined) groups.set(g.id, { x: p.x, y: p.y, w: p.w, h: p.h });
  }
  const all = [...nodes.values(), ...groups.values()];
  const pad = METRICS.canvasPadding;
  if (all.length === 0) return { nodes, groups, bounds: { x: -pad, y: -pad, w: 2 * pad, h: 2 * pad } };
  const minX = Math.min(...all.map((r) => r.x));
  const minY = Math.min(...all.map((r) => r.y));
  const maxX = Math.max(...all.map((r) => r.x + r.w));
  const maxY = Math.max(...all.map((r) => r.y + r.h));
  return { nodes, groups, bounds: { x: minX - pad, y: minY - pad, w: maxX - minX + 2 * pad, h: maxY - minY + 2 * pad } };
}
