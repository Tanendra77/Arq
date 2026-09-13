import "fake-indexeddb/auto";
import { describe, expect, it } from "vitest";
import type { IconPack } from "@arq/core";
import { openKv } from "../src/idb";
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

describe("kv writes", () => {
  it("resolves set only once the transaction has committed", async () => {
    const name = "arq-test-commit-" + Math.random();
    const kv = await openKv(name);
    await kv.set("k", 1);
    // A separate connection can only see the value after the write transaction committed.
    const other = await openKv(name);
    expect(await other.get<number>("k")).toBe(1);
  });
});

describe("web platform export", () => {
  it("creates and clicks a download anchor", async () => {
    const clicks: string[] = [];
    const revokes: string[] = [];
    const orig = HTMLAnchorElement.prototype.click;
    // jsdom does not implement the object-URL API, so these may be `undefined` here;
    // whatever was there is put back in `finally`.
    const urls = globalThis.URL as unknown as { createObjectURL?: unknown; revokeObjectURL?: unknown };
    const origCreate = urls.createObjectURL;
    const origRevoke = urls.revokeObjectURL;
    HTMLAnchorElement.prototype.click = function () { clicks.push(this.download); };
    urls.createObjectURL = () => "blob:x";
    urls.revokeObjectURL = (u: string) => { revokes.push(u); };
    try {
      await createWebPlatform("arq-test-x").exportFile("<svg/>", "d.svg", "image/svg+xml");
      expect(clicks).toEqual(["d.svg"]);
      expect(revokes).toEqual(["blob:x"]);
    } finally {
      HTMLAnchorElement.prototype.click = orig;
      urls.createObjectURL = origCreate;
      urls.revokeObjectURL = origRevoke;
    }
  });
});
