import { beforeEach, describe, expect, it, vi } from "vitest";

const files = new Map<string, string | Uint8Array>();
const dirs = new Set<string>();

vi.mock("@tauri-apps/api/path", () => ({ appDataDir: async () => "C:/AppData/arq", join: async (...p: string[]) => p.join("/") }));
vi.mock("@tauri-apps/plugin-dialog", () => ({
  open: vi.fn(async () => "C:/docs/flow.arq"),
  save: vi.fn(async () => "C:/docs/out.arq"),
}));
vi.mock("@tauri-apps/plugin-fs", () => ({
  readTextFile: async (p: string) => { const v = files.get(p); if (typeof v !== "string") throw new Error("ENOENT " + p); return v; },
  writeTextFile: async (p: string, t: string) => { files.set(p, t); },
  writeFile: async (p: string, b: Uint8Array) => { files.set(p, b); },
  mkdir: async (p: string) => { dirs.add(p); },
  exists: async (p: string) => files.has(p) || dirs.has(p),
  readDir: async (p: string) => [...dirs].filter((d) => d.startsWith(p + "/") && !d.slice(p.length + 1).includes("/")).map((d) => ({ name: d.slice(p.length + 1), isDirectory: true })),
  remove: async (p: string) => { dirs.delete(p); for (const k of [...files.keys()]) if (k.startsWith(p + "/")) files.delete(k); },
}));

import { createDesktopPlatform } from "../src/desktop-platform";
import type { IconPack } from "@arq/core";

const pack: IconPack = {
  manifest: { version: 1, id: "solace", name: "Solace", count: 1, shapes: [{ id: "cat/x", name: "X", category: "cat", file: "cat/x.svg", w: 72, h: 72, keywords: [] }] },
  svgs: { "cat/x": "<svg/>" },
};

beforeEach(() => { files.clear(); dirs.clear(); });

describe("desktop platform", () => {
  it("opens a document via the dialog and reads it", async () => {
    files.set("C:/docs/flow.arq", '{"version":1}');
    const r = await createDesktopPlatform().openDocument();
    expect(r).toEqual({ path: "C:/docs/flow.arq", text: '{"version":1}' });
  });

  it("saves to the given path without a dialog, and via the dialog when absent", async () => {
    const p = createDesktopPlatform();
    expect(await p.saveDocument("x", "C:/docs/flow.arq")).toBe("C:/docs/flow.arq");
    expect(files.get("C:/docs/flow.arq")).toBe("x");
    expect(await p.saveDocument("y")).toBe("C:/docs/out.arq");
    expect(files.get("C:/docs/out.arq")).toBe("y");
  });

  it("stores icon packs as a manifest plus one svg per shape", async () => {
    const p = createDesktopPlatform();
    await p.iconPacks.put(pack);
    expect(files.get("C:/AppData/arq/iconpacks/solace/manifest.json")).toBe(JSON.stringify(pack.manifest, null, 2));
    expect(files.get("C:/AppData/arq/iconpacks/solace/cat/x.svg")).toBe("<svg/>");
    expect((await p.iconPacks.list()).map((m) => m.id)).toEqual(["solace"]);
    expect(await p.iconPacks.get("solace")).toEqual(pack);
    await p.iconPacks.remove("solace");
    expect(await p.iconPacks.get("solace")).toBeNull();
  });

  // A pack id and a shape file both come from a user-supplied pack file and are joined onto
  // a real path, while the fs capability allows writes at "**". Traversal must be refused.
  it("refuses pack ids that escape the packs directory", async () => {
    const p = createDesktopPlatform();
    for (const id of ["../evil", "..", ".", "a/b", "a\\b", "", "C:/windows"]) {
      await expect(p.iconPacks.put({ ...pack, manifest: { ...pack.manifest, id } })).rejects.toThrow();
      await expect(p.iconPacks.remove(id)).rejects.toThrow();
    }
    expect([...files.keys()].some((k) => !k.startsWith("C:/AppData/arq/iconpacks/"))).toBe(false);
  });

  it("refuses shape files that escape the pack directory", async () => {
    const p = createDesktopPlatform();
    for (const file of ["../../evil.svg", "..\\evil.svg", "a/../../evil.svg", "/etc/passwd", ""]) {
      const bad: IconPack = {
        manifest: { ...pack.manifest, shapes: [{ ...pack.manifest.shapes[0]!, file }] },
        svgs: { "cat/x": "<svg/>" },
      };
      await expect(p.iconPacks.put(bad)).rejects.toThrow();
    }
    expect([...files.keys()].every((k) => k.startsWith("C:/AppData/arq/iconpacks/solace/"))).toBe(true);
  });
});
