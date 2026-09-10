import { describe, expect, it, vi } from "vitest";
import { fireEvent, render } from "@testing-library/react";
import { emptyDocument, serializeDocument } from "@arq/schema";
import { EditorStoreProvider } from "../../src/store/context";
import { createEditorStore } from "../../src/store/editor-store";
import { useShortcuts } from "../../src/commands/shortcuts";
import { createFakePlatform } from "../platform-fake";

// useShortcuts calls useReactFlow (for the zoom shortcuts), which requires a ReactFlowProvider
// ancestor. Mocking it here keeps every other test in this file free of that ceremony and lets
// the zoom shortcuts be asserted as plain calls rather than real, timing-sensitive d3 zoom math.
const zoom = { zoomIn: vi.fn(), zoomOut: vi.fn(), zoomTo: vi.fn(), fitView: vi.fn() };
vi.mock("@xyflow/react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@xyflow/react")>();
  return { ...actual, useReactFlow: () => zoom };
});

function Host() { useShortcuts(); return <div />; }

/** The file commands are async; let their promise chains settle before asserting. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("useShortcuts", () => {
  it("Ctrl+Z undoes and Ctrl+Y redoes", () => {
    const store = createEditorStore(emptyDocument());
    render(<EditorStoreProvider store={store} platform={createFakePlatform()}><Host /></EditorStoreProvider>);
    store.getState().addNode({ shape: "rect", label: "a", position: { x: 0, y: 0 } });
    fireEvent.keyDown(window, { key: "z", ctrlKey: true });
    expect(store.getState().document.nodes).toHaveLength(0);
    fireEvent.keyDown(window, { key: "y", ctrlKey: true });
    expect(store.getState().document.nodes).toHaveLength(1);
  });

  it("arrow keys nudge the selection by 1, Shift by 10, merged into one undo entry", () => {
    const store = createEditorStore(emptyDocument());
    render(<EditorStoreProvider store={store} platform={createFakePlatform()}><Host /></EditorStoreProvider>);
    const id = store.getState().addNode({ shape: "rect", label: "a", position: { x: 0, y: 0 } });
    store.getState().setSelection({ nodes: [id], edges: [] });
    fireEvent.keyDown(window, { key: "ArrowRight" });
    fireEvent.keyDown(window, { key: "ArrowDown", shiftKey: true });
    expect(store.getState().document.layout.pinned[id]).toEqual({ x: 1, y: 10 });
    expect(store.getState().past).toHaveLength(2);
  });

  it("Ctrl+D duplicates the selected nodes offset by 20", () => {
    const store = createEditorStore(emptyDocument());
    render(<EditorStoreProvider store={store} platform={createFakePlatform()}><Host /></EditorStoreProvider>);
    const id = store.getState().addNode({ shape: "ellipse", label: "q", position: { x: 5, y: 5 } });
    store.getState().setSelection({ nodes: [id], edges: [] });
    fireEvent.keyDown(window, { key: "d", ctrlKey: true });
    const d = store.getState().document;
    expect(d.nodes).toHaveLength(2);
    expect(d.layout.pinned[d.nodes[1]!.id]).toEqual({ x: 25, y: 25 });
  });

  it("ignores shortcuts while typing in an input", () => {
    const store = createEditorStore(emptyDocument());
    const { container } = render(<EditorStoreProvider store={store} platform={createFakePlatform()}><Host /><input data-testid="i" /></EditorStoreProvider>);
    store.getState().addNode({ shape: "rect", label: "a", position: { x: 0, y: 0 } });
    fireEvent.keyDown(container.querySelector("input")!, { key: "z", ctrlKey: true });
    expect(store.getState().document.nodes).toHaveLength(1);
  });

  it("Ctrl+S saves to the current path and Ctrl+Shift+S saves without one", async () => {
    const store = createEditorStore(emptyDocument());
    const p = createFakePlatform();
    render(<EditorStoreProvider store={store} platform={p}><Host /></EditorStoreProvider>);
    store.getState().markSaved("C:/fake/deck.arq");

    fireEvent.keyDown(window, { key: "s", ctrlKey: true });
    await settle();
    expect(p.saved[0]?.path).toBe("C:/fake/deck.arq");

    fireEvent.keyDown(window, { key: "s", ctrlKey: true, shiftKey: true });
    await settle();
    expect(p.saved[1]?.path).toBeUndefined();
  });

  it("Ctrl+O reports parse errors through the notice and leaves the document alone", async () => {
    const store = createEditorStore(emptyDocument());
    const p = createFakePlatform();
    p.nextOpen = { text: "{ not json" };
    render(<EditorStoreProvider store={store} platform={p}><Host /></EditorStoreProvider>);
    const before = store.getState().document;

    fireEvent.keyDown(window, { key: "o", ctrlKey: true });
    await settle();

    const notice = store.getState().notice;
    expect(Array.isArray(notice)).toBe(true);
    expect(notice?.length).toBeGreaterThan(0);
    expect(store.getState().document).toBe(before);
  });

  it("Ctrl+O loads a valid document", async () => {
    const store = createEditorStore(emptyDocument());
    const p = createFakePlatform();
    p.nextOpen = { path: "C:/fake/other.arq", text: serializeDocument(emptyDocument("Loaded")) };
    store.getState().setNotice(["stale"]);
    render(<EditorStoreProvider store={store} platform={p}><Host /></EditorStoreProvider>);

    fireEvent.keyDown(window, { key: "o", ctrlKey: true });
    await settle();

    expect(store.getState().document.title).toBe("Loaded");
    expect(store.getState().filePath).toBe("C:/fake/other.arq");
    expect(store.getState().notice).toBeNull();
  });

  it("Ctrl+N resets a clean document to Untitled", () => {
    const store = createEditorStore(emptyDocument("Deck"));
    render(<EditorStoreProvider store={store} platform={createFakePlatform()}><Host /></EditorStoreProvider>);
    fireEvent.keyDown(window, { key: "n", ctrlKey: true });
    expect(store.getState().document.title).toBe("Untitled");
  });

  it("Ctrl+A selects every node and edge", () => {
    const store = createEditorStore(emptyDocument());
    render(<EditorStoreProvider store={store} platform={createFakePlatform()}><Host /></EditorStoreProvider>);
    const a = store.getState().addNode({ shape: "rect", label: "a", position: { x: 0, y: 0 } });
    const b = store.getState().addNode({ shape: "rect", label: "b", position: { x: 100, y: 0 } });
    const e = store.getState().addEdge({ from: a, to: b });

    fireEvent.keyDown(window, { key: "a", ctrlKey: true });

    expect(store.getState().selection).toEqual({ nodes: [a, b], edges: [e] });
  });

  it("surfaces a rejected save through the notice", async () => {
    const store = createEditorStore(emptyDocument());
    const p = createFakePlatform();
    p.saveDocument = async () => { throw new Error("disk full"); };
    render(<EditorStoreProvider store={store} platform={p}><Host /></EditorStoreProvider>);

    fireEvent.keyDown(window, { key: "s", ctrlKey: true });
    await settle();

    expect(store.getState().notice).toEqual(["disk full"]);
  });

  it("Ctrl+=/Ctrl+- zoom in and out, Ctrl+0 resets zoom, Ctrl+1 fits the view", () => {
    const store = createEditorStore(emptyDocument());
    render(<EditorStoreProvider store={store} platform={createFakePlatform()}><Host /></EditorStoreProvider>);

    fireEvent.keyDown(window, { key: "=", ctrlKey: true });
    expect(zoom.zoomIn).toHaveBeenCalledTimes(1);

    fireEvent.keyDown(window, { key: "+", ctrlKey: true });
    expect(zoom.zoomIn).toHaveBeenCalledTimes(2);

    fireEvent.keyDown(window, { key: "-", ctrlKey: true });
    expect(zoom.zoomOut).toHaveBeenCalledTimes(1);

    fireEvent.keyDown(window, { key: "0", ctrlKey: true });
    expect(zoom.zoomTo).toHaveBeenCalledWith(1);

    fireEvent.keyDown(window, { key: "1", ctrlKey: true });
    expect(zoom.fitView).toHaveBeenCalledTimes(1);
  });

  it("does not call preventDefault for a key it does not handle", () => {
    const store = createEditorStore(emptyDocument());
    render(<EditorStoreProvider store={store} platform={createFakePlatform()}><Host /></EditorStoreProvider>);
    const event = new KeyboardEvent("keydown", { key: "x", ctrlKey: true, cancelable: true, bubbles: true });
    window.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(false);
  });
});
