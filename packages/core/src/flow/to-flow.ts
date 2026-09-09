import type { Edge, Node } from "@xyflow/react";
import type { Document, EdgeKind, NodeType } from "@arq/schema";
import type { Selection } from "../store/editor-store";

export type ArqNodeData = {
  label: string;
  nodeType: NodeType;
  iconSvg: string | undefined;
  iconId: string | undefined;
};
export type ArqEdgeData = { kind: EdgeKind; label: string | undefined };

export type ArqFlowNode = Node<ArqNodeData, "arq">;
export type ArqFlowEdge = Edge<ArqEdgeData, "arq">;

export type IconResolver = (id: string | undefined, nodeType: NodeType) => string | undefined;

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
      data: { label: n.label, nodeType: n.type, iconSvg: resolveIcon(n.icon, n.type), iconId: n.icon },
    };
  });
  const edges: ArqFlowEdge[] = doc.edges.map((e) => ({
    id: e.id,
    type: "arq",
    source: e.from,
    target: e.to,
    selected: selEdges.has(e.id),
    data: { kind: e.kind, label: e.label },
  }));
  return { nodes, edges };
}
