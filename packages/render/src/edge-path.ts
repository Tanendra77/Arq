import { METRICS, type Point } from "./metrics";

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

/** The point half way along the polyline by arc length; where an edge label sits. */
function midpoint(points: Point[]): Point {
  let total = 0;
  const lens: number[] = [];
  for (let i = 1; i < points.length; i++) {
    const l = Math.abs(points[i]!.x - points[i - 1]!.x) + Math.abs(points[i]!.y - points[i - 1]!.y);
    lens.push(l);
    total += l;
  }
  let remaining = total / 2;
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

export function edgePath(start: Point, end: Point): { d: string; mid: Point } {
  let points: Point[];
  if (start.y === end.y && end.x >= start.x) {
    points = [start, end];
  } else if (end.x - start.x >= 2 * METRICS.cornerRadius) {
    const midX = (start.x + end.x) / 2;
    points = [start, { x: midX, y: start.y }, { x: midX, y: end.y }, end];
  } else {
    const midY = Math.max(start.y, end.y) + BACKWARD_CLEARANCE;
    points = [
      start,
      { x: start.x + BACKWARD_STUB, y: start.y },
      { x: start.x + BACKWARD_STUB, y: midY },
      { x: end.x - BACKWARD_STUB, y: midY },
      { x: end.x - BACKWARD_STUB, y: end.y },
      end,
    ];
  }
  return { d: roundedPolyline(points, METRICS.cornerRadius), mid: midpoint(points) };
}
