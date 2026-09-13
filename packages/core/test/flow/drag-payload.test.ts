import { describe, expect, it } from "vitest";
import { decodeDragPayload, encodeDragPayload } from "../../src/flow/drag-payload";

describe("drag payload", () => {
  it("round-trips", () => {
    const p = { item: "ellipse" };
    expect(decodeDragPayload(encodeDragPayload(p))).toEqual(p);
  });
  it("returns null for null, garbage, or a missing/empty item", () => {
    expect(decodeDragPayload(null)).toBeNull();
    expect(decodeDragPayload("{nope")).toBeNull();
    expect(decodeDragPayload(JSON.stringify({}))).toBeNull();
    expect(decodeDragPayload(JSON.stringify({ item: "" }))).toBeNull();
  });
});
