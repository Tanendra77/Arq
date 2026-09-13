import { describe, expect, it } from "vitest";
import { SCHEMA_VERSION } from "../src/index";

describe("schema package", () => {
  it("exports the schema version", () => {
    expect(SCHEMA_VERSION).toBe(2);
  });
});
