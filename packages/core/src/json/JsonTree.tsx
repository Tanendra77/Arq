import type { ReactNode } from "react";
import type { Document } from "@arq/schema";
import type { Selection } from "../store/editor-store";

type Json = null | boolean | number | string | Json[] | { [k: string]: Json };

/** A one-line reminder of what an element is, so a collapsed shape or line still says which it is. */
function elementHint(kind: "nodes" | "edges", v: Json): string {
  if (!v || typeof v !== "object" || Array.isArray(v)) return "";
  const end = (e: Json) => (typeof e === "string" ? e : e && typeof e === "object" && !Array.isArray(e) && typeof e.node === "string" ? e.node : "·");
  if (kind === "nodes") return `${String(v.shape)}${v.label ? ` · "${String(v.label)}"` : ""}`;
  return `${end(v.from ?? null)} → ${end(v.to ?? null)}${v.label ? ` · "${String(v.label)}"` : ""}`;
}

function Leaf({ name, value }: { name: string | number; value: Json }) {
  const kind = value === null ? "null" : typeof value;
  return (
    <li className="arq-tree-leaf">
      <span className="arq-tree-key">{name}</span>
      <span className={`arq-tree-value ${kind}`}>{JSON.stringify(value)}</span>
    </li>
  );
}

function Branch({
  name, value, open, hint, selected, onSummaryClick, children,
}: {
  name: string | number;
  value: Json[] | { [k: string]: Json };
  open: boolean;
  hint?: string;
  selected?: boolean;
  onSummaryClick?: () => void;
  children?: ReactNode;
}) {
  const count = Array.isArray(value) ? `[${value.length}]` : `{${Object.keys(value).length}}`;
  return (
    <li className={`arq-tree-branch${selected ? " selected" : ""}`}>
      {/* Native disclosure: keyboard and screen-reader support come with the element. */}
      <details open={open}>
        <summary onClick={onSummaryClick}>
          <span className="arq-tree-key">{name}</span>
          <span className="arq-tree-count">{count}</span>
          {hint ? <span className="arq-tree-hint">{hint}</span> : null}
        </summary>
        <ul>{children ?? entries(value).map(([k, v]) => <Node key={k} name={k} value={v} depth={1} />)}</ul>
      </details>
    </li>
  );
}

const entries = (v: Json[] | { [k: string]: Json }): [string | number, Json][] =>
  Array.isArray(v) ? v.map((x, i) => [i, x]) : Object.entries(v);

function Node({ name, value, depth }: { name: string | number; value: Json; depth: number }) {
  if (value === null || typeof value !== "object") return <Leaf name={name} value={value} />;
  return <Branch name={name} value={value} open={depth < 1} />;
}

/**
 * The diagram's JSON as a collapsible outline — the same document the text shows, easier to scan.
 * Shapes and lines are summarised by what they are; clicking one selects it on the canvas, and
 * whatever is selected there is marked here.
 */
export function JsonTree({
  doc, selection, onSelect,
}: {
  doc: Document;
  selection: Selection;
  onSelect: (kind: "nodes" | "edges", id: string) => void;
}) {
  const root = JSON.parse(JSON.stringify(doc)) as { [k: string]: Json };
  const picked = { nodes: new Set(selection.nodes), edges: new Set(selection.edges) };
  return (
    <ul className="arq-tree" data-testid="json-tree" role="tree" aria-label="Diagram JSON outline">
      {Object.entries(root).map(([key, value]) => {
        if ((key === "nodes" || key === "edges") && Array.isArray(value)) {
          return (
            <Branch key={key} name={key} value={value} open>
              {value.map((item, i) => {
                const id = item && typeof item === "object" && !Array.isArray(item) ? String(item.id) : String(i);
                return (
                  <Branch
                    key={id}
                    name={id}
                    value={item as { [k: string]: Json }}
                    open={false}
                    hint={elementHint(key, item)}
                    selected={picked[key].has(id)}
                    onSummaryClick={() => onSelect(key, id)}
                  />
                );
              })}
            </Branch>
          );
        }
        return <Node key={key} name={key} value={value} depth={0} />;
      })}
    </ul>
  );
}
