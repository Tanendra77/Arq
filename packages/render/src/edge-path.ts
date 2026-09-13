import type { ArqEdge, Endpoint, LabelPosition, Routing } from "@arq/schema";
import { endpointNode, isAnchored } from "@arq/schema";
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

/**
 * The hand-shaped parts of a route. `bend` slides the middle leg of an automatic right-angled route;
 * `legs` replaces that route entirely; `via` threads a straight or curved line through points.
 * A bare number is accepted as `bend`, for callers that only ever had that.
 */
export interface EdgeRoute {
  bend?: number | undefined;
  legs?: readonly number[] | undefined;
  via?: readonly Point[] | undefined;
}

const asRoute = (r: number | EdgeRoute | undefined): EdgeRoute => (typeof r === "number" ? { bend: r } : r ?? {});

/** The route of an edge as stored: its style's bend plus any hand-shaped legs or via points. */
export function edgeRoute(e: { legs?: readonly number[] | undefined; via?: readonly Point[] | undefined }, bend: number): EdgeRoute {
  return { bend, legs: e.legs, via: e.via };
}

/**
 * A right-angled route through explicit legs: from the start, each coordinate in turn sets where the
 * next leg runs (even entries an x, odd a y), and one last corner turns onto the end. Consecutive
 * points may coincide — a leg of zero length — which is what lets a new turn be added without the
 * line visibly jumping.
 */
export function legPoints(start: Point, end: Point, legs: readonly number[]): Point[] {
  const points = [start];
  let p = start;
  legs.forEach((c, i) => {
    p = i % 2 === 0 ? { x: c, y: p.y } : { x: p.x, y: c };
    points.push(p);
  });
  points.push(legs.length % 2 === 1 ? { x: p.x, y: end.y } : { x: end.x, y: p.y });
  points.push(end);
  return points;
}

/**
 * The same polyline with repeated points, and points partway along a straight run, dropped — for
 * drawing and for directions. A turn added but not yet dragged leaves both behind, and neither should
 * show up as a corner.
 */
function distinct(points: Point[]): Point[] {
  const unique = points.filter((p, i) => i === 0 || p.x !== points[i - 1]!.x || p.y !== points[i - 1]!.y);
  return unique.filter((p, i) => {
    const a = unique[i - 1];
    const b = unique[i + 1];
    return !a || !b || !((a.x === p.x && p.x === b.x) || (a.y === p.y && p.y === b.y));
  });
}

/**
 * The legs that reproduce an axis-aligned polyline — how an automatic route becomes one the author
 * can start dragging without it moving. A route whose first leg is vertical gains a zero-length
 * horizontal one first, since legs always leave the start horizontally.
 */
export function legsFromPoints(points: readonly Point[]): number[] {
  const pts = distinct([...points]);
  if (pts.length < 3) return [];
  // Merge runs of collinear points so each entry is one real leg.
  const corners = [pts[0]!];
  for (let i = 1; i < pts.length - 1; i += 1) {
    const a = corners[corners.length - 1]!;
    const b = pts[i]!;
    const c = pts[i + 1]!;
    if (!((a.x === b.x && b.x === c.x) || (a.y === b.y && b.y === c.y))) corners.push(b);
  }
  corners.push(pts[pts.length - 1]!);
  const legs: number[] = [];
  if (corners[0]!.x === corners[1]!.x) legs.push(corners[0]!.x); // leaves vertically: a zero-length first leg
  // Every leg after the first, except the one that turns onto the end, is fixed by its coordinate.
  for (let i = 1; i < corners.length - 2; i += 1) {
    const a = corners[i]!;
    const b = corners[i + 1]!;
    legs.push(a.x === b.x ? a.x : a.y);
  }
  return legs;
}

/** A leg of a right-angled route that can be dragged, and the handle drawn on it. */
export interface LegHandle {
  /** Index of the segment in `legPoints`. */
  segment: number;
  at: Point;
  /** The segment runs along this axis, so dragging it moves it across the other. */
  horizontal: boolean;
}

