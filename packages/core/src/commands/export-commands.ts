/// <reference path="../gifenc.d.ts" />
import { FLOW_SECONDS, PACKET_SECONDS, layoutDocument, renderSvg } from "@arq/render";
import type { Document } from "@arq/schema";
import type { EditorStore, Selection } from "../store/editor-store";
import { buildClip } from "../store/clipboard";
import type { Platform } from "../platform";
import type { IconResolver } from "../flow/to-flow";

export function fileSlug(title: string): string {
  const s = title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return s || "diagram";
}

/** Still image, still vector, the vector that animates itself, or a recording of the animation. */
export type ExportFormat = "png" | "svg" | "animated-svg" | "gif" | "mp4";

const EXTENSION: Record<ExportFormat, string> = { png: "png", svg: "svg", "animated-svg": "svg", gif: "gif", mp4: "mp4" };
const MIME: Record<ExportFormat, string> = {
  png: "image/png", svg: "image/svg+xml", "animated-svg": "image/svg+xml", gif: "image/gif", mp4: "video/mp4",
};

/** Formats that record the animation frame by frame. */
export const isRecording = (f: ExportFormat): f is "gif" | "mp4" => f === "gif" || f === "mp4";

export interface ExportOptions {
  format: ExportFormat;
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
  /** GIF and MP4: frames per second. */
  fps: number;
  /** GIF and MP4: length in seconds; 0 records exactly one loop of the animation. */
  seconds: number;
}

/** How long a pulse takes to breathe in and out — fixed in `FLOW_CSS`, whatever the speed. */
const PULSE_SECONDS = 1.8;

/**
 * The shortest recording that loops seamlessly: the least common multiple of every animation's
 * period, so each one is back where it started when the file repeats. When that would be very long
 * (periods that share no neat multiple), the longest single period stands in — close enough that
 * the jump is hard to see, and a file that stays a sensible size. 0 when nothing animates.
 */
export function animationLoop(doc: Document): number {
  const periods = new Set<number>();
  for (const n of doc.nodes) {
    const a = n.style?.animate;
    if (a === "flow") periods.add(FLOW_SECONDS[n.style?.animateSpeed ?? "normal"]);
    if (a === "pulse") periods.add(PULSE_SECONDS);
  }
  for (const e of doc.edges) {
    const a = e.style?.animate;
    if (a === "flow") periods.add(FLOW_SECONDS[e.style?.animateSpeed ?? "normal"]);
    if (a === "packets") periods.add(PACKET_SECONDS[e.style?.animateSpeed ?? "normal"]);
    if (a === "pulse") periods.add(PULSE_SECONDS);
  }
  if (periods.size === 0) return 0;
  const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b));
  const hundredths = [...periods].map((p) => Math.round(p * 100));
  const lcm = hundredths.reduce((a, b) => (a * b) / gcd(a, b)) / 100;
  return lcm <= 10 ? lcm : Math.max(...periods);
}

export const DEFAULT_EXPORT: Omit<ExportOptions, "name" | "grid"> = {
  format: "png", background: "solid", area: "all", padding: 40, scale: 2, theme: "light", fps: 20, seconds: 0,
};

/** The document an export draws: all of it, or just the selection cut out as its own diagram. */
export function exportDocument(doc: Document, selection: Selection, area: ExportOptions["area"]): Document {
  if (area === "all") return doc;
  const clip = buildClip(doc, selection);
  if (!clip) return { ...doc, nodes: [], edges: [], groups: [], layout: { ...doc.layout, pinned: {} } };
  // Groups are not part of a selection; dropping them keeps every node's `group` reference harmless.
  return { ...doc, nodes: clip.nodes, edges: clip.edges, groups: [], layout: { ...doc.layout, pinned: clip.pinned } };
}

type RenderSettings = Pick<ExportOptions, "background" | "grid" | "padding" | "theme" | "area"> & { format?: ExportFormat };

/**
 * The SVG an export produces and its size in document units — also what the dialog previews. A still
 * format is frozen at the first moment of every animation; the animated and recorded formats get the
 * SVG that plays (which is what the preview shows for them).
 */
export function renderExport(doc: Document, selection: Selection, o: RenderSettings, resolveIcon: IconResolver, font: "embed" | "system" = "embed", frame?: number) {
  const target = exportDocument(doc, selection, o.area);
  const still = o.format === "png" || o.format === "svg";
  const at = frame ?? (still ? 0 : undefined);
  const svg = renderSvg(target, {
    resolveIcon, font, background: o.background, grid: o.grid, padding: o.padding, theme: o.theme,
    ...(at !== undefined ? { frame: at } : {}),
  });
  const { bounds } = layoutDocument(target, o.padding);
  return { svg, width: bounds.w, height: bounds.h, target };
}

