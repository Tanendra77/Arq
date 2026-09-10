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
  type Edge,
  type Node,
  type OnSelectionChangeParams,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { useEditor } from "../store/context";
import { DRAG_MIME, decodeDragPayload } from "../flow/drag-payload";
import { toFlow, type ArqFlowEdge, type ArqFlowNode } from "../flow/to-flow";
import { createIconResolver } from "../icons/resolver";
import { useShortcuts } from "../commands/shortcuts";
import { ArqNode } from "./ArqNode";
import { ArqEdge, EdgeDefs } from "./ArqEdge";
import { PALETTE_ITEMS, FREE_LINE_LENGTH } from "./Palette";

const nodeTypes = { arq: ArqNode };
const edgeTypes = { arq: ArqEdge };

/**
 * Split a React Flow deletion into the two store calls it needs.
 *
 * React Flow hands `onDelete` the nodes *and* every edge attached to them, but `removeNodes`
 * already cascades to attached edges in one mutation. Calling `removeEdges` for those as well
 * would push a second history entry, so one Delete keypress would take two Ctrl+Z to undo.
 * Only edges whose endpoints both survive the node removal still need an explicit removal.
 */
export function planDeletion(
  nodeIds: string[],
  edges: { id: string; source: string; target: string }[],
): { nodeIds: string[]; edgeIds: string[] } {
  const gone = new Set(nodeIds);
  return {
    nodeIds,
    edgeIds: edges.filter((e) => !gone.has(e.source) && !gone.has(e.target)).map((e) => e.id),
  };
}

/**
 * Re-apply the sizes React Flow measured to freshly derived nodes.
 *
 * `toFlow` rebuilds every node from the document on each store change, and those objects carry no
 * `measured`. Pushing them in as-is would make every node unmeasured after any selection click or
 * edit, dropping the edges until React Flow's ResizeObserver fires again. `measured` is an optional
 * property, so it is spread in only when the previous state actually had one (`exactOptionalPropertyTypes`).
 */
export function mergeMeasured(prev: ArqFlowNode[], next: ArqFlowNode[]): ArqFlowNode[] {
  const measured = new Map(prev.map((n) => [n.id, n.measured]));
  return next.map((n) => {
    const m = measured.get(n.id);
    return m !== undefined ? { ...n, measured: m } : n;
  });
}

function CanvasInner() {
  // Requires a ReactFlowProvider ancestor (for the zoom shortcuts' useReactFlow call), which is
  // why this lives here rather than in App: Canvas already wraps itself in one, App does not.
  useShortcuts();
  const doc = useEditor((s) => s.document);
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
  const derived = useMemo(() => toFlow(doc, resolveIcon, selection), [doc, resolveIcon, selection]);

  const [nodes, setNodes, onNodesChange] = useNodesState<ArqFlowNode>(derived.nodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState<ArqFlowEdge>(derived.edges);
  useEffect(() => setNodes((prev) => mergeMeasured(prev, derived.nodes)), [derived.nodes, setNodes]);
  useEffect(() => setEdges(derived.edges), [derived.edges, setEdges]);

  const onConnect = useCallback(
    (c: Connection) => {
      const from = doc.nodes.find((n) => n.id === c.source);
      const to = doc.nodes.find((n) => n.id === c.target);
      if (!from || !to) return;
      addEdge({ from: from.id, to: to.id });
    },
    [doc.nodes, addEdge],
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

  // One `onDelete` rather than `onNodesDelete` + `onEdgesDelete`: React Flow fires both for a single
  // keypress, and the connected edges are already folded into the edge list, so the pair produced two
  // undo entries per delete. See `planDeletion`.
  const onDelete = useCallback(
    ({ nodes: ns, edges: es }: { nodes: Node[]; edges: Edge[] }) => {
      const plan = planDeletion(
        ns.map((n) => n.id),
        es,
      );
      if (plan.nodeIds.length > 0) removeNodes(plan.nodeIds);
      if (plan.edgeIds.length > 0) removeEdges(plan.edgeIds);
    },
    [removeNodes, removeEdges],
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
      const item = payload ? PALETTE_ITEMS.find((i) => i.key === payload.item) : undefined;
      if (!item) return;
      e.preventDefault();
      const position = screenToFlowPosition({ x: e.clientX, y: e.clientY });
      if (item.kind === "node") {
        addNode({ shape: item.shape, label: item.label, position });
      } else {
        addEdge({
          from: { x: position.x - FREE_LINE_LENGTH / 2, y: position.y },
          to: { x: position.x + FREE_LINE_LENGTH / 2, y: position.y },
          style: { endArrow: item.endArrow },
        });
      }
    },
    [addNode, addEdge, screenToFlowPosition],
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
        onDelete={onDelete}
        onSelectionChange={onSelectionChange}
        deleteKeyCode={["Delete", "Backspace"]}
        fitView
        panOnScroll
        zoomOnScroll={false}
        zoomOnPinch
        panOnDrag={[1, 2]}
        minZoom={0.1}
        maxZoom={4}
      >
        <EdgeDefs doc={doc} />
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
