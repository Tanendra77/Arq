import type { Document, Endpoint } from "@arq/schema";
import { shapeRect } from "@arq/render";
import { nodeAt } from "./node-handles";

/** How far outside a shape an arrow end still attaches to it. */
export const SNAP_MARGIN = 12;

/**
 * What an edge end becomes when it is released at `p`.
 *
 * Three outcomes, in order: with `pin` held and a shape under the pointer, the end is anchored to
 * the exact spot on that shape; over or merely near a shape, it binds to the shape and the renderer
 * keeps choosing the side that faces the other end; otherwise it is a loose point.
 *
 * Snapping stays the effortless default — a bare drag onto a shape does the sensible thing — and
 * pinning is the deliberate act, because an anchor put somewhere by accident is worse than no
 * anchor at all: the line would meet the shape's middle and appear to run into it.
 */
export function endpointFor(doc: Document, p: { x: number; y: number }, pin: boolean): Endpoint {
  const inside = nodeAt(doc.nodes, doc.layout.pinned, p);
  if (pin && inside !== undefined) {
    const n = doc.nodes.find((x) => x.id === inside)!;
    const r = shapeRect(doc.layout.pinned[inside], n.shape);
    return {
      node: inside,
      // Fractions of the shape's own box, so the spot survives the shape being moved and resized.
      // Rounded, or a drag would write a new document state for every sub-pixel of pointer travel.
      ax: clamp01(round3((p.x - r.x) / r.w)),
      ay: clamp01(round3((p.y - r.y) / r.h)),
    };
  }
  const near = inside ?? nodeAt(doc.nodes, doc.layout.pinned, p, SNAP_MARGIN);
  return near ?? { x: Math.round(p.x), y: Math.round(p.y) };
}

const round3 = (n: number): number => Math.round(n * 1000) / 1000;
const clamp01 = (n: number): number => Math.min(1, Math.max(0, n));
