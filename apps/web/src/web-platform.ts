import type { IconPack, IconPackManifest, Platform } from "@arq/core";
import { openKv, type Kv } from "./idb";

function pickFile(accept: string): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = accept;
    input.onchange = () => resolve(input.files?.[0] ?? null);
    input.oncancel = () => resolve(null);
    input.click();
  });
}

function download(data: string | Uint8Array, name: string, mime: string): void {
  // TS 5.9 types Uint8Array as Uint8Array<ArrayBufferLike>, which is not a BlobPart
  // (its buffer may be a SharedArrayBuffer). Re-wrap into an ArrayBuffer-backed view.
  const part: BlobPart = typeof data === "string" ? data : new Uint8Array(data);
  const blob = new Blob([part], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

export function createWebPlatform(dbName = "arq"): Platform {
  let kv: Promise<Kv> | null = null;
  const db = () => (kv ??= openKv(dbName));
  const key = (id: string) => `pack:${id}`;

  return {
    async openDocument() {
      const f = await pickFile(".arq,application/json");
      return f ? { path: f.name, text: await f.text() } : null;
    },
    async saveDocument(text, path) {
      const name = path ?? "diagram.arq";
      download(text, name, "application/json");
      return name;
    },
    async exportFile(data, name, mime) {
      download(data, name, mime);
    },
    async pickIconPackFile() {
      const f = await pickFile(".xml");
      return f ? { name: f.name, text: await f.text() } : null;
    },
    iconPacks: {
      async list(): Promise<IconPackManifest[]> {
        const d = await db();
        const ks = (await d.keys()).filter((k) => k.startsWith("pack:"));
        const packs = await Promise.all(ks.map((k) => d.get<IconPack>(k)));
        return packs.flatMap((p) => (p ? [p.manifest] : []));
      },
      async get(id) { return (await (await db()).get<IconPack>(key(id))) ?? null; },
      async put(pack) { await (await db()).set(key(pack.manifest.id), pack); },
      async remove(id) { await (await db()).del(key(id)); },
    },
  };
}
