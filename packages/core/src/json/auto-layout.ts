import { endpointNode, parseDocument, type Document, type ParseIssue, type Pinned } from "@arq/schema";
import { shapeRect, type Rect } from "@arq/render";
import type { ElkNode } from "elkjs/lib/elk-api";

/** Room between the shapes already placed and a batch of new ones laid out beside them. */
const GAP = 80;

/**
 * Give every shape without a position one, using ELK's layered layout — the flow reads in
 * `layout.direction`, connected shapes line up in ranks, crossings are kept down.
 *
 * Shapes that already have a position stay exactly where they are; only the unplaced ones are laid
 * out, as their own graph, and set beside the placed ones in the flow direction. With `all`, every
 * shape is laid out afresh (keeping its size) — the explicit "tidy" action.
 *
 * ponytail: new shapes are placed as a block beside the old ones, not threaded in next to the shapes
 * they connect to; ELK's interactive mode could do that if a mixed diagram ever needs it.
 */
export async function autoLayout(doc: Document, opts: { all?: boolean } = {}): Promise<Document> {
  const pinned = doc.layout.pinned;
  const free = doc.nodes.filter((n) => opts.all === true || pinned[n.id] === undefined);
  if (free.length === 0) return doc;
  const freeIds = new Set(free.map((n) => n.id));

  const graph: ElkNode = {
    id: "root",
    layoutOptions: {
      "elk.algorithm": "layered",
      "elk.direction": doc.layout.direction,
      "elk.spacing.nodeNode": "40",
      "elk.layered.spacing.nodeNodeBetweenLayers": "80",
      "elk.spacing.componentComponent": "60",
      "elk.padding": "[top=0,left=0,bottom=0,right=0]",
    },
    children: free.map((n) => {
      const r = shapeRect(pinned[n.id], n.shape);
      return { id: n.id, width: r.w, height: r.h };
    }),
    edges: doc.edges.flatMap((e) => {
      const from = endpointNode(e.from);
      const to = endpointNode(e.to);
      if (from === undefined || to === undefined || from === to || !freeIds.has(from) || !freeIds.has(to)) return [];
      return [{ id: `edge:${e.id}`, sources: [from], targets: [to] }];
    }),
  };

  // Loaded on first use: most sessions never lay anything out, and ELK is the largest thing in the app.
  const { default: ELK } = await import("elkjs/lib/elk.bundled.js");
  const laid = await new ELK().layout(graph);

  const origin = placeBeside(
    doc.nodes.filter((n) => !freeIds.has(n.id)).map((n) => shapeRect(pinned[n.id], n.shape)),
    { w: laid.width ?? 0, h: laid.height ?? 0 },
    doc.layout.direction,
  );
  const next: Record<string, Pinned> = { ...pinned };
  for (const c of laid.children ?? []) {
    next[c.id] = { ...pinned[c.id], x: Math.round(origin.x + (c.x ?? 0)), y: Math.round(origin.y + (c.y ?? 0)) };
  }
  return { ...doc, layout: { ...doc.layout, pinned: next } };
}

/** Where a block of the given size goes so it sits clear of `placed`, on the side the flow runs toward. */
function placeBeside(placed: Rect[], size: { w: number; h: number }, direction: Document["layout"]["direction"]) {
  if (placed.length === 0) return { x: 0, y: 0 };
  const minX = Math.min(...placed.map((r) => r.x));
  const minY = Math.min(...placed.map((r) => r.y));
  const maxX = Math.max(...placed.map((r) => r.x + r.w));
  const maxY = Math.max(...placed.map((r) => r.y + r.h));
  switch (direction) {
    case "RIGHT": return { x: maxX + GAP, y: minY };
    case "LEFT": return { x: minX - GAP - size.w, y: minY };
    case "DOWN": return { x: minX, y: maxY + GAP };
    case "UP": return { x: minX, y: minY - GAP - size.h };
  }
}

export type ApplyResult = { ok: true; document: Document } | { ok: false; issues: ParseIssue[] };

/**
 * Turn JSON text into the document to show: validated by the same schema a file open uses, with
 * positions kept from `current` for any shape the text names without one — so regenerating a diagram,
 * or a JSON that never carried a layout, does not shuffle what is already on the canvas — and the
 * rest laid out.
 */
export async function applyJson(text: string, current: Document): Promise<ApplyResult> {
  const parsed = parseDocument(text);
  if (!parsed.ok) return { ok: false, issues: parsed.issues };
  const doc = parsed.document;
  const pinned = { ...doc.layout.pinned };
  for (const n of doc.nodes) {
    const kept = current.layout.pinned[n.id];
    if (pinned[n.id] === undefined && kept !== undefined) pinned[n.id] = kept;
  }
  return { ok: true, document: await autoLayout({ ...doc, layout: { ...doc.layout, pinned } }) };
}
