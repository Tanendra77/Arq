import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent, type MouseEvent } from "react";
import {
  Background,
  BackgroundVariant,
  Controls,
  ReactFlow,
  ReactFlowProvider,
  useNodesInitialized,
  useReactFlow,
  ViewportPortal,
  useNodesState,
  useEdgesState,
  type Connection,
  type Edge,
  type Node,
  type OnSelectionChangeParams,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import {
  edgePath, edgePaths, edgeTangents, resolveEdgeStyle, resolveNodeStyle, shapeMarkup, shapeRect,
} from "@arq/render";
import type { Document, Endpoint } from "@arq/schema";
import { isNodeRef } from "@arq/schema";
import { useEditor } from "../store/context";
import { DRAG_MIME, decodeDragPayload } from "../flow/drag-payload";
import { parseEndpointNodeId, toFlow, type ArqFlowEdge, type ArqFlowNode } from "../flow/to-flow";
import { createIconResolver } from "../icons/resolver";
import { useShortcuts } from "../commands/shortcuts";
import { ArqEndpointNode, ArqNode } from "./ArqNode";
import { ArqEdge, EdgeDefs } from "./ArqEdge";
import {
  FREE_LINE_LENGTH, PALETTE_ITEMS, edgeCreationStyle, nodeCreationStyle, placeItem, useActiveTool,
  type PaletteItem,
} from "./Palette";
import { useSettings } from "./SettingsModal";
import type { Settings } from "../settings";

// `arqEndpoint` must be registered: React Flow renders its own default node — a visible empty
// box — for any type it does not know, which is what made one dropped arrow look like two boxes.
const nodeTypes = { arq: ArqNode, arqEndpoint: ArqEndpointNode };
const edgeTypes = { arq: ArqEdge };

/** Below this many pixels of movement a press-and-release is a click, not a drawing gesture. */
const DRAG_THRESHOLD = 6;

/** One fixed seed for whatever the in-flight gesture previews. */
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

/**
 * What the gesture in flight will produce, drawn with the very same painter as the finished
 * element — the real shape at its real size, or the real arrow between its real ends. Rendered in
 * flow coordinates inside `ViewportPortal`.
 *
 * The seed is fixed rather than derived from an id (there is no element yet): the preview still
 * redraws as the geometry changes, but it does not re-roll its wobble on every pointer move, which
 * reads as flicker.
 */
function DrawPreview({
  item, from, to, settings,
}: {
  item: PaletteItem;
  from: { x: number; y: number };
  to: { x: number; y: number };
  settings: Settings;
}) {
  if (item.kind === "edge") {
    const s = resolveEdgeStyle(edgeCreationStyle(item, settings));
    const { d } = edgePath(from, to, s.routing);
    const specs = edgePaths(d, s, PREVIEW_SEED, { start: from, end: to, ...edgeTangents(from, to, s.routing) });
    // Anchored at the flow origin with overflow visible, so the absolute coordinates above land
    // where they mean to without any per-frame offset maths.
    return (
      <svg className="arq-draw-preview" data-testid="draw-preview" width={1} height={1} style={{ overflow: "visible" }}>
        {specs.map((p, i) => (
          <path key={i} d={p.d} stroke={p.stroke} strokeWidth={p.strokeWidth} fill={p.fill} />
        ))}
      </svg>
    );
  }
  const box = rectFrom(from, to);
  return (
    <svg
      className="arq-draw-preview"
      data-testid="draw-preview"
      style={{ position: "absolute", left: box.x, top: box.y }}
      width={box.w}
      height={box.h}
      viewBox={`0 0 ${box.w} ${box.h}`}
      // Built by @arq/render from this component's own numbers and the creation colours — never
      // from document or user text.
      dangerouslySetInnerHTML={{
        __html: shapeMarkup(
          item.shape,
          { x: 0, y: 0, w: box.w, h: box.h },
          resolveNodeStyle(nodeCreationStyle(settings)),
          PREVIEW_SEED,
        ),
      }}
    />
  );
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
  const past = useEditor((s) => s.past);
  const future = useEditor((s) => s.future);
  const { screenToFlowPosition, flowToScreenPosition, fitView } = useReactFlow();
  const nodesInitialized = useNodesInitialized();
  const [settings] = useSettings();
  const [tool, setTool] = useActiveTool();
  const armed: PaletteItem | undefined = PALETTE_ITEMS.find((i) => i.key === tool);

  /** Where the drawing gesture was pressed, in screen coordinates; null when none is in flight. */
  const dragFrom = useRef<{ x: number; y: number } | null>(null);
  /** The same gesture in flow coordinates, for the live preview. */
  const [drag, setDrag] = useState<{ from: { x: number; y: number }; to: { x: number; y: number } } | null>(null);

  // Escape abandons a gesture in flight and disarms, rather than leaving the tool stuck on.
  useEffect(() => {
    if (armed === undefined) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setTool(null);
      dragFrom.current = null;
      setDrag(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [armed, setTool]);

  /**
   * Fit the view when a *document* arrives, and at no other time.
   *
   * React Flow's `fitView` prop fires the first time nodes are measured, which on an empty canvas
   * is the moment the user places their first shape — so drawing something made the viewport jump
   * and zoom. Loading is instead detected from the history: `loadDocument` clears both stacks, so
   * an empty past *and* an empty future means "new document", while undoing back to the start
   * leaves a non-empty future and correctly does not refit.
   */
  const fittedDoc = useRef<Document | null>(null);
  useEffect(() => {
    if (!nodesInitialized || past.length > 0 || future.length > 0 || fittedDoc.current === doc) return;
    fittedDoc.current = doc;
    fitView({ maxZoom: 1, duration: 200 });
  }, [doc, past, future, nodesInitialized, fitView]);

  // Phase 1 has no user packs wired yet; a plan B task injects installed packs here.
  const resolveIcon = useMemo(() => createIconResolver([]), []);
  const derived = useMemo(() => toFlow(doc, resolveIcon, selection), [doc, resolveIcon, selection]);

  const [nodes, setNodes, onNodesChange] = useNodesState<ArqFlowNode>(derived.nodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState<ArqFlowEdge>(derived.edges);
  useEffect(() => setNodes((prev) => mergeMeasured(prev, derived.nodes)), [derived.nodes, setNodes]);
  useEffect(() => setEdges(derived.edges), [derived.edges, setEdges]);

  // Currently unreachable: node handles are hidden and `pointer-events: none` (styles.css), so no
  // drag can start a connection — arrows are drawn with the two-click arrow tool instead. Kept as
  // the other half of that CSS switch, so re-enabling drag-to-connect stays a one-line change.
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
   * The node under a flow-space point, if any.
   *
   * Hit-tested against the document's own rects (`shapeRect`, the exporter's function) rather than
   * by asking the DOM what is under the cursor: an arrow end binds to a shape, and a shape is what
   * the document says it is. Later nodes win, matching paint order — the one drawn on top.
   */
  const nodeAt = useCallback(
    (p: { x: number; y: number }): string | undefined => {
      let hit: string | undefined;
      for (const n of doc.nodes) {
        const pin = doc.layout.pinned[n.id];
        if (!pin) continue;
        const r = shapeRect(pin, n.shape);
        if (p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h) hit = n.id;
      }
      return hit;
    },
    [doc],
  );

  /** An arrow end at this point: bound to whatever shape is under it, else the bare point. */
  const endpointAt = useCallback(
    (p: { x: number; y: number }): Endpoint => nodeAt(p) ?? p,
    [nodeAt],
  );

  /**
   * One gesture draws everything: press where it starts, drag, release where it ends.
   *
   * A shape takes the dragged box as its size; an arrow runs from the press to the release, binding
   * either end to whatever shape is under it. Releasing without moving is a plain click, which
   * places a default-sized shape or a default-length arrow. Working in flow coordinates throughout
   * means the gesture behaves the same at any zoom.
   */
  const onMouseDown = useCallback(
    (e: MouseEvent) => {
      if (armed === undefined || e.button !== 0) return;
      dragFrom.current = { x: e.clientX, y: e.clientY };
      setDrag({ from: screenToFlowPosition({ x: e.clientX, y: e.clientY }), to: screenToFlowPosition({ x: e.clientX, y: e.clientY }) });
    },
    [armed, screenToFlowPosition],
  );

  const onMouseMove = useCallback(
    (e: MouseEvent) => {
      if (dragFrom.current === null) return;
      setDrag((d) => (d === null ? null : { ...d, to: screenToFlowPosition({ x: e.clientX, y: e.clientY }) }));
    },
    [screenToFlowPosition],
  );

  const onMouseUp = useCallback(
    (e: MouseEvent) => {
      const press = dragFrom.current;
      dragFrom.current = null;
      setDrag(null);
      if (!press || armed === undefined) return;
      const a = screenToFlowPosition(press);
      const b = screenToFlowPosition({ x: e.clientX, y: e.clientY });
      const moved =
        Math.abs(e.clientX - press.x) >= DRAG_THRESHOLD || Math.abs(e.clientY - press.y) >= DRAG_THRESHOLD;

      if (armed.kind === "edge") {
        const to = moved ? b : { x: a.x + FREE_LINE_LENGTH, y: a.y };
        const from = endpointAt(a);
        const target = endpointAt(to);
        // Both ends on one shape would anchor to the same point and draw nothing visible.
        if (!(isNodeRef(from) && isNodeRef(target) && from === target)) {
          addEdge({ from, to: target, style: edgeCreationStyle(armed, settings) });
        }
      } else {
        const box = rectFrom(a, b);
        placeItem(
          armed,
          moved ? { x: box.x, y: box.y } : a,
          settings,
          { addNode, addEdge },
          moved ? { w: Math.round(box.w), h: Math.round(box.h) } : undefined,
        );
      }
      setTool(null);
    },
    [armed, screenToFlowPosition, settings, addNode, addEdge, endpointAt, setTool],
  );

  return (
    <div
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
        deleteKeyCode={["Delete", "Backspace"]}
        // With a tool armed the canvas only draws: pressing on a shape must start the gesture, not
        // pick the shape up. Without this, dragging an arrow from one shape to another dragged the
        // first shape on top of the second instead.
        nodesDraggable={armed === undefined}
        elementsSelectable={armed === undefined}
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
        {/* Drawn inside the flow's own viewport, so the preview sits in document coordinates and
            scales and pans with everything else instead of being re-projected by hand. */}
        {drag !== null && armed !== undefined ? (
          <ViewportPortal>
            <DrawPreview item={armed} from={drag.from} to={drag.to} settings={settings} />
          </ViewportPortal>
        ) : null}
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
