import { layoutDocument, renderSvg } from "@arq/render";
import type { EditorStore } from "../store/editor-store";
import type { Platform } from "../platform";
import type { IconResolver } from "../flow/to-flow";

export function fileSlug(title: string): string {
  const s = title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return s || "diagram";
}

export async function exportSvg(store: EditorStore, platform: Platform, resolveIcon: IconResolver): Promise<void> {
  const doc = store.getState().document;
  const svg = renderSvg(doc, { resolveIcon, font: "embed" });
  await platform.exportFile(svg, `${fileSlug(doc.title)}.svg`, "image/svg+xml");
}

/** Browser only: rasterizes through an <img>, so it is covered by the Playwright suite, not vitest. */
export async function svgToPng(svg: string, width: number, height: number, scale: number): Promise<Uint8Array> {
  const blob = new Blob([svg], { type: "image/svg+xml;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  try {
    const img = new Image();
    img.decoding = "sync";
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error("could not rasterize SVG"));
      img.src = url;
    });
    const w = Math.ceil(width * scale);
    const h = Math.ceil(height * scale);
    if (typeof OffscreenCanvas !== "undefined") {
      const canvas = new OffscreenCanvas(w, h);
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("no 2d context");
      ctx.scale(scale, scale);
      ctx.drawImage(img, 0, 0);
      const out = await canvas.convertToBlob({ type: "image/png" });
      return new Uint8Array(await out.arrayBuffer());
    }
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("no 2d context");
    ctx.scale(scale, scale);
    ctx.drawImage(img, 0, 0);
    const out = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
    if (!out) throw new Error("toBlob failed");
    return new Uint8Array(await out.arrayBuffer());
  } finally {
    URL.revokeObjectURL(url);
  }
}

export async function exportPng(
  store: EditorStore,
  platform: Platform,
  resolveIcon: IconResolver,
  scale: 1 | 2 | 3,
): Promise<void> {
  const doc = store.getState().document;
  const svg = renderSvg(doc, { resolveIcon, font: "embed" });
  const { bounds } = layoutDocument(doc);
  const bytes = await svgToPng(svg, bounds.w, bounds.h, scale);
  await platform.exportFile(bytes, `${fileSlug(doc.title)}@${scale}x.png`, "image/png");
}
