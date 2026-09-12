import type { ArqEdge, Endpoint, LabelPosition, Routing } from "@arq/schema";
import { isNodeRef } from "@arq/schema";
import { METRICS, type Point, type Rect } from "./metrics";

const fmt = (n: number) => String(Math.round(n * 100) / 100);
const pt = (p: Point) => `${fmt(p.x)} ${fmt(p.y)}`;

/** Emit an axis-aligned polyline with rounded corners. Corners are rounded only when both adjacent segments are at least 2r long. */
function roundedPolyline(points: Point[], r: number): string {
  if (points.length < 2) return "";
  let d = `M${pt(points[0]!)}`;
  for (let i = 1; i < points.length; i++) {
    const prev = points[i - 1]!;
    const cur = points[i]!;
    const next = points[i + 1];
    if (!next) { d += ` L${pt(cur)}`; break; }
    const inLen = Math.abs(cur.x - prev.x) + Math.abs(cur.y - prev.y);
    const outLen = Math.abs(next.x - cur.x) + Math.abs(next.y - cur.y);
    if (inLen < 2 * r || outLen < 2 * r) { d += ` L${pt(cur)}`; continue; }
    const inDir = { x: Math.sign(cur.x - prev.x), y: Math.sign(cur.y - prev.y) };
    const outDir = { x: Math.sign(next.x - cur.x), y: Math.sign(next.y - cur.y) };
    const a = { x: cur.x - inDir.x * r, y: cur.y - inDir.y * r };
    const b = { x: cur.x + outDir.x * r, y: cur.y + outDir.y * r };
    d += ` L${pt(a)} Q${pt(cur)} ${pt(b)}`;
  }
  return d;
}

/** The point a fraction `t` along the polyline by arc length; where an edge label sits. */
function pointAt(points: Point[], t: number): Point {
  let total = 0;
  const lens: number[] = [];
  for (let i = 1; i < points.length; i++) {
    const l = Math.abs(points[i]!.x - points[i - 1]!.x) + Math.abs(points[i]!.y - points[i - 1]!.y);
    lens.push(l);
    total += l;
  }
  let remaining = total * t;
  for (let i = 1; i < points.length; i++) {
    const l = lens[i - 1]!;
    if (remaining <= l) {
      const t = l === 0 ? 0 : remaining / l;
      const a = points[i - 1]!;
      const b = points[i]!;
      return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
    }
    remaining -= l;
  }
  return points[points.length - 1] ?? { x: 0, y: 0 };
}

const BACKWARD_STUB = 20;
const BACKWARD_CLEARANCE = 60;

/**
 * `bend` slides the leg that joins the two ends, as a fraction of the span: 0.5 is the automatic
 * halfway route, and dragging the handle on a selected edge moves it along. Which span it applies
 * to depends on the case — the horizontal one for a forward route, the vertical detour for a
 * backward one — because that is the leg the handle sits on either way.
 */
function orthogonalPoints(start: Point, end: Point, bend = 0.5): Point[] {
  let points: Point[];
  if (start.y === end.y && end.x >= start.x) {
    points = [start, end];
  } else if (end.x - start.x >= 2 * METRICS.cornerRadius) {
    const midX = start.x + (end.x - start.x) * bend;
    points = [start, { x: midX, y: start.y }, { x: midX, y: end.y }, end];
  } else {
    const midY = Math.max(start.y, end.y) + BACKWARD_CLEARANCE * (bend * 2);
    points = [
      start,
      { x: start.x + BACKWARD_STUB, y: start.y },
      { x: start.x + BACKWARD_STUB, y: midY },
      { x: end.x - BACKWARD_STUB, y: midY },
      { x: end.x - BACKWARD_STUB, y: end.y },
      end,
    ];
  }
  return points;
}

/**
 * The four side midpoints of a rect, in a fixed order. The order is the tie-break when two sides
 * are equidistant, so the same document always picks the same anchor and exports the same bytes.
 */
function sideAnchors(r: Rect): Point[] {
  return [
    { x: r.x + r.w, y: r.y + r.h / 2 }, // right
    { x: r.x, y: r.y + r.h / 2 }, // left
    { x: r.x + r.w / 2, y: r.y }, // top
    { x: r.x + r.w / 2, y: r.y + r.h }, // bottom
  ];
}

/**
 * Where an edge meets a box: the side facing whatever is on the other end, rather than a fixed
 * right-for-source / left-for-target pair. This is what lets an arrow mount on any part of a
 * shape — attach one above a node and the line lands on its top edge, not its left.
 *
 * A zero-size rect (the box a loose point endpoint stands in for) returns that point unchanged,
 * so the same function serves both kinds of endpoint.
 */
export function anchorOn(r: Rect, towards: Point): Point {
  let best = { x: r.x, y: r.y };
  let bestDist = Infinity;
  for (const p of sideAnchors(r)) {
    const dist = (p.x - towards.x) ** 2 + (p.y - towards.y) ** 2;
    if (dist < bestDist) {
      bestDist = dist;
      best = p;
    }
  }
  return best;
}

/** The rect an endpoint occupies: a node's box, or the degenerate box at a loose point. */
export function endpointRect(ep: Endpoint, nodes: Map<string, Rect>): Rect | undefined {
  if (!isNodeRef(ep)) return { x: ep.x, y: ep.y, w: 0, h: 0 };
  return nodes.get(ep);
}

