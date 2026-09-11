import { memo } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { DASH_ARRAY, METRICS, glowId, resolveNodeStyle, shapeOutline, shapeRect, wrapLabel } from "@arq/render";
import type { ArqFlowNode } from "../flow/to-flow";

function ArqNodeImpl({ data, selected }: NodeProps<ArqFlowNode>) {
  if (!("shape" in data)) return null; // the hidden node standing in for a loose edge endpoint: no visual
  const s = resolveNodeStyle(data.style);
  // Same call the SVG exporter makes (`layoutDocument` -> `shapeRect(doc.layout.pinned[id], shape)`),
  // so a pinned w/h renders here exactly as it exports. x/y are zeroed: React Flow already
  // positions this node via its own `position`/CSS transform, and shapeOutline draws relative to
  // rect.x/rect.y — passing the pinned x/y through here would draw the shape outside this node's
  // local `viewBox="0 0 w h"` instead of on top of it.
  const rect = shapeRect(data.pinned ? { ...data.pinned, x: 0, y: 0 } : undefined, data.shape);
  const dash = DASH_ARRAY[s.strokeDash];
  // shapeOutline emits one element with no paint attributes, ending in `/>`; splice the resolved
  // style in exactly as the SVG exporter does, so the two never draw two different rects.
  const outline = shapeOutline(data.shape, rect, s.radius);
  const shaped = outline
    ? outline.replace(
        "/>",
        ` fill="${s.fill}" stroke="${s.stroke}" stroke-width="${s.strokeWidth}"${dash ? ` stroke-dasharray="${dash}"` : ""}/>`,
      )
    : "";
  // Referenced only, never defined here: `EdgeDefs` mounts `collectDefs(doc)` once per document,
  // which already emits `<filter id="arq-glow-<color>">` for every glowing node and edge. Defining
  // it again per-node would duplicate that id in the DOM.
  const filterId = s.glow ? glowId(s.glow.color) : undefined;

  const lines = wrapLabel(data.label);
  const hasIcon = data.iconId !== undefined;
  const iconBox = { x: (rect.w - METRICS.iconSize) / 2, y: METRICS.padding, w: METRICS.iconSize, h: METRICS.iconSize };
  // With an icon the label sits under it; without one it is centred in the box, matching
  // `renderNode` in @arq/render so a `text` shape (no outline, no icon) reads the same both places.
  const labelTop = hasIcon ? iconBox.y + iconBox.h + METRICS.gap : (rect.h - lines.length * METRICS.labelLineHeight) / 2;

  return (
    <div
      className={`arq-node${selected === true ? " selected" : ""}`}
      style={{ width: rect.w, height: rect.h, position: "relative" }}
      data-shape={data.shape}
    >
      <Handle type="target" position={Position.Left} />
      <Handle type="source" position={Position.Right} />
      <svg
        className="arq-node-shape"
        width={rect.w}
        height={rect.h}
        viewBox={`0 0 ${rect.w} ${rect.h}`}
        style={{ position: "absolute", inset: 0, filter: filterId ? `url(#${filterId})` : undefined }}
        // The outline string comes only from `shapeOutline` in @arq/render plus attribute values
        // this component computed itself — never from document/user content.
        dangerouslySetInnerHTML={{ __html: shaped }}
      />
      {hasIcon ? (
        data.iconSvg !== undefined ? (
          <div
            className="arq-node-icon"
            style={{ position: "absolute", left: iconBox.x, top: iconBox.y, width: iconBox.w, height: iconBox.h }}
            // SAFE ONLY WHILE THE RESOLVER IS BUILT-IN-ONLY. Today `createIconResolver([])` (or
            // packs installed via the platform) is the only source reaching this component. Icon
            // pack import (spec 7.2, slice 4) makes this a user-supplied string: that task MUST
            // land the import-time sanitizer (strip <script>, on* handlers, <foreignObject>, and
            // any non-fragment href/url()) before an installed pack's SVG text reaches this sink.
            dangerouslySetInnerHTML={{ __html: data.iconSvg }}
          />
        ) : (
          <div
            className="arq-node-icon arq-node-icon-missing"
            style={{ position: "absolute", left: iconBox.x, top: iconBox.y, width: iconBox.w, height: iconBox.h }}
            title={`Missing icon ${data.iconId ?? ""}`}
          >
            {data.iconId}
          </div>
        )
      ) : null}
      <div
        className="arq-node-label"
        style={{
          position: "absolute",
          left: 0,
          top: labelTop,
          width: rect.w,
          textAlign: s.textAlign,
          fontSize: s.fontSize,
        }}
      >
        {lines.map((line, i) => (
          <div key={i}>{line}</div>
        ))}
      </div>
    </div>
  );
}

export const ArqNode = memo(ArqNodeImpl);
