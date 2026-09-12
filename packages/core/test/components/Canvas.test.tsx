import { describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import type { ReactFlowProps } from "@xyflow/react";
import { emptyDocument } from "@arq/schema";
import { markerId, STYLE_DEFAULTS } from "@arq/render";
import { Canvas, mergeMeasured, planDeletion } from "../../src/components/Canvas";
import { DEFAULT_NODE_LABEL, setActiveTool } from "../../src/components/Palette";
import { endpointNodeId, type ArqFlowNode } from "../../src/flow/to-flow";
import { EditorStoreProvider } from "../../src/store/context";
import { createEditorStore } from "../../src/store/editor-store";
import { createFakePlatform } from "../platform-fake";

// Captures the props Canvas hands to <ReactFlow>, so navigation config can be asserted without
// reaching into React Flow's own internals.
let capturedProps: ReactFlowProps | undefined;
vi.mock("@xyflow/react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@xyflow/react")>();
  return {
    ...actual,
    ReactFlow: (props: ReactFlowProps) => {
      capturedProps = props;
      return <actual.ReactFlow {...props} />;
    },
  };
});

function flowNode(id: string, x: number, label: string, measured?: { width: number; height: number }): ArqFlowNode {
  return {
    id,
    type: "arq",
    position: { x, y: 0 },
    data: { label, shape: "rect", style: undefined, iconSvg: undefined, iconId: undefined, pinned: undefined },
    ...(measured !== undefined ? { measured } : {}),
  };
}

function renderCanvasAndReadReactFlowProps(): ReactFlowProps {
  capturedProps = undefined;
  render(
    <EditorStoreProvider store={createEditorStore(emptyDocument())} platform={createFakePlatform()}>
      <Canvas />
    </EditorStoreProvider>,
  );
  if (!capturedProps) throw new Error("ReactFlow was not rendered");
  return capturedProps;
}

