import { z } from "zod";
import { Id, IconId } from "./ids";
import { EdgeStyleSchema, GROUP_KINDS, NODE_SHAPES, NodeStyleSchema } from "./shapes";

export const PointSchema = z.object({ x: z.number(), y: z.number() }).strict();

/** A node id, or a loose point for a free-floating line end. */
export const EndpointSchema = z.union([Id, PointSchema]);
export type Endpoint = z.infer<typeof EndpointSchema>;

export function isNodeRef(e: Endpoint): e is string {
  return typeof e === "string";
}

export const NodeSchema = z.object({
  id: Id,
  shape: z.enum(NODE_SHAPES),
  label: z.string(),
  icon: IconId.optional(),
  group: Id.optional(),
  style: NodeStyleSchema.optional(),
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
  nodes: z.array(NodeSchema).default([]),
  edges: z.array(EdgeSchema).default([]),
  groups: z.array(GroupSchema).default([]),
  annotations: z.array(AnnotationSchema).default([]),
  layout: LayoutSchema.default({}),
}).strict();

export const DocumentSchema = DocumentBase.superRefine((doc, ctx) => {
  const issue = (path: (string | number)[], message: string) =>
    ctx.addIssue({ code: z.ZodIssueCode.custom, path, message });

  const nodeIds = new Set<string>();
  doc.nodes.forEach((n, i) => {
    if (nodeIds.has(n.id)) issue(["nodes", i, "id"], `duplicate node id "${n.id}"`);
    nodeIds.add(n.id);
  });
  const groupIds = new Set<string>();
  doc.groups.forEach((g, i) => {
    if (groupIds.has(g.id)) issue(["groups", i, "id"], `duplicate group id "${g.id}"`);
    if (nodeIds.has(g.id)) issue(["groups", i, "id"], `group id "${g.id}" collides with a node id`);
    groupIds.add(g.id);
  });
  const edgeIds = new Set<string>();
  doc.edges.forEach((e, i) => {
    if (edgeIds.has(e.id)) issue(["edges", i, "id"], `duplicate edge id "${e.id}"`);
    edgeIds.add(e.id);
    if (isNodeRef(e.from) && !nodeIds.has(e.from))
      issue(["edges", i, "from"], `edge "${e.id}" references missing node "${e.from}"`);
    if (isNodeRef(e.to) && !nodeIds.has(e.to))
      issue(["edges", i, "to"], `edge "${e.id}" references missing node "${e.to}"`);
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
