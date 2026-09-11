import { describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { emptyDocument } from "@arq/schema";
import { Inspector } from "../../src/components/Inspector";
import { EditorStoreProvider } from "../../src/store/context";
import { createEditorStore, type EditorStore, type Selection } from "../../src/store/editor-store";
import { createFakePlatform } from "../platform-fake";

/** Seeds a document with nodes "a" (rect), "b" (rect) and "ellipseNode" (ellipse), plus edge
 *  "e1" from a to b, applies the given selection, and mounts the Inspector against it. */
function renderInspector(
  sel: Selection,
  overrides: { aFill?: string; bFill?: string } = {},
): EditorStore {
  const store = createEditorStore(emptyDocument());
  store.getState().addNode({ id: "a", shape: "rect", label: "A", position: { x: 0, y: 0 } });
  store.getState().addNode({ id: "b", shape: "rect", label: "B", position: { x: 100, y: 0 } });
  store.getState().addNode({ id: "ellipseNode", shape: "ellipse", label: "E", position: { x: 200, y: 0 } });
  store.getState().addEdge({ id: "e1", from: "a", to: "b" });
  if (overrides.aFill !== undefined) store.getState().setStyle(["a"], { fill: overrides.aFill });
  if (overrides.bFill !== undefined) store.getState().setStyle(["b"], { fill: overrides.bFill });
  store.getState().setSelection(sel);
  render(
    <EditorStoreProvider store={store} platform={createFakePlatform()}>
      <Inspector />
    </EditorStoreProvider>,
  );
  return store;
}

describe("Inspector", () => {
  it("shows document properties when nothing is selected", () => {
    renderInspector({ nodes: [], edges: [] });
    expect(screen.getByLabelText("Title")).toBeInTheDocument();
    expect(screen.getByLabelText("Canvas background")).toBeInTheDocument();
  });

  it("shows shape controls for a selected node", () => {
    renderInspector({ nodes: ["a"], edges: [] });
    expect(screen.getByLabelText("Fill")).toBeInTheDocument();
    expect(screen.getByLabelText("Corner radius")).toBeInTheDocument();
    expect(screen.getByLabelText("Label")).toBeInTheDocument();
    expect(screen.getByLabelText("Font size")).toBeInTheDocument();
    expect(screen.getByLabelText("Text alignment")).toBeInTheDocument();
    expect(screen.getByLabelText("Glow")).toBeInTheDocument();
    expect(screen.queryByLabelText("Routing")).toBeNull();
  });

  it("shows line controls for a selected edge", () => {
    renderInspector({ nodes: [], edges: ["e1"] });
    expect(screen.getByLabelText("Routing")).toBeInTheDocument();
    expect(screen.getByLabelText("Start arrow")).toBeInTheDocument();
    expect(screen.getByLabelText("End arrow")).toBeInTheDocument();
    expect(screen.getByLabelText("Stroke")).toBeInTheDocument();
    expect(screen.queryByLabelText("Fill")).toBeNull();
  });

  it("writes an edit through the store", () => {
    const store = renderInspector({ nodes: ["a"], edges: [] });
    fireEvent.change(screen.getByLabelText("Fill"), { target: { value: "#ff0000" } });
    expect(store.getState().document.nodes.find((n) => n.id === "a")?.style?.fill).toBe("#ff0000");
  });

  it("shows an indeterminate fill when a multi-selection disagrees", () => {
    renderInspector({ nodes: ["a", "b"], edges: [] }, { aFill: "#ff0000", bFill: "#00ff00" });
    expect(screen.getByLabelText("Fill")).toHaveAttribute("data-indeterminate", "true");
  });

  it("does not show indeterminate fill when a multi-selection agrees", () => {
    renderInspector({ nodes: ["a", "b"], edges: [] }, { aFill: "#123456", bFill: "#123456" });
    const fill = screen.getByLabelText("Fill") as HTMLInputElement;
    expect(fill).not.toHaveAttribute("data-indeterminate", "true");
    expect(fill.value).toBe("#123456");
  });

  it("applies one edit to the whole selection as a single undo entry", () => {
    const store = renderInspector({ nodes: ["a", "b"], edges: [] });
    const before = store.getState().past.length;
    fireEvent.change(screen.getByLabelText("Fill"), { target: { value: "#0000ff" } });
    expect(store.getState().past.length).toBe(before + 1);
    expect(store.getState().document.nodes.filter((n) => n.id === "a" || n.id === "b").every((n) => n.style?.fill === "#0000ff")).toBe(true);
  });

  it("collapses several drag-like edits on the same field into one undo entry", () => {
    const store = renderInspector({ nodes: ["a"], edges: [] });
    const before = store.getState().past.length;
    const width = screen.getByLabelText("Stroke width");
    fireEvent.change(width, { target: { value: "2" } });
    fireEvent.change(width, { target: { value: "3" } });
    fireEvent.change(width, { target: { value: "4" } });
    expect(store.getState().past.length).toBe(before + 1);
    expect(store.getState().document.nodes.find((n) => n.id === "a")?.style?.strokeWidth).toBe(4);
  });

  it("hides corner radius for a non-rect shape", () => {
    renderInspector({ nodes: ["ellipseNode"], edges: [] });
    expect(screen.queryByLabelText("Corner radius")).toBeNull();
  });

  it("hides corner radius when the selection mixes rect and non-rect shapes", () => {
    renderInspector({ nodes: ["a", "ellipseNode"], edges: [] });
    expect(screen.queryByLabelText("Corner radius")).toBeNull();
  });

  it("shows the label field only for a single selected node, not a multi-selection", () => {
    renderInspector({ nodes: ["a"], edges: [] });
    expect(screen.getByLabelText("Label")).toBeInTheDocument();
  });

  it("hides the label field for a multi-node selection", () => {
    renderInspector({ nodes: ["a", "b"], edges: [] });
    expect(screen.queryByLabelText("Label")).toBeNull();
  });

  it("edits a node's label through setLabel", () => {
    const store = renderInspector({ nodes: ["a"], edges: [] });
    fireEvent.change(screen.getByLabelText("Label"), { target: { value: "Renamed" } });
    expect(store.getState().document.nodes.find((n) => n.id === "a")?.label).toBe("Renamed");
  });

  it("toggling glow on a node writes a glow style with no merge key, and shows a color field once on", () => {
    const store = renderInspector({ nodes: ["a"], edges: [] });
    const before = store.getState().past.length;
    fireEvent.click(screen.getByLabelText("Glow"));
    expect(store.getState().document.nodes.find((n) => n.id === "a")?.style?.glow).toBeDefined();
    expect(store.getState().past.length).toBe(before + 1);
    expect(screen.getByLabelText("Glow color")).toBeInTheDocument();
  });

  it("shows only properties common to nodes and edges for a mixed selection", () => {
    renderInspector({ nodes: ["a"], edges: ["e1"] });
    expect(screen.getByLabelText("Stroke")).toBeInTheDocument();
    expect(screen.getByLabelText("Stroke width")).toBeInTheDocument();
    expect(screen.queryByLabelText("Fill")).toBeNull();
    expect(screen.queryByLabelText("Routing")).toBeNull();
    expect(screen.queryByLabelText("Label")).toBeNull();
  });

  it("applies a mixed-selection edit to both the node and the edge as one undo entry", () => {
    const store = renderInspector({ nodes: ["a"], edges: ["e1"] });
    const before = store.getState().past.length;
    fireEvent.change(screen.getByLabelText("Stroke"), { target: { value: "#abcdef" } });
    expect(store.getState().past.length).toBe(before + 1);
    expect(store.getState().document.nodes.find((n) => n.id === "a")?.style?.stroke).toBe("#abcdef");
    expect(store.getState().document.edges.find((e) => e.id === "e1")?.style?.stroke).toBe("#abcdef");
  });

  it("a discrete edit (select) does not merge with a later discrete edit on the same field", () => {
    const store = renderInspector({ nodes: ["a"], edges: [] });
    const before = store.getState().past.length;
    fireEvent.change(screen.getByLabelText("Dash"), { target: { value: "dashed" } });
    fireEvent.change(screen.getByLabelText("Dash"), { target: { value: "dotted" } });
    expect(store.getState().past.length).toBe(before + 2);
  });

  it("edits the document title through the store", () => {
    const store = renderInspector({ nodes: [], edges: [] });
    fireEvent.change(screen.getByLabelText("Title"), { target: { value: "My Diagram" } });
    expect(store.getState().document.title).toBe("My Diagram");
  });
});
