import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { emptyDocument } from "@arq/schema";
import { Canvas, mergeMeasured, planDeletion } from "../../src/components/Canvas";
import type { ArqFlowNode } from "../../src/flow/to-flow";
import { EditorStoreProvider } from "../../src/store/context";
import { createEditorStore } from "../../src/store/editor-store";
import { createFakePlatform } from "../platform-fake";

function flowNode(id: string, x: number, label: string, measured?: { width: number; height: number }): ArqFlowNode {
  return {
    id,
    type: "arq",
    position: { x, y: 0 },
    data: { label, nodeType: "app", iconSvg: undefined, iconId: undefined },
    ...(measured !== undefined ? { measured } : {}),
  };
}

describe("Canvas", () => {
  it("renders document nodes with their labels and edges by id", () => {
    const store = createEditorStore(emptyDocument());
    const a = store.getState().addNode({ type: "app", label: "OMS", position: { x: 0, y: 0 } });
    const b = store.getState().addNode({ type: "broker", label: "PR broker", position: { x: 300, y: 0 } });
    store.getState().addEdge({ from: a, to: b, kind: "publish", label: "orders/new" });
    render(
      <EditorStoreProvider store={store} platform={createFakePlatform()}>
        <Canvas />
      </EditorStoreProvider>,
    );
    expect(screen.getByText("OMS")).toBeInTheDocument();
    expect(screen.getByText("PR broker")).toBeInTheDocument();
    expect(screen.getByTestId("edge-label-e-1")).toHaveTextContent("orders/new");
  });

  it("renders the edge kind style and the store's selection", () => {
    const store = createEditorStore(emptyDocument());
    const a = store.getState().addNode({ type: "app", label: "OMS", position: { x: 0, y: 0 } });
    const b = store.getState().addNode({ type: "broker", label: "PR broker", position: { x: 300, y: 0 } });
    const e = store.getState().addEdge({ from: a, to: b, kind: "publish" });
    store.getState().setSelection({ nodes: [a], edges: [e] });
    const { container } = render(
      <EditorStoreProvider store={store} platform={createFakePlatform()}>
        <Canvas />
      </EditorStoreProvider>,
    );
    const path = container.querySelector(`path#${e}`);
    expect(path).toHaveClass("arq-edge", "arq-edge-publish", "selected");
    expect(path).toHaveAttribute("marker-end", "url(#arq-arrow)");
    expect(container.querySelectorAll(".arq-node.selected")).toHaveLength(1);
    // A kind with no label renders no label element.
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
    const a = store.getState().addNode({ type: "app", label: "OMS", position: { x: 0, y: 0 } });
    const b = store.getState().addNode({ type: "broker", label: "PR broker", position: { x: 300, y: 0 } });
    store.getState().addEdge({ from: a, to: b, kind: "publish" });
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
