import { describe, expect, it } from "vitest";
import { parseDocument } from "@arq/schema";
import { aiInstructions } from "../../src/json/ai-instructions";

describe("aiInstructions", () => {
  it("describes the style vocabulary straight from the schema", () => {
    const text = aiInstructions();
    expect(text).toContain(`"animate": "none" | "flow" | "packets" | "pulse"`);
    expect(text).toContain(`"sides": integer 3–24`);
    expect(text).toContain(`"fill": "#rgb or #rrggbb"`);
  });

  it("carries an example that the editor itself accepts", () => {
    const text = aiInstructions();
    const example = text.slice(text.indexOf("EXAMPLE") + "EXAMPLE".length);
    expect(parseDocument(example).ok).toBe(true);
  });
});
