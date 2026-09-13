import rough from "roughjs";
import type { AnimationSpeed, NodeShape } from "@arq/schema";
import { DASH_ARRAY, shapeOutline, type Point, type ResolvedEdgeStyle, type ResolvedNodeStyle, type Rect } from "./metrics";
import { freehandPathD, shapePathD } from "./shape-paths";

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
 * One drawn path: enough to build either an SVG string (the exporter) or a React `<path>` (the
 * editor) from the same numbers. Handing back data rather than markup is what lets the canvas stop
 * pushing generated HTML into an SVG element — `innerHTML` on SVG is resolved into the HTML
 * namespace by some engines, which renders unpredictably.
 */
export interface PathSpec {
  d: string;
  stroke: string;
  strokeWidth: number;
  fill: string;
  dash: string | undefined;
  /** Painted below full strength — the faint rail an animated line marches over. */
  opacity?: number;
  /** How this path animates, if it does. */
  anim?: PathAnim;
}

export type PathAnim =
  | { kind: "flow"; period: number; duration: number; reverse: boolean }
  | { kind: "packet"; path: string; delay: number; duration: number; reverse: boolean };

/** Class an animated stroke carries. The keyframes live in the stylesheet — `styles.css` for the
 *  editor and the `<style>` block `renderSvg` writes — so an exported file animates on its own. */
export const FLOW_CLASS = "arq-flow";

/**
 * Custom property the keyframes read, so one rule animates any dash pattern seamlessly.
 *
 * It carries a `px` length, not a bare number. As a *presentation attribute* `stroke-dashoffset`
 * accepts a plain number, but as a CSS property — which is what a keyframe sets — it needs a
 * `<length-percentage>`; a unitless value made `calc(var(...) * -2)` invalid, the declaration was
 * dropped, and the animation ran with the offset pinned at zero. It looked completely still.
 */
export const FLOW_PERIOD_VAR = "--arq-flow-period";

export const PACKET_CLASS = "arq-packet";
export const PULSE_CLASS = "arq-pulse";

/**
 * The keyframes behind both line animations, shared by the editor stylesheet and every export.
 *
 * Packets ride `offset-path`, so a dot follows the routed line exactly — including an orthogonal
 * route's corners — with no scripting and nothing for a viewer to run. Each packet is drawn at the
 * origin and placed by the motion path, hence `offset-rotate:0deg`: a circle should not spin as it
 * goes round a corner.
 */
export const FLOW_CSS =
  `@keyframes ${FLOW_CLASS}{to{stroke-dashoffset:calc(var(${FLOW_PERIOD_VAR}) * -2)}}` +
  `.${FLOW_CLASS}{animation:${FLOW_CLASS} 0.9s linear infinite}` +
  `@keyframes ${PACKET_CLASS}{from{offset-distance:0%}to{offset-distance:100%}}` +
  `.${PACKET_CLASS}{offset-rotate:0deg;animation:${PACKET_CLASS} 2.4s linear infinite}` +
  `@keyframes ${PULSE_CLASS}{50%{opacity:0.45}}` +
  `.${PULSE_CLASS}{animation:${PULSE_CLASS} 1.8s ease-in-out infinite}` +
  `@media (prefers-reduced-motion: reduce){.${FLOW_CLASS},.${PACKET_CLASS},.${PULSE_CLASS}{animation:none}}`;

/** How many dots ride a packet line, and how far apart in the loop they sit. */
const PACKET_COUNT = 3;
const PACKET_RADIUS = 3;

/** A dot centred on the origin; `offset-path` moves it along the route. */
function packetDot(r: number): string {
  return `M${-r} 0a${r} ${r} 0 1 0 ${r * 2} 0a${r} ${r} 0 1 0 ${-r * 2} 0`;
}

/** The travelling dots for an edge, evenly spaced around one loop by negative start delays. */
function packets(d: string, s: ResolvedEdgeStyle): PathSpec[] {
  const r = Math.max(PACKET_RADIUS, s.strokeWidth * 1.6);
  const duration = PACKET_SECONDS[s.animateSpeed];
  return Array.from({ length: PACKET_COUNT }, (_, i) => ({
    d: packetDot(r2(r)),
    stroke: "none",
    strokeWidth: 0,
    fill: s.stroke,
    dash: undefined,
    anim: {
      kind: "packet" as const,
      path: d,
      delay: r2((-duration / PACKET_COUNT) * i),
      duration,
      reverse: s.animateDirection === "reverse",
    },
  }));
}

/** The class and inline style an animated path carries. Duration and direction are per-element, so
 *  one pair of keyframes serves every speed and both directions. */
export function animAttrs(a: PathAnim): { className: string; style: Record<string, string> } {
  const common = {
    "animation-duration": `${r2(a.duration)}s`,
    ...(a.reverse ? { "animation-direction": "reverse" } : {}),
  };
  return a.kind === "flow"
    ? { className: FLOW_CLASS, style: { ...common, [FLOW_PERIOD_VAR]: `${r2(a.period)}px` } }
    : {
        className: PACKET_CLASS,
        style: { ...common, "offset-path": `path('${a.path}')`, "animation-delay": `${r2(a.delay)}s` },
      };
}

