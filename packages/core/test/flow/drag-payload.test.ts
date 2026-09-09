import { describe, expect, it } from "vitest";
import { decodeDragPayload, encodeDragPayload } from "../../src/flow/drag-payload";

describe("drag payload", () => {
  it("round-trips", () => {
    const p = { nodeType: "queue" as const, label: "Queue", icon: "builtin/queue" };
    expect(decodeDragPayload(encodeDragPayload(p))).toEqual(p);
  });
  it("returns null for null or garbage", () => {
    expect(decodeDragPayload(null)).toBeNull();
    expect(decodeDragPayload("{nope")).toBeNull();
    expect(decodeDragPayload(JSON.stringify({ nodeType: "not-a-type", label: "x" }))).toBeNull();
  });
});
