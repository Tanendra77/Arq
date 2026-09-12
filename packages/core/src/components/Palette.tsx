import { useSyncExternalStore } from "react";
import type { ArrowStyle, EdgeStyle, NodeShape, NodeStyle } from "@arq/schema";
import { ARROW_BODY, edgePath, shapeOutline } from "@arq/render";
import { useEditor } from "../store/context";
import { DRAG_MIME, encodeDragPayload } from "../flow/drag-payload";
import { useSettings } from "./SettingsModal";
import type { Settings } from "../settings";
import type { NewEdge, NewNode } from "../store/editor-store";

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

/**
 * Every new node starts with the same placeholder label, edited in place by double-clicking it
 * (see ArqNode) or through the inspector's Label field. A palette item's own name ("Rectangle",
 * "Diamond") is chrome — it names the tool, not the thing the tool makes — so it is no longer
 * baked into the document as a label the user then has to clear.
 */
export const DEFAULT_NODE_LABEL = "Text";

/**
 * The settings-driven creation defaults, applied once into a new element's own `style` at the
 * moment it is created and never again — a document must render identically on every machine no
 * matter what its author's local settings say, so these values are baked into the element rather
 * than read at render time.
 */
export function nodeCreationStyle(settings: Settings): NodeStyle {
  return { fill: settings.nodeFill, stroke: settings.nodeStroke };
}

export function edgeCreationStyle(item: Extract<PaletteItem, { kind: "edge" }>, settings: Settings): EdgeStyle {
  // "Line" is defined by having no arrowhead; only an item that already wants one takes the
  // configurable style, so turning the setting to "none" cannot silently turn Line into Arrow.
  return { stroke: settings.edgeStroke, endArrow: item.endArrow === "none" ? "none" : settings.edgeArrow };
}

/**
 * The one place a palette item becomes a document element. All three entry points — drag-and-drop,
 * click-to-place, and the palette's own double-click/keyboard shortcut — route through here, so a
 * shape created one way can never differ from the same shape created another way.
 */
export function placeItem(
  item: PaletteItem,
  position: { x: number; y: number },
  settings: Settings,
  api: { addNode: (input: NewNode) => string; addEdge: (input: NewEdge) => string },
): void {
  if (item.kind === "node") {
    api.addNode({
      shape: item.shape,
      label: DEFAULT_NODE_LABEL,
      position,
      style: nodeCreationStyle(settings),
    });
  } else {
    api.addEdge({
      from: { x: position.x - FREE_LINE_LENGTH / 2, y: position.y },
      to: { x: position.x + FREE_LINE_LENGTH / 2, y: position.y },
      style: edgeCreationStyle(item, settings),
    });
  }
}

/**
 * The armed palette tool: the item the next canvas click inserts, or null when a canvas click just
 * clears the selection. A module-level store for the same reason `useSettings` is one — the palette
 * and the canvas both need it but share no ancestor below the app root, and it is view state that
 * must never reach the document.
 */
let activeTool: string | null = null;
const toolListeners = new Set<() => void>();

function subscribeTool(listener: () => void): () => void {
  toolListeners.add(listener);
  return () => toolListeners.delete(listener);
}

function getActiveTool(): string | null {
  return activeTool;
}

export function setActiveTool(key: string | null): void {
  if (activeTool === key) return;
  activeTool = key;
  toolListeners.forEach((l) => l());
}

export function useActiveTool(): [string | null, (key: string | null) => void] {
  return [useSyncExternalStore(subscribeTool, getActiveTool), setActiveTool];
}

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

/** The "text" item draws no outline, so it gets a letterform rather than an empty tile. */
function glyph(item: PaletteItem): string | null {
  return item.kind === "node" && item.shape === "text" ? "T" : null;
}

export function Palette() {
  const addNode = useEditor((s) => s.addNode);
  const addEdge = useEditor((s) => s.addEdge);
  const count = useEditor((s) => s.document.nodes.length + s.document.edges.length);
  const [settings] = useSettings();
  const [tool, setTool] = useActiveTool();

  // The no-position fallback used by double-click and the keyboard shortcut: a short diagonal
  // cascade, so repeated adds do not stack on one spot.
  const place = (item: PaletteItem) => {
    const c = 80 + (count % 6) * 40;
    placeItem(item, { x: c, y: c }, settings, { addNode, addEdge });
  };

  return (
    <div className="arq-palette-inner">
      <div className="arq-palette-tabs">
        <button type="button" className="active">Shapes</button>
        <button type="button" disabled>Icons</button>
      </div>
      <ul className="arq-palette-list">
        {PALETTE_ITEMS.map((item) => {
          const armed = tool === item.key;
          const letter = glyph(item);
          return (
            <li
              key={item.key}
              className={armed ? "armed" : undefined}
              draggable
              tabIndex={0}
              role="button"
              aria-label={item.label}
              aria-pressed={armed}
              title={`${item.label} — click to arm, then click the canvas to place it. Or drag it on.`}
              onClick={() => setTool(armed ? null : item.key)}
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
              {letter !== null ? (
                <span className="arq-palette-glyph" aria-hidden="true">
                  {letter}
                </span>
              ) : null}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
