import { z } from "zod";
import { Id, IconId } from "./ids";
import { ColorSchema, EdgeStyleSchema, GROUP_KINDS, NODE_SHAPES, NodeStyleSchema } from "./shapes";

export const PointSchema = z.object({ x: z.number(), y: z.number() }).strict();

/**
 * An edge end bound to a shape at a chosen spot on it, as fractions of the shape's own box:
 * `{ ax: 0, ay: 0 }` is its top-left corner and `{ ax: 1, ay: 1 }` its bottom-right.
 *
 * Fractions rather than coordinates, so the attachment survives the shape being moved *and*
 * resized — the point stays where the author put it relative to the shape.
 */
export const AnchoredSchema = z.object({
  node: Id,
  ax: z.number().min(0).max(1),
  ay: z.number().min(0).max(1),
}).strict();
export type Anchored = z.infer<typeof AnchoredSchema>;

/**
 * One end of an edge, in three forms: a node id (bound, the renderer picks the facing side), an
 * anchored binding (bound at a spot the author chose), or a loose point.
 */
export const EndpointSchema = z.union([Id, AnchoredSchema, PointSchema]);
export type Endpoint = z.infer<typeof EndpointSchema>;

/** True for the plain bound form, where the renderer chooses the side. */
export function isNodeRef(e: Endpoint): e is string {
  return typeof e === "string";
}

export function isAnchored(e: Endpoint): e is Anchored {
  return typeof e === "object" && "node" in e;
}

/** The node an end is attached to, whichever bound form it takes; undefined for a loose point. */
export function endpointNode(e: Endpoint): string | undefined {
  if (isNodeRef(e)) return e;
  return isAnchored(e) ? e.node : undefined;
}

export const NodeSchema = z.object({
  id: Id,
  shape: z.enum(NODE_SHAPES),
  label: z.string(),
  icon: IconId.optional(),
  group: Id.optional(),
  style: NodeStyleSchema.optional(),
  /**
   * Stacking order among every shape and line: higher draws on top. Unset is 0; at equal values
   * lines sit under shapes, each in document order — which is exactly how a file with no `z`
   * anywhere has always drawn.
   */
  z: z.number().int().optional(),
  /**
   * A freehand stroke's path, as [x, y] pairs normalised to 0..1 within the node's own box.
   * Normalised rather than absolute so resizing a drawing scales the drawing, the same way it
   * scales any other shape.
   */
  points: z.array(z.tuple([z.number().min(0).max(1), z.number().min(0).max(1)])).max(5000).optional(),
  // Free-form carrier for v1 `props` so a migration never silently drops authored data.
  meta: z.record(z.string()).optional(),
}).strict();

export const EdgeSchema = z.object({
  id: Id,
  from: EndpointSchema,
  to: EndpointSchema,
  label: z.string().optional(),
  // Unread in v2. Kept because JSON generation and flow animation both need it; dropping it
  // now would mean a third document version within two features.
  kind: z.string().optional(),
  style: EdgeStyleSchema.optional(),
  /**
   * Stacking order among every shape and line: higher draws on top. Unset is 0; at equal values
   * lines sit under shapes, each in document order — which is exactly how a file with no `z`
   * anywhere has always drawn.
   */
  z: z.number().int().optional(),
  /**
   * A right-angled route the author shaped by hand: where each leg between the ends runs, in
   * document coordinates, alternating x (a vertical leg) and y (a horizontal leg), first leg
   * leaving the start horizontally. Absent means the router picks the route.
   */
  legs: z.array(z.number()).max(64).optional(),
  /** Points a straight or curved line passes through between its ends, in order. */
  via: z.array(PointSchema).max(64).optional(),
  // Free-form carrier for v1 edge `props` (e.g. `qos`, `mode`) so a migration never silently drops authored data.
  meta: z.record(z.string()).optional(),
}).strict();

export const GroupSchema = z.object({
  id: Id,
  label: z.string(),
  kind: z.enum(GROUP_KINDS),
  parent: Id.optional(),
}).strict();

export const AnnotationSchema = z.object({
  id: Id,
  type: z.literal("note"),
  text: z.string(),
  x: z.number(),
  y: z.number(),
}).strict();

export const PinnedSchema = z.object({
  x: z.number(),
  y: z.number(),
  w: z.number().positive().optional(),
  h: z.number().positive().optional(),
}).strict();

export const LayoutSchema = z.object({
  engine: z.literal("elk").default("elk"),
  direction: z.enum(["RIGHT", "DOWN", "LEFT", "UP"]).default("RIGHT"),
  pinned: z.record(Id, PinnedSchema).default({}),
}).strict();

