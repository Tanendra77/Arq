import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent, type MouseEvent } from "react";
import {
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  ReactFlow,
  ReactFlowProvider,
  useKeyPress,
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
  edgePath, edgePaths, edgeTangents, freehandPathD, normaliseStroke, resolveEdgeStyle, resolveNodeStyle,
  shapeMarkup,
} from "@arq/render";
import type { Document, Endpoint } from "@arq/schema";
import { isNodeRef } from "@arq/schema";
import { useEditor } from "../store/context";
import { DRAG_MIME, decodeDragPayload } from "../flow/drag-payload";
import { parseEndpointNodeId, toFlow, type ArqFlowEdge, type ArqFlowNode } from "../flow/to-flow";
import { endpointFor } from "../flow/endpoint-target";
import { eraserHits } from "../flow/eraser";
import { createIconResolver } from "../icons/resolver";
import { useShortcuts } from "../commands/shortcuts";
import { ArqEndpointNode, ArqNode } from "./ArqNode";
import { ArqEdge, EdgeDefs } from "./ArqEdge";
import {
  FREE_LINE_LENGTH, PALETTE_ITEMS, edgeCreationStyle, nodeCreationStyle, placeItem, useActiveTool,
  type PaletteItem,
} from "./Palette";
import { useSettings } from "./SettingsModal";
import { RULER_SIZE, Rulers } from "./Rulers";
import { loadViewport, saveViewport } from "../autosave";
import { onFitViewRequest } from "../flow/fit-request";
import type { Settings } from "../settings";

// `arqEndpoint` must be registered: React Flow renders its own default node — a visible empty
// box — for any type it does not know, which is what made one dropped arrow look like two boxes.
const nodeTypes = { arq: ArqNode, arqEndpoint: ArqEndpointNode };
const edgeTypes = { arq: ArqEdge };

/** Below this many pixels of movement a press-and-release is a click, not a drawing gesture. */
const DRAG_THRESHOLD = 6;

/** One fixed seed for whatever the in-flight gesture previews. */
const PREVIEW_SEED = 1;

/** How long the minimap lingers after the view stops moving. */
const MINIMAP_LINGER_MS = 1200;

/** Ink width for a new pen stroke. */
const STROKE_WIDTH = 2;



/** A rect from two corners in any order. */
export function rectFrom(a: { x: number; y: number }, b: { x: number; y: number }) {
  return {
    x: Math.min(a.x, b.x),
    y: Math.min(a.y, b.y),
    w: Math.abs(a.x - b.x),
    h: Math.abs(a.y - b.y),
  };
}

