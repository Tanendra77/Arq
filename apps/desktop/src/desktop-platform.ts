import type { IconPack, IconPackManifest, Platform } from "@arq/core";
import { appDataDir, join } from "@tauri-apps/api/path";
import { open, save } from "@tauri-apps/plugin-dialog";
import { exists, mkdir, readDir, readTextFile, remove, writeFile, writeTextFile } from "@tauri-apps/plugin-fs";

const ARQ_FILTER = [{ name: "Arq diagram", extensions: ["arq"] }];

// Pack ids and shape file paths come from a parsed icon-pack file, which is user-supplied
// content, and both are joined onto a real filesystem path below. Without these guards a
// crafted manifest could walk out of the pack directory and write or delete anywhere the
// fs capability reaches, which is "**" for writes. Every path segment is validated instead
// of trusting the manifest.
const SAFE_SEGMENT = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

function safeSegment(segment: string): string {
  if (!SAFE_SEGMENT.test(segment) || segment === "." || segment === "..") {
    throw new Error(`unsafe icon pack path segment: ${JSON.stringify(segment)}`);
  }
  return segment;
}

/** A pack id is one directory name; it may never contain a separator. */
function safePackId(id: string): string {
  return safeSegment(id);
}

/** A shape file is a relative "category/name.svg"; every segment is checked. */
function safeRelativeFile(file: string): string[] {
  // Backslashes and a leading slash are refused outright rather than normalised away: an
  // absolute path in a manifest is malformed, and silently reinterpreting it as relative
  // would hide the fact that the pack asked for something it is not allowed to have.
  if (file.includes("\\") || file.startsWith("/")) {
    throw new Error(`unsafe icon pack file: ${JSON.stringify(file)}`);
  }
  const parts = file.split("/").filter((p) => p.length > 0);
  if (parts.length === 0) throw new Error(`empty icon pack file path`);
  return parts.map(safeSegment);
}

async function packsDir(): Promise<string> {
  const dir = await join(await appDataDir(), "iconpacks");
  if (!(await exists(dir))) await mkdir(dir, { recursive: true });
  return dir;
}

/** The only way to build a path inside a pack. Validates before it joins. */
async function packDir(id: string): Promise<string> {
  return join(await packsDir(), safePackId(id));
}

export function createDesktopPlatform(): Platform {
  return {
    async openDocument() {
      const path = await open({ multiple: false, directory: false, filters: ARQ_FILTER });
      if (typeof path !== "string") return null;
      return { path, text: await readTextFile(path) };
    },
    async saveDocument(text, path) {
      const target = path ?? (await save({ filters: ARQ_FILTER, defaultPath: "diagram.arq" }));
      if (!target) return null;
      await writeTextFile(target, text);
      return target;
    },
    async exportFile(data, name, _mime) {
      const ext = name.split(".").pop() ?? "";
      const target = await save({ defaultPath: name, filters: [{ name: ext.toUpperCase(), extensions: [ext] }] });
      if (!target) return;
      if (typeof data === "string") await writeTextFile(target, data);
      else await writeFile(target, data);
    },
    async pickIconPackFile() {
      const path = await open({ multiple: false, directory: false, filters: [{ name: "draw.io library", extensions: ["xml"] }] });
      if (typeof path !== "string") return null;
      const name = path.split(/[\/]/).pop() ?? path;
      return { name, text: await readTextFile(path) };
    },
    iconPacks: {
      async list(): Promise<IconPackManifest[]> {
        const dir = await packsDir();
        const entries = await readDir(dir);
        const out: IconPackManifest[] = [];
        for (const e of entries) {
          if (!e.isDirectory || !e.name) continue;
          try {
            out.push(JSON.parse(await readTextFile(await join(dir, e.name, "manifest.json"))) as IconPackManifest);
          } catch {
            // A directory without a readable manifest is not a pack; skip it.
          }
        }
        return out;
      },
      async get(id) {
        const dir = await packDir(id);
        let manifest: IconPackManifest;
        try {
          manifest = JSON.parse(await readTextFile(await join(dir, "manifest.json"))) as IconPackManifest;
        } catch {
          return null;
        }
        const svgs: Record<string, string> = {};
        for (const s of manifest.shapes) svgs[s.id] = await readTextFile(await join(dir, ...safeRelativeFile(s.file)));
        return { manifest, svgs };
      },
      async put(pack) {
        const dir = await packDir(pack.manifest.id);
        await mkdir(dir, { recursive: true });
        await writeTextFile(await join(dir, "manifest.json"), JSON.stringify(pack.manifest, null, 2));
        for (const s of pack.manifest.shapes) {
          const file = await join(dir, ...safeRelativeFile(s.file));
          const parent = file.slice(0, Math.max(file.lastIndexOf("/"), file.lastIndexOf("\\")));
          if (!(await exists(parent))) await mkdir(parent, { recursive: true });
          await writeTextFile(file, pack.svgs[s.id] ?? "");
        }
      },
      async remove(id) {
        const dir = await packDir(id);
        if (await exists(dir)) await remove(dir, { recursive: true });
      },
    },
  };
}
