import { describe, expect, it } from "vitest";
import { emptyDocument } from "@arq/schema";
import { toFlow } from "../../src/flow/to-flow";

const resolve = (id: string | undefined, t: string) => (id ? `<svg id="${id}"/>` : `<svg id="builtin-${t}"/>`);

describe("toFlow", () => {
  it("maps nodes with pinned positions and resolved icons", () => {
    const doc = emptyDocument();
    doc.nodes.push({ id: "a", type: "broker", label: "A", props: {} });
    doc.layout.pinned.a = { x: 5, y: 6 };
    const { nodes } = toFlow(doc, resolve, { nodes: [], edges: [] });
    expect(nodes).toHaveLength(1);
    expect(nodes[0]).toMatchObject({ id: "a", type: "arq", position: { x: 5, y: 6 }, data: { label: "A", nodeType: "broker", iconSvg: '<svg id="builtin-broker"/>' } });
  });

  it("falls back to origin when a node has no pinned entry", () => {
    const doc = emptyDocument();
    doc.nodes.push({ id: "a", type: "app", label: "A", props: {} });
    const { nodes } = toFlow(doc, resolve, { nodes: [], edges: [] });
    expect(nodes[0]?.position).toEqual({ x: 0, y: 0 });
  });

  it("maps edges with source/target and kind data, marking selection", () => {
    const doc = emptyDocument();
    doc.nodes.push({ id: "a", type: "app", label: "A", props: {} }, { id: "b", type: "broker", label: "B", props: {} });
    doc.edges.push({ id: "e", from: "a", to: "b", kind: "publish", label: "t/1", props: {} });
    const { nodes, edges } = toFlow(doc, resolve, { nodes: ["b"], edges: ["e"] });
    expect(edges[0]).toMatchObject({ id: "e", source: "a", target: "b", type: "arq", selected: true, data: { kind: "publish", label: "t/1" } });
    expect(nodes.find((n) => n.id === "b")?.selected).toBe(true);
    expect(nodes.find((n) => n.id === "a")?.selected).toBe(false);
  });
});