export function pathSpecToSvg(p: PathSpec): string {
  const anim = p.anim
    ? (() => {
        const { className, style } = animAttrs(p.anim);
        const css = Object.entries(style)
          .map(([k, v]) => `${k}:${v}`)
          .join(";");
        return ` class="${className}" style="${css}"`;
      })()
    : "";
  const opacity = p.opacity === undefined ? "" : ` stroke-opacity="${r2(p.opacity)}"`;
  return `<path d="${p.d}" stroke="${p.stroke}" stroke-width="${r2(p.strokeWidth)}" fill="${p.fill}"${p.dash !== undefined ? ` stroke-dasharray="${p.dash}"` : ""}${opacity}${anim}/>`;
}

/** Seconds per loop at each speed. Dashes cycle quickly; a packet has a whole line to cross. */
const FLOW_SECONDS: Record<AnimationSpeed, number> = { slow: 1.8, normal: 0.9, fast: 0.45 };
const PACKET_SECONDS: Record<AnimationSpeed, number> = { slow: 4.2, normal: 2.4, fast: 1.2 };

/** How faint the underlying line is drawn while dashes march over it. */
const RAIL_OPACITY = 0.3;

/** A still edge keeps whatever dash it was given; an animated one needs *some* pattern to march,
 *  so a solid animated line borrows this one. */
const FLOW_DASH = "8 6";

/**
 * The marching-dash overlay, drawn on the *routed* path.
 *
 * This is the whole reason a flowing sketch line used to look motionless: rough.js draws a stroke
 * as dozens of short sub-paths, and `stroke-dashoffset` restarts at every `M`, so the dashes
 * shuffled within each fragment instead of travelling the line. One clean path over a faint rail
 * marches the way the eye expects, and it behaves identically whether the line is sketched or not.
 */
function flowOverlay(d: string, s: ResolvedEdgeStyle): PathSpec {
  const dash = DASH_ARRAY[s.strokeDash] ?? FLOW_DASH;
  return {
    d,
    stroke: s.stroke,
    strokeWidth: s.strokeWidth,
    fill: "none",
    dash,
    anim: {
      kind: "flow",
      period: dashPeriod(dash),
      duration: FLOW_SECONDS[s.animateSpeed],
      reverse: s.animateDirection === "reverse",
    },
  };
}

function dashPeriod(dash: string): number {
  return dash.split(" ").reduce((a, n) => a + Number(n), 0);
}

/**
 * Rough's output as specs. Rough has already resolved stroke/fill per path; the dash is applied
 * here instead, because `toPaths` drops `strokeLineDash` (it only reaches rough's canvas renderer).
 * It goes on stroke paths only — a dashed fill would show the background through the gaps.
 */
function toSpecs(drawable: ReturnType<typeof generator.rectangle>, dash: string | undefined): PathSpec[] {
  return generator.toPaths(drawable).map((p) => ({
    d: roundPath(p.d),
    stroke: p.stroke,
    strokeWidth: p.strokeWidth,
    fill: p.fill === undefined || p.fill === "" ? "none" : p.fill,
    dash: dash !== undefined && p.stroke !== "none" ? dash : undefined,
  }));
}

/** The same, serialized — the shape renderers still build markup. */
function toSvg(drawable: ReturnType<typeof generator.rectangle>, dash: string | undefined): string {
  return toSpecs(drawable, dash).map(pathSpecToSvg).join("");
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
    default: {
      // Every shape added after the first five is path data, so rough.js sketches it straight from
      // the same `d` the crisp renderer draws — one geometry, two looks.
      const d = shapePathD(shape, r, s.sides);
      return d === undefined ? "" : toSvg(generator.path(d, opts), dash);
    }
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
function arrowhead(kind: string, tip: Point, dir: Point, s: ResolvedEdgeStyle, seed: number): PathSpec[] {
  if (kind === "none") return [];
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
    return toSpecs(generator.linearPath([[back(BARB, len).x, back(BARB, len).y], [tip.x, tip.y], [back(-BARB, len).x, back(-BARB, len).y]], opts), undefined);
  }
  if (kind === "triangle") {
    const a = back(BARB, len);
    const b = back(-BARB, len);
    return toSpecs(generator.polygon([[tip.x, tip.y], [a.x, a.y], [b.x, b.y]], filled), undefined);
  }
  if (kind === "diamond") {
    const a = back(BARB, len);
    const b = back(-BARB, len);
    const tail = back(0, len * 1.6);
    return toSpecs(generator.polygon([[tip.x, tip.y], [a.x, a.y], [tail.x, tail.y], [b.x, b.y]], filled), undefined);
  }
  // circle
  const r = len * 0.35;
  const c = back(0, r);
  return toSpecs(generator.ellipse(c.x, c.y, r * 2, r * 2, filled), undefined);
}

/**
 * An edge drawn by hand, from the path `edgePath` already routed.
 *
 * `preserveVertices` keeps the two ends exactly where the router put them, so an arrow still meets
 * the shape it is bound to and the arrowhead marker still points the right way — only the middle
 * of the line wobbles.
 */
