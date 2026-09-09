import "fake-indexeddb/auto";
import { describe, expect, it } from "vitest";
import type { IconPack } from "@arq/core";
import { createWebPlatform } from "../src/web-platform";

const pack: IconPack = {
  manifest: { version: 1, id: "p1", name: "P1", count: 1, shapes: [{ id: "c/a", name: "A", category: "c", file: "c/a.svg", w: 72, h: 72, keywords: [] }] },
  svgs: { "c/a": "<svg/>" },
};

describe("web platform icon packs", () => {
  it("puts, lists, gets and removes packs through IndexedDB", async () => {
    const p = createWebPlatform("arq-test-" + Math.random());
    expect(await p.iconPacks.list()).toEqual([]);
    await p.iconPacks.put(pack);
    expect((await p.iconPacks.list()).map((m) => m.id)).toEqual(["p1"]);
    expect(await p.iconPacks.get("p1")).toEqual(pack);
    await p.iconPacks.remove("p1");
    expect(await p.iconPacks.get("p1")).toBeNull();
  });
});

describe("web platform export", () => {
  it("creates and clicks a download anchor", async () => {
    const clicks: string[] = [];
    const orig = HTMLAnchorElement.prototype.click;
    HTMLAnchorElement.prototype.click = function () { clicks.push(this.download); };
    (globalThis.URL as unknown as { createObjectURL: () => string }).createObjectURL = () => "blob:x";
    (globalThis.URL as unknown as { revokeObjectURL: () => void }).revokeObjectURL = () => {};
    try {
      await createWebPlatform("arq-test-x").exportFile("<svg/>", "d.svg", "image/svg+xml");
      expect(clicks).toEqual(["d.svg"]);
    } finally {
      HTMLAnchorElement.prototype.click = orig;
    }
  });
});