const DocumentBase = z.object({
  version: z.literal(2),
  kind: z.enum(["event-flow", "deployment", "topology", "generic"]).default("generic"),
  title: z.string().default("Untitled"),
  // Optional so every pre-existing v2 document stays valid; absent means "use @arq/render's
  // STYLE_DEFAULTS.canvasBackground" (see render-svg.ts), never retyped here.
  canvasBackground: ColorSchema.optional(),
  nodes: z.array(NodeSchema).default([]),
  edges: z.array(EdgeSchema).default([]),
  groups: z.array(GroupSchema).default([]),
  annotations: z.array(AnnotationSchema).default([]),
  layout: LayoutSchema.default({}),
}).strict();

export const DocumentSchema = DocumentBase.superRefine((doc, ctx) => {
  const issue = (path: (string | number)[], message: string) =>
    ctx.addIssue({ code: z.ZodIssueCode.custom, path, message });

  // `__ep:` is the id prefix `@arq/core` uses for the hidden node that stands in for a loose edge
  // endpoint (see `endpointNodeId` in packages/core/src/flow/to-flow.ts). `Id`'s grammar otherwise
  // permits it, so without this check an authored id here could collide with that synthetic one.
  const RESERVED_ID_PREFIX = "__ep:";
  const rejectReservedId = (path: (string | number)[], id: string) => {
    if (id.startsWith(RESERVED_ID_PREFIX)) {
      issue(path, `id "${id}" uses the reserved "${RESERVED_ID_PREFIX}" prefix, which is reserved for internal use`);
    }
  };

  const nodeIds = new Set<string>();
  doc.nodes.forEach((n, i) => {
    if (nodeIds.has(n.id)) issue(["nodes", i, "id"], `duplicate node id "${n.id}"`);
    nodeIds.add(n.id);
    rejectReservedId(["nodes", i, "id"], n.id);
  });
  const groupIds = new Set<string>();
  doc.groups.forEach((g, i) => {
    if (groupIds.has(g.id)) issue(["groups", i, "id"], `duplicate group id "${g.id}"`);
    if (nodeIds.has(g.id)) issue(["groups", i, "id"], `group id "${g.id}" collides with a node id`);
    groupIds.add(g.id);
    rejectReservedId(["groups", i, "id"], g.id);
  });
  const edgeIds = new Set<string>();
  doc.edges.forEach((e, i) => {
    if (edgeIds.has(e.id)) issue(["edges", i, "id"], `duplicate edge id "${e.id}"`);
    edgeIds.add(e.id);
    rejectReservedId(["edges", i, "id"], e.id);
    for (const side of ["from", "to"] as const) {
      const bound = endpointNode(e[side]);
      if (bound !== undefined && !nodeIds.has(bound))
        issue(["edges", i, side], `edge "${e.id}" references missing node "${bound}"`);
    }
  });
  doc.nodes.forEach((n, i) => {
    if (n.group !== undefined && !groupIds.has(n.group))
      issue(["nodes", i, "group"], `node "${n.id}" references missing group "${n.group}"`);
  });
  const parentOf = new Map(doc.groups.map((g) => [g.id, g.parent]));
  doc.groups.forEach((g, i) => {
    if (g.parent !== undefined && !groupIds.has(g.parent))
      issue(["groups", i, "parent"], `group "${g.id}" references missing parent "${g.parent}"`);
    const seen = new Set<string>([g.id]);
    let cur = g.parent;
    while (cur !== undefined) {
      if (seen.has(cur)) { issue(["groups", i, "parent"], `group parent cycle through "${g.id}"`); break; }
      seen.add(cur);
      cur = parentOf.get(cur);
    }
  });
  for (const id of Object.keys(doc.layout.pinned)) {
    if (!nodeIds.has(id) && !groupIds.has(id))
      issue(["layout", "pinned", id], `pinned entry "${id}" matches no node or group`);
  }
});

export type Document = z.infer<typeof DocumentSchema>;
export type DocumentInput = z.input<typeof DocumentBase>;
export type ArqNode = z.infer<typeof NodeSchema>;
export type ArqEdge = z.infer<typeof EdgeSchema>;
export type ArqGroup = z.infer<typeof GroupSchema>;
export type Pinned = z.infer<typeof PinnedSchema>;
export type DocumentKind = Document["kind"];
export type LayoutDirection = Document["layout"]["direction"];

export function emptyDocument(title = "Untitled"): Document {
  return DocumentSchema.parse({ version: 2, title });
}
