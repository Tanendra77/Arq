import { z } from "zod";

export const NODE_SHAPES = ["rect", "ellipse", "diamond", "triangle", "text"] as const;
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
 * How an edge animates. "flow" marches its dashes from source to target, the usual way of showing
 * data moving through a diagram; "none" is a still line.
 */
export const EDGE_ANIMATIONS = ["none", "flow"] as const;
export type EdgeAnimation = (typeof EDGE_ANIMATIONS)[number];

/** Where an edge's label sits along its own path: a fraction of the way from source to target. */
export const LABEL_POSITIONS = ["start", "middle", "end"] as const;
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

export const NodeStyleSchema = z.object({
  fill: ColorSchema.optional(),
  stroke: ColorSchema.optional(),
  strokeWidth: z.number().positive().optional(),
  strokeDash: z.enum(DASH_STYLES).optional(),
  radius: z.number().nonnegative().optional(),
  fontSize: z.number().positive().optional(),
  textAlign: z.enum(["left", "center", "right"]).optional(),
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
  animate: z.enum(EDGE_ANIMATIONS).optional(),
  roughness: RoughnessSchema.optional(),
  glow: GlowSchema.optional(),
}).strict();

export type NodeStyle = z.infer<typeof NodeStyleSchema>;
export type EdgeStyle = z.infer<typeof EdgeStyleSchema>;