/** A file name the user typed, made safe to write, with the extension the format needs. */
export function exportFileName(name: string, title: string, format: ExportFormat): string {
  const base = name.trim().replace(/\.(png|svg|gif|mp4)$/i, "").replace(/[\\/:*?"<>|]+/g, "-").trim();
  return `${base || fileSlug(title)}.${EXTENSION[format]}`;
}

export async function exportDiagram(
  store: EditorStore,
  platform: Platform,
  resolveIcon: IconResolver,
  o: ExportOptions,
  onProgress?: (done: number, total: number) => void,
): Promise<void> {
  const { document, selection } = store.getState();
  const file = exportFileName(o.name, document.title, o.format);
  if (isRecording(o.format)) {
    const bytes = await recordAnimation(document, selection, o, resolveIcon, onProgress);
    await platform.exportFile(bytes, file, MIME[o.format]);
    return;
  }
  const { svg, width, height } = renderExport(document, selection, o, resolveIcon);
  if (o.format === "png") await platform.exportFile(await svgToPng(svg, width, height, o.scale), file, MIME.png);
  else await platform.exportFile(svg, file, MIME[o.format]);
}

/** How many seconds a recording lasts and how many frames it has. */
export function recordingLength(doc: Document, o: Pick<ExportOptions, "fps" | "seconds">): { seconds: number; frames: number } {
  const seconds = o.seconds > 0 ? o.seconds : animationLoop(doc) || 2;
  return { seconds, frames: Math.max(1, Math.round(seconds * o.fps)) };
}

async function loadSvg(svg: string): Promise<HTMLImageElement> {
  const url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml;charset=utf-8" }));
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    return img;
  } finally {
    URL.revokeObjectURL(url);
  }
}

/**
 * Record the animation as a GIF or an MP4: every frame is the export's own SVG frozen at that moment
 * (`renderSvg`'s `frame`), drawn to a canvas and handed to the encoder. Browser only — it needs a
 * canvas to draw on — so it is covered by the Playwright suite. The encoders load on first use.
 */
async function recordAnimation(
  doc: Document,
  selection: Selection,
  o: ExportOptions,
  resolveIcon: IconResolver,
  onProgress?: (done: number, total: number) => void,
): Promise<Uint8Array> {
  // A video has no transparency: a transparent background records on the canvas colour instead.
  const settings = { ...o, background: o.format === "mp4" && o.background === "transparent" ? "solid" as const : o.background };
  const first = renderExport(doc, selection, settings, resolveIcon, "embed", 0);
  const { seconds, frames } = recordingLength(first.target, o);
  // H.264 wants even dimensions.
  const even = (n: number) => (o.format === "mp4" ? Math.ceil(n / 2) * 2 : n);
  const w = even(Math.ceil(first.width * o.scale));
  const h = even(Math.ceil(first.height * o.scale));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d", { willReadFrequently: o.format === "gif" });
  if (!ctx) throw new Error("no 2d context");

  const draw = async (i: number) => {
    const { svg } = i === 0 ? first : renderExport(doc, selection, settings, resolveIcon, "embed", (i / frames) * seconds);
    const img = await loadSvg(svg);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, w, h);
    ctx.setTransform(o.scale, 0, 0, o.scale, 0, 0);
    ctx.drawImage(img, 0, 0);
    onProgress?.(i + 1, frames);
  };

  if (o.format === "gif") {
    const { GIFEncoder, quantize, applyPalette } = await import("gifenc");
    const gif = GIFEncoder();
    const transparent = o.background === "transparent";
    const format = transparent ? "rgba4444" : "rgb565";
    const delay = Math.round(1000 / o.fps);
    for (let i = 0; i < frames; i += 1) {
      await draw(i);
      const { data } = ctx.getImageData(0, 0, w, h);
      const palette = quantize(data, 256, { format, oneBitAlpha: transparent });
      const index = applyPalette(data, palette, format);
      const clear = transparent ? palette.findIndex((c) => c[3] === 0) : -1;
      gif.writeFrame(index, w, h, { palette, delay, repeat: 0, ...(clear >= 0 ? { transparent: true, transparentIndex: clear } : {}) });
    }
    gif.finish();
    return gif.bytes();
  }

  const { BufferTarget, CanvasSource, Mp4OutputFormat, Output, QUALITY_HIGH, getFirstEncodableVideoCodec } = await import("mediabunny");
  const codec = await getFirstEncodableVideoCodec(["avc", "vp9", "av1"], { width: w, height: h });
  if (!codec) throw new Error("This browser cannot encode video. Try GIF or animated SVG instead.");
  const output = new Output({ format: new Mp4OutputFormat(), target: new BufferTarget() });
  const source = new CanvasSource(canvas, { codec, quality: QUALITY_HIGH });
  output.addVideoTrack(source, { frameRate: o.fps });
  await output.start();
  for (let i = 0; i < frames; i += 1) {
    await draw(i);
    await source.add(i / o.fps, 1 / o.fps);
  }
  source.close();
  await output.finalize();
  const buffer = output.target.buffer;
  if (!buffer) throw new Error("video encoding produced no data");
  return new Uint8Array(buffer);
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
