import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import type { ReactFlowProps } from "@xyflow/react";
import { emptyDocument } from "@arq/schema";
import { markerId, STYLE_DEFAULTS } from "@arq/render";
import { Canvas, mergeMeasured, planDeletion } from "../../src/components/Canvas";
import type { ArqFlowNode } from "../../src/flow/to-flow";
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
    const path = container.querySelector(`path#${e}`);
    expect(path).toHaveClass("arq-edge", "selected");
    expect(path).toHaveAttribute("marker-end", `url(#${markerId(STYLE_DEFAULTS.edge.endArrow, STYLE_DEFAULTS.edge.stroke)})`);
    expect(container.querySelectorAll(".arq-node.selected")).toHaveLength(1);
    // No label was set on the edge, so no label element renders.
    expect(screen.queryByTestId(`edge-label-${e}`)).toBeNull();
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
