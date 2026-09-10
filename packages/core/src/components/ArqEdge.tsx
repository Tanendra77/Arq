import { memo } from "react";
import type { ArrowStyle, Document } from "@arq/schema";
import { BaseEdge, EdgeLabelRenderer, type EdgeProps } from "@xyflow/react";
import { DASH_ARRAY, collectDefs, edgePath, glowId, markerId, resolveEdgeStyle } from "@arq/render";
import type { ArqFlowEdge } from "../flow/to-flow";

function ArqEdgeImpl({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  data,
  selected,
}: EdgeProps<ArqFlowEdge>) {
  const s = resolveEdgeStyle(data?.style);
  // The shared router from @arq/render, so the canvas and the SVG export draw the same path.
  const { d, mid } = edgePath({ x: sourceX, y: sourceY }, { x: targetX, y: targetY }, s.routing);
  const dash = DASH_ARRAY[s.strokeDash];
  // Selection is view state (never exported), so it is layered on as an extra CSS `filter` rather
  // than changing `stroke`: an inline style always wins a specificity fight against a `.selected`
  // class, so this is computed here instead of in CSS. It composes with a document-authored glow
  // filter rather than replacing it.
  const filters = [
    s.glow ? `url(#${glowId(s.glow.color)})` : undefined,
    selected === true ? "drop-shadow(0 0 2px var(--arq-accent)) drop-shadow(0 0 2px var(--arq-accent))" : undefined,
  ].filter((f): f is string => f !== undefined);
  // resolveEdgeStyle widens the arrow fields to `string`; the schema already constrained them to
  // ArrowStyle, so the casts below narrow rather than assert (same as render-svg.ts).
  return (
    <>
      <BaseEdge
        id={id}
        path={d}
        className={`arq-edge${selected === true ? " selected" : ""}`}
        style={{
          stroke: s.stroke,
          strokeWidth: s.strokeWidth,
          ...(dash !== undefined ? { strokeDasharray: dash } : {}),
          ...(filters.length > 0 ? { filter: filters.join(" ") } : {}),
        }}
        {...(s.endArrow !== "none" ? { markerEnd: `url(#${markerId(s.endArrow as ArrowStyle, s.stroke)})` } : {})}
        {...(s.startArrow !== "none" ? { markerStart: `url(#${markerId(s.startArrow as ArrowStyle, s.stroke)})` } : {})}
      />
      {data?.label !== undefined && data.label !== "" ? (
        <EdgeLabelRenderer>
          <div
            className="arq-edge-label"
            data-testid={`edge-label-${id}`}
            style={{ transform: `translate(-50%, -50%) translate(${mid.x}px, ${mid.y}px)` }}
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
