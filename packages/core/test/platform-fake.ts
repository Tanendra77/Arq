import type { IconPack, IconPackManifest, Platform } from "../src/platform";

export interface FakePlatform extends Platform {
  saved: { text: string; path?: string }[];
  exported: { name: string; mime: string; data: string | Uint8Array }[];
  nextOpen: { path?: string; text: string } | null;
  nextIconPackFile: { name: string; text: string } | null;
}

export function createFakePlatform(): FakePlatform {
  const packs = new Map<string, IconPack>();
  const fake: FakePlatform = {
    saved: [],
    exported: [],
    nextOpen: null,
    nextIconPackFile: null,
    async openDocument() { return fake.nextOpen; },
    async saveDocument(text, path) {
      const used = path ?? "C:/fake/untitled.arq";
      fake.saved.push(path === undefined ? { text } : { text, path });
      return used;
    },
    async exportFile(data, name, mime) { fake.exported.push({ data, name, mime }); },
    async pickIconPackFile() { return fake.nextIconPackFile; },
    iconPacks: {
      async list(): Promise<IconPackManifest[]> { return [...packs.values()].map((p) => p.manifest); },
      async get(id) { return packs.get(id) ?? null; },
      async put(pack) { packs.set(pack.manifest.id, pack); },
      async remove(id) { packs.delete(id); },
    },
  };
  return fake;
}
