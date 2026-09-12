import { describe, expect, it } from "vitest";
import { fireEvent, render } from "@testing-library/react";
import { ReactFlow, ReactFlowProvider } from "@xyflow/react";
import { DEFAULT_NODE_SIZE } from "@arq/render";
import { emptyDocument } from "@arq/schema";
import { ArqNode } from "../../src/components/ArqNode";
import type { ArqFlowNode } from "../../src/flow/to-flow";
import { EditorStoreProvider } from "../../src/store/context";
import { createEditorStore, type EditorStore } from "../../src/store/editor-store";
import { createFakePlatform } from "../platform-fake";

const nodeTypes = { arq: ArqNode };

/** The node reaches the store to commit an inline label edit and a resize, so it needs a real
 *  provider even in the tests that only look at its geometry. */
function renderNode(node: ArqFlowNode, store: EditorStore = createEditorStore(emptyDocument())) {
  const r = render(
    <EditorStoreProvider store={store} platform={createFakePlatform()}>
      <ReactFlowProvider>
        <ReactFlow nodes={[node]} edges={[]} nodeTypes={nodeTypes} />
      </ReactFlowProvider>
    </EditorStoreProvider>,
  );
  return { ...r, store };
}

describe("ArqNode", () => {
  it("renders at its pinned width/height, not the default size", () => {
    const node: ArqFlowNode = {
      id: "a",
      type: "arq",
      position: { x: 0, y: 0 },
      data: {
        label: "A",
        shape: "rect",
        style: undefined,
        iconSvg: undefined,
        iconId: undefined,
        pinned: { x: 10, y: 20, w: 300, h: 150 },
      },
    };
    const { container } = renderNode(node);
    const svg = container.querySelector(".arq-node-shape");
    expect(svg).toHaveAttribute("width", "300");
    expect(svg).toHaveAttribute("height", "150");
    expect(svg?.getAttribute("width")).not.toBe(String(DEFAULT_NODE_SIZE.w));
    expect(svg?.getAttribute("height")).not.toBe(String(DEFAULT_NODE_SIZE.h));
  });

  it("falls back to the default size with no pinned rect", () => {
    const node: ArqFlowNode = {
      id: "a",
      type: "arq",
      position: { x: 0, y: 0 },
      data: {
        label: "A",
        shape: "rect",
        style: undefined,
        iconSvg: undefined,
        iconId: undefined,
        pinned: undefined,
      },
    };
    const { container } = renderNode(node);
    const svg = container.querySelector(".arq-node-shape");
    expect(svg).toHaveAttribute("width", String(DEFAULT_NODE_SIZE.w));
    expect(svg).toHaveAttribute("height", String(DEFAULT_NODE_SIZE.h));
  });

  it("references its glow filter by id instead of defining one itself", () => {
    const node: ArqFlowNode = {
      id: "a",
      type: "arq",
      position: { x: 0, y: 0 },
      data: {
        label: "A",
        shape: "rect",
        style: { glow: { color: "#ff0000" } },
        iconSvg: undefined,
        iconId: undefined,
        pinned: undefined,
      },
    };
    const { container } = renderNode(node);
    const svg = container.querySelector(".arq-node-shape");
    // EdgeDefs (mounted once per document via collectDefs) owns the <filter> element; a glowing
    // node must only reference it, never redefine it, or the id ends up duplicated in the DOM.
    expect(svg?.getAttribute("style")).toContain("url(#arq-glow-ff0000)");
    expect(container.querySelector("filter")).toBeNull();
  });

  it("edits the label in place: Enter commits to the document, Escape discards the draft", () => {
    const store = createEditorStore(emptyDocument());
    const id = store.getState().addNode({ shape: "rect", label: "Text", position: { x: 0, y: 0 } });
    const node: ArqFlowNode = {
      id,
      type: "arq",
      position: { x: 0, y: 0 },
      data: { label: "Text", shape: "rect", style: undefined, iconSvg: undefined, iconId: undefined, pinned: undefined },
    };
    const { container } = renderNode(node, store);

    // fireEvent, not userEvent: a real pointer sequence also lands a mousedown on React Flow's
    // d3-drag handler, which reads `event.view.document` — null on a jsdom-synthesized event.
    // Only the dblclick is under test here.
    const edit = (): HTMLInputElement => {
      fireEvent.doubleClick(container.querySelector(".arq-node-label")!);
      const input = container.querySelector("input.arq-node-label-input");
      expect(input).not.toBeNull();
      return input as HTMLInputElement;
    };

    const input = edit();
    fireEvent.change(input, { target: { value: "Payments" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(store.getState().document.nodes[0]?.label).toBe("Payments");
    expect(container.querySelector("input.arq-node-label-input")).toBeNull();

    // The node prop is a fixture, so the visible label still reads "Text"; what matters is that
    // Escape leaves the document exactly as the committed edit left it.
    const second = edit();
    fireEvent.change(second, { target: { value: "discard me" } });
    fireEvent.keyDown(second, { key: "Escape" });
    expect(store.getState().document.nodes[0]?.label).toBe("Payments");
  });
});