describe("Canvas", () => {
  function renderCanvasWithStore() {
    capturedProps = undefined;
    const store = createEditorStore(emptyDocument());
    const r = render(
      <EditorStoreProvider store={store} platform={createFakePlatform()}>
        <Canvas />
      </EditorStoreProvider>,
    );
    return { store, canvas: r.getByTestId("canvas") };
  }

  it("places the armed shape where the canvas is pressed, then disarms it", () => {
    const { store, canvas } = renderCanvasWithStore();
    act(() => setActiveTool("ellipse"));
    // A press and release at the same point is a click, not a drag-to-size gesture.
    fireEvent.mouseDown(canvas, { clientX: 40, clientY: 60, button: 0 });
    fireEvent.mouseUp(canvas, { clientX: 40, clientY: 60 });
    expect(store.getState().document.nodes).toHaveLength(1);
    expect(store.getState().document.nodes[0]?.shape).toBe("ellipse");
    // Every creation path goes through `placeItem`, so a click-placed node carries the same
    // editable placeholder a dropped one does — never the palette item's own name.
    expect(store.getState().document.nodes[0]?.label).toBe(DEFAULT_NODE_LABEL);
    // A click alone leaves the size unset, so `shapeRect`'s per-shape default applies.
    const pinned = store.getState().document.layout.pinned[store.getState().document.nodes[0]!.id];
    expect(pinned?.w).toBeUndefined();

    // Disarmed by the placement: pressing again adds nothing.
    fireEvent.mouseDown(canvas, { clientX: 90, clientY: 90, button: 0 });
    fireEvent.mouseUp(canvas, { clientX: 90, clientY: 90 });
    expect(store.getState().document.nodes).toHaveLength(1);
    setActiveTool(null);
  });

  it("sizes a shape from the drag, taking the top-left corner whichever way it is dragged", () => {
    const { store, canvas } = renderCanvasWithStore();
    act(() => setActiveTool("rect"));
    // Dragged up and to the left: the released corner is the origin, not the pressed one.
    fireEvent.mouseDown(canvas, { clientX: 200, clientY: 150, button: 0 });
    fireEvent.mouseMove(canvas, { clientX: 120, clientY: 90 });
    fireEvent.mouseUp(canvas, { clientX: 120, clientY: 90 });
    const doc = store.getState().document;
    const pinned = doc.layout.pinned[doc.nodes[0]!.id];
    expect(pinned).toMatchObject({ x: 120, y: 90, w: 80, h: 60 });
    setActiveTool(null);
  });

  it("draws an arrow from two clicks, mounting an end on whatever shape is clicked", () => {
    const { store, canvas } = renderCanvasWithStore();
    const a = store.getState().addNode({ shape: "rect", label: "A", position: { x: 0, y: 0 } });

    act(() => setActiveTool("arrow"));
    // First click: a bare point on empty canvas. No edge yet — the tool stays armed.
    act(() => capturedProps?.onPaneClick?.({ clientX: 10, clientY: 10 } as never));
    expect(store.getState().document.edges).toHaveLength(0);

    // Second click lands on a shape, so that end mounts to the node rather than to a coordinate.
    act(() => capturedProps?.onNodeClick?.({ clientX: 80, clientY: 40, stopPropagation() {} } as never, { id: a } as never));
    const e = store.getState().document.edges[0]!;
    // The pane end stayed a bare coordinate (fitView has already panned the viewport, so the exact
    // numbers are the viewport's business — what matters is that it is a point, not a node ref).
    expect(typeof e.from).toBe("object");
    expect(e.to).toBe(a);
    expect(e.label).toBeUndefined(); // an arrow gets no text until the user double-clicks it

    // Disarmed by the completed placement.
    act(() => capturedProps?.onPaneClick?.({ clientX: 200, clientY: 200 } as never));
    expect(store.getState().document.edges).toHaveLength(1);
    setActiveTool(null);
  });

  it("moves a loose edge end rather than filing a layout rect under its reserved id", () => {
    const { store } = renderCanvasWithStore();
    const id = store.getState().addEdge({ from: { x: 0, y: 0 }, to: { x: 100, y: 0 } });
    act(() =>
      capturedProps?.onNodeDragStop?.({} as never, {} as never, [
        { id: endpointNodeId(id, "to"), position: { x: 40, y: 70 } } as never,
      ]),
    );
    expect(store.getState().document.edges[0]?.to).toEqual({ x: 40, y: 70 });
    expect(store.getState().document.layout.pinned[endpointNodeId(id, "to")]).toBeUndefined();
  });

  it("configures the canvas to pan on scroll and zoom on pinch", () => {
    const props = renderCanvasAndReadReactFlowProps();
    expect(props.panOnScroll).toBe(true);
    expect(props.zoomOnScroll).toBe(false);
    expect(props.zoomOnPinch).toBe(true);
  });

  it("renders document nodes with their labels and edges by id", () => {
    const store = createEditorStore(emptyDocument());
    const a = store.getState().addNode({ shape: "rect", label: "OMS", position: { x: 0, y: 0 } });
    const b = store.getState().addNode({ shape: "rect", label: "PR broker", position: { x: 300, y: 0 } });
    store.getState().addEdge({ from: a, to: b, label: "orders/new" });
    render(
      <EditorStoreProvider store={store} platform={createFakePlatform()}>
        <Canvas />
      </EditorStoreProvider>,
    );
    expect(screen.getByText("OMS")).toBeInTheDocument();
    expect(screen.getByText("PR broker")).toBeInTheDocument();
    expect(screen.getByTestId("edge-label-e-1")).toHaveTextContent("orders/new");
  });

  it("renders the resolved edge style and marker, and the store's selection", () => {
    const store = createEditorStore(emptyDocument());
    const a = store.getState().addNode({ shape: "rect", label: "OMS", position: { x: 0, y: 0 } });
    const b = store.getState().addNode({ shape: "rect", label: "PR broker", position: { x: 300, y: 0 } });
    const e = store.getState().addEdge({ from: a, to: b });
    store.getState().setSelection({ nodes: [a], edges: [e] });
    const { container } = render(
      <EditorStoreProvider store={store} platform={createFakePlatform()}>
        <Canvas />
      </EditorStoreProvider>,
    );
    // A hand-drawn edge is a group of rough.js paths, not one <path>; the arrowhead marker goes on
    // exactly one of them, or it would be printed twice over rough's two stroke passes.
    const group = container.querySelector("g.arq-edge");
    expect(group).toHaveClass("arq-edge", "selected");
    const marked = group!.querySelectorAll("path[marker-end]");
    expect(marked).toHaveLength(1);
    expect(marked[0]).toHaveAttribute(
      "marker-end",
      `url(#${markerId(STYLE_DEFAULTS.edge.endArrow, STYLE_DEFAULTS.edge.stroke)})`,
    );
    expect(container.querySelectorAll(".arq-node.selected")).toHaveLength(1);
    // No label was set on the edge, so no label element renders.
    expect(screen.queryByTestId(`edge-label-${e}`)).toBeNull();
  });

  it("draws nodes hand-drawn by default, and the exact primitive at roughness 0", () => {
    const store = createEditorStore(emptyDocument());
    store.getState().addNode({ shape: "ellipse", label: "A", position: { x: 0, y: 0 } });
    const sketchy = render(
      <EditorStoreProvider store={store} platform={createFakePlatform()}>
        <Canvas />
      </EditorStoreProvider>,
    );
    expect(sketchy.container.querySelector(".arq-node-shape ellipse")).toBeNull();
    expect(sketchy.container.querySelectorAll(".arq-node-shape path").length).toBeGreaterThan(0);

    const crisp = createEditorStore(emptyDocument());
    crisp.getState().addNode({ shape: "ellipse", label: "A", position: { x: 0, y: 0 }, style: { roughness: 0 } });
    const exact = render(
      <EditorStoreProvider store={crisp} platform={createFakePlatform()}>
        <Canvas />
      </EditorStoreProvider>,
    );
    expect(exact.container.querySelector(".arq-node-shape ellipse")).not.toBeNull();
  });
});

