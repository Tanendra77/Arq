import { memo, useState } from "react";
import type { ArrowStyle, Document } from "@arq/schema";
import { EdgeLabelRenderer, useInternalNode, type EdgeProps, type InternalNode } from "@xyflow/react";
import {
  DASH_ARRAY,
  anchorPair,
  collectDefs,
  edgeLabelPoint,
  edgePath,
  glowId,
  markerId,
  resolveEdgeStyle,
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
  const dash = DASH_ARRAY[s.strokeDash];
  // Selection is view state (never exported), so it is layered on as an extra CSS `filter` rather
  // than changing `stroke`: an inline style always wins a specificity fight against a `.selected`
  // class, so this is computed here instead of in CSS. It composes with a document-authored glow
  // filter rather than replacing it.
  const filters = [
    s.glow ? `url(#${glowId(s.glow.color)})` : undefined,
    selected === true ? "drop-shadow(0 0 2px var(--arq-accent)) drop-shadow(0 0 2px var(--arq-accent))" : undefined,
  ].filter((f): f is string => f !== undefined);

  const commit = () => {
    if (draft !== null && draft !== (data?.label ?? "")) setLabel(id, draft);
    setDraft(null);
  };

  // resolveEdgeStyle widens the arrow fields to `string`; the schema already constrained them to
  // ArrowStyle, so the casts below narrow rather than assert (same as render-svg.ts).
  return (
    <>
      <path
        id={id}
        className={`arq-edge react-flow__edge-path${selected === true ? " selected" : ""}`}
        d={d}
        fill="none"
        style={{
          stroke: s.stroke,
          strokeWidth: s.strokeWidth,
          ...(dash !== undefined ? { strokeDasharray: dash } : {}),
          ...(filters.length > 0 ? { filter: filters.join(" ") } : {}),
        }}
        {...(s.endArrow !== "none" ? { markerEnd: `url(#${markerId(s.endArrow as ArrowStyle, s.stroke)})` } : {})}
        {...(s.startArrow !== "none" ? { markerStart: `url(#${markerId(s.startArrow as ArrowStyle, s.stroke)})` } : {})}
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
