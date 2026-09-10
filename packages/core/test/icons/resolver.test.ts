import { describe, expect, it } from "vitest";
import { createIconResolver } from "../../src/icons/resolver";
import type { IconPack } from "../../src/platform";

const pack: IconPack = {
  manifest: { version: 1, id: "p", name: "P", count: 1, shapes: [{ id: "cat/x", name: "X", category: "cat", file: "cat/x.svg", w: 72, h: 72, keywords: [] }] },
  svgs: { "cat/x": "<svg>x</svg>" },
};

describe("createIconResolver", () => {
  it("returns undefined when no icon id is given: a node with no icon has no icon", () => {
    expect(createIconResolver([])(undefined)).toBeUndefined();
  });
  it("finds icons in installed packs and in the builtin pack", () => {
    const r = createIconResolver([pack]);
    expect(r("cat/x")).toBe("<svg>x</svg>");
    expect(r("builtin/cloud")).toContain("<svg");
  });
  it("returns undefined for an icon id that is not installed", () => {
    expect(createIconResolver([pack])("cat/missing")).toBeUndefined();
  });
});
