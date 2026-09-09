import { useCallback, useEffect, useMemo, type DragEvent } from "react";
import {
  Background,
  Controls,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
  useNodesState,
  useEdgesState,
  type Connection,
  type Node,
  type OnSelectionChangeParams,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { useEditor } from "../store/context";
import { DRAG_MIME, decodeDragPayload } from "../flow/drag-payload";
import { toFlow, type ArqFlowEdge, type ArqFlowNode } from "../flow/to-flow";
import { defaultEdgeKind } from "../flow/default-edge-kind";
import { createIconResolver } from "../icons/resolver";
import { ArqNode } from "./ArqNode";
import { ArqEdge, EdgeMarkers } from "./ArqEdge";

const nodeTypes = { arq: ArqNode };
const edgeTypes = { arq: ArqEdge };

function CanvasInner() {
  const document = useEditor((s) => s.document);
  const selection = useEditor((s) => s.selection);
  const addNode = useEditor((s) => s.addNode);
  const addEdge = useEditor((s) => s.addEdge);
  const removeNodes = useEditor((s) => s.removeNodes);
  const removeEdges = useEditor((s) => s.removeEdges);
  const setPinned = useEditor((s) => s.setPinned);
  const setSelection = useEditor((s) => s.setSelection);
  const { screenToFlowPosition } = useReactFlow();

  // Phase 1 has no user packs wired yet; a plan B task injects installed packs here.
  const resolveIcon = useMemo(() => createIconResolver([]), []);
  const derived = useMemo(() => toFlow(document, resolveIcon, selection), [document, resolveIcon, selection]);

  const [nodes, setNodes, onNodesChange] = useNodesState<ArqFlowNode>(derived.nodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState<ArqFlowEdge>(derived.edges);
  useEffect(() => setNodes(derived.nodes), [derived.nodes, setNodes]);
  useEffect(() => setEdges(derived.edges), [derived.edges, setEdges]);

  const onConnect = useCallback(
    (c: Connection) => {
      const from = document.nodes.find((n) => n.id === c.source);
      const to = document.nodes.find((n) => n.id === c.target);
      if (!from || !to) return;
      addEdge({ from: from.id, to: to.id, kind: defaultEdgeKind(from.type, to.type) });
    },
    [document.nodes, addEdge],
  );

  const onNodeDragStop = useCallback(
    (_e: unknown, _node: Node, dragged: Node[]) => {
      for (const n of dragged) {
        setPinned(n.id, { x: Math.round(n.position.x), y: Math.round(n.position.y) }, { mergeKey: "drag" });
      }
    },
    [setPinned],
  );

  const onSelectionChange = useCallback(
    (p: OnSelectionChangeParams) => {
      const next = { nodes: p.nodes.map((n) => n.id), edges: p.edges.map((e) => e.id) };
      if (next.nodes.join() !== selection.nodes.join() || next.edges.join() !== selection.edges.join()) {
        setSelection(next);
      }
    },
    [selection, setSelection],
  );

  const onNodesDelete = useCallback((ns: Node[]) => removeNodes(ns.map((n) => n.id)), [removeNodes]);
  const onEdgesDelete = useCallback(
    (es: { id: string }[]) => removeEdges(es.map((e) => e.id)),
    [removeEdges],
  );

  const onDragOver = useCallback((e: DragEvent) => {
    if (e.dataTransfer.types.includes(DRAG_MIME)) {
      e.preventDefault();
      e.dataTransfer.dropEffect = "copy";
    }
  }, []);

  const onDrop = useCallback(
    (e: DragEvent) => {
      const payload = decodeDragPayload(e.dataTransfer.getData(DRAG_MIME));
      if (!payload) return;
      e.preventDefault();
      const position = screenToFlowPosition({ x: e.clientX, y: e.clientY });
      addNode({
        type: payload.nodeType,
        label: payload.label,
        position,
        ...(payload.icon !== undefined ? { icon: payload.icon } : {}),
      });
    },
    [addNode, screenToFlowPosition],
  );

  return (
    <div className="arq-canvas" data-testid="canvas" onDragOver={onDragOver} onDrop={onDrop}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onNodeDragStop={onNodeDragStop}
        onNodesDelete={onNodesDelete}
        onEdgesDelete={onEdgesDelete}
        onSelectionChange={onSelectionChange}
        deleteKeyCode={["Delete", "Backspace"]}
        fitView
      >
        <EdgeMarkers />
        <Background />
        <Controls />
      </ReactFlow>
    </div>
  );
}

export function Canvas() {
  return (
    <ReactFlowProvider>
      <CanvasInner />
    </ReactFlowProvider>
  );
}
