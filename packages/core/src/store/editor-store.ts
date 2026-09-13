import { createStore, type StoreApi } from "zustand/vanilla";
import { applyPatches, enablePatches, produceWithPatches, type Patch } from "immer";
import {
  EdgeSchema,
  EdgeStyleSchema,
  NodeSchema,
  NodeStyleSchema,
  emptyDocument,
  endpointNode,
  isAnchored,
  isNodeRef,
  type Document,
  type EdgeStyle,
  type Endpoint,
  type NodeShape,
  type NodeStyle,
  type Pinned,
} from "@arq/schema";
import type { Clip } from "./clipboard";
import { parseEndpointNodeId } from "../flow/endpoint-id";

enablePatches();

/** The keys each side's own style schema accepts, so a mixed selection never writes a foreign key. */
const STYLE_KEYS = {
  node: new Set(Object.keys(NodeStyleSchema.shape)),
  edge: new Set(Object.keys(EdgeStyleSchema.shape)),
};

/**
 * Merge `patch` onto `current`, keeping only keys `allowed` names and DELETING a key whose patch
 * value is `undefined` rather than storing `undefined`: a stored `undefined` would survive into
 * the saved JSON and stop meaning "unset", and "unset" has to keep meaning "fall back to the
 * renderer's built-in default" for an export to be byte-identical on every machine.
 */
function mergeStyle<S extends object>(current: S | undefined, patch: StylePatch, allowed: Set<string>): S {
  const next = { ...(current ?? {}) } as Record<string, unknown>;
  for (const [k, v] of Object.entries(patch)) {
    if (!allowed.has(k)) continue;
    if (v === undefined) delete next[k];
    else next[k] = v;
  }
  // `allowed` is the target schema's own key set, so every surviving key is a key of `S` and
  // carries a value that schema accepts.
  return next as S;
}

export interface HistoryEntry {
  name: string;
  patches: Patch[];
  inverse: Patch[];
  mergeKey?: string;
  at: number;
}

export interface Selection {
  nodes: string[];
  edges: string[];
}

export interface NewNode {
  id?: string;
  shape: NodeShape;
  label: string;
  icon?: string;
  style?: NodeStyle;
  position: { x: number; y: number };
  size?: { w: number; h: number };
  /** A freehand stroke's path, normalised to 0..1 within `size`. */
  points?: [number, number][];
}

export interface NewEdge {
  id?: string;
  from: Endpoint;
  to: Endpoint;
  label?: string;
  kind?: string;
  style?: EdgeStyle;
}

/** One patch covering both style vocabularies; keys the target does not know are skipped. */
export type StylePatch = NodeStyle & EdgeStyle;

export interface MutateOptions {
  mergeKey?: string;
}

const MERGE_WINDOW_MS = 1000;

export interface EditorState {
  document: Document;
  filePath: string | null;
  dirty: boolean;
  selection: Selection;
  past: HistoryEntry[];
  future: HistoryEntry[];
  /**
   * View state (never serialized): the history entry that was on top of `past` the last time the
   * document was saved, or `null` when the saved state is the empty history. `dirty` is derived
   * from it, so undoing back to the saved entry clears `dirty` again.
   */
  savedEntry: HistoryEntry | null;
  /**
   * View state (never serialized): the lines of the message the toolbar shows, or `null` when
   * there is nothing to report. A notice raised by a failed command survives whatever the user
   * does next until they dismiss it, except that `loadDocument` clears it: a successful open or
   * a new document starts from a clean slate rather than carrying a stale banner over.
   */
  notice: string[] | null;

  /** `dirty` restores an unsaved state across a reload — an autosaved draft is not a saved file. */
  loadDocument(doc: Document, filePath: string | null, opts?: { dirty?: boolean }): void;
  markSaved(filePath: string | null): void;
  setNotice(lines: string[] | null): void;
  setSelection(sel: Selection): void;
  mutate(name: string, recipe: (draft: Document) => void, opts?: MutateOptions): void;
  undo(): void;
  redo(): void;
  canUndo(): boolean;
  canRedo(): boolean;

