import { describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { emptyDocument, parseDocument, serializeDocument } from "@arq/schema";
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

/** Glow and motion live on the Animation tab; style controls on the other. */
const openAnimationTab = () => fireEvent.click(screen.getByRole("tab", { name: "Animation" }));

describe("Inspector", () => {
  it("keeps the canvas view preferences out of the document and its history", () => {
    const store = renderInspector({ nodes: [], edges: [] });
    const before = { past: store.getState().past.length, dirty: store.getState().dirty };
    fireEvent.click(screen.getByLabelText("Rulers"));
    // A preference, not content: it must not dirty the file or cost an undo.
    expect(store.getState().past.length).toBe(before.past);
    expect(store.getState().dirty).toBe(before.dirty);
    expect(JSON.stringify(store.getState().document)).not.toContain("rulers");
  });

  it("offers the canvas patterns and the ruler toggle beside the document's own properties", () => {
    renderInspector({ nodes: [], edges: [] });
    expect(screen.getByRole("group", { name: "Pattern" })).toBeInTheDocument();
    for (const name of ["Plain", "Dots", "Grid", "Crosses"]) {
      expect(screen.getByRole("button", { name })).toBeInTheDocument();
    }
    expect(screen.getByLabelText("Rulers")).toBeInTheDocument();
    expect(screen.getByLabelText("Snap to grid")).toBeInTheDocument();
    expect(screen.getByLabelText("Grid size")).toBeInTheDocument();
  });

  it("shows document properties when nothing is selected", () => {
    renderInspector({ nodes: [], edges: [] });
    expect(screen.getByLabelText("Title")).toBeInTheDocument();
    expect(screen.getByLabelText("Background colour")).toBeInTheDocument();
  });

  it("writes canvas background into the document, not localStorage", () => {
    const store = renderInspector({ nodes: [], edges: [] });
    fireEvent.change(screen.getByLabelText("Background colour"), { target: { value: "#112233" } });
    expect(store.getState().document.canvasBackground).toBe("#112233");
  });

  it("collapses several canvas-background edits into one undo entry", () => {
    const store = renderInspector({ nodes: [], edges: [] });
    const before = store.getState().past.length;
    const bg = screen.getByLabelText("Background colour");
    fireEvent.change(bg, { target: { value: "#111111" } });
    fireEvent.change(bg, { target: { value: "#222222" } });
    fireEvent.change(bg, { target: { value: "#333333" } });
    expect(store.getState().past.length).toBe(before + 1);
    expect(store.getState().document.canvasBackground).toBe("#333333");
  });

  it("shows shape controls for a selected node", () => {
    renderInspector({ nodes: ["a"], edges: [] });
    expect(screen.getByLabelText("Fill")).toBeInTheDocument();
    expect(screen.getByLabelText("Corner radius")).toBeInTheDocument();
    expect(screen.getByLabelText("Label")).toBeInTheDocument();
    expect(screen.getByLabelText("Text size")).toBeInTheDocument();
    // Enumerated properties are icon rows now: the group is named, each button names its option.
    expect(screen.getByRole("group", { name: "Align" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Centre" })).toBeInTheDocument();
    expect(screen.getByRole("group", { name: "Turn" })).toBeInTheDocument();
    expect(screen.queryByRole("group", { name: "Shape" })).toBeNull();
    // Animation lives on its own tab, so it is not competing for room with the style controls.
    expect(screen.queryByLabelText("Glow")).toBeNull();
    openAnimationTab();
    expect(screen.getByLabelText("Glow")).toBeInTheDocument();
    expect(screen.getByRole("group", { name: "Motion" })).toBeInTheDocument();
  });

  it("rotates a shape from the quarter-turn row and from the degrees field", () => {
    const store = renderInspector({ nodes: ["a"], edges: [] });
    fireEvent.click(screen.getByRole("button", { name: "90°" }));
    expect(store.getState().document.nodes.find((n) => n.id === "a")?.style?.rotate).toBe(90);
    fireEvent.change(screen.getByLabelText("Degrees"), { target: { value: "12" } });
    expect(store.getState().document.nodes.find((n) => n.id === "a")?.style?.rotate).toBe(12);
  });

  it("pulses a shape", () => {
    const store = renderInspector({ nodes: ["a"], edges: [] });
    openAnimationTab();
    fireEvent.click(screen.getByRole("button", { name: "Pulse" }));
    expect(store.getState().document.nodes.find((n) => n.id === "a")?.style?.animate).toBe("pulse");
  });

  it("shows every line control for a selected edge", () => {
    renderInspector({ nodes: [], edges: ["e1"] });
    for (const group of ["Shape", "Ends", "Stroke", "Style", "Label at"]) {
      expect(screen.getByRole("group", { name: group })).toBeInTheDocument();
    }
    // Both ends are offered independently, and the arrowhead kinds are the full set.
    expect(screen.getByRole("button", { name: "Start: Diamond" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "End: Diamond" })).toBeInTheDocument();
    expect(screen.getByLabelText("Colour")).toBeInTheDocument();
    expect(screen.getByLabelText("Width")).toBeInTheDocument();
    expect(screen.queryByLabelText("Fill")).toBeNull();
    openAnimationTab();
    expect(screen.getByLabelText("Glow")).toBeInTheDocument();
  });

  it("marks the active option in an icon row and writes the choice through the store", () => {
    const store = renderInspector({ nodes: [], edges: ["e1"] });
    // The default routing is orthogonal, so that button starts pressed.
    expect(screen.getByRole("button", { name: "Right angles" })).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(screen.getByRole("button", { name: "Curved" }));
    expect(store.getState().document.edges.find((e) => e.id === "e1")?.style?.routing).toBe("curved");
    expect(screen.getByRole("button", { name: "Curved" })).toHaveAttribute("aria-pressed", "true");
  });

  it("offers every line animation, including moving packets", () => {
    const store = renderInspector({ nodes: [], edges: ["e1"] });
    openAnimationTab();
    expect(screen.getByRole("button", { name: "Still" })).toHaveAttribute("aria-pressed", "true");
    for (const name of ["Flowing dashes", "Moving packets", "Pulse"]) {
      expect(screen.getByRole("button", { name })).toBeInTheDocument();
    }
    fireEvent.click(screen.getByRole("button", { name: "Moving packets" }));
    expect(store.getState().document.edges.find((e) => e.id === "e1")?.style?.animate).toBe("packets");
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
    const width = screen.getByLabelText("Width");
    fireEvent.change(width, { target: { value: "2" } });
    fireEvent.change(width, { target: { value: "3" } });
    fireEvent.change(width, { target: { value: "4" } });
    expect(store.getState().past.length).toBe(before + 1);
    expect(store.getState().document.nodes.find((n) => n.id === "a")?.style?.strokeWidth).toBe(4);
  });

  it("rejects a stroke width of 0 so it never reaches the store (min is a validity hint, not a clamp)", () => {
    const store = renderInspector({ nodes: ["a"], edges: [] });
    const width = screen.getByLabelText("Width");
    fireEvent.change(width, { target: { value: "3" } });
    fireEvent.change(width, { target: { value: "0" } });
    expect(store.getState().document.nodes.find((n) => n.id === "a")?.style?.strokeWidth).toBe(3);
  });

  it("a document edited through the inspector, including rejected 0 entries, still round-trips through serializeDocument/parseDocument", () => {
    const store = renderInspector({ nodes: ["a"], edges: [] });
    fireEvent.change(screen.getByLabelText("Width"), { target: { value: "3" } });
    fireEvent.change(screen.getByLabelText("Width"), { target: { value: "0" } });
    fireEvent.change(screen.getByLabelText("Text size"), { target: { value: "0" } });
    const result = parseDocument(serializeDocument(store.getState().document));
    expect(result.ok).toBe(true);
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
    openAnimationTab();
    const before = store.getState().past.length;
    fireEvent.click(screen.getByLabelText("Glow"));
    expect(store.getState().document.nodes.find((n) => n.id === "a")?.style?.glow).toBeDefined();
    expect(store.getState().past.length).toBe(before + 1);
    expect(screen.getByLabelText("Glow color")).toBeInTheDocument();
  });

  it("shows only properties common to nodes and edges for a mixed selection", () => {
    renderInspector({ nodes: ["a"], edges: ["e1"] });
    expect(screen.getByLabelText("Line")).toBeInTheDocument();
    expect(screen.getByLabelText("Width")).toBeInTheDocument();
    expect(screen.queryByLabelText("Fill")).toBeNull();
    expect(screen.queryByRole("group", { name: "Shape" })).toBeNull();
    expect(screen.queryByLabelText("Label")).toBeNull();
  });

  it("applies a mixed-selection edit to both the node and the edge as one undo entry", () => {
    const store = renderInspector({ nodes: ["a"], edges: ["e1"] });
    const before = store.getState().past.length;
    fireEvent.change(screen.getByLabelText("Line"), { target: { value: "#abcdef" } });
    expect(store.getState().past.length).toBe(before + 1);
    expect(store.getState().document.nodes.find((n) => n.id === "a")?.style?.stroke).toBe("#abcdef");
    expect(store.getState().document.edges.find((e) => e.id === "e1")?.style?.stroke).toBe("#abcdef");
  });

  it("a discrete edit (select) does not merge with a later discrete edit on the same field", () => {
    const store = renderInspector({ nodes: ["a"], edges: [] });
    const before = store.getState().past.length;
    fireEvent.click(screen.getByRole("button", { name: "Dashed" }));
    fireEvent.click(screen.getByRole("button", { name: "Dotted" }));
    expect(store.getState().past.length).toBe(before + 2);
  });

  it("edits the document title through the store", () => {
    const store = renderInspector({ nodes: [], edges: [] });
    fireEvent.change(screen.getByLabelText("Title"), { target: { value: "My Diagram" } });
    expect(store.getState().document.title).toBe("My Diagram");
  });
});