/** Handles for every leg of a right-angled route with some length to it. */
export function legHandles(start: Point, end: Point, legs: readonly number[]): LegHandle[] {
  const pts = legPoints(start, end, legs);
  const out: LegHandle[] = [];
  for (let i = 0; i < pts.length - 1; i += 1) {
    const a = pts[i]!;
    const b = pts[i + 1]!;
    if (Math.abs(a.x - b.x) + Math.abs(a.y - b.y) < 12) continue; // too short to grab, or zero length
    out.push({ segment: i, at: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, horizontal: a.y === b.y });
  }
  return out;
}

/**
 * Start dragging segment `segment`: the legs to store, and which entry of them the drag then moves.
 *
 * A middle leg is simply its own entry. The first and last legs are pinned to the ends, so dragging
 * one inserts a new zero-length turn at its middle and moves that instead — which is how a route
 * gains a bend exactly where the author grabbed it.
 */
export function beginLegDrag(start: Point, end: Point, legs: readonly number[], segment: number): { legs: number[]; index: number } {
  const pts = legPoints(start, end, legs);
  const n = legs.length;
  if (segment >= 1 && segment <= n) return { legs: [...legs], index: segment - 1 };
  const a = pts[segment]!;
  const b = pts[segment + 1]!;
  if (segment === 0) {
    // The first leg runs horizontally at the start's y.
    return { legs: [(a.x + b.x) / 2, start.y, ...legs], index: 1 };
  }
  // The last leg: horizontal into the end when there is an odd number of legs, vertical when even.
  return n % 2 === 1
    ? { legs: [...legs, end.y, (a.x + b.x) / 2], index: n }
    : { legs: [...legs, end.x, (a.y + b.y) / 2], index: n };
}

/** Move entry `index` of the legs to follow the pointer, snapping level with either end when close. */
export function dragLeg(start: Point, end: Point, legs: readonly number[], index: number, p: Point, snap = 6): number[] {
  const alongX = index % 2 === 0;
  let v = Math.round(alongX ? p.x : p.y);
  for (const ref of alongX ? [start.x, end.x] : [start.y, end.y]) if (Math.abs(v - ref) <= snap) v = ref;
  const next = [...legs];
  next[index] = v;
  return next;
}

/** Catmull-Rom through the points, as cubic segments: a curve that passes through every via point. */
function curveThrough(points: readonly Point[]): { p0: Point; c1: Point; c2: Point; p3: Point }[] {
  const out = [];
  for (let i = 0; i < points.length - 1; i += 1) {
    const p0 = points[i]!;
    const p3 = points[i + 1]!;
    const prev = points[i - 1] ?? p0;
    const next = points[i + 2] ?? p3;
    const c1 = { x: Number(fmt(p0.x + (p3.x - prev.x) / 6)), y: Number(fmt(p0.y + (p3.y - prev.y) / 6)) };
    const c2 = { x: Number(fmt(p3.x - (next.x - p0.x) / 6)), y: Number(fmt(p3.y - (next.y - p0.y) / 6)) };
    out.push({ p0, c1, c2, p3 });
  }
  return out;
}

function cubicAt(s: { p0: Point; c1: Point; c2: Point; p3: Point }, t: number): Point {
  const u = 1 - t;
  const at = (a: number, b: number, c: number, d: number) => u * u * u * a + 3 * u * u * t * b + 3 * u * t * t * c + t * t * t * d;
  return { x: Number(fmt(at(s.p0.x, s.c1.x, s.c2.x, s.p3.x))), y: Number(fmt(at(s.p0.y, s.c1.y, s.c2.y, s.p3.y))) };
}

/** The point a fraction `t` along a polyline by straight-line length. */
function pointAlong(points: readonly Point[], t: number): Point {
  const lens = points.slice(1).map((p, i) => Math.hypot(p.x - points[i]!.x, p.y - points[i]!.y));
  let remaining = lens.reduce((a, b) => a + b, 0) * t;
  for (let i = 1; i < points.length; i += 1) {
    const l = lens[i - 1]!;
    if (remaining <= l) {
      const k = l === 0 ? 0 : remaining / l;
      const a = points[i - 1]!;
      const b = points[i]!;
      return { x: Number(fmt(a.x + (b.x - a.x) * k)), y: Number(fmt(a.y + (b.y - a.y) * k)) };
    }
    remaining -= l;
  }
  return points[points.length - 1] ?? { x: 0, y: 0 };
}

