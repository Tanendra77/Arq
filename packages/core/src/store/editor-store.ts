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

  loadDocument(doc: Document, filePath: string | null): void;
  markSaved(filePath: string | null): void;
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

    loadDocument(doc, filePath) {
      set({ document: doc, filePath, dirty: false, selection: { nodes: [], edges: [] }, past: [], future: [] });
    },

    markSaved(filePath) {
      set({ dirty: false, filePath });
    },

    setSelection(selection) {
      set({ selection: pruneSelection(selection, get().document) });
    },

    mutate(name, recipe, opts = {}) {
      const { document, past, selection } = get();
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
      set({ document: next, past: nextPast, future: [], dirty: true, selection: pruneSelection(selection, next) });
    },

    undo() {
      const { past, future, document, selection } = get();
      const entry = past[past.length - 1];
      if (!entry) return;
      const next = applyPatches(document, entry.inverse);
      set({ document: next, past: past.slice(0, -1), future: [entry, ...future], dirty: true, selection: pruneSelection(selection, next) });
    },

    redo() {
      const { past, future, document, selection } = get();
      const entry = future[0];
      if (!entry) return;
      const next = applyPatches(document, entry.patches);
      set({ document: next, past: [...past, entry], future: future.slice(1), dirty: true, selection: pruneSelection(selection, next) });
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
      get().mutate("remove nodes", (d) => {
        d.nodes = d.nodes.filter((n) => !gone.has(n.id));
        d.edges = d.edges.filter((e) => !gone.has(e.from) && !gone.has(e.to));
        for (const id of gone) delete d.layout.pinned[id];
      });
    },

    setPinned(id, pinned, opts) {
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
      get().mutate("remove edges", (d) => {
        d.edges = d.edges.filter((e) => !gone.has(e.id));
      });
    },

    setLabel(id, label) {
      get().mutate("set label", (d) => {
        const n = d.nodes.find((x) => x.id === id);
        if (n) n.label = label;
        const e = d.edges.find((x) => x.id === id);
        if (e) e.label = label;
      });
    },
  }));
}
