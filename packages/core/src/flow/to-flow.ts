import type { Edge, Node } from "@xyflow/react";
import type { Document, Endpoint, NodeShape, NodeStyle, EdgeStyle, Pinned } from "@arq/schema";
import { isNodeRef } from "@arq/schema";
import type { Selection } from "../store/editor-store";
import { endpointNodeId } from "./endpoint-id";

export { endpointNodeId, parseEndpointNodeId } from "./endpoint-id";

export type ArqNodeData = {
  label: string;
  shape: NodeShape;
  style: NodeStyle | undefined;
  iconSvg: string | undefined;
  iconId: string | undefined;
  /** The document's pinned rect for this node, if any — carried through so `ArqNode` can size
   * itself with `@arq/render`'s `shapeRect`, exactly as the SVG exporter does. */
  pinned: Pinned | undefined;
};
export type ArqEdgeData = { label: string | undefined; style: EdgeStyle | undefined };

/** Empty data for the hidden node standing in for a loose edge endpoint (see `endpointNodeId`). */
export type ArqEndpointData = Record<string, never>;

export type ArqFlowNode = Node<ArqNodeData, "arq"> | Node<ArqEndpointData, "arqEndpoint">;
export type ArqFlowEdge = Edge<ArqEdgeData, "arq">;

export type IconResolver = (id: string | undefined) => string | undefined;

export function toFlow(doc: Document, resolveIcon: IconResolver, selection: Selection): { nodes: ArqFlowNode[]; edges: ArqFlowEdge[] } {
  const selNodes = new Set(selection.nodes);
  const selEdges = new Set(selection.edges);
  const nodes: ArqFlowNode[] = doc.nodes.map((n) => {
    const p = doc.layout.pinned[n.id];
    return {
      id: n.id,
      type: "arq",
      position: { x: p?.x ?? 0, y: p?.y ?? 0 },
      selected: selNodes.has(n.id),
      data: {
        label: n.label,
        shape: n.shape,
        style: n.style,
        iconSvg: n.icon !== undefined ? resolveIcon(n.icon) : undefined,
        iconId: n.icon,
        pinned: p,
      },
    };
  });

  // React Flow requires every edge to name a real source/target node. A loose (point) endpoint
  // gets a hidden zero-size node instead of a second, node-less edge representation, so dragging
  // and rendering share one code path regardless of whether an end is attached.
  const endpointNodes: ArqFlowNode[] = [];
  const anchor = (edgeId: string, which: "from" | "to", ep: Endpoint): string => {
    if (isNodeRef(ep)) return ep;
    const id = endpointNodeId(edgeId, which);
    // Carries its own selected flag like any other node. The store keeps a loose end's selection
    // (see `pruneSelection`); if the derived node disagreed, React Flow would re-assert its own
    // selection on every render and the two would ping-pong until React gave up.
    endpointNodes.push({
      id,
      type: "arqEndpoint",
      position: { x: ep.x, y: ep.y },
      // Geometry only: React Flow needs a node to hang an edge end on, but moving that end is
      // ArqEdge's job (one code path for bound and loose ends alike), so this is not draggable.
      draggable: false,
      selected: selNodes.has(id),
      data: {},
    });
    return id;
  };

  const edges: ArqFlowEdge[] = doc.edges.map((e) => ({
    id: e.id,
    type: "arq",
    source: anchor(e.id, "from", e.from),
    target: anchor(e.id, "to", e.to),
    selected: selEdges.has(e.id),
    data: { label: e.label, style: e.style },
  }));

  return { nodes: [...nodes, ...endpointNodes], edges };
}
