import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { emptyDocument } from "@arq/schema";
import { Canvas } from "../../src/components/Canvas";
import { EditorStoreProvider } from "../../src/store/context";
import { createEditorStore } from "../../src/store/editor-store";
import { createFakePlatform } from "../platform-fake";

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
