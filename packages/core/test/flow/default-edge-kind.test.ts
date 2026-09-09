import { describe, expect, it } from "vitest";
import { defaultEdgeKind } from "../../src/flow/default-edge-kind";

describe("defaultEdgeKind", () => {
  it.each([
    ["app", "broker", "publish"],
    ["publisher", "broker", "publish"],
    ["broker", "consumer", "subscribe"],
    ["broker", "app", "subscribe"],
    ["broker", "queue", "bind"],
    ["queue", "consumer", "subscribe"],
    ["broker", "broker", "bridge"],
    ["broker", "mesh", "dmr"],
    ["mesh", "broker", "dmr"],
    ["app", "store", "generic"],
    ["shape", "shape", "generic"],
  ] as const)("%s -> %s is %s", (from, to, kind) => {
    expect(defaultEdgeKind(from, to)).toBe(kind);
  });
});
