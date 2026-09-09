import { memo } from "react";
import { BaseEdge, EdgeLabelRenderer, type EdgeProps } from "@xyflow/react";
import { edgePath } from "@arq/render";
import type { ArqFlowEdge } from "../flow/to-flow";
import { EDGE_STYLE } from "../flow/default-edge-kind";

function ArqEdgeImpl({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  data,
  selected,
}: EdgeProps<ArqFlowEdge>) {
  const kind = data?.kind ?? "generic";
  const style = EDGE_STYLE[kind];
  // The shared router from @arq/render, so the canvas and the SVG export draw the same path.
  const { d, mid } = edgePath({ x: sourceX, y: sourceY }, { x: targetX, y: targetY });
  const labelX = mid.x;
  const labelY = mid.y;
  return (
    <>
      <BaseEdge
        id={id}
        path={d}
        className={`arq-edge arq-edge-${kind}${selected === true ? " selected" : ""}`}
        // `exactOptionalPropertyTypes` rejects an explicit `undefined` on these optional props,
        // so each one is spread in only when the edge kind actually asks for it.
        {...(style.dash !== undefined ? { style: { strokeDasharray: style.dash } } : {})}
        {...(style.markerEnd ? { markerEnd: "url(#arq-arrow)" } : {})}
        {...(style.markerStart ? { markerStart: "url(#arq-arrow-start)" } : {})}
      />
      {data?.label !== undefined && data.label !== "" ? (
        <EdgeLabelRenderer>
          <div
            className="arq-edge-label"
            data-testid={`edge-label-${id}`}
            style={{ transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)` }}
          >
            {data.label}
          </div>
        </EdgeLabelRenderer>
      ) : null}
    </>
  );
}

export const ArqEdge = memo(ArqEdgeImpl);

/** Rendered once inside the ReactFlow children so edges can reference the markers. */
export function EdgeMarkers() {
  return (
    <svg style={{ position: "absolute", width: 0, height: 0 }}>
      <defs>
        <marker
          id="arq-arrow"
          viewBox="0 0 10 10"
          refX="9"
          refY="5"
          markerWidth="8"
          markerHeight="8"
          orient="auto-start-reverse"
        >
          <path d="M0 0L10 5L0 10z" fill="currentColor" />
        </marker>
        <marker
          id="arq-arrow-start"
          viewBox="0 0 10 10"
          refX="1"
          refY="5"
          markerWidth="8"
          markerHeight="8"
          orient="auto-start-reverse"
        >
          <path d="M10 0L0 5L10 10z" fill="currentColor" />
        </marker>
      </defs>
    </svg>
  );
}