function sketchPathSpecs(d: string, s: ResolvedEdgeStyle, seed: number): PathSpec[] {
  return toSpecs(
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
export function shapeMarkup(
  shape: NodeShape,
  r: Rect,
  s: ResolvedNodeStyle,
  seed: number,
  points?: readonly (readonly [number, number])[],
): string {
  // A pen stroke is ink, not an outline: one filled path in the line colour, never sketched over —
  // rough.js on an already hand-drawn stroke only makes it look drawn twice.
  if (shape === "freehand") {
    const d = freehandPathD(points ?? [], r, s.strokeWidth);
    return d === "" ? "" : `<path d="${d}" fill="${s.stroke}" stroke="none"/>`;
  }
  // No border: the same shape with its outline left unpainted, so the fill still covers exactly
  // the area it did.
  if (s.strokeDash === "none") s = { ...s, stroke: "none" };
  const body = (() => {
    if (s.roughness > 0) return sketchShape(shape, r, s, seed);
    const outline = shapeOutline(shape, r, s.radius, s.sides);
    if (!outline) return "";
    const dash = DASH_ARRAY[s.strokeDash];
    // shapeOutline emits one element with no paint attributes, ending in `/>`.
    return outline.replace(
      "/>",
      ` fill="${s.fill}" stroke="${s.stroke}" stroke-width="${r2(s.strokeWidth)}"${dash ? ` stroke-dasharray="${dash}"` : ""}/>`,
    );
  })();
  return body + borderFlowMarkup(shape, r, s);
}

/**
 * A shape's border marching, for the same reason a line's does: an unfilled copy of the outline
 * laid over the shape, dashed and animated. It rides `shapeOutline` — one uninterrupted element —
 * rather than the sketched body, because dash offset restarts at every sub-path and a rough
 * outline is dozens of them.
 */
export function borderFlowMarkup(shape: NodeShape, r: Rect, s: ResolvedNodeStyle): string {
  if (s.animate !== "flow" || s.strokeDash === "none") return ""; // no border, nothing to march
  const outline = shapeOutline(shape, r, s.radius, s.sides);
  if (!outline) return ""; // a text node has no border to march
  const dash = DASH_ARRAY[s.strokeDash] ?? FLOW_DASH;
  const { className, style } = animAttrs({
    kind: "flow",
    period: dashPeriod(dash),
    duration: FLOW_SECONDS[s.animateSpeed],
    reverse: s.animateDirection === "reverse",
  });
  const css = Object.entries(style)
    .map(([k, v]) => `${k}:${v}`)
    .join(";");
  return outline.replace(
    "/>",
    ` fill="none" stroke="${s.stroke}" stroke-width="${r2(s.strokeWidth)}" stroke-dasharray="${dash}" class="${className}" style="${css}"/>`,
  );
}

/**
 * The painted markup for a whole edge: its line and both arrowheads.
 *
 * Heads are drawn here rather than referenced as `<marker>` defs, which is why `collectDefs` no
 * longer emits any — one arrow is one set of paths, in the document's own coordinates, and the
 * heads share the line's hand-drawn character instead of being crisp stamps on the end of it.
 */
export function edgePaths(
  d: string,
  s: ResolvedEdgeStyle,
  seed: number,
  ends: { start: Point; end: Point; startDir: Point; endDir: Point },
): PathSpec[] {
  // An edge set to no stroke keeps its arrowheads and label but draws no line between them.
  if (s.strokeDash === "none") s = { ...s, stroke: "none" };
  const flowing = s.animate === "flow";
  const dash = DASH_ARRAY[s.strokeDash];
  const line: PathSpec[] = (
    s.roughness > 0
      ? sketchPathSpecs(d, s, seed)
      : [{ d, stroke: s.stroke, strokeWidth: s.strokeWidth, fill: "none", dash }]
  ).map((p) =>
    // While dashes march, the line itself becomes a faint rail: undashed, so the only thing moving
    // is the overlay, and dimmed so the motion is what the eye follows.
    flowing && p.stroke !== "none" ? { ...p, dash: undefined, opacity: RAIL_OPACITY } : p,
  );
  // Distinct seeds per head, or both ends of the same edge would wobble in lockstep.
  return [
    ...line,
    ...arrowhead(s.startArrow, ends.start, ends.startDir, s, seed + 1),
    ...arrowhead(s.endArrow, ends.end, ends.endDir, s, seed + 2),
    // Both animations ride the *routed* path, not the hand-drawn one: they should travel the line
    // the diagram means, rather than wander with the sketch's wobble.
    ...(flowing ? [flowOverlay(d, s)] : []),
    ...(s.animate === "packets" ? packets(d, s) : []),
  ];
}

/** The same edge, serialized for the SVG exporter. */
export function edgeMarkup(
  d: string,
  s: ResolvedEdgeStyle,
  seed: number,
  ends: { start: Point; end: Point; startDir: Point; endDir: Point },
): string {
  return edgePaths(d, s, seed, ends).map(pathSpecToSvg).join("");
}
