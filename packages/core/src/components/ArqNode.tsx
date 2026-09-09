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
        // Icons come from the built-in pack or an installed icon pack, both trusted SVG sources.
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