  addNode(input: NewNode): string;
  removeNodes(ids: string[]): void;
  /** Nodes and edges together, as one undo step — what an eraser stroke needs. */
  removeElements(nodeIds: string[], edgeIds: string[]): void;
  setPinned(id: string, pinned: Pinned, opts?: MutateOptions): void;
  addEdge(input: NewEdge): string;
  removeEdges(ids: string[]): void;
  setLabel(id: string, label: string): void;
  setStyle(ids: string[], patch: StylePatch, opts?: MutateOptions): void;
  setEndpoint(edgeId: string, which: "from" | "to", ep: Endpoint, opts?: MutateOptions): void;
  /** Adds a copied set of elements under fresh ids, shifted by (dx, dy), as one undo step. Returns what was added. */
  insertClip(clip: Clip, dx: number, dy: number): Selection;
  /** Shifts nodes and the loose ends of edges together, as one mutation. */
  moveBy(nodeIds: string[], edgeIds: string[], dx: number, dy: number, opts?: MutateOptions): void;
}

export type EditorStore = StoreApi<EditorState>;

export function newId(prefix: string, existing: Set<string>): string {
  let n = 1;
  while (existing.has(`${prefix}-${n}`)) n += 1;
  return `${prefix}-${n}`;
}

/** The document is dirty whenever the top of the undo stack is not the entry current at save time. */
function isDirty(past: HistoryEntry[], savedEntry: HistoryEntry | null): boolean {
  return (past[past.length - 1] ?? null) !== savedEntry;
}

/**
 * Stands in for "the state that was last saved" when a draft is restored dirty: it is never on the
 * undo stack, so the document reads as unsaved until the next real save.
 */
const UNSAVED: HistoryEntry = { name: "restored draft", patches: [], inverse: [], at: 0 };

function samePinned(a: Pinned | undefined, b: Pinned): boolean {
  return a !== undefined && a.x === b.x && a.y === b.y && a.w === b.w && a.h === b.h;
}

/**
 * Drop selected ids that no longer exist.
 *
 * A loose edge endpoint is selectable on the canvas but is not a document node — it is the hidden
 * stand-in `toFlow` creates, and it exists for exactly as long as its edge does. Filtering it out
 * as "unknown" is what made selecting or dragging one loop: the canvas reported the selection, the
 * store threw it away, the derived nodes came back unselected, React Flow re-asserted it, and round
 * it went until React aborted with "Maximum update depth exceeded" and unmounted the editor.
 */
function pruneSelection(sel: Selection, doc: Document): Selection {
  const nodeIds = new Set(doc.nodes.map((n) => n.id));
  const edgeIds = new Set(doc.edges.map((e) => e.id));
  const alive = (id: string): boolean => {
    if (nodeIds.has(id)) return true;
    const ep = parseEndpointNodeId(id);
    return ep !== null && edgeIds.has(ep.edgeId);
  };
  return {
    nodes: sel.nodes.filter(alive),
    edges: sel.edges.filter((id) => edgeIds.has(id)),
  };
}

function sameSelection(a: Selection, b: Selection): boolean {
  return (
    a.nodes.length === b.nodes.length &&
    a.edges.length === b.edges.length &&
    a.nodes.every((id, i) => b.nodes[i] === id) &&
    a.edges.every((id, i) => b.edges[i] === id)
  );
}

