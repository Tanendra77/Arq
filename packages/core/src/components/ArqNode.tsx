import { memo, useState } from "react";
import { Handle, Position, useReactFlow, type NodeProps } from "@xyflow/react";
import {
  METRICS, PULSE_CLASS, glowId, resolveNodeStyle, seedFromId, shapeMarkup, shapeRect, wrapLabel,
} from "@arq/render";
import { useEditor } from "../store/context";
import type { ArqFlowNode } from "../flow/to-flow";
// Same floor drag-to-size uses. `PinnedSchema` requires a positive w/h, so a node must never be
// resizable down to a zero dimension the document schema would then refuse to load.
import { MIN_NODE_SIZE } from "./Palette";
import { CORNERS, angleFromPointer, resizeRotated } from "../flow/node-handles";

function ArqNodeImpl({ id, data, selected }: NodeProps<ArqFlowNode>) {
  // Hooks run before the endpoint-node bail-out below: that branch is decided by props, but the
  // hook order must not change with it.
  const setPinned = useEditor((s) => s.setPinned);
  const setLabel = useEditor((s) => s.setLabel);
  const setStyle = useEditor((s) => s.setStyle);
  const { screenToFlowPosition } = useReactFlow();
  // null while not editing; otherwise the in-progress draft, so Escape can discard it.
  const [draft, setDraft] = useState<string | null>(null);

  if (!("shape" in data)) return null; // the hidden node standing in for a loose edge endpoint: no visual
  const s = resolveNodeStyle(data.style);
  // Same call the SVG exporter makes (`layoutDocument` -> `shapeRect(doc.layout.pinned[id], shape)`),
  // so a pinned w/h renders here exactly as it exports. x/y are zeroed: React Flow already
  // positions this node via its own `position`/CSS transform, and shapeOutline draws relative to
  // rect.x/rect.y — passing the pinned x/y through here would draw the shape outside this node's
  // local `viewBox="0 0 w h"` instead of on top of it.
  const rect = shapeRect(data.pinned ? { ...data.pinned, x: 0, y: 0 } : undefined, data.shape);
  // The same box in document coordinates, which is the frame the handle maths works in.
  const box = data.pinned ? shapeRect(data.pinned, data.shape) : undefined;
  // The exporter's own painter, seeded off the node id: the hand-drawn wobble on screen is the
  // wobble in the exported file, down to the byte.
  const shaped = shapeMarkup(data.shape, rect, s, seedFromId(id));
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

  const commit = () => {
    if (draft !== null && draft !== data.label) setLabel(id, draft);
    setDraft(null);
  };

  return (
    <div
      className={`arq-node${selected === true ? " selected" : ""}${s.animate === "pulse" ? ` ${PULSE_CLASS}` : ""}`}
      style={{
        width: rect.w,
        height: rect.h,
        position: "relative",
        // About the box's own centre, matching the `rotate(deg cx cy)` the exporter writes. The
        // resize handles and the edge anchors both stay on the unrotated box, which is what keeps
        // screen and file agreeing on where a line meets this shape.
        ...(s.rotate === 0 ? {} : { transform: `rotate(${s.rotate}deg)` }),
      }}
      data-shape={data.shape}
    >
      {/* Corner handles and a rotation grip, drawn inside the rotated box so they sit on the
          shape's own corners. Both commit through the same `setPinned` a node drag uses, each
          under its own merge key, so a whole gesture collapses into one undo entry and never
          merges into a preceding move. Writing on every step rather than only at the end is what
          makes the shape follow the pointer: ArqNode sizes itself from the document. */}
      {selected === true && box !== undefined ? (
        <>
          <div
            className="arq-rotate-grip nodrag nopan"
            data-testid={`rotate-${id}`}
            title="Drag to rotate (hold Shift for 15° steps)"
            onPointerDown={(e) => {
              e.stopPropagation();
              e.currentTarget.setPointerCapture(e.pointerId);
            }}
            onPointerMove={(e) => {
              if (!e.currentTarget.hasPointerCapture(e.pointerId)) return;
              const p = screenToFlowPosition({ x: e.clientX, y: e.clientY });
              setStyle([id], { rotate: angleFromPointer(box, p, e.shiftKey) }, { mergeKey: "rotate" });
            }}
            onPointerUp={(e) => e.currentTarget.releasePointerCapture(e.pointerId)}
          />
          {CORNERS.map((corner) => (
            <div
              key={corner}
              className={`arq-resize-handle arq-resize-${corner} nodrag nopan`}
              data-testid={`resize-${corner}-${id}`}
              onPointerDown={(e) => {
                e.stopPropagation();
                e.currentTarget.setPointerCapture(e.pointerId);
              }}
              onPointerMove={(e) => {
                if (!e.currentTarget.hasPointerCapture(e.pointerId)) return;
                const p = screenToFlowPosition({ x: e.clientX, y: e.clientY });
                setPinned(id, resizeRotated(box, corner, p, s.rotate, MIN_NODE_SIZE), { mergeKey: "resize" });
              }}
              onPointerUp={(e) => e.currentTarget.releasePointerCapture(e.pointerId)}
            />
          ))}
        </>
      ) : null}
      <Handle type="target" position={Position.Left} />
      <Handle type="source" position={Position.Right} />
      <svg
        className="arq-node-shape"
        width={rect.w}
        height={rect.h}
        viewBox={`0 0 ${rect.w} ${rect.h}`}
        style={{ position: "absolute", inset: 0, filter: filterId ? `url(#${filterId})` : undefined }}
        // The outline string comes only from `shapeMarkup` in @arq/render, built from the
        // document's own geometry and colours — never from raw document/user text.
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
      {draft !== null ? (
        // `nodrag`/`nopan` are React Flow's own opt-outs: without them a click into the field
        // starts a node drag and the caret never lands.
        <input
          className="arq-node-label-input nodrag nopan"
          style={{ position: "absolute", left: 0, top: labelTop, width: rect.w, textAlign: s.textAlign, fontSize: s.fontSize }}
          value={draft}
          autoFocus
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            e.stopPropagation(); // Delete/Backspace in the field must edit text, not delete the node
            if (e.key === "Enter") commit();
            else if (e.key === "Escape") setDraft(null);
          }}
        />
      ) : (
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
          title="Double-click to edit"
          // stopPropagation so the canvas does not also take this as a zoom-to-fit double-click.
          onDoubleClick={(e) => {
            e.stopPropagation();
            setDraft(data.label);
          }}
        >
          {lines.map((line, i) => (
            <div key={i}>{line}</div>
          ))}
        </div>
      )}
    </div>
  );
}

export const ArqNode = memo(ArqNodeImpl);

/**
 * The stand-in node for a loose (unattached) edge end.
 *
 * React Flow needs every edge to name a real node with real handles, so a free-floating line gets
 * one of these at each unattached end. It must be registered in `nodeTypes`: without an entry,
 * React Flow falls back to its own default node and each loose end draws as a visible empty box —
 * which is why dropping a single arrow used to appear to insert two boxes.
 *
 * It renders as a small grab dot rather than nothing at all, so the end can be dragged to a new
 * position (Canvas routes that drag to `setEndpoint`).
 */
function ArqEndpointNodeImpl() {
  return (
    <div className="arq-endpoint" title="Drag to move this end">
      <Handle type="target" position={Position.Left} className="arq-endpoint-handle" />
      <Handle type="source" position={Position.Right} className="arq-endpoint-handle" />
    </div>
  );
}

export const ArqEndpointNode = memo(ArqEndpointNodeImpl);
