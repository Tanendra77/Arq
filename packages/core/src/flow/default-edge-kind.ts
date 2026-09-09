import type { EdgeKind, NodeType } from "@arq/schema";

const isProducer = (t: NodeType) => t === "app" || t === "publisher" || t === "gateway" || t === "external";
const isConsumer = (t: NodeType) => t === "app" || t === "consumer" || t === "gateway" || t === "external";

export function defaultEdgeKind(from: NodeType, to: NodeType): EdgeKind {
  if (from === "broker" && to === "broker") return "bridge";
  if ((from === "broker" && to === "mesh") || (from === "mesh" && to === "broker")) return "dmr";
  if (from === "broker" && (to === "queue" || to === "topic")) return "bind";
  if (isProducer(from) && (to === "broker" || to === "topic")) return "publish";
  if ((from === "broker" || from === "queue" || from === "topic") && isConsumer(to)) return "subscribe";
  return "generic";
}

export const EDGE_STYLE: Record<EdgeKind, { dash: string | undefined; markerStart: boolean; markerEnd: boolean }> = {
  publish: { dash: undefined, markerStart: false, markerEnd: true },
  subscribe: { dash: undefined, markerStart: false, markerEnd: true },
  bind: { dash: "2 4", markerStart: false, markerEnd: false },
  bridge: { dash: "8 4", markerStart: true, markerEnd: true },
  dmr: { dash: "8 4 2 4", markerStart: true, markerEnd: true },
  replication: { dash: "6 6", markerStart: false, markerEnd: true },
  "request-reply": { dash: undefined, markerStart: true, markerEnd: true },
  generic: { dash: undefined, markerStart: false, markerEnd: true },
};
