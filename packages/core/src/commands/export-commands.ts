import { layoutDocument, renderSvg } from "@arq/render";
import type { Document } from "@arq/schema";
import type { EditorStore, Selection } from "../store/editor-store";
import { buildClip } from "../store/clipboard";
import type { Platform } from "../platform";
import type { IconResolver } from "../flow/to-flow";

export function fileSlug(title: string): string {
  const s = title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return s || "diagram";
}

export interface ExportOptions {
  format: "png" | "svg";
  /** File name without extension; blank falls back to the diagram's title. */
  name: string;
  background: "solid" | "transparent" | "grid";
  grid: { variant: "dots" | "lines" | "cross"; size: number };
  /** The whole diagram, or only what is selected. */
  area: "all" | "selection";
  /** Margin around the content, in document units. */
  padding: number;
  /** PNG pixels per document unit. */
  scale: number;
  /** Colours for unstyled text and an unset canvas: light, or the editor's dark theme. */
  theme: "light" | "dark";
}

export const DEFAULT_EXPORT: Omit<ExportOptions, "name" | "grid"> = {
  format: "png", background: "solid", area: "all", padding: 40, scale: 2, theme: "light",
};

/** The document an export draws: all of it, or just the selection cut out as its own diagram. */
export function exportDocument(doc: Document, selection: Selection, area: ExportOptions["area"]): Document {
  if (area === "all") return doc;
  const clip = buildClip(doc, selection);
  if (!clip) return { ...doc, nodes: [], edges: [], groups: [], layout: { ...doc.layout, pinned: {} } };
  // Groups are not part of a selection; dropping them keeps every node's `group` reference harmless.
  return { ...doc, nodes: clip.nodes, edges: clip.edges, groups: [], layout: { ...doc.layout, pinned: clip.pinned } };
}

/** The SVG an export produces and its size in document units — also what the dialog previews. */
export function renderExport(doc: Document, selection: Selection, o: Omit<ExportOptions, "name" | "format" | "scale">, resolveIcon: IconResolver, font: "embed" | "system" = "embed") {
  const target = exportDocument(doc, selection, o.area);
  const svg = renderSvg(target, { resolveIcon, font, background: o.background, grid: o.grid, padding: o.padding, theme: o.theme });
  const { bounds } = layoutDocument(target, o.padding);
  return { svg, width: bounds.w, height: bounds.h };
}

/** A file name the user typed, made safe to write, with the extension the format needs. */
export function exportFileName(name: string, title: string, format: ExportOptions["format"]): string {
  const base = name.trim().replace(/\.(png|svg)$/i, "").replace(/[\\/:*?"<>|]+/g, "-").trim();
  return `${base || fileSlug(title)}.${format}`;
}

export async function exportDiagram(store: EditorStore, platform: Platform, resolveIcon: IconResolver, o: ExportOptions): Promise<void> {
  const { document, selection } = store.getState();
  const { svg, width, height } = renderExport(document, selection, o, resolveIcon);
  const file = exportFileName(o.name, document.title, o.format);
  if (o.format === "svg") {
    await platform.exportFile(svg, file, "image/svg+xml");
    return;
  }
  await platform.exportFile(await svgToPng(svg, width, height, o.scale), file, "image/png");
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
