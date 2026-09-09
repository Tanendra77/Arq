import { memo } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import type { ArqFlowNode } from "../flow/to-flow";

export const NODE_SIZE = { w: 120, h: 96 } as const;

function ArqNodeImpl({ data, selected }: NodeProps<ArqFlowNode>) {
  return (
    <div
      className={`arq-node${selected === true ? " selected" : ""}`}
      style={{ width: NODE_SIZE.w }}
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
      <div className="arq-node-label">{data.label}</div>
      <div className="arq-node-badge">{data.nodeType}</div>
    </div>
  );
}

export const ArqNode = memo(ArqNodeImpl);
