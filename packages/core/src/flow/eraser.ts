import type { Document } from "@arq/schema";
import {
  distanceToPolyline, edgeEnds, edgePolyline, layoutDocument, resolveEdgeStyle,
} from "@arq/render";
import { nodesAt } from "./node-handles";

/** How close the eraser has to pass to take something with it, in document units. */
export const ERASER_RADIUS = 8;

/**
 * Everything the eraser touches at one point.
 *
 * Tested against the document's own geometry — node rects, and each edge's *routed* line — rather
 * than against what the DOM reports under the pointer, so it agrees with what an export would draw
 * and can be exercised without a browser. An edge is hit along its whole length, not just near its
 * ends, which is what makes wiping across a line erase it.
 */
export function eraserHits(doc: Document, p: { x: number; y: number }, radius = ERASER_RADIUS): {
  nodes: string[];
  edges: string[];
} {
  // Everything under the eraser, stacked shapes included — not just the one on top.
  const nodes = nodesAt(doc.nodes, doc.layout.pinned, p, radius);
  const rects = layoutDocument(doc).nodes;
  const edges = doc.edges
    .filter((e) => {
      const ends = edgeEnds(e, rects);
      if (!ends) return false;
      const s = resolveEdgeStyle(e.style);
      return distanceToPolyline(p, edgePolyline(ends.start, ends.end, s.routing, s.bend)) <= radius;
    })
    .map((e) => e.id);
  return { nodes, edges };
}
