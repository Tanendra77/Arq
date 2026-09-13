import { z } from "zod";

/**
 * Every shape a node can take.
 *
 * `polygon` and `star` read their vertex/point count from `style.sides`. `freehand` is a pen stroke:
 * its path lives in the node's own `points`, normalised to its box, so it moves, resizes and rotates
 * exactly like any other shape.
 */
export const NODE_SHAPES = [
  "rect", "ellipse", "diamond", "triangle", "text",
  "polygon", "star", "parallelogram", "cylinder", "cloud", "note", "bubble", "freehand",
] as const;
export type NodeShape = (typeof NODE_SHAPES)[number];

export const DASH_STYLES = ["solid", "dashed", "dotted"] as const;
export type DashStyle = (typeof DASH_STYLES)[number];

export const ARROW_STYLES = ["none", "arrow", "triangle", "diamond", "circle"] as const;
export type ArrowStyle = (typeof ARROW_STYLES)[number];

export const ROUTING_MODES = ["straight", "curved", "orthogonal"] as const;
export type Routing = (typeof ROUTING_MODES)[number];

export const GROUP_KINDS = ["region", "dc", "vpc", "cluster", "zone", "generic"] as const;
export type GroupKind = (typeof GROUP_KINDS)[number];

/**
 * How an element animates.
 *
 * One vocabulary for lines and shapes alike, sharing a single `animate` field: `StylePatch` is the
 * intersection of both style types, so two enums under one name would collapse to their common
 * member and make every other value unassignable.
 *
 * - `flow` marches a line's dashes from source to target.
 * - `packets` sends dots travelling along a line, for showing discrete messages rather than a
 *   continuous stream.
 * - `pulse` breathes an element's opacity; the only one that means anything on a shape.
 */
export const ANIMATIONS = ["none", "flow", "packets", "pulse"] as const;
export type Animation = (typeof ANIMATIONS)[number];

/** What a line can be set to, and what a shape can — both subsets of `ANIMATIONS`. A shape has no
 *  path for packets to ride, but its outline can march just as a line's can. */
export const EDGE_ANIMATIONS = ["none", "flow", "packets", "pulse"] as const;
export const NODE_ANIMATIONS = ["none", "flow", "pulse"] as const;

export const ANIMATION_SPEEDS = ["slow", "normal", "fast"] as const;
export type AnimationSpeed = (typeof ANIMATION_SPEEDS)[number];

export const ANIMATION_DIRECTIONS = ["forward", "reverse"] as const;
export type AnimationDirection = (typeof ANIMATION_DIRECTIONS)[number];

/** Where an edge's label sits along its own path: a fraction of the way from source to target. */
export const LABEL_POSITIONS = ["start", "middle", "end"] as const;

/** Typefaces a label can be set in: the hand-drawn sketch face, or a plain sans, serif or monospace. */
export const FONT_FAMILIES = ["sketch", "sans", "serif", "mono"] as const;
export type FontFamily = (typeof FONT_FAMILIES)[number];
export type LabelPosition = (typeof LABEL_POSITIONS)[number];

/**
 * Hex only. Named colours are rejected so the renderer never has to carry a colour table, and
 * so an exported SVG cannot depend on a browser's notion of "rebeccapurple".
 */
export const ColorSchema = z.string().regex(/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/, "expected #rgb or #rrggbb");

const GlowSchema = z.object({ color: ColorSchema }).strict();

/**
 * How hand-drawn an element looks, in rough.js's own units: 0 draws the exact geometric shape,
 * 1 is the sketched default, 2 is looser still. Unset means the renderer's default (1).
 */
const RoughnessSchema = z.number().min(0).max(3);

/** How a label's text is set — shared by shapes and lines, so one selection styles both alike. */
const TEXT_STYLE = {
  fontSize: z.number().positive().optional(),
  fontFamily: z.enum(FONT_FAMILIES).optional(),
  bold: z.boolean().optional(),
  italic: z.boolean().optional(),
  underline: z.boolean().optional(),
  strike: z.boolean().optional(),
  /** The text's own colour; unset follows the theme on screen and the default ink in an export. */
  textColor: ColorSchema.optional(),
  /** A plate behind the text; unset means none. */
  textBackground: ColorSchema.optional(),
};

export const NodeStyleSchema = z.object({
  fill: ColorSchema.optional(),
  stroke: ColorSchema.optional(),
  strokeWidth: z.number().positive().optional(),
  strokeDash: z.enum(DASH_STYLES).optional(),
  radius: z.number().nonnegative().optional(),
  ...TEXT_STYLE,
  textAlign: z.enum(["left", "center", "right"]).optional(),
  /** Degrees clockwise about the shape's own centre. */
  rotate: z.number().optional(),
  /** Corners of a polygon, or points of a star. Ignored by every other shape. */
  sides: z.number().int().min(3).max(24).optional(),
  animate: z.enum(ANIMATIONS).optional(),
  animateSpeed: z.enum(ANIMATION_SPEEDS).optional(),
  animateDirection: z.enum(ANIMATION_DIRECTIONS).optional(),
  roughness: RoughnessSchema.optional(),
  glow: GlowSchema.optional(),
}).strict();

export const EdgeStyleSchema = z.object({
  stroke: ColorSchema.optional(),
  strokeWidth: z.number().positive().optional(),
  strokeDash: z.enum(DASH_STYLES).optional(),
  routing: z.enum(ROUTING_MODES).optional(),
  startArrow: z.enum(ARROW_STYLES).optional(),
  endArrow: z.enum(ARROW_STYLES).optional(),
  labelPos: z.enum(LABEL_POSITIONS).optional(),
  ...TEXT_STYLE,
  animate: z.enum(ANIMATIONS).optional(),
  animateSpeed: z.enum(ANIMATION_SPEEDS).optional(),
  animateDirection: z.enum(ANIMATION_DIRECTIONS).optional(),
  /** Where an orthogonal route puts its middle leg, as a fraction between the two ends. */
  bend: z.number().min(0.05).max(0.95).optional(),
  roughness: RoughnessSchema.optional(),
  glow: GlowSchema.optional(),
}).strict();

export type NodeStyle = z.infer<typeof NodeStyleSchema>;
export type EdgeStyle = z.infer<typeof EdgeStyleSchema>;
