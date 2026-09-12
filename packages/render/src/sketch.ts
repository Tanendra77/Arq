import rough from "roughjs";
import type { NodeShape } from "@arq/schema";
import { DASH_ARRAY, shapeOutline, type Point, type ResolvedEdgeStyle, type ResolvedNodeStyle, type Rect } from "./metrics";

/**
 * Hand-drawn geometry, via rough.js — the same library Excalidraw draws with.
 *
 * Everything here runs through `RoughGenerator`, which is pure geometry: it returns path data and
 * never touches a canvas or the DOM. That is what lets the editor and the SVG exporter share it,
 * exactly as they already share `shapeOutline` and `edgePath`. Rough's jitter comes from a seeded
 * PRNG, so a given (seed, shape, size) always produces the same path — the export stays byte-stable
 * and the on-screen shape is the shape you get in the file.
 */
const generator = rough.generator();

/** Two decimals, the rounding every other coordinate in this package uses. */
const r2 = (n: number): number => Math.round(n * 100) / 100;

/**
 * Round the floats inside generated path data.
 *
 * Rough emits full double precision (`-1.213032502681017`), which triples the size of an export for
 * no visible difference. Rounding here also removes any chance that two JS engines disagree in the
 * last digit of a `Number.toString`, which the byte-for-byte Node-vs-browser parity test would
 * otherwise be at the mercy of.
 */
function roundPath(d: string): string {
  return d.replace(/-?\d+\.\d+/g, (m) => String(r2(Number(m))));
}

/**
 * A stable seed for one element, derived from its id (FNV-1a).
 *
 * Excalidraw stores a random `seed` on every element. Deriving it from the id instead keeps the
 * document schema unchanged and is still stable for the life of the element: the same node wobbles
 * the same way on every machine and in every export, and two nodes never wobble identically.
 */
export function seedFromId(id: string): number {
  let h = 2166136261;
  for (let i = 0; i < id.length; i += 1) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  // rough treats 0 as "no seed" and picks a random one, which would break determinism.
  return (h >>> 0) % 2147483647 || 1;
}

/**
 * Serialize rough's output. Rough has already resolved stroke/fill per path; the dash is applied
 * here instead, because `toPaths` drops `strokeLineDash` (it only reaches rough's canvas renderer).
 * It goes on stroke paths only — a dashed fill would show the background through the gaps.
 */
function toSvg(drawable: ReturnType<typeof generator.rectangle>, dash: string | undefined): string {
  return generator
    .toPaths(drawable)
    .map((p) => {
      const attrs = [
        `d="${roundPath(p.d)}"`,
        `stroke="${p.stroke}"`,
        `stroke-width="${r2(p.strokeWidth)}"`,
        `fill="${p.fill === undefined || p.fill === "" ? "none" : p.fill}"`,
        dash !== undefined && p.stroke !== "none" ? `stroke-dasharray="${dash}"` : "",
      ].filter((a) => a !== "");
      return `<path ${attrs.join(" ")}/>`;
    })
    .join("");
}

/** A node outline drawn by hand. Returns "" for shapes that have no outline (`text`). */
export function sketchShape(shape: NodeShape, r: Rect, s: ResolvedNodeStyle, seed: number): string {
  const dash = DASH_ARRAY[s.strokeDash];
  const opts = {
    seed,
    roughness: s.roughness,
    stroke: s.stroke,
    strokeWidth: s.strokeWidth,
    fill: s.fill,
    // Solid, not rough's default hachure: a document's fill colour is a fill, and cross-hatching it
    // would change what every existing diagram looks like rather than just how its edges wobble.
    fillStyle: "solid",
  } as const;

  const cx = r.x + r.w / 2;
  const cy = r.y + r.h / 2;
  switch (shape) {
    case "rect":
      return toSvg(generator.rectangle(r.x, r.y, r.w, r.h, opts), dash);
    case "ellipse":
      return toSvg(generator.ellipse(cx, cy, r.w, r.h, opts), dash);
    case "diamond":
      return toSvg(
        generator.polygon([[cx, r.y], [r.x + r.w, cy], [cx, r.y + r.h], [r.x, cy]], opts),
        dash,
      );
    case "triangle":
      return toSvg(
        generator.polygon([[cx, r.y], [r.x + r.w, r.y + r.h], [r.x, r.y + r.h]], opts),
        dash,
      );
    case "text":
      return "";
  }
}

/**
 * Arrowhead geometry, drawn rather than placed as an SVG `<marker>`.
 *
 * This is how Excalidraw draws them, and it is what makes a head look like part of the same
 * stroke: the barbs pick up the line's own wobble instead of sitting on the end as a crisp
 * machine-made triangle. At roughness 0 rough.js draws the exact geometry, so the clean look is
 * the same code path with no jitter — there is no second arrowhead implementation to keep in step.
 *
 * `tip` is the point of the head and `dir` the unit direction it faces (from `edgeTangents`).
 */