/** A curve through via points, sampled finely enough to hit-test and to place a label on. */
function sampledCurve(points: readonly Point[]): Point[] {
  const segs = curveThrough(points);
  return [points[0]!, ...segs.flatMap((s) => Array.from({ length: 8 }, (_, i) => cubicAt(s, (i + 1) / 8)))];
}

/** Where a new via point would go between each pair of neighbours, for the "add a bend" handles. */
export function viaInsertPoints(start: Point, end: Point, routing: Routing, via: readonly Point[]): Point[] {
  const pts = [start, ...via, end];
  if (routing === "curved") return curveThrough(pts).map((s) => cubicAt(s, 0.5));
  return pts.slice(1).map((p, i) => ({ x: (pts[i]!.x + p.x) / 2, y: (pts[i]!.y + p.y) / 2 }));
}

/** True when a route has hand-shaped parts that apply to its current routing mode. */
function shaped(routing: Routing, r: EdgeRoute): boolean {
  return routing === "orthogonal" ? r.legs !== undefined : (r.via?.length ?? 0) > 0;
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
  const bound = endpointNode(ep);
  if (bound !== undefined) return nodes.get(bound);
  const p = ep as Point;
  return { x: p.x, y: p.y, w: 0, h: 0 };
}

/**
 * Where an anchored end sits, or undefined when the renderer is free to choose the side.
 *
 * The fractions are of the shape's own box, so the attachment follows the shape through moves and
 * resizes rather than being a coordinate that drifts off it.
 */
export function anchoredPoint(ep: Endpoint, r: Rect): Point | undefined {
  return isAnchored(ep) ? { x: r.x + ep.ax * r.w, y: r.y + ep.ay * r.h } : undefined;
}

/**
 * The two points an edge is drawn between. Each end aims at the *centre* of the other end's box
 * first, then picks its own facing side — so the choice is symmetric and does not depend on which
 * end is resolved first.
 */
export function anchorPair(
  from: Rect,
  to: Rect,
  fixed: { from?: Point | undefined; to?: Point | undefined } = {},
): { start: Point; end: Point } {
  // An end the author pinned is also what the *other* end aims at — otherwise a line would point
  // at a shape's centre while meeting it at a corner.
  const fromAim = fixed.from ?? { x: from.x + from.w / 2, y: from.y + from.h / 2 };
  const toAim = fixed.to ?? { x: to.x + to.w / 2, y: to.y + to.h / 2 };
  return {
    start: fixed.from ?? anchorOn(from, toAim),
    end: fixed.to ?? anchorOn(to, fromAim),
  };
}

