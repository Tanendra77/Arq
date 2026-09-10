export class MigrationError extends Error {
  constructor(public readonly foundVersion: unknown) {
    super(`unsupported document version ${String(foundVersion)}; this build reads version 2`);
    this.name = "MigrationError";
  }
}

const V1_DOMAIN_TYPES = new Set([
  "broker", "queue", "topic", "app", "consumer", "publisher",
  "mesh", "gateway", "store", "external",
]);

/** v1 edge kinds to their v2 visual treatment, taken from the v1 EDGE_DASH/EDGE_MARKERS tables. */
const V1_EDGE_STYLE: Record<string, { strokeDash?: "dashed" | "dotted"; startArrow: string; endArrow: string }> = {
  publish: { startArrow: "none", endArrow: "arrow" },
  subscribe: { startArrow: "none", endArrow: "arrow" },
  bind: { strokeDash: "dashed", startArrow: "none", endArrow: "none" },
  bridge: { strokeDash: "dashed", startArrow: "arrow", endArrow: "arrow" },
  dmr: { strokeDash: "dotted", startArrow: "arrow", endArrow: "arrow" },
  replication: { strokeDash: "dashed", startArrow: "none", endArrow: "arrow" },
  "request-reply": { startArrow: "arrow", endArrow: "arrow" },
  generic: { startArrow: "none", endArrow: "arrow" },
};

type V1Node = { id: string; type: string; label: string; icon?: string; group?: string; props?: Record<string, unknown> };
type V1Edge = { id: string; from: string; to: string; kind: string; label?: string; props?: Record<string, unknown> };

/** Stringifies every prop value (v1 allowed booleans/numbers) so nothing is dropped by v2's string-only meta. */
function propsToMeta(props: Record<string, unknown> | undefined): Record<string, string> | undefined {
  const meta: Record<string, string> = {};
  for (const [k, v] of Object.entries(props ?? {})) if (v !== undefined) meta[k] = String(v);
  return Object.keys(meta).length > 0 ? meta : undefined;
}

function migrateNode(n: V1Node): Record<string, unknown> {
  const out: Record<string, unknown> = { id: n.id, shape: "rect", label: n.label };
  if (n.icon !== undefined) out["icon"] = n.icon;
  else if (V1_DOMAIN_TYPES.has(n.type)) out["icon"] = `solace/${n.type}`;
  if (n.group !== undefined) out["group"] = n.group;
  const meta = propsToMeta(n.props);
  if (meta !== undefined) out["meta"] = meta;
  return out;
}

function migrateEdge(e: V1Edge): Record<string, unknown> {
  const v = V1_EDGE_STYLE[e.kind] ?? { startArrow: "none", endArrow: "arrow" };
  const style: Record<string, unknown> = { startArrow: v.startArrow, endArrow: v.endArrow };
  if (v.strokeDash !== undefined) style["strokeDash"] = v.strokeDash;
  const out: Record<string, unknown> = { id: e.id, from: e.from, to: e.to, kind: e.kind, style };
  if (e.label !== undefined) out["label"] = e.label;
  // v1 edge props (e.g. qos, mode) carried real data; NodeSchema-style meta keeps it from being dropped.
  const meta = propsToMeta(e.props);
  if (meta !== undefined) out["meta"] = meta;
  return out;
}

function v1ToV2(raw: Record<string, unknown>): Record<string, unknown> {
  // Parser boundary: v1 documents aren't validated by a schema before this point, so we
  // narrow with `as` rather than `any` and let migrateNode/migrateEdge tolerate missing fields.
  // A missing field legitimately defaults to [] (DocumentSchema also defaults it there), but a
  // *present, malformed* field (an object, a string, null) is passed through unchanged rather
  // than coerced to [] — coercing would silently discard the user's data instead of letting
  // DocumentSchema reject it with a real validation error.
  const nodes = "nodes" in raw ? (Array.isArray(raw["nodes"]) ? (raw["nodes"] as V1Node[]).map(migrateNode) : raw["nodes"]) : [];
  const edges = "edges" in raw ? (Array.isArray(raw["edges"]) ? (raw["edges"] as V1Edge[]).map(migrateEdge) : raw["edges"]) : [];
  return { ...raw, version: 2, nodes, edges };
}

/** Steps run oldest first. Version 2 is returned untouched. */
export function migrate(raw: unknown): unknown {
  const version = typeof raw === "object" && raw !== null ? (raw as { version?: unknown }).version : undefined;
  if (version === 2) return raw;
  if (version === 1) return v1ToV2(raw as Record<string, unknown>);
  throw new MigrationError(version);
}
