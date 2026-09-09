import { memo } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { METRICS, nodeHeight, wrapLabel } from "@arq/render";
import type { ArqFlowNode } from "../flow/to-flow";

function ArqNodeImpl({ data, selected }: NodeProps<ArqFlowNode>) {
  // Size the DOM box from the shared metrics table so the canvas box is the one the exporter draws.
  const h = nodeHeight(data.label);
  return (
    <div
      className={`arq-node${selected === true ? " selected" : ""}`}
      style={{ width: METRICS.nodeWidth, height: h, boxSizing: "border-box" }}
      data-node-type={data.nodeType}
    >
      <Handle type="target" position={Position.Left} />
      <Handle type="source" position={Position.Right} />
      {data.iconSvg !== undefined ? (
        // SAFE ONLY WHILE THE RESOLVER IS BUILT-IN-ONLY. Today `createIconResolver([])` is called
        // with no installed packs, so this is always hand-authored SVG from `icons/primitives.ts`.
        // Icon-pack import (spec 7.2, slice 4) makes this a user-supplied string: that task MUST
        // land the import-time sanitizer (strip <script>, on* handlers, <foreignObject>, and any
        // non-fragment href/url()) before it passes a pack to the resolver.
        <div className="arq-node-icon" dangerouslySetInnerHTML={{ __html: data.iconSvg }} />
      ) : (
        <div className="arq-node-icon arq-node-icon-missing" title={`Missing icon ${data.iconId ?? ""}`}>
          {data.iconId}
        </div>
      )}
      <div className="arq-node-label">
        {wrapLabel(data.label).map((line, i) => (
          <div key={i}>{line}</div>
        ))}
      </div>
      <div className="arq-node-badge">{data.nodeType}</div>
    </div>
  );
}

export const ArqNode = memo(ArqNodeImpl);
