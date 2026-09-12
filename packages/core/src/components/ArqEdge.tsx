import { memo, useState } from "react";
import type { Document } from "@arq/schema";
import { EdgeLabelRenderer, useInternalNode, type EdgeProps, type InternalNode } from "@xyflow/react";
import {
  anchorPair,
  collectDefs,
  edgeLabelPoint,
  edgeMarkup,
  edgePath,
  edgeTangents,
  glowId,
  resolveEdgeStyle,
  seedFromId,
  shapeRect,
  type Rect,
} from "@arq/render";
import { useEditor } from "../store/context";
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

function ArqEdgeImpl({ id, source, target, data, selected }: EdgeProps<ArqFlowEdge>) {
  const setLabel = useEditor((s) => s.setLabel);
  const sourceNode = useInternalNode<ArqFlowNode>(source);
  const targetNode = useInternalNode<ArqFlowNode>(target);
  // null while not editing; otherwise the in-progress draft, so Escape can discard it.
  const [draft, setDraft] = useState<string | null>(null);

  const s = resolveEdgeStyle(data?.style);
  const from = endpointBox(sourceNode);
  const to = endpointBox(targetNode);
  if (!from || !to) return null; // not measured yet; the next render has both

  // The shared anchor + router from @arq/render, so the canvas and the SVG export draw the same
  // path — including which side of a shape each end mounts on.
  const { start, end } = anchorPair(from, to);
  const { d, mid } = edgePath(start, end, s.routing);
  const lp = s.labelPos === "middle" ? mid : edgeLabelPoint(start, end, s.routing, s.labelPos);
  // Selection is view state and never exported, so it is drawn as a wide translucent halo *under*
  // the edge rather than as a CSS `filter` on it. A filter here forced the whole edge layer onto
  // its own compositing layer, which some engines (WebView2 in the desktop build) painted black.
  // A plain extra path cannot do that, and it survives whatever the document's own glow does.
  const glowFilter = s.glow ? `url(#${glowId(s.glow.color)})` : undefined;

  const commit = () => {
    if (draft !== null && draft !== (data?.label ?? "")) setLabel(id, draft);
    setDraft(null);
  };

  return (
    <>
      {/* The exporter's own painter. A hand-drawn edge is several paths rather than one, so this
          is markup rather than a React <path>; the string is built by @arq/render from the
          document's geometry and colours, never from raw user text. Deliberately unclassed: React
          Flow's `.react-flow__edge-path` CSS would override the paint attributes rough sets. */}
      {selected === true ? <path className="arq-edge-halo" d={d} /> : null}
      <g
        className={`arq-edge${selected === true ? " selected" : ""}`}
        style={glowFilter !== undefined ? { filter: glowFilter } : undefined}
        dangerouslySetInnerHTML={{
          __html: edgeMarkup(d, s, seedFromId(id), { start, end, ...edgeTangents(start, end, s.routing) }),
        }}
      />
      {/* A fat transparent copy of the path: an edge stroke is only a pixel or two wide, far too
          thin to double-click reliably. This is also what React Flow's own `interactionWidth`
          does, but it needs to carry the handler, so it is spelled out here. */}
      <path
        className="arq-edge-hit"
        d={d}
        fill="none"
        stroke="transparent"
        strokeWidth={20}
        onDoubleClick={(e) => {
          e.stopPropagation();
          setDraft(data?.label ?? "");
        }}
      />
      {draft !== null ? (
        <EdgeLabelRenderer>
          <input
            className="arq-edge-label-input nodrag nopan"
            data-testid={`edge-label-input-${id}`}
            style={{ transform: `translate(-50%, -50%) translate(${lp.x}px, ${lp.y}px)` }}
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
            style={{ transform: `translate(-50%, -50%) translate(${lp.x}px, ${lp.y}px)` }}
            title="Double-click to edit"
            onDoubleClick={(e) => {
              e.stopPropagation();
              setDraft(data.label ?? "");
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
