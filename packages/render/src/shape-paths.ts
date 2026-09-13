import { getStroke } from "perfect-freehand";
import type { NodeShape } from "@arq/schema";
import type { Rect } from "./metrics";

const fmt = (n: number) => String(Math.round(n * 100) / 100);
const pt = (x: number, y: number) => `${fmt(x)} ${fmt(y)}`;

/**
 * Path data for every shape added after the original five.
 *
 * One `d` string per shape, and everything draws from it: the crisp renderer as a `<path>`, rough.js
 * through `generator.path`, the marching-border animation, and the palette's swatches. The original
 * rect/ellipse/diamond/triangle keep their SVG primitives instead, so no existing export changes by
 * a single byte.
 *
 * A shape with interior detail — a cylinder's front rim, a note's folded corner — carries it as a
 * further open sub-path in the same `d`. Filling treats an open sub-path as closed, which here only
 * ever re-fills a region already inside the silhouette, so the detail is stroked and the fill is
 * unchanged.
 */
export function shapePathD(shape: NodeShape, r: Rect, sides?: number): string | undefined {
  const { x, y, w, h } = r;
  const cx = x + w / 2;
  const cy = y + h / 2;
  switch (shape) {
    case "polygon":
      return closed(regular(cx, cy, w / 2, h / 2, clampSides(sides ?? 6)));

    case "star": {
      const n = clampSides(sides ?? 5);
      const outer = regular(cx, cy, w / 2, h / 2, n);
      // The inner vertices sit half a step round, at a fixed fraction of the outer radius.
      const inner = regular(cx, cy, (w / 2) * STAR_INNER, (h / 2) * STAR_INNER, n, Math.PI / n);
      return closed(outer.flatMap((p, i) => [p, inner[i]!]));
    }

    case "parallelogram": {
      const k = w * 0.2;
      return `M${pt(x + k, y)} L${pt(x + w, y)} L${pt(x + w - k, y + h)} L${pt(x, y + h)} Z`;
    }

    case "cylinder": {
      // The rim's depth, kept shallow on a tall cylinder and never deeper than a quarter of the width.
      const e = Math.min(h * 0.15, w * 0.25);
      const rx = w / 2;
      return (
        `M${pt(x, y + e)} A${fmt(rx)} ${fmt(e)} 0 0 1 ${pt(x + w, y + e)} ` +
        `L${pt(x + w, y + h - e)} A${fmt(rx)} ${fmt(e)} 0 0 1 ${pt(x, y + h - e)} Z ` +
        // The near half of the top rim, which is what makes it read as a cylinder and not a tab.
        `M${pt(x, y + e)} A${fmt(rx)} ${fmt(e)} 0 0 0 ${pt(x + w, y + e)}`
      );
    }

    case "note": {
      const c = Math.min(w, h) * 0.18;
      return (
        `M${pt(x, y)} L${pt(x + w - c, y)} L${pt(x + w, y + c)} L${pt(x + w, y + h)} L${pt(x, y + h)} Z ` +
        `M${pt(x + w - c, y)} L${pt(x + w - c, y + c)} L${pt(x + w, y + c)}`
      );
    }

    case "bubble": {
      // A rounded body with a tail hanging from its lower left, like a chat message.
      const bb = y + h * 0.78;
      const rr = Math.min(10, w * 0.1, (bb - y) * 0.2);
      return (
        `M${pt(x + rr, y)} L${pt(x + w - rr, y)} Q${pt(x + w, y)} ${pt(x + w, y + rr)} ` +
        `L${pt(x + w, bb - rr)} Q${pt(x + w, bb)} ${pt(x + w - rr, bb)} ` +
        `L${pt(x + w * 0.36, bb)} L${pt(x + w * 0.14, y + h)} L${pt(x + w * 0.22, bb)} ` +
        `L${pt(x + rr, bb)} Q${pt(x, bb)} ${pt(x, bb - rr)} L${pt(x, y + rr)} Q${pt(x, y)} ${pt(x + rr, y)} Z`
      );
    }

    case "cloud": {
      // Five overlapping bumps, laid out in a unit box and stretched to fit. Arc radii scale per axis;
      // a radius too small to join its ends is enlarged by every SVG implementation, so the outline
      // stays closed at any aspect ratio.
      const u = (ux: number, uy: number) => pt(x + ux * w, y + uy * h);
      const a = (rx: number, ry: number, ux: number, uy: number) =>
        `A${fmt(rx * w)} ${fmt(ry * h)} 0 0 1 ${u(ux, uy)}`;
      return (
        `M${u(0.26, 0.92)} ${a(0.18, 0.22, 0.12, 0.54)} ${a(0.2, 0.26, 0.36, 0.2)} ` +
        `${a(0.24, 0.3, 0.76, 0.22)} ${a(0.18, 0.24, 0.9, 0.62)} ${a(0.16, 0.2, 0.72, 0.92)} Z`
      );
    }

    default:
      return undefined;
  }
}

