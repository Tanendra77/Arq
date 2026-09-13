import {
  EdgeSchema, NodeSchema, PinnedSchema, endpointNode,
  type ArqEdge, type ArqNode, type Document, type Endpoint, type Pinned,
} from "@arq/schema";
import { edgeEnds, layoutDocument } from "@arq/render";
import { parseEndpointNodeId } from "../flow/endpoint-id";
import type { Selection } from "./editor-store";

const TAG = "arq/clipboard@1";

/** A copied piece of a document: self-contained, so it pastes into any document, this one or another. */
export interface Clip {
  nodes: ArqNode[];
  edges: ArqEdge[];
  /** Position (and size) per copied node id. */
  pinned: Record<string, Pinned>;
}

/**
 * What copying the selection takes.
 *
 * An edge comes along when it is selected, or when every end of it is — both its shapes, or the
 * hidden stand-ins for its loose ends. An end bound to a shape that is *not* copied is cut free at
 * the spot it currently touches, so the pasted arrow looks the same instead of vanishing.
 */
export function buildClip(doc: Document, sel: Selection): Clip | null {
  const nodeIds = new Set(sel.nodes.filter((id) => doc.nodes.some((n) => n.id === id)));
  const endpointEdges = new Set(sel.nodes.flatMap((id) => parseEndpointNodeId(id)?.edgeId ?? []));
  const selectedEdges = new Set(sel.edges);
  const inSelection = (ep: Endpoint, edgeId: string) => {
    const bound = endpointNode(ep);
    return bound !== undefined ? nodeIds.has(bound) : endpointEdges.has(edgeId);
  };
  const rects = layoutDocument(doc).nodes;

  const edges = doc.edges.flatMap((e) => {
    if (!selectedEdges.has(e.id) && !(inSelection(e.from, e.id) && inSelection(e.to, e.id))) return [];
    const kept = (ep: Endpoint) => {
      const bound = endpointNode(ep);
      return bound === undefined || nodeIds.has(bound);
    };
    const fromKept = kept(e.from);
    const toKept = kept(e.to);
    if (fromKept && toKept) return [e];
    const ends = edgeEnds(e, rects);
    if (!ends) return [];
    return [{ ...e, from: fromKept ? e.from : ends.start, to: toKept ? e.to : ends.end }];
  });

  const nodes = doc.nodes.filter((n) => nodeIds.has(n.id));
  if (nodes.length === 0 && edges.length === 0) return null;
  const pinned: Record<string, Pinned> = {};
  for (const n of nodes) {
    const r = rects.get(n.id);
    pinned[n.id] = doc.layout.pinned[n.id] ?? { x: r?.x ?? 0, y: r?.y ?? 0 };
  }
  return { nodes, edges, pinned };
}

export function serializeClip(clip: Clip): string {
  return JSON.stringify({ type: TAG, ...clip });
}

/**
 * The clip in pasted text, or null when it is not one of ours.
 *
 * Clipboard text can come from anywhere, so every element is checked against the document schema
 * and anything that fails is dropped rather than trusted.
 */
export function parseClip(text: string): Clip | null {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return null;
  }
  if (typeof raw !== "object" || raw === null || (raw as { type?: unknown }).type !== TAG) return null;
  const r = raw as { nodes?: unknown; edges?: unknown; pinned?: unknown };
  const list = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
  const nodes = list(r.nodes).flatMap((n) => {
    const p = NodeSchema.safeParse(n);
    return p.success ? [p.data] : [];
  });
  const edges = list(r.edges).flatMap((e) => {
    const p = EdgeSchema.safeParse(e);
    return p.success ? [p.data] : [];
  });
  const source = typeof r.pinned === "object" && r.pinned !== null ? (r.pinned as Record<string, unknown>) : {};
  const pinned: Record<string, Pinned> = {};
  for (const n of nodes) {
    const p = PinnedSchema.safeParse(source[n.id]);
    if (p.success) pinned[n.id] = p.data;
  }
  return nodes.length > 0 || edges.length > 0 ? { nodes, edges, pinned } : null;
}
