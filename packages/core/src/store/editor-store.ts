import { createStore, type StoreApi } from "zustand/vanilla";
import { applyPatches, enablePatches, produceWithPatches, type Patch } from "immer";
import {
  DocumentSchema,
  emptyDocument,
  type ArqEdge,
  type ArqNode,
  type Document,
  type EdgeKind,
  type NodeType,
  type Pinned,
} from "@arq/schema";

enablePatches();

// `DocumentSchema` is a ZodEffects (superRefine); `.innerType()` gives the base object,
// whose `nodes`/`edges` fields are `.default([])`-wrapped arrays, so the default wrapper
// has to come off before `.element` reaches the discriminated union.
const NodeElementSchema = DocumentSchema.innerType().shape.nodes.removeDefault().element;
const EdgeElementSchema = DocumentSchema.innerType().shape.edges.removeDefault().element;

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
  type: NodeType;
  label: string;
  icon?: string;
  position: { x: number; y: number };
}

export interface NewEdge {
  id?: string;
  from: string;
  to: string;
  kind: EdgeKind;
  label?: string;
}

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

  loadDocument(doc: Document, filePath: string | null): void;
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
  setPinned(id: string, pinned: Pinned, opts?: MutateOptions): void;
  addEdge(input: NewEdge): string;
  removeEdges(ids: string[]): void;
  setLabel(id: string, label: string): void;
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

function samePinned(a: Pinned | undefined, b: Pinned): boolean {
  return a !== undefined && a.x === b.x && a.y === b.y && a.w === b.w && a.h === b.h;
}

function pruneSelection(sel: Selection, doc: Document): Selection {
  const nodeIds = new Set(doc.nodes.map((n) => n.id));
  const edgeIds = new Set(doc.edges.map((e) => e.id));
  return {
    nodes: sel.nodes.filter((id) => nodeIds.has(id)),
    edges: sel.edges.filter((id) => edgeIds.has(id)),
  };
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

    loadDocument(doc, filePath) {
      set({
        document: doc,
        filePath,
        dirty: false,
        selection: { nodes: [], edges: [] },
        past: [],
        future: [],
        savedEntry: null,
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
      set({ selection: pruneSelection(selection, get().document) });
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
      const id = input.id ?? newId(input.type, existing);
      if (existing.has(id)) throw new Error(`node id "${id}" already exists`);
      const node = NodeElementSchema.parse({
        id,
        type: input.type,
        label: input.label,
        ...(input.icon !== undefined ? { icon: input.icon } : {}),
        props: {},
      }) as ArqNode;
      get().mutate("add node", (d) => {
        d.nodes.push(node);
        d.layout.pinned[id] = { x: input.position.x, y: input.position.y };
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
          if (e !== undefined && (gone.has(e.from) || gone.has(e.to))) d.edges.splice(i, 1);
        }
        for (const id of gone) delete d.layout.pinned[id];
      });
    },

    setPinned(id, pinned, opts) {
      if (samePinned(get().document.layout.pinned[id], pinned)) return;
      get().mutate("move", (d) => {
        d.layout.pinned[id] = { ...pinned };
      }, opts);
    },

    addEdge(input) {
      const doc = get().document;
      const nodeIds = new Set(doc.nodes.map((n) => n.id));
      if (!nodeIds.has(input.from)) throw new Error(`edge source "${input.from}" does not exist`);
      if (!nodeIds.has(input.to)) throw new Error(`edge target "${input.to}" does not exist`);
      const id = input.id ?? newId("e", new Set(doc.edges.map((e) => e.id)));
      const edge = EdgeElementSchema.parse({
        id,
        from: input.from,
        to: input.to,
        kind: input.kind,
        ...(input.label !== undefined ? { label: input.label } : {}),
        props: {},
      }) as ArqEdge;
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
  }));
}