const STAR_INNER = 0.45;

function clampSides(n: number): number {
  return Math.min(24, Math.max(3, Math.round(n)));
}

/** A regular n-gon inscribed in the ellipse the box describes, first vertex straight up. */
function regular(cx: number, cy: number, rx: number, ry: number, n: number, phase = 0): [number, number][] {
  return Array.from({ length: n }, (_, i) => {
    const a = -Math.PI / 2 + phase + (2 * Math.PI * i) / n;
    return [cx + rx * Math.cos(a), cy + ry * Math.sin(a)];
  });
}

function closed(points: [number, number][]): string {
  return points.map(([px, py], i) => `${i === 0 ? "M" : "L"}${pt(px, py)}`).join(" ") + " Z";
}

/**
 * The outline of a pen stroke, as a closed path to be *filled* in the ink colour.
 *
 * perfect-freehand is what Excalidraw draws freehand with: it turns the raw pointer samples into a
 * tapered, smoothed outline that reads as ink rather than as a polyline. It is deterministic, so a
 * stroke renders identically on the canvas and in an export.
 *
 * `points` are normalised to the node's box and stretched to fit it here, which is what makes a
 * resized drawing scale instead of being clipped.
 */
export function freehandPathD(points: readonly (readonly [number, number])[], r: Rect, width: number): string {
  if (points.length === 0) return "";
  const absolute = points.map(([px, py]) => [r.x + px * r.w, r.y + py * r.h]);
  const outline = getStroke(absolute, {
    size: Math.max(2, width * 2.6),
    thinning: 0.5,
    smoothing: 0.5,
    streamline: 0.5,
    simulatePressure: true,
  });
  return strokeToPath(outline);
}

/**
 * perfect-freehand's recommended outline-to-path conversion: quadratic curves through the midpoints
 * of consecutive outline points, which rounds off the polygon it returns into a smooth edge.
 */
function strokeToPath(outline: number[][]): string {
  if (outline.length < 2) return "";
  const [first] = outline;
  let d = `M${pt(first![0]!, first![1]!)} Q`;
  for (let i = 0; i < outline.length; i += 1) {
    const [x0, y0] = outline[i]!;
    const [x1, y1] = outline[(i + 1) % outline.length]!;
    d += ` ${pt(x0!, y0!)} ${pt((x0! + x1!) / 2, (y0! + y1!) / 2)}`;
  }
  return `${d} Z`;
}

/**
 * Normalise raw pointer samples into a box and the 0..1 points a freehand node stores.
 *
 * The box is padded by half the ink width so a stroke's tapered edge is not clipped at the bounds,
 * and never collapses to zero on either axis — a perfectly straight horizontal stroke is still a
 * node you can select and move.
 */
export function normaliseStroke(
  samples: readonly { x: number; y: number }[],
  width: number,
  min = 8,
): { box: Rect; points: [number, number][] } {
  const pad = Math.max(2, width * 1.5);
  const xs = samples.map((p) => p.x);
  const ys = samples.map((p) => p.y);
  let x0 = Math.min(...xs) - pad;
  let y0 = Math.min(...ys) - pad;
  let w = Math.max(...xs) + pad - x0;
  let h = Math.max(...ys) + pad - y0;
  if (w < min) { x0 -= (min - w) / 2; w = min; }
  if (h < min) { y0 -= (min - h) / 2; h = min; }
  const round = (n: number) => Math.round(n * 1000) / 1000;
  return {
    box: { x: Math.round(x0), y: Math.round(y0), w: Math.round(w), h: Math.round(h) },
    points: samples.map((p) => [round((p.x - x0) / w), round((p.y - y0) / h)]),
  };
}