export function createEditorStore(initial: Document = emptyDocument()): EditorStore {
  return createStore<EditorState>((set, get) => ({
    document: initial,
    filePath: null,
    dirty: false,
    selection: { nodes: [], edges: [] },
    past: [],
    future: [],
    savedEntry: null,
    notice: null,

    loadDocument(doc, filePath, opts = {}) {
      set({
        document: doc,
        filePath,
        dirty: opts.dirty === true,
        selection: { nodes: [], edges: [] },
        past: [],
        future: [],
        savedEntry: opts.dirty === true ? UNSAVED : null,
        notice: null,
      });
    },

    markSaved(filePath) {
      const { past } = get();
      set({ dirty: false, filePath, savedEntry: past[past.length - 1] ?? null });
    },

    setNotice(notice) {
      set({ notice });
    },

    setSelection(selection) {
      const next = pruneSelection(selection, get().document);
      // Publishing an equal-but-new object would re-run `toFlow`, hand React Flow fresh node
      // objects and have it report its selection back — a cycle that only ends when React stops it.
      // Selection arrives from the canvas on every interaction, so this has to be a no-op when
      // nothing actually changed.
      if (sameSelection(next, get().selection)) return;
      set({ selection: next });
    },

    mutate(name, recipe, opts = {}) {
      const { document, past, selection, savedEntry } = get();
      const [next, patches, inverse] = produceWithPatches(document, recipe);
      if (patches.length === 0) return;
      const now = Date.now();
      const last = past[past.length - 1];
      const canMerge =
        opts.mergeKey !== undefined && last !== undefined && last.mergeKey === opts.mergeKey && now - last.at < MERGE_WINDOW_MS;
      const entry: HistoryEntry = canMerge
        ? { ...last, patches: [...last.patches, ...patches], inverse: [...inverse, ...last.inverse], at: now }
        : { name, patches, inverse, at: now, ...(opts.mergeKey !== undefined ? { mergeKey: opts.mergeKey } : {}) };
      const nextPast = canMerge ? [...past.slice(0, -1), entry] : [...past, entry];
      set({
        document: next,
        past: nextPast,
        future: [],
        dirty: isDirty(nextPast, savedEntry),
        selection: pruneSelection(selection, next),
      });
    },

    undo() {
      const { past, future, document, selection, savedEntry } = get();
      const entry = past[past.length - 1];
      if (!entry) return;
      const next = applyPatches(document, entry.inverse);
      const nextPast = past.slice(0, -1);
      set({
        document: next,
        past: nextPast,
        future: [entry, ...future],
        dirty: isDirty(nextPast, savedEntry),
        selection: pruneSelection(selection, next),
      });
    },

    redo() {
      const { past, future, document, selection, savedEntry } = get();
      const entry = future[0];
      if (!entry) return;
      const next = applyPatches(document, entry.patches);
      const nextPast = [...past, entry];
      set({
        document: next,
        past: nextPast,
        future: future.slice(1),
        dirty: isDirty(nextPast, savedEntry),
        selection: pruneSelection(selection, next),
      });
    },

    canUndo: () => get().past.length > 0,
    canRedo: () => get().future.length > 0,

    addNode(input) {
      const doc = get().document;
      const existing = new Set([...doc.nodes.map((n) => n.id), ...doc.groups.map((g) => g.id)]);
      const id = input.id ?? newId(input.shape, existing);
      if (existing.has(id)) throw new Error(`node id "${id}" already exists`);
      const node = NodeSchema.parse({
        id,
        shape: input.shape,
        label: input.label,
        ...(input.icon !== undefined ? { icon: input.icon } : {}),
        ...(input.style !== undefined ? { style: input.style } : {}),
        ...(input.points !== undefined ? { points: input.points } : {}),
      });
      get().mutate("add node", (d) => {
        d.nodes.push(node);
        d.layout.pinned[id] = { x: input.position.x, y: input.position.y, ...(input.size ?? {}) };
      });
      return id;
    },

    removeNodes(ids) {
      const gone = new Set(ids);
      // Nothing to remove: return before `mutate` so a no-op delete never lands on the undo stack.
      if (!get().document.nodes.some((n) => gone.has(n.id))) return;
      get().mutate("remove nodes", (d) => {
        // Splice in place from the end so immer emits per-index patches rather than one
        // `replace` patch carrying a full copy of the array.
        for (let i = d.nodes.length - 1; i >= 0; i -= 1) {
          const n = d.nodes[i];
          if (n !== undefined && gone.has(n.id)) d.nodes.splice(i, 1);
        }
        for (let i = d.edges.length - 1; i >= 0; i -= 1) {
          const e = d.edges[i];
          // Only string endpoints can name a node; an edge with point endpoints is a free-floating
          // line and survives the deletion of anything.
          if (e !== undefined && [e.from, e.to].some((ep) => { const n = endpointNode(ep); return n !== undefined && gone.has(n); }))
            d.edges.splice(i, 1);
        }
        for (const id of gone) delete d.layout.pinned[id];
      });
    },

    removeElements(nodeIds, edgeIds) {
      const nodes = new Set(nodeIds);
      const edges = new Set(edgeIds);
      const doc = get().document;
      if (!doc.nodes.some((n) => nodes.has(n.id)) && !doc.edges.some((e) => edges.has(e.id))) return;
      get().mutate("erase", (d) => {
        for (let i = d.nodes.length - 1; i >= 0; i -= 1) {
          const n = d.nodes[i];
          if (n !== undefined && nodes.has(n.id)) d.nodes.splice(i, 1);
        }
        // An edge goes if it was hit itself, or if either end was attached to a node that went.
        for (let i = d.edges.length - 1; i >= 0; i -= 1) {
          const e = d.edges[i];
          if (e === undefined) continue;
          const orphaned = [e.from, e.to].some((ep) => {
            const bound = endpointNode(ep);
            return bound !== undefined && nodes.has(bound);
          });
          if (edges.has(e.id) || orphaned) d.edges.splice(i, 1);
        }
        for (const id of nodes) delete d.layout.pinned[id];
      });
    },

    setPinned(id, pinned, opts) {
      // Merged, not replaced. A move only knows x/y, so assigning the argument wholesale dropped
      // whatever width and height a resize had stored — dragging a resized shape snapped it back
      // to the default size. Anything a caller does supply still wins.
      const prev = get().document.layout.pinned[id];
      const next = { ...prev, ...pinned };
      if (samePinned(prev, next)) return;
      get().mutate("move", (d) => {
        d.layout.pinned[id] = next;
      }, opts);
    },

    addEdge(input) {
      const doc = get().document;
      const nodeIds = new Set(doc.nodes.map((n) => n.id));
      // Only a string endpoint names a node; a point endpoint is a loose end and needs no target.
      for (const [side, ep] of [["from", input.from], ["to", input.to]] as const) {
        const bound = endpointNode(ep);
        if (bound !== undefined && !nodeIds.has(bound)) throw new Error(`edge ${side} "${bound}" does not exist`);
      }
      const id = input.id ?? newId("e", new Set(doc.edges.map((e) => e.id)));
      const edge = EdgeSchema.parse({
        id,
        from: input.from,
        to: input.to,
        ...(input.kind !== undefined ? { kind: input.kind } : {}),
        ...(input.label !== undefined ? { label: input.label } : {}),
        ...(input.style !== undefined ? { style: input.style } : {}),
      });
      get().mutate("add edge", (d) => {
        d.edges.push(edge);
      });
      return id;
    },

    removeEdges(ids) {
      const gone = new Set(ids);
      if (!get().document.edges.some((e) => gone.has(e.id))) return;
      get().mutate("remove edges", (d) => {
        for (let i = d.edges.length - 1; i >= 0; i -= 1) {
          const e = d.edges[i];
          if (e !== undefined && gone.has(e.id)) d.edges.splice(i, 1);
        }
      });
    },

    setLabel(id, label) {
      get().mutate("set label", (d) => {
        const n = d.nodes.find((x) => x.id === id);
        // Node and edge ids are separate namespaces, so an id may name one of each; a node match
        // wins and the edge is left alone.
        if (n) {
          n.label = label;
          return;
        }
        const e = d.edges.find((x) => x.id === id);
        if (e) e.label = label;
      });
    },

    setStyle(ids, patch, opts) {
      const { nodes, edges } = get().document;
      const known = new Set([...nodes.map((n) => n.id), ...edges.map((e) => e.id)]);
      // Return before `mutate` when nothing matches, so a stale selection never lands a dead
      // entry on the undo stack.
      if (!ids.some((id) => known.has(id))) return;
      get().mutate("set style", (d) => {
        for (const id of ids) {
          // Node and edge ids are separate namespaces, so an id may name one of each; as in
          // `setLabel`, a node match wins and the edge is left alone.
          const n = d.nodes.find((x) => x.id === id);
          if (n) {
            const next = mergeStyle(n.style, patch, STYLE_KEYS.node);
            // An empty style is dropped rather than stored as `{}`, for the same reason an unset
            // key is deleted: the saved JSON carries only what was actually authored.
            if (Object.keys(next).length > 0) n.style = next;
            else delete n.style;
            continue;
          }
          const e = d.edges.find((x) => x.id === id);
          if (!e) continue;
          const next = mergeStyle(e.style, patch, STYLE_KEYS.edge);
          if (Object.keys(next).length > 0) e.style = next;
          else delete e.style;
        }
      }, opts);
    },

    setEndpoint(edgeId, which, ep, opts) {
      const bound = endpointNode(ep);
      if (bound !== undefined && !get().document.nodes.some((n) => n.id === bound)) {
        throw new Error(`edge endpoint "${bound}" does not exist`);
      }
      get().mutate("set endpoint", (d) => {
        const e = d.edges.find((x) => x.id === edgeId);
        if (e) e[which] = ep;
      }, opts);
    },

    insertClip(clip, dx, dy) {
      const doc = get().document;
      const taken = new Set([...doc.nodes.map((n) => n.id), ...doc.groups.map((g) => g.id)]);
      const groups = new Set(doc.groups.map((g) => g.id));
      const ids = new Map<string, string>();
      const nodes = clip.nodes.map((n) => {
        const id = newId(n.shape, taken);
        taken.add(id);
        ids.set(n.id, id);
        const copy = { ...n, id };
        // A group only means something in the document it came from.
        if (copy.group !== undefined && !groups.has(copy.group)) delete copy.group;
        return copy;
      });
      const edgeIds = new Set(doc.edges.map((e) => e.id));
      const shift = (ep: Endpoint): Endpoint | undefined => {
        if (isNodeRef(ep)) return ids.get(ep);
        if (isAnchored(ep)) {
          const node = ids.get(ep.node);
          return node === undefined ? undefined : { ...ep, node };
        }
        return { x: ep.x + dx, y: ep.y + dy };
      };
      const edges = clip.edges.flatMap((e) => {
        const from = shift(e.from);
        const to = shift(e.to);
        if (from === undefined || to === undefined) return []; // bound to something that was not copied
        const id = newId("e", edgeIds);
        edgeIds.add(id);
        return [{ ...e, id, from, to }];
      });
      if (nodes.length === 0 && edges.length === 0) return { nodes: [], edges: [] };
      get().mutate("paste", (d) => {
        for (const n of nodes) d.nodes.push(n);
        for (const e of edges) d.edges.push(e);
        for (const [from, to] of ids) {
          const p = clip.pinned[from] ?? { x: 0, y: 0 };
          d.layout.pinned[to] = { ...p, x: p.x + dx, y: p.y + dy };
        }
      });
      return { nodes: nodes.map((n) => n.id), edges: edges.map((e) => e.id) };
    },

    moveBy(nodeIds, edgeIds, dx, dy, opts) {
      const nodes = new Set(nodeIds);
      const edges = new Set(edgeIds);
      get().mutate("move", (d) => {
        for (const n of d.nodes) {
          if (!nodes.has(n.id)) continue;
          const p = d.layout.pinned[n.id] ?? { x: 0, y: 0 };
          d.layout.pinned[n.id] = { ...p, x: p.x + dx, y: p.y + dy };
        }
        for (const e of d.edges) {
          if (!edges.has(e.id)) continue;
          // Bound ends follow their shapes; only a loose end is a position of the edge's own.
          for (const side of ["from", "to"] as const) {
            const ep = e[side];
            if (typeof ep === "object" && !isAnchored(ep)) e[side] = { x: ep.x + dx, y: ep.y + dy };
          }
        }
      }, opts);
    },
  }));
}