const GRID_VARIANT: Record<Exclude<Settings["grid"], "off">, BackgroundVariant> = {
  dots: BackgroundVariant.Dots,
  lines: BackgroundVariant.Lines,
  cross: BackgroundVariant.Cross,
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
  item, from, to, settings, stroke,
}: {
  item: PaletteItem;
  from: { x: number; y: number };
  to: { x: number; y: number };
  settings: Settings;
  /** The pen's samples so far, in flow coordinates. */
  stroke: readonly { x: number; y: number }[];
}) {
  // The eraser fades what it will take in place instead; the hand draws nothing.
  if (item.kind === "eraser" || item.kind === "hand") return null;
  if (item.kind === "pen") {
    if (stroke.length < 2) return null;
    // Drawn through the same `freehandPathD` the finished node uses, so lifting the pen changes
    // nothing on screen.
    const { box, points } = normaliseStroke(stroke, STROKE_WIDTH);
    return (
      <svg className="arq-draw-preview arq-pen-preview" width={1} height={1} style={{ overflow: "visible" }}>
        <path d={freehandPathD(points, box, STROKE_WIDTH)} fill={settings.edgeStroke} />
      </svg>
    );
  }
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
          resolveNodeStyle({
            ...nodeCreationStyle(settings),
            ...(item.shape === "polygon" ? { sides: settings.polygonSides } : {}),
            ...(item.shape === "star" ? { sides: settings.starPoints } : {}),
          }),
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
  const removeElements = useEditor((s) => s.removeElements);
  const setPinned = useEditor((s) => s.setPinned);
  const setSelection = useEditor((s) => s.setSelection);
  const past = useEditor((s) => s.past);
  const future = useEditor((s) => s.future);
  const { screenToFlowPosition, flowToScreenPosition, fitView } = useReactFlow();
  const nodesInitialized = useNodesInitialized();
  const [settings] = useSettings();
  const [tool, setTool] = useActiveTool();
  const armed: PaletteItem | undefined = PALETTE_ITEMS.find((i) => i.key === tool);
  // Space held down borrows the hand for as long as it is held, whatever tool is armed. React Flow's
  // own key tracking, so typing a space in a label never counts.
  const spaceHeld = useKeyPress("Space");
  const panning = spaceHeld || armed?.kind === "hand";

  /** Where the drawing gesture was pressed, in screen coordinates; null when none is in flight. */
  const dragFrom = useRef<{ x: number; y: number } | null>(null);
  /** The same gesture in flow coordinates, for the live preview. */
  const [drag, setDrag] = useState<{ from: { x: number; y: number }; to: { x: number; y: number } } | null>(null);
  /** The pen's samples for the stroke in progress, in flow coordinates. */
  const [stroke, setStroke] = useState<{ x: number; y: number }[]>([]);
  /**
   * What the eraser has touched so far in this wipe, as "n:<id>" / "e:<id>" keys. Nothing is removed
   * until the pointer lifts, so a wipe can be seen — everything it will take is faded — before it
   * commits, and the whole wipe lands as one undo step.
   */
  const [erasing, setErasing] = useState<Set<string>>(new Set());
  const collectHits = useCallback(
    (prev: Set<string>, at: { x: number; y: number }): Set<string> => {
      const { nodes: ns, edges: es } = eraserHits(doc, at);
      if (ns.every((id) => prev.has(`n:${id}`)) && es.every((id) => prev.has(`e:${id}`))) return prev;
      return new Set([...prev, ...ns.map((id) => `n:${id}`), ...es.map((id) => `e:${id}`)]);
    },
    [doc],
  );
  /** Pointer position in canvas-local pixels, tracked only while the rulers are shown. */
  const [pointer, setPointer] = useState<{ x: number; y: number } | null>(null);

  // Escape abandons a gesture in flight and disarms, rather than leaving the tool stuck on.
  useEffect(() => {
    if (armed === undefined) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setTool(null);
      dragFrom.current = null;
      setDrag(null);
      setStroke([]);
      setErasing(new Set());
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
  // Where the last session left the view, read once. When there is one, the document on screen at
  // start-up counts as already fitted, so the saved pan and zoom are kept instead of refitted.
  const [savedViewport] = useState(loadViewport);
  const fittedDoc = useRef<Document | null>(savedViewport ? doc : null);

  /**
   * The minimap shows only while the view is moving, and for a moment after — long enough to reach
   * it and drag it. The pointer resting on it keeps it up.
   */
  const [minimapAwake, setMinimapAwake] = useState(false);
  const minimapTimer = useRef<ReturnType<typeof setTimeout>>();
  const wakeMinimap = useCallback(() => {
    setMinimapAwake(true);
    clearTimeout(minimapTimer.current);
    minimapTimer.current = setTimeout(() => setMinimapAwake(false), MINIMAP_LINGER_MS);
  }, []);
  useEffect(() => () => clearTimeout(minimapTimer.current), []);

  // Fit on request from outside the canvas (the JSON panel). While the canvas is hidden behind the
  // JSON view it has no size to fit into, so the request waits until it is shown again.
  const fitPending = useRef(false);
  const hidden = settings.editorView === "json";
  useEffect(() => onFitViewRequest(() => {
    if (hidden) {
      fitPending.current = true;
      return;
    }
    // After the new document has rendered and been measured.
    requestAnimationFrame(() => void fitView({ maxZoom: 1, duration: 200 }));
  }), [hidden, fitView]);
  useEffect(() => {
    if (hidden || !fitPending.current) return;
    fitPending.current = false;
    requestAnimationFrame(() => void fitView({ maxZoom: 1, duration: 200 }));
  }, [hidden, fitView]);
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
  // Anything the eraser is about to take is faded in place, via React Flow's own per-element class.
  useEffect(
    () =>
      setNodes((prev) =>
        mergeMeasured(
          prev,
          erasing.size === 0 ? derived.nodes : derived.nodes.map((n) => (erasing.has(`n:${n.id}`) ? { ...n, className: "arq-erasing" } : n)),
        ),
      ),
    [derived.nodes, setNodes, erasing],
  );
  useEffect(
    () =>
      setEdges(
        erasing.size === 0 ? derived.edges : derived.edges.map((e) => (erasing.has(`e:${e.id}`) ? { ...e, className: "arq-erasing" } : e)),
      ),
    [derived.edges, setEdges, erasing],
  );

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
        // The hidden stand-ins for loose edge ends are geometry only — ArqEdge owns moving those,
        // so that both kinds of end are edited the same way. Nothing else here should ever write a
        // `layout.pinned` rect under a reserved `__ep:` id.
        if (parseEndpointNodeId(n.id)) continue;
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
      placeItem(item, screenToFlowPosition({ x: e.clientX, y: e.clientY }), settings, { addNode, addEdge });
    },
    [addNode, addEdge, screenToFlowPosition, settings],
  );

  /** An arrow end at this point: bound to whatever shape is under or near it, else the bare point.
   *  Placement never pins an exact spot — that is a deliberate act on an existing end. */
  const endpointAt = useCallback(
    (p: { x: number; y: number }): Endpoint => endpointFor(doc, p, false),
    [doc],
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
      if (armed === undefined || panning || e.button !== 0) return;
      dragFrom.current = { x: e.clientX, y: e.clientY };
      const at = screenToFlowPosition({ x: e.clientX, y: e.clientY });
      setDrag({ from: at, to: at });
      if (armed.kind === "pen") setStroke([at]);
      if (armed.kind === "eraser") setErasing(collectHits(new Set(), at));
    },
    [armed, panning, screenToFlowPosition, collectHits],
  );

  const onMouseMove = useCallback(
    (e: MouseEvent) => {
      // Only while the rulers are up: this fires on every pixel of pointer travel, and setting
      // state that often for a readout nobody asked to see is not worth the renders.
      if (settings.rulers) {
        const o = e.currentTarget.getBoundingClientRect();
        setPointer({ x: e.clientX - o.left, y: e.clientY - o.top });
      }
      if (e.target instanceof Element && e.target.closest(".react-flow__minimap")) wakeMinimap();
      if (dragFrom.current === null) return;
      const at = screenToFlowPosition({ x: e.clientX, y: e.clientY });
      setDrag((d) => (d === null ? null : { ...d, to: at }));
      if (armed?.kind === "pen") setStroke((pts) => [...pts, at]);
      if (armed?.kind === "eraser") setErasing((hit) => collectHits(hit, at));
    },
    [screenToFlowPosition, settings.rulers, armed, collectHits, wakeMinimap],
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

      if (armed.kind === "pen") {
        // A tap with no travel draws nothing: a single sample is a dot too small to ever select.
        const samples = stroke;
        setStroke([]);
        if (samples.length >= 2) {
          const { box, points } = normaliseStroke(samples, STROKE_WIDTH);
          addNode({
            shape: "freehand",
            label: "",
            position: { x: box.x, y: box.y },
            size: { w: box.w, h: box.h },
            points,
            style: { stroke: settings.edgeStroke, strokeWidth: STROKE_WIDTH },
          });
        }
        return; // the pen stays armed for the next stroke
      }
      if (armed.kind === "eraser") {
        const hit = erasing;
        setErasing(new Set());
        const nodeIds = [...hit].filter((k) => k.startsWith("n:")).map((k) => k.slice(2));
        const edgeIds = [...hit].filter((k) => k.startsWith("e:")).map((k) => k.slice(2));
        removeElements(nodeIds, edgeIds); // one wipe is one undo, however much it took
        return; // the eraser stays armed too
      }
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
    [armed, screenToFlowPosition, settings, addNode, addEdge, endpointAt, setTool, stroke, erasing, removeElements],
  );

  return (
    <div
      className={`arq-canvas${panning ? " panning" : tool !== null ? " armed" : ""}`}
      data-testid="canvas"
      onDragOver={onDragOver}
      onDrop={onDrop}
      onMouseDown={onMouseDown}
      onMouseMove={onMouseMove}
      onMouseUp={onMouseUp}
      onMouseLeave={() => setPointer(null)}
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
        // A selected line is lifted above the shapes, so the dots at its ends can be grabbed even
        // where they sit on a shape's border.
        elevateEdgesOnSelect
        deleteKeyCode={["Delete", "Backspace"]}
        // With a tool armed the canvas only draws: pressing on a shape must start the gesture, not
        // pick the shape up. Without this, dragging an arrow from one shape to another dragged the
        // first shape on top of the second instead.
        // Panning takes the left button too, and grabbing a shape drags the view rather than the shape.
        nodesDraggable={armed === undefined && !panning}
        elementsSelectable={armed === undefined && !panning}
        panOnScroll
        zoomOnScroll={false}
        zoomOnPinch
        panOnDrag={panning ? true : [1, 2]}
        {...(savedViewport ? { defaultViewport: savedViewport } : {})}
        // All three: a single scroll tick reports only a start, and the linger should count from the end.
        onMoveStart={wakeMinimap}
        onMove={wakeMinimap}
        onMoveEnd={(_e, vp) => {
          wakeMinimap();
          saveViewport(vp);
        }}
        minZoom={0.1}
        maxZoom={4}
        snapToGrid={settings.snap}
        snapGrid={[settings.gridSize, settings.gridSize]}
      >
        <EdgeDefs doc={doc} />
        {settings.grid !== "off" ? (
          <Background variant={GRID_VARIANT[settings.grid]} gap={settings.gridSize} />
        ) : null}
        {settings.rulers ? <Rulers pointer={pointer} /> : null}
        {/* Clear of the vertical ruler when it is showing. */}
        <Controls style={settings.rulers ? { marginLeft: 15 + RULER_SIZE } : {}} />
        {settings.minimap ? (
          <MiniMap
            className={minimapAwake ? "arq-minimap awake" : "arq-minimap"}
            style={{ width: 180, height: 135 }}
            offsetScale={2}
            pannable
            zoomable
            ariaLabel="Minimap"
            // The stand-ins for loose line ends are 1px geometry, not something to see.
            nodeClassName={(n) => (n.type === "arqEndpoint" ? "arq-minimap-hidden" : "")}
          />
        ) : null}
        {/* Drawn inside the flow's own viewport, so the preview sits in document coordinates and
            scales and pans with everything else instead of being re-projected by hand. */}
        {drag !== null && armed !== undefined ? (
          <ViewportPortal>
            <DrawPreview item={armed} from={drag.from} to={drag.to} settings={settings} stroke={stroke} />
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
