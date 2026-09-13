import { memo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import type { Document } from "@arq/schema";
import { EdgeLabelRenderer, useInternalNode, useReactFlow, type EdgeProps, type InternalNode } from "@xyflow/react";
import {
  anchorPair,
  anchoredPoint,
  collectDefs,
  animAttrs,
  beginLegDrag,
  dragLeg,
  edgeLabelPoint,
  edgePolyline,
  edgeRoute,
  legHandles,
  legsFromPoints,
  viaInsertPoints,
  edgePaths,
  edgePath,
  edgeTangents,
  glowId,
  resolveEdgeStyle,
  seedFromId,
  shapeRect,
  type PathAnim,
  type Rect,
} from "@arq/render";
import { useEditor, useEditorStore } from "../store/context";
import { labelStyle, useReportTextEditing } from "../flow/text-editing";
import { endpointFor } from "../flow/endpoint-target";
import type { ArqFlowNode, ArqFlowEdge } from "../flow/to-flow";

/**
 * The box an edge end is attached to, in flow coordinates.
 *
 * Position comes from React Flow (live, so the edge follows a node mid-drag) but the *size* comes
 * from `shapeRect` — the exporter's own function — so the anchor this feeds `anchorPair` is the
 * one `renderSvg` will compute for the same document. A loose endpoint's hidden stand-in node
 * carries no shape and collapses to a zero-size box at its point, which is exactly what the
 * exporter does with a point endpoint.
 */
function endpointBox(n: InternalNode<ArqFlowNode> | undefined): Rect | undefined {
  if (!n) return undefined;
  const { x, y } = n.internals.positionAbsolute;
  if (!("shape" in n.data)) return { x, y, w: 0, h: 0 };
  const r = shapeRect(n.data.pinned, n.data.shape);
  return { x, y, w: r.w, h: r.h };
}

/** `animAttrs` speaks CSS property names; React wants them as a style object. */
function animProps(a: PathAnim): { className: string; style: CSSProperties } {
  const { className, style } = animAttrs(a);
  return { className, style: style as CSSProperties };
}

/**
 * A draggable dot on a selected line: an end, a leg of a right-angled route, a bend point.
 *
 * The press is followed on the window rather than by pointer capture: dragging a leg can add a turn,
 * which re-keys the handles mid-drag, and a captured element that React replaces takes the capture
 * with it. Each dot also carries an invisible ring twice its size, because a 6px target on a line is
 * what made these so hard to grab.
 */
function Grip({
  at, r = 6, className, testId, title, onStart, onDrag, onDoubleClick,
}: {
  at: { x: number; y: number };
  r?: number;
  className: string;
  testId?: string;
  title?: string;
  onStart?: () => void;
  onDrag: (e: PointerEvent) => void;
  onDoubleClick?: () => void;
}): ReactNode {
  return (
    <g
      className={`arq-grip nodrag nopan ${className}`}
      {...(testId !== undefined ? { "data-testid": testId } : {})}
      onPointerDown={(e) => {
        if (e.button !== 0) return;
        e.stopPropagation();
        onStart?.();
        const up = () => {
          window.removeEventListener("pointermove", onDrag);
          window.removeEventListener("pointerup", up);
        };
        window.addEventListener("pointermove", onDrag);
        window.addEventListener("pointerup", up);
      }}
      onDoubleClick={(e) => {
        e.stopPropagation();
        onDoubleClick?.();
      }}
    >
      <circle className="arq-grip-hit" cx={at.x} cy={at.y} r={r + 7} />
      <circle className="arq-grip-dot" cx={at.x} cy={at.y} r={r} />
      {/* An SVG <title> child, which is how a tooltip is spelled on a shape element. */}
      {title !== undefined ? <title>{title}</title> : null}
    </g>
  );
}

function ArqEdgeImpl({ id, source, target, data, selected }: EdgeProps<ArqFlowEdge>) {
  const setLabel = useEditor((s) => s.setLabel);
  const setEndpoint = useEditor((s) => s.setEndpoint);
  const doc = useEditor((s) => s.document);
  const store = useEditorStore();
  const { screenToFlowPosition } = useReactFlow();
  const sourceNode = useInternalNode<ArqFlowNode>(source);
  const targetNode = useInternalNode<ArqFlowNode>(target);
  // null while not editing; otherwise the in-progress draft, so Escape can discard it.
  const [draft, setDraft] = useState<string | null>(null);
  useReportTextEditing(id, draft !== null);
  /** Start editing the label — which also selects the line, so its text settings are in the panel. */
  const startEditing = () => {
    store.getState().setSelection({ nodes: [], edges: [id] });
    setDraft(data?.label ?? "");
  };
  // The latest geometry, for drags that outlive the render they started in.
  const geo = useRef({ start: { x: 0, y: 0 }, end: { x: 0, y: 0 } });
  /** Which entry of the legs, or of the via points, the drag in progress moves. */
  const dragIndex = useRef(0);
  const dragStamp = useRef(0);

  const s = resolveEdgeStyle(data?.style);
  const from = endpointBox(sourceNode);
  const to = endpointBox(targetNode);
  if (!from || !to) return null; // not measured yet; the next render has both

  // The shared anchor + router from @arq/render, so the canvas and the SVG export draw the same
  // path — including which side of a shape each end mounts on.
  // An end the author pinned overrides the automatic side, here exactly as in the exporter.
  const { start, end } = anchorPair(from, to, {
    from: data ? anchoredPoint(data.from, from) : undefined,
    to: data ? anchoredPoint(data.to, to) : undefined,
  });
  const route = edgeRoute({ legs: data?.legs, via: data?.via }, s.bend);
  const { d, mid } = edgePath(start, end, s.routing, route);
  const lp = s.labelPos === "middle" ? mid : edgeLabelPoint(start, end, s.routing, s.labelPos, route);
  // Selection is view state and never exported, so it is drawn as a wide translucent halo *under*
  // the edge rather than as a CSS `filter` on it. A filter here forced the whole edge layer onto
  // its own compositing layer, which some engines (WebView2 in the desktop build) painted black.
  // A plain extra path cannot do that, and it survives whatever the document's own glow does.
  const glowFilter = s.glow ? `url(#${glowId(s.glow.color)})` : undefined;

  geo.current = { start, end };
  const flowPoint = (e: PointerEvent) => screenToFlowPosition({ x: e.clientX, y: e.clientY });
  const liveEdge = () => store.getState().document.edges.find((x) => x.id === id);
  // Every move within one drag folds into one undo step, and the next drag starts a new one.
  const routeKey = () => ({ mergeKey: `route:${id}:${dragStamp.current}` });
  const commit = () => {
    if (draft !== null && draft !== (data?.label ?? "")) setLabel(id, draft);
    setDraft(null);
  };

  return (
    <>
      {selected === true ? <path className="arq-edge-halo" d={d} /> : null}
      {/* The exporter's own geometry, as real elements. `edgePaths` hands back the same path data
          `renderSvg` serializes, so canvas and file cannot diverge — but building <path> nodes here
          rather than pushing an HTML string through `dangerouslySetInnerHTML` keeps every element in
          the SVG namespace, which innerHTML on an SVG parent does not guarantee in every engine.
          Deliberately unclassed: React Flow's `.react-flow__edge-path` CSS would override the paint
          attributes rough sets. */}
      <g
        className={`arq-edge${selected === true ? " selected" : ""}`}
        style={glowFilter !== undefined ? { filter: glowFilter } : undefined}
      >
        {edgePaths(d, s, seedFromId(id), { start, end, ...edgeTangents(start, end, s.routing, route) }).map((p, i) => (
          <path
            key={i}
            d={p.d}
            stroke={p.stroke}
            strokeWidth={p.strokeWidth}
            fill={p.fill}
            {...(p.dash !== undefined ? { strokeDasharray: p.dash } : {})}
            {...(p.opacity !== undefined ? { strokeOpacity: p.opacity } : {})}
            {/* The class and the per-element duration/direction come from @arq/render, the same
                values it writes into an exported file, so the two animate in step. */
            ...(p.anim !== undefined ? animProps(p.anim) : {})}
          />
        ))}
      </g>
      {/* A fat transparent copy of the path: an edge stroke is only a pixel or two wide, far too
          thin to double-click reliably. Drawn *before* the grips and handles below, so it never sits on top
          of them and swallows the press meant for a dot. This is also what React Flow's own `interactionWidth`
          does, but it needs to carry the handler, so it is spelled out here. */}
      <path
        className="arq-edge-hit"
        d={d}
        fill="none"
        stroke="transparent"
        strokeWidth={20}
        onDoubleClick={(e) => {
          e.stopPropagation();
          startEditing();
        }}
      />
      {/* One grab dot per end, whether that end is bound to a shape or floating. Dragging either
          re-points it: release on (or near) a shape and it binds there, release on empty canvas and
          it becomes a loose point again. Both ends behave identically, which is why the hidden
          stand-in nodes are no longer draggable themselves. */}
      {selected === true
        ? ([
            ["from", start],
            ["to", end],
          ] as const).map(([which, at]) => (
            <Grip
              key={which}
              at={at}
              className="arq-edge-end"
              testId={`end-${which}-${id}`}
              onStart={() => { dragStamp.current += 1; }}
              title="Drag onto a shape to attach — hold Alt to pin the exact spot"
              onDrag={(e) =>
                setEndpoint(id, which, endpointFor(store.getState().document, flowPoint(e), e.altKey), { mergeKey: `endpoint:${id}:${dragStamp.current}` })}
            />
          ))
        : null}
      {/* Right angles: a handle on every leg. Drag one across to move that leg; the first and last
          legs gain a new turn where they are grabbed. */}
      {selected === true && s.routing === "orthogonal"
        ? legHandles(start, end, data?.legs ?? legsFromPoints(edgePolyline(start, end, "orthogonal", s.bend))).map((h) => (
            <Grip
              key={`leg-${h.segment}`}
              at={h.at}
              r={5}
              className={`arq-bend-handle ${h.horizontal ? "horizontal" : "vertical"}`}
              testId={`leg-${id}-${h.segment}`}
              title="Drag to move this part of the line"
              onStart={() => {
                const { start: s0, end: e0 } = geo.current;
                const current = liveEdge()?.legs ?? legsFromPoints(edgePolyline(s0, e0, "orthogonal", s.bend));
                dragStamp.current += 1;
                const begun = beginLegDrag(s0, e0, current, h.segment);
                dragIndex.current = begun.index;
                store.getState().setRoute(id, { legs: begun.legs }, routeKey());
              }}
              onDrag={(e) => {
                const legs = liveEdge()?.legs;
                if (!legs) return;
                const { start: s0, end: e0 } = geo.current;
                store.getState().setRoute(id, { legs: dragLeg(s0, e0, legs, dragIndex.current, flowPoint(e)) }, routeKey());
              }}
            />
          ))
        : null}
      {/* Straight and curved lines: drag a bend point to move it, double-click it to remove it, or
          drag one of the fainter midpoints to add a new bend there. */}
      {selected === true && s.routing !== "orthogonal" ? (
        <>
          {viaInsertPoints(start, end, s.routing, data?.via ?? []).map((at, i) => (
            <Grip
              key={`add-${i}`}
              at={at}
              r={4}
              className="arq-via-add"
              testId={`via-add-${id}-${i}`}
              title="Drag to bend the line here"
              onStart={() => {
                const via = [...(liveEdge()?.via ?? [])];
                via.splice(i, 0, { x: Math.round(at.x), y: Math.round(at.y) });
                dragStamp.current += 1;
                dragIndex.current = i;
                store.getState().setRoute(id, { via }, routeKey());
              }}
              onDrag={(e) => {
                const via = [...(liveEdge()?.via ?? [])];
                const p = flowPoint(e);
                if (dragIndex.current >= via.length) return;
                via[dragIndex.current] = { x: Math.round(p.x), y: Math.round(p.y) };
                store.getState().setRoute(id, { via }, routeKey());
              }}
            />
          ))}
          {(data?.via ?? []).map((at, i) => (
            <Grip
              key={`via-${i}`}
              at={at}
              r={5}
              className="arq-via-point"
              testId={`via-${id}-${i}`}
              title="Drag to move this bend — double-click to remove it"
              onStart={() => {
                dragIndex.current = i;
                dragStamp.current += 1;
              }}
              onDrag={(e) => {
                const via = [...(liveEdge()?.via ?? [])];
                const p = flowPoint(e);
                if (dragIndex.current >= via.length) return;
                via[dragIndex.current] = { x: Math.round(p.x), y: Math.round(p.y) };
                store.getState().setRoute(id, { via }, routeKey());
              }}
              onDoubleClick={() => {
                const via = (liveEdge()?.via ?? []).filter((_, j) => j !== i);
                store.getState().setRoute(id, { via: via.length > 0 ? via : null });
              }}
            />
          ))}
        </>
      ) : null}
      {draft !== null ? (
        <EdgeLabelRenderer>
          <input
            className="arq-edge-label-input nodrag nopan"
            data-testid={`edge-label-input-${id}`}
            style={{
              transform: `translate(-50%, -50%) translate(${lp.x}px, ${lp.y}px)`,
              // The label rises and falls with its line — lifted with it while selected, as the line is.
              zIndex: (data?.layer ?? 0) + (selected === true ? 1000 : 0),
              ...labelStyle(s),
              ...(s.textBackground !== undefined ? { background: s.textBackground } : {}),
            }}
            value={draft}
            autoFocus
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => {
              e.stopPropagation(); // Delete/Backspace here must edit text, not delete the edge
              if (e.key === "Enter") commit();
              else if (e.key === "Escape") setDraft(null);
            }}
          />
        </EdgeLabelRenderer>
      ) : data?.label !== undefined && data.label !== "" ? (
        <EdgeLabelRenderer>
          <div
            className="arq-edge-label"
            data-testid={`edge-label-${id}`}
            style={{
              transform: `translate(-50%, -50%) translate(${lp.x}px, ${lp.y}px)`,
              // The label rises and falls with its line — lifted with it while selected, as the line is.
              zIndex: (data?.layer ?? 0) + (selected === true ? 1000 : 0),
              ...labelStyle(s),
              // Bare text unless a plate was asked for — the same as the export.
              ...(s.textBackground !== undefined ? { background: s.textBackground } : {}),
            }}
            title="Double-click to edit"
            onClick={() => store.getState().setSelection({ nodes: [], edges: [id] })}
            onDoubleClick={(e) => {
              e.stopPropagation();
              startEditing();
            }}
          >
            {data.label}
          </div>
        </EdgeLabelRenderer>
      ) : null}
    </>
  );
}

export const ArqEdge = memo(ArqEdgeImpl);

/**
 * Rendered once inside the ReactFlow children so edges and nodes can reference their markers and
 * glow filters. Built from `collectDefs` in @arq/render — the same function the SVG exporter
 * calls — so the canvas never carries a second, hand-maintained set of marker/filter ids.
 */
export function EdgeDefs({ doc }: { doc: Document }) {
  return (
    <svg
      style={{ position: "absolute", width: 0, height: 0 }}
      // `collectDefs` returns a `<defs>...</defs>` string built only from the document's own
      // style values (colors, arrow kinds) run through @arq/render's own escaping; never raw
      // user text.
      dangerouslySetInnerHTML={{ __html: collectDefs(doc) }}
    />
  );
}
