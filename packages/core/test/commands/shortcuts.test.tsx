import { describe, expect, it } from "vitest";
import { fireEvent, render } from "@testing-library/react";
import { emptyDocument } from "@arq/schema";
import { EditorStoreProvider } from "../../src/store/context";
import { createEditorStore } from "../../src/store/editor-store";
import { useShortcuts } from "../../src/commands/shortcuts";
import { createFakePlatform } from "../platform-fake";

function Host() { useShortcuts(); return <div />; }

describe("useShortcuts", () => {
  it("Ctrl+Z undoes and Ctrl+Y redoes", () => {
    const store = createEditorStore(emptyDocument());
    render(<EditorStoreProvider store={store} platform={createFakePlatform()}><Host /></EditorStoreProvider>);
    store.getState().addNode({ type: "app", label: "a", position: { x: 0, y: 0 } });
    fireEvent.keyDown(window, { key: "z", ctrlKey: true });
    expect(store.getState().document.nodes).toHaveLength(0);
    fireEvent.keyDown(window, { key: "y", ctrlKey: true });
    expect(store.getState().document.nodes).toHaveLength(1);
  });

  it("arrow keys nudge the selection by 1, Shift by 10, merged into one undo entry", () => {
    const store = createEditorStore(emptyDocument());
    render(<EditorStoreProvider store={store} platform={createFakePlatform()}><Host /></EditorStoreProvider>);
    const id = store.getState().addNode({ type: "app", label: "a", position: { x: 0, y: 0 } });
    store.getState().setSelection({ nodes: [id], edges: [] });
    fireEvent.keyDown(window, { key: "ArrowRight" });
    fireEvent.keyDown(window, { key: "ArrowDown", shiftKey: true });
    expect(store.getState().document.layout.pinned[id]).toEqual({ x: 1, y: 10 });
    expect(store.getState().past).toHaveLength(2);
  });

  it("Ctrl+D duplicates the selected nodes offset by 20", () => {
    const store = createEditorStore(emptyDocument());
    render(<EditorStoreProvider store={store} platform={createFakePlatform()}><Host /></EditorStoreProvider>);
    const id = store.getState().addNode({ type: "queue", label: "q", position: { x: 5, y: 5 } });
    store.getState().setSelection({ nodes: [id], edges: [] });
    fireEvent.keyDown(window, { key: "d", ctrlKey: true });
    const d = store.getState().document;
    expect(d.nodes).toHaveLength(2);
    expect(d.layout.pinned[d.nodes[1]!.id]).toEqual({ x: 25, y: 25 });
  });

  it("ignores shortcuts while typing in an input", () => {
    const store = createEditorStore(emptyDocument());
    const { container } = render(<EditorStoreProvider store={store} platform={createFakePlatform()}><Host /><input data-testid="i" /></EditorStoreProvider>);
    store.getState().addNode({ type: "app", label: "a", position: { x: 0, y: 0 } });
    fireEvent.keyDown(container.querySelector("input")!, { key: "z", ctrlKey: true });
    expect(store.getState().document.nodes).toHaveLength(1);
  });
});
