import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent, type MouseEvent } from "react";
import {
  Background,
  BackgroundVariant,
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
import { resolveNodeStyle, shapeMarkup } from "@arq/render";
import type { Endpoint } from "@arq/schema";
import { isNodeRef } from "@arq/schema";
import { useEditor } from "../store/context";
import { DRAG_MIME, decodeDragPayload } from "../flow/drag-payload";
import { parseEndpointNodeId, toFlow, type ArqFlowEdge, type ArqFlowNode } from "../flow/to-flow";
import { createIconResolver } from "../icons/resolver";
import { useShortcuts } from "../commands/shortcuts";
import { ArqEndpointNode, ArqNode } from "./ArqNode";
import { ArqEdge, EdgeDefs } from "./ArqEdge";
import { PALETTE_ITEMS, edgeCreationStyle, nodeCreationStyle, placeItem, useActiveTool, type PaletteItem } from "./Palette";
import { useSettings } from "./SettingsModal";

// `arqEndpoint` must be registered: React Flow renders its own default node — a visible empty
// box — for any type it does not know, which is what made one dropped arrow look like two boxes.
const nodeTypes = { arq: ArqNode, arqEndpoint: ArqEndpointNode };
const edgeTypes = { arq: ArqEdge };

/** Below this many pixels a press-and-release is a click, not a drag-to-size gesture. */
const DRAG_SIZE_THRESHOLD = 6;

/** One fixed seed for the drag preview. The shape still redraws as the box changes size, but it
 *  does not also re-roll its wobble on every pointer move, which reads as flicker. */
const PREVIEW_SEED = 1;

/** A rect from two corners in any order. */
export function rectFrom(a: { x: number; y: number }, b: { x: number; y: number }) {
  return {
    x: Math.min(a.x, b.x),
    y: Math.min(a.y, b.y),
    w: Math.abs(a.x - b.x),
    h: Math.abs(a.y - b.y),
  };
}

const GRID_VARIANT: Record<"dots" | "lines", BackgroundVariant> = {
  dots: BackgroundVariant.Dots,
  lines: BackgroundVariant.Lines,
};

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
  const setEndpoint = useEditor((s) => s.setEndpoint);
  const { screenToFlowPosition, flowToScreenPosition } = useReactFlow();
  const [settings] = useSettings();
  const [tool, setTool] = useActiveTool();
  const armed: PaletteItem | undefined = PALETTE_ITEMS.find((i) => i.key === tool);

  const wrapRef = useRef<HTMLDivElement>(null);
  /** Where a drag-to-size gesture started, in screen coordinates; null when none is in flight. */
  const sizingFrom = useRef<{ x: number; y: number } | null>(null);
  /** The live preview of that gesture, in coordinates local to the canvas wrapper. */
  const [sizingBox, setSizingBox] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  /** First click of a two-click edge placement: the end already fixed, waiting for the second. */
  const [pendingFrom, setPendingFrom] = useState<Endpoint | null>(null);

  // Escape abandons whatever placement is in flight rather than leaving a half-placed arrow with
  // no way out but committing it.
  useEffect(() => {
    if (armed === undefined && pendingFrom === null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setPendingFrom(null);
      setTool(null);
      sizingFrom.current = null;
      setSizingBox(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [armed, pendingFrom, setTool]);

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
        const pos = { x: Math.round(n.position.x), y: Math.round(n.position.y) };
        // A hidden endpoint node is not a document node: moving it moves the edge's own loose end.
        // Writing it to `layout.pinned` instead would file a rect under a reserved `__ep:` id that
        // nothing ever reads back.
        const ep = parseEndpointNodeId(n.id);
        if (ep) setEndpoint(ep.edgeId, ep.which, pos, { mergeKey: "drag" });
        else setPinned(n.id, pos, { mergeKey: "drag" });
      }
    },
    [setPinned, setEndpoint],
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
      placeItem(item, screenToFlowPosition({ x: e.clientX, y: e.clientY }), settings, { addNode, addEdge });
    },
    [addNode, addEdge, screenToFlowPosition, settings],
  );

  /**
   * One end of an armed edge placement. The first call fixes the start; the second draws the edge
   * and disarms. Either end is a bare point or a node id, so an arrow can run from empty canvas to
   * empty canvas, or mount on a shape at one or both ends.
   */
  const takeEdgeEnd = useCallback(
    (ep: Endpoint) => {
      if (armed?.kind !== "edge") return;
      if (pendingFrom === null) {
        setPendingFrom(ep);
        return;
      }
      // Both ends on the same shape anchor to the same point, drawing a zero-length line. Treat the
      // second click as a misclick and keep waiting rather than creating an invisible edge.
      if (isNodeRef(ep) && isNodeRef(pendingFrom) && ep === pendingFrom) return;
      addEdge({ from: pendingFrom, to: ep, style: edgeCreationStyle(armed, settings) });
      setPendingFrom(null);
      setTool(null);
    },
    [armed, pendingFrom, addEdge, settings, setTool],
  );

  // Shapes are placed on mouse-up (so a press-and-drag can size them, below); only edges are
  // placed from a click. With nothing armed neither runs, leaving React Flow's own
  // click-to-deselect behaviour untouched.
  const onPaneClick = useCallback(
    (e: MouseEvent) => takeEdgeEnd(screenToFlowPosition({ x: e.clientX, y: e.clientY })),
    [takeEdgeEnd, screenToFlowPosition],
  );

  // Clicking a shape while an edge tool is armed mounts that end on the shape rather than pinning
  // it to a bare coordinate, so the arrow keeps following the shape when it later moves.
  const onNodeClick = useCallback(
    (e: MouseEvent, node: Node) => {
      if (armed?.kind !== "edge") return;
      e.stopPropagation();
      // A hidden loose-endpoint node is not something an arrow can mount to; treat a click on one
      // as a click on the canvas underneath it.
      if (parseEndpointNodeId(node.id)) takeEdgeEnd(screenToFlowPosition({ x: e.clientX, y: e.clientY }));
      else takeEdgeEnd(node.id);
    },
    [armed, takeEdgeEnd, screenToFlowPosition],
  );

  // Drag-to-size, for shape tools only: press, drag out the box you want, release. A release
  // within DRAG_SIZE_THRESHOLD of the press is a plain click and places the default size instead.
  const onMouseDown = useCallback(
    (e: MouseEvent) => {
      if (armed?.kind !== "node" || e.button !== 0) return;
      sizingFrom.current = { x: e.clientX, y: e.clientY };
    },
    [armed],
  );

  const onMouseMove = useCallback((e: MouseEvent) => {
    const from = sizingFrom.current;
    const wrap = wrapRef.current;
    if (!from || !wrap) return;
    const o = wrap.getBoundingClientRect();
    setSizingBox(rectFrom({ x: from.x - o.left, y: from.y - o.top }, { x: e.clientX - o.left, y: e.clientY - o.top }));
  }, []);

  const onMouseUp = useCallback(
    (e: MouseEvent) => {
      const from = sizingFrom.current;
      sizingFrom.current = null;
      setSizingBox(null);
      if (!from || armed?.kind !== "node") return;
      const a = screenToFlowPosition(from);
      const b = screenToFlowPosition({ x: e.clientX, y: e.clientY });
      const box = rectFrom(a, b);
      const dragged = Math.abs(e.clientX - from.x) >= DRAG_SIZE_THRESHOLD || Math.abs(e.clientY - from.y) >= DRAG_SIZE_THRESHOLD;
      placeItem(
        armed,
        dragged ? { x: box.x, y: box.y } : a,
        settings,
        { addNode, addEdge },
        dragged ? { w: Math.round(box.w), h: Math.round(box.h) } : undefined,
      );
      setTool(null);
    },
    [armed, screenToFlowPosition, settings, addNode, addEdge, setTool],
  );

  // The dot marking a two-click arrow's fixed first end. Only a loose point needs one: an end
  // already mounted on a shape is visible as the shape.
  const pendingEndScreen = (() => {
    const wrap = wrapRef.current;
    if (pendingFrom === null || isNodeRef(pendingFrom) || !wrap) return null;
    const p = flowToScreenPosition(pendingFrom);
    const o = wrap.getBoundingClientRect();
    return { x: p.x - o.left, y: p.y - o.top };
  })();

  return (
    <div
      ref={wrapRef}
      className={`arq-canvas${tool !== null ? " armed" : ""}`}
      data-testid="canvas"
      onDragOver={onDragOver}
      onDrop={onDrop}
      onMouseDown={onMouseDown}
      onMouseMove={onMouseMove}
      onMouseUp={onMouseUp}
    >
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
        onPaneClick={onPaneClick}
        onNodeClick={onNodeClick}
        deleteKeyCode={["Delete", "Backspace"]}
        fitView
        panOnScroll
        zoomOnScroll={false}
        zoomOnPinch
        panOnDrag={[1, 2]}
        minZoom={0.1}
        maxZoom={4}
        snapToGrid={settings.snap}
        snapGrid={[settings.gridSize, settings.gridSize]}
      >
        <EdgeDefs doc={doc} />
        {settings.grid !== "off" ? (
          <Background variant={GRID_VARIANT[settings.grid]} gap={settings.gridSize} />
        ) : null}
        <Controls />
      </ReactFlow>
      {/* Placement feedback, drawn over the flow rather than inside it: the dashed box a shape
          will occupy on release, and the anchored first end of a two-click arrow. */}
      {sizingBox !== null && armed?.kind === "node" ? (
        <svg
          className="arq-sizing-preview"
          data-testid="sizing-preview"
          style={{ left: sizingBox.x, top: sizingBox.y, width: sizingBox.w, height: sizingBox.h }}
          width={sizingBox.w}
          height={sizingBox.h}
          viewBox={`0 0 ${sizingBox.w} ${sizingBox.h}`}
          // The real hand-drawn shape at the real size, not a placeholder box, so what you drag out
          // is what you get. Built by @arq/render from this component's own numbers and the
          // creation colours — never from document or user text.
          dangerouslySetInnerHTML={{
            __html: shapeMarkup(
              armed.shape,
              { x: 0, y: 0, w: sizingBox.w, h: sizingBox.h },
              resolveNodeStyle(nodeCreationStyle(settings)),
              PREVIEW_SEED,
            ),
          }}
        />
      ) : null}
      {pendingEndScreen !== null ? (
        <div className="arq-pending-end" data-testid="pending-end" style={{ left: pendingEndScreen.x, top: pendingEndScreen.y }} />
      ) : null}
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
