import type { ArrowStyle, NodeShape } from "@arq/schema";
import { ARROW_BODY, edgePath, shapeOutline } from "@arq/render";
import { useEditor } from "../store/context";
import { DRAG_MIME, encodeDragPayload } from "../flow/drag-payload";

export type PaletteItem =
  | { key: string; label: string; kind: "node"; shape: NodeShape }
  | { key: string; label: string; kind: "edge"; endArrow: ArrowStyle };

export const PALETTE_ITEMS: readonly PaletteItem[] = [
  { key: "rect", label: "Rectangle", kind: "node", shape: "rect" },
  { key: "ellipse", label: "Ellipse", kind: "node", shape: "ellipse" },
  { key: "diamond", label: "Diamond", kind: "node", shape: "diamond" },
  { key: "triangle", label: "Triangle", kind: "node", shape: "triangle" },
  { key: "text", label: "Text", kind: "node", shape: "text" },
  { key: "line", label: "Line", kind: "edge", endArrow: "none" },
  { key: "arrow", label: "Arrow", kind: "edge", endArrow: "arrow" },
] as const;

/** Length of the free-floating line/arrow a palette edge item drops onto the canvas. */
export const FREE_LINE_LENGTH = 120;

const SWATCH_BOX = { x: 4, y: 4, w: 24, h: 24 };

/** A small inline SVG preview built from `@arq/render`'s own geometry (shapeOutline for node
 *  shapes, edgePath + ARROW_BODY for the line/arrow items) — never hand-drawn. */
function swatch(item: PaletteItem): string {
  if (item.kind === "node") {
    const outline = shapeOutline(item.shape, SWATCH_BOX, 3);
    if (!outline) return ""; // "text": no outline, same as the renderer
    const shaped = outline.replace("/>", ' fill="none" stroke="currentColor" stroke-width="2"/>');
    return `<svg viewBox="0 0 32 32" width="20" height="20">${shaped}</svg>`;
  }
  const arrow = item.endArrow !== "none";
  const shaftEnd = arrow ? 20 : 28;
  const shaft = edgePath({ x: 4, y: 16 }, { x: shaftEnd, y: 16 }, "straight").d;
  const line = `<path d="${shaft}" fill="none" stroke="currentColor" stroke-width="2"/>`;
  // Arrowhead reuses @arq/render's own ARROW_BODY geometry (the same shape drawn into the
  // canvas/export marker), scaled and translated so its local (10,5) tip lands on the shaft end.
  const head = arrow
    ? `<g transform="translate(20,12) scale(0.8)" fill="currentColor">${ARROW_BODY.arrow}</g>`
    : "";
  return `<svg viewBox="0 0 32 32" width="20" height="20">${line}${head}</svg>`;
}

export function Palette() {
  const addNode = useEditor((s) => s.addNode);
  const addEdge = useEditor((s) => s.addEdge);
  const count = useEditor((s) => s.document.nodes.length + s.document.edges.length);

  const place = (item: PaletteItem) => {
    const cx = 80 + (count % 6) * 40;
    const cy = 80 + (count % 6) * 40;
    if (item.kind === "node") {
      addNode({ shape: item.shape, label: item.label, position: { x: cx, y: cy } });
    } else {
      addEdge({
        from: { x: cx - FREE_LINE_LENGTH / 2, y: cy },
        to: { x: cx + FREE_LINE_LENGTH / 2, y: cy },
        style: { endArrow: item.endArrow },
      });
    }
  };

  return (
    <div className="arq-palette-inner">
      <div className="arq-palette-tabs">
        <button type="button" className="active">Shapes</button>
        <button type="button" disabled>Icons</button>
      </div>
      <ul className="arq-palette-list">
        {PALETTE_ITEMS.map((item) => (
          <li
            key={item.key}
            draggable
            tabIndex={0}
            role="button"
            aria-label={item.label}
            title={`Drag onto the canvas, or double-click to add ${item.label}`}
            onDragStart={(e) => {
              e.dataTransfer.setData(DRAG_MIME, encodeDragPayload({ item: item.key }));
              e.dataTransfer.effectAllowed = "copy";
            }}
            onDoubleClick={() => place(item)}
            onKeyDown={(e) => {
              if (e.key !== "Enter" && e.key !== " ") return;
              e.preventDefault();
              place(item);
            }}
          >
            {/* The swatch string comes only from @arq/render's shapeOutline plus attribute values
                this component computed itself — never from document/user content. */}
            <span className="arq-palette-icon" aria-hidden="true" dangerouslySetInnerHTML={{ __html: swatch(item) }} />
            <span>{item.label}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