function arrowhead(kind: string, tip: Point, dir: Point, s: ResolvedEdgeStyle, seed: number): string {
  if (kind === "none") return "";
  // Scales a little with stroke weight so a heavy line does not outgrow its own head.
  const len = 11 + s.strokeWidth * 2;
  const opts = { seed, roughness: s.roughness, stroke: s.stroke, strokeWidth: s.strokeWidth } as const;
  const filled = { ...opts, fill: s.stroke, fillStyle: "solid" } as const;
  // The two directions the barbs run, `BARB` radians either side of straight back.
  const BARB = 0.45;
  const back = (angle: number, dist: number): Point => {
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    return { x: tip.x - (dir.x * cos - dir.y * sin) * dist, y: tip.y - (dir.x * sin + dir.y * cos) * dist };
  };

  if (kind === "arrow") {
    // Two open strokes, not a closed triangle: the hand-drawn "V".
    return toSvg(generator.linearPath([[back(BARB, len).x, back(BARB, len).y], [tip.x, tip.y], [back(-BARB, len).x, back(-BARB, len).y]], opts), undefined);
  }
  if (kind === "triangle") {
    const a = back(BARB, len);
    const b = back(-BARB, len);
    return toSvg(generator.polygon([[tip.x, tip.y], [a.x, a.y], [b.x, b.y]], filled), undefined);
  }
  if (kind === "diamond") {
    const a = back(BARB, len);
    const b = back(-BARB, len);
    const tail = back(0, len * 1.6);
    return toSvg(generator.polygon([[tip.x, tip.y], [a.x, a.y], [tail.x, tail.y], [b.x, b.y]], filled), undefined);
  }
  // circle
  const r = len * 0.35;
  const c = back(0, r);
  return toSvg(generator.ellipse(c.x, c.y, r * 2, r * 2, filled), undefined);
}

/**
 * An edge drawn by hand, from the path `edgePath` already routed.
 *
 * `preserveVertices` keeps the two ends exactly where the router put them, so an arrow still meets
 * the shape it is bound to and the arrowhead marker still points the right way — only the middle
 * of the line wobbles.
 */
export function sketchPath(d: string, s: ResolvedEdgeStyle, seed: number): string {
  return toSvg(
    generator.path(d, {
      seed,
      roughness: s.roughness,
      stroke: s.stroke,
      strokeWidth: s.strokeWidth,
      fill: "none",
      preserveVertices: true,
    }),
    DASH_ARRAY[s.strokeDash],
  );
}

/**
 * The painted markup for a node's outline — the one function the editor and the exporter both
 * call, so a shape can never be drawn two different ways.
 *
 * At roughness 0 it emits the exact geometric outline (`shapeOutline` with the resolved paint
 * spliced in, which is what this package did everywhere before hand-drawn rendering existed);
 * above 0 it emits rough.js's sketched version of the same shape.
 */
export function shapeMarkup(shape: NodeShape, r: Rect, s: ResolvedNodeStyle, seed: number): string {
  if (s.roughness > 0) return sketchShape(shape, r, s, seed);
  const outline = shapeOutline(shape, r, s.radius);
  if (!outline) return "";
  const dash = DASH_ARRAY[s.strokeDash];
  // shapeOutline emits one element with no paint attributes, ending in `/>`.
  return outline.replace(
    "/>",
    ` fill="${s.fill}" stroke="${s.stroke}" stroke-width="${r2(s.strokeWidth)}"${dash ? ` stroke-dasharray="${dash}"` : ""}/>`,
  );
}

/**
 * The painted markup for a whole edge: its line and both arrowheads.
 *
 * Heads are drawn here rather than referenced as `<marker>` defs, which is why `collectDefs` no
 * longer emits any — one arrow is one set of paths, in the document's own coordinates, and the
 * heads share the line's hand-drawn character instead of being crisp stamps on the end of it.
 */
export function edgeMarkup(
  d: string,
  s: ResolvedEdgeStyle,
  seed: number,
  ends: { start: Point; end: Point; startDir: Point; endDir: Point },
): string {
  const dash = DASH_ARRAY[s.strokeDash];
  const line =
    s.roughness > 0
      ? sketchPath(d, s, seed)
      : `<path d="${d}" fill="none" stroke="${s.stroke}" stroke-width="${r2(s.strokeWidth)}"${dash ? ` stroke-dasharray="${dash}"` : ""}/>`;
  // Distinct seeds per head, or both ends of the same edge would wobble in lockstep.
  return (
    line +
    arrowhead(s.startArrow, ends.start, ends.startDir, s, seed + 1) +
    arrowhead(s.endArrow, ends.end, ends.endDir, s, seed + 2)
  );
}
