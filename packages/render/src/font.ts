import type { FontFamily } from "@arq/schema";
import { SKETCH_WOFF2_BASE64 } from "./font.generated";

/**
 * The drawing typeface: Excalifont, the hand-drawn face Excalidraw uses, so labels read as part of
 * the sketch rather than as typeset captions dropped on top of one. The fallbacks are the common
 * system "handwriting-ish" faces, then any sans — a viewer without the embedded font still gets
 * something, and `font=system` exports rely on them entirely.
 */
export const FONT_STACK = "Excalifont, 'Segoe Print', 'Bradley Hand', Chilanka, system-ui, sans-serif";

/** The font stack for each typeface a label can choose. Only the sketch face is embedded in exports;
 *  the others are the common faces every system already has. */
export const FONT_STACKS: Record<FontFamily, string> = {
  sketch: FONT_STACK,
  sans: "Inter, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
  serif: "Georgia, 'Times New Roman', Times, serif",
  mono: "'Cascadia Code', Consolas, 'Courier New', monospace",
};

export function fontFaceCss(mode: "embed" | "system"): string {
  if (mode === "embed" && SKETCH_WOFF2_BASE64 !== null) {
    return `@font-face{font-family:Excalifont;font-style:normal;font-weight:400;src:url(data:font/woff2;base64,${SKETCH_WOFF2_BASE64}) format('woff2')}`;
  }
  return "";
}