export function edgeEnds(e: ArqEdge, nodes: Map<string, Rect>): { start: Point; end: Point } | undefined {
  const from = endpointRect(e.from, nodes);
  const to = endpointRect(e.to, nodes);
  if (!from || !to) return undefined;
  return anchorPair(from, to, { from: anchoredPoint(e.from, from), to: anchoredPoint(e.to, to) });
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
function pathPointAt(start: Point, end: Point, routing: Routing, t: number, route?: number | EdgeRoute): Point {
  const r = asRoute(route);
  if (shaped(routing, r)) {
    if (routing === "orthogonal") return pointAt(legPoints(start, end, r.legs!), t);
    return pointAlong(routing === "curved" ? sampledCurve([start, ...r.via!, end]) : [start, ...r.via!, end], t);
  }
  const bend = r.bend;
  if (routing === "straight") return { x: start.x + (end.x - start.x) * t, y: start.y + (end.y - start.y) * t };
  if (routing === "curved") return curvePointAt(start, end, t);
  return pointAt(orthogonalPoints(start, end, bend), t);
}

/** How far along the path each label position sits. Off the ends so a start/end label clears the
 *  arrowhead and whatever the edge is attached to. */
const LABEL_T: Record<LabelPosition, number> = { start: 0.2, middle: 0.5, end: 0.8 };

/** Where an edge's label plate is centred. The canvas and the SVG exporter both call this, so a
 *  label never sits in one place on screen and another in the export. */
export function edgeLabelPoint(start: Point, end: Point, routing: Routing, pos: LabelPosition, route?: number | EdgeRoute): Point {
  return pathPointAt(start, end, routing, LABEL_T[pos], route);
}

/**
 * The routed line as a polyline, for hit-testing. A curve is sampled finely enough that the gap
 * between chord and arc stays well inside any sensible hit radius.
 */
export function edgePolyline(start: Point, end: Point, routing: Routing, route?: number | EdgeRoute): Point[] {
  const r = asRoute(route);
  if (shaped(routing, r)) {
    if (routing === "orthogonal") return legPoints(start, end, r.legs!);
    return routing === "curved" ? sampledCurve([start, ...r.via!, end]) : [start, ...r.via!, end];
  }
  const bend = r.bend;
  if (routing === "straight") return [start, end];
  if (routing === "orthogonal") return orthogonalPoints(start, end, bend);
  return Array.from({ length: 17 }, (_, i) => curvePointAt(start, end, i / 16));
}

/** Shortest distance from a point to a polyline. */
export function distanceToPolyline(p: Point, line: readonly Point[]): number {
  let best = Infinity;
  for (let i = 1; i < line.length; i += 1) {
    const a = line[i - 1]!;
    const b = line[i]!;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len2 = dx * dx + dy * dy;
    const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2));
    best = Math.min(best, Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy)));
  }
  return best;
}

/**
 * The point on an orthogonal route the bend handle sits on: the middle of the leg that `bend`
 * moves. Undefined for any route without one — a straight run, or a non-orthogonal mode.
 */
export function bendHandlePoint(start: Point, end: Point, routing: Routing, bend: number): Point | undefined {
  // (Only for an automatic route; a hand-shaped one gets a handle per leg from `legHandles`.)
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
export function edgeTangents(start: Point, end: Point, routing: Routing, route?: number | EdgeRoute): { startDir: Point; endDir: Point } {
  const r = asRoute(route);
  const bend = r.bend;
  const unit = (from: Point, to: Point): Point => {
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const len = Math.hypot(dx, dy);
    // A zero-length segment has no direction; pointing right is as good an answer as any and
    // keeps the arrowhead from collapsing to a dot.
    return len === 0 ? { x: 1, y: 0 } : { x: dx / len, y: dy / len };
  };
  if (shaped(routing, r)) {
    if (routing === "orthogonal") {
      const pts = distinct(legPoints(start, end, r.legs!));
      return {
        startDir: unit(pts[1] ?? end, pts[0] ?? start),
        endDir: unit(pts[pts.length - 2] ?? start, pts[pts.length - 1] ?? end),
      };
    }
    const via = r.via!;
    if (routing === "straight") return { startDir: unit(via[0]!, start), endDir: unit(via[via.length - 1]!, end) };
    const segs = curveThrough([start, ...via, end]);
    const first = segs[0]!;
    const last = segs[segs.length - 1]!;
    return {
      startDir: unit(first.c1.x === start.x && first.c1.y === start.y ? first.p3 : first.c1, start),
      endDir: unit(last.c2.x === end.x && last.c2.y === end.y ? last.p0 : last.c2, end),
    };
  }
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

export function edgePath(start: Point, end: Point, routing: Routing, route?: number | EdgeRoute): { d: string; mid: Point } {
  const r = asRoute(route);
  if (shaped(routing, r)) {
    if (routing === "orthogonal") {
      const points = legPoints(start, end, r.legs!);
      return { d: roundedPolyline(distinct(points), METRICS.cornerRadius), mid: pointAt(points, 0.5) };
    }
    const pts = [start, ...r.via!, end];
    if (routing === "straight") {
      return { d: `M${pts.map(pt).join(" L")}`, mid: pointAlong(pts, 0.5) };
    }
    const segs = curveThrough(pts);
    return {
      d: `M${pt(start)} ${segs.map((s) => `C${pt(s.c1)} ${pt(s.c2)} ${pt(s.p3)}`).join(" ")}`,
      mid: pointAlong(sampledCurve(pts), 0.5),
    };
  }
  const bend = r.bend;
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