/**
 * The two points an edge is drawn between. Each end aims at the *centre* of the other end's box
 * first, then picks its own facing side — so the choice is symmetric and does not depend on which
 * end is resolved first.
 */
export function anchorPair(from: Rect, to: Rect): { start: Point; end: Point } {
  const fromCentre = { x: from.x + from.w / 2, y: from.y + from.h / 2 };
  const toCentre = { x: to.x + to.w / 2, y: to.y + to.h / 2 };
  return { start: anchorOn(from, toCentre), end: anchorOn(to, fromCentre) };
}

export function edgeEnds(e: ArqEdge, nodes: Map<string, Rect>): { start: Point; end: Point } | undefined {
  const from = endpointRect(e.from, nodes);
  const to = endpointRect(e.to, nodes);
  if (!from || !to) return undefined;
  return anchorPair(from, to);
}

function curveControls(start: Point, end: Point): { c1: Point; c2: Point } {
  const dx = Math.max(Math.abs(end.x - start.x) / 2, 30);
  return { c1: { x: start.x + dx, y: start.y }, c2: { x: end.x - dx, y: end.y } };
}

function curvePointAt(start: Point, end: Point, t: number): Point {
  const { c1, c2 } = curveControls(start, end);
  const at = (a: number, b: number, c: number, d: number) => {
    const u = 1 - t;
    return u * u * u * a + 3 * u * u * t * b + 3 * u * t * t * c + t * t * t * d;
  };
  // Round through fmt (not raw floats) so the point is deterministic byte-for-byte — a cubic
  // bezier midpoint like 24.999999999999996 would otherwise fail SVG parity tests.
  return { x: Number(fmt(at(start.x, c1.x, c2.x, end.x))), y: Number(fmt(at(start.y, c1.y, c2.y, end.y))) };
}

/** The point a fraction `t` along an edge, whichever way it is routed. */
function pathPointAt(start: Point, end: Point, routing: Routing, t: number, bend?: number): Point {
  if (routing === "straight") return { x: start.x + (end.x - start.x) * t, y: start.y + (end.y - start.y) * t };
  if (routing === "curved") return curvePointAt(start, end, t);
  return pointAt(orthogonalPoints(start, end, bend), t);
}

/** How far along the path each label position sits. Off the ends so a start/end label clears the
 *  arrowhead and whatever the edge is attached to. */
const LABEL_T: Record<LabelPosition, number> = { start: 0.2, middle: 0.5, end: 0.8 };

/** Where an edge's label plate is centred. The canvas and the SVG exporter both call this, so a
 *  label never sits in one place on screen and another in the export. */
export function edgeLabelPoint(start: Point, end: Point, routing: Routing, pos: LabelPosition, bend?: number): Point {
  return pathPointAt(start, end, routing, LABEL_T[pos], bend);
}

/**
 * The point on an orthogonal route the bend handle sits on: the middle of the leg that `bend`
 * moves. Undefined for any route without one — a straight run, or a non-orthogonal mode.
 */
export function bendHandlePoint(start: Point, end: Point, routing: Routing, bend: number): Point | undefined {
  if (routing !== "orthogonal") return undefined;
  const pts = orthogonalPoints(start, end, bend);
  if (pts.length < 4) return undefined; // a single straight leg has nothing to slide
  const a = pts[1]!;
  const b = pts[2]!;
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

/** Turn a dragged handle position back into a `bend` fraction, clamped to the schema's range. */
export function bendFromPoint(start: Point, end: Point, p: Point): number {
  const span = end.x - start.x;
  const raw = span === 0 ? 0.5 : (p.x - start.x) / span;
  return Math.min(0.95, Math.max(0.05, Number(raw.toFixed(3))));
}

/**
 * Unit vectors pointing *out* of each end of the routed path — the direction an arrowhead at that
 * end faces. Taken from the path's own first/last segment, so a head sits along the line it caps
 * whichever way the edge was routed.
 */
export function edgeTangents(start: Point, end: Point, routing: Routing, bend?: number): { startDir: Point; endDir: Point } {
  const unit = (from: Point, to: Point): Point => {
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const len = Math.hypot(dx, dy);
    // A zero-length segment has no direction; pointing right is as good an answer as any and
    // keeps the arrowhead from collapsing to a dot.
    return len === 0 ? { x: 1, y: 0 } : { x: dx / len, y: dy / len };
  };
  if (routing === "curved") {
    const { c1, c2 } = curveControls(start, end);
    return { startDir: unit(c1, start), endDir: unit(c2, end) };
  }
  if (routing === "straight") return { startDir: unit(end, start), endDir: unit(start, end) };
  const pts = orthogonalPoints(start, end, bend);
  return {
    startDir: unit(pts[1] ?? end, pts[0] ?? start),
    endDir: unit(pts[pts.length - 2] ?? start, pts[pts.length - 1] ?? end),
  };
}

export function edgePath(start: Point, end: Point, routing: Routing, bend?: number): { d: string; mid: Point } {
  if (routing === "straight") {
    return { d: `M${pt(start)} L${pt(end)}`, mid: pathPointAt(start, end, routing, 0.5) };
  }
  if (routing === "curved") {
    const { c1, c2 } = curveControls(start, end);
    return { d: `M${pt(start)} C${pt(c1)} ${pt(c2)} ${pt(end)}`, mid: curvePointAt(start, end, 0.5) };
  }
  const points = orthogonalPoints(start, end, bend);
  return { d: roundedPolyline(points, METRICS.cornerRadius), mid: pointAt(points, 0.5) };
}
