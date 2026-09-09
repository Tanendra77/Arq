import { NODE_TYPES, type NodeType } from "@arq/schema";
import { BUILTIN_ICONS } from "../icons/primitives";
import { useEditor } from "../store/context";
import { DRAG_MIME, encodeDragPayload } from "../flow/drag-payload";

export const TYPE_LABELS: Record<NodeType, string> = {
  broker: "Broker",
  queue: "Queue",
  topic: "Topic",
  app: "Application",
  consumer: "Consumer",
  publisher: "Publisher",
  mesh: "Event mesh",
  gateway: "Gateway",
  store: "Data store",
  external: "External system",
  shape: "Shape",
};

export function Palette() {
  const addNode = useEditor((s) => s.addNode);
  const count = useEditor((s) => s.document.nodes.length);
  return (
    <div className="arq-palette-inner">
      <div className="arq-palette-tabs">
        <button type="button" className="active">Types</button>
        <button type="button" disabled>Icons</button>
      </div>
      <ul className="arq-palette-list">
        {NODE_TYPES.map((t) => {
          const add = () =>
            addNode({
              type: t,
              label: TYPE_LABELS[t],
              position: { x: 80 + (count % 6) * 40, y: 80 + (count % 6) * 40 },
            });
          return (
            <li
              key={t}
              draggable
              tabIndex={0}
              role="button"
              aria-label={TYPE_LABELS[t]}
              title={`Drag onto the canvas, or double-click to add ${TYPE_LABELS[t]}`}
              onDragStart={(e) => {
                e.dataTransfer.setData(DRAG_MIME, encodeDragPayload({ nodeType: t, label: TYPE_LABELS[t] }));
                e.dataTransfer.effectAllowed = "copy";
              }}
              onDoubleClick={add}
              onKeyDown={(e) => {
                if (e.key !== "Enter" && e.key !== " ") return;
                e.preventDefault();
                add();
              }}
            >
              {/* The built-in icons are hand-authored constants in this package, not user input. */}
              <span className="arq-palette-icon" aria-hidden="true" dangerouslySetInnerHTML={{ __html: BUILTIN_ICONS[t] }} />
              <span>{TYPE_LABELS[t]}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