describe("planDeletion", () => {
  it("drops edges attached to a deleted node so the node removal alone covers them", () => {
    const plan = planDeletion(["app-1"], [{ id: "e-1", source: "app-1", target: "broker-1" }]);
    expect(plan).toEqual({ nodeIds: ["app-1"], edgeIds: [] });
  });

  it("keeps a lone edge deletion as an edge removal", () => {
    const plan = planDeletion([], [{ id: "e-1", source: "app-1", target: "broker-1" }]);
    expect(plan).toEqual({ nodeIds: [], edgeIds: ["e-1"] });
  });

  it("keeps edges whose endpoints both survive alongside an unrelated node deletion", () => {
    const plan = planDeletion(
      ["app-9"],
      [
        { id: "e-1", source: "app-1", target: "broker-1" },
        { id: "e-2", source: "app-9", target: "broker-1" },
      ],
    );
    expect(plan).toEqual({ nodeIds: ["app-9"], edgeIds: ["e-1"] });
  });
});

describe("removeNodes cascade", () => {
  it("removes a node and its attached edges in exactly one history entry", () => {
    const store = createEditorStore(emptyDocument());
    const a = store.getState().addNode({ shape: "rect", label: "OMS", position: { x: 0, y: 0 } });
    const b = store.getState().addNode({ shape: "rect", label: "PR broker", position: { x: 300, y: 0 } });
    store.getState().addEdge({ from: a, to: b });
    const before = store.getState().past.length;

    store.getState().removeNodes([a]);

    expect(store.getState().past.length).toBe(before + 1);
    expect(store.getState().document.edges).toHaveLength(0);
    expect(store.getState().document.nodes.map((n) => n.id)).toEqual([b]);
  });
});

describe("mergeMeasured", () => {
  it("carries a previous node's measurements onto the freshly derived node", () => {
    const prev = [flowNode("app-1", 0, "OMS", { width: 120, height: 96 })];
    const next = [flowNode("app-1", 40, "OMS renamed")];

    const merged = mergeMeasured(prev, next);

    expect(merged[0]?.measured).toEqual({ width: 120, height: 96 });
    // Everything else comes from `next`, not `prev`.
    expect(merged[0]?.position).toEqual({ x: 40, y: 0 });
    expect(merged[0]?.data.label).toBe("OMS renamed");
  });

  it("leaves a node that has no previous counterpart unmeasured", () => {
    const merged = mergeMeasured([flowNode("app-1", 0, "OMS", { width: 120, height: 96 })], [flowNode("app-2", 0, "New")]);
    expect(merged).toHaveLength(1);
    expect(merged[0]?.id).toBe("app-2");
    expect(merged[0]).not.toHaveProperty("measured");
  });

  it("leaves the node alone when the previous state had no measurements either", () => {
    const merged = mergeMeasured([flowNode("app-1", 0, "OMS")], [flowNode("app-1", 0, "OMS")]);
    expect(merged[0]).not.toHaveProperty("measured");
  });
});
