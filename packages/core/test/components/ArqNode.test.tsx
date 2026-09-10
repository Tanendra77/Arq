import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import { ReactFlow, ReactFlowProvider } from "@xyflow/react";
import { DEFAULT_NODE_SIZE } from "@arq/render";
import { ArqNode } from "../../src/components/ArqNode";
import type { ArqFlowNode } from "../../src/flow/to-flow";

const nodeTypes = { arq: ArqNode };

function renderNode(node: ArqFlowNode) {
  return render(
    <ReactFlowProvider>
      <ReactFlow nodes={[node]} edges={[]} nodeTypes={nodeTypes} />
    </ReactFlowProvider>,
  );
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
});
