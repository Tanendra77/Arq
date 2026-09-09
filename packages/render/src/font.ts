import { INTER_WOFF2_BASE64 } from "./font.generated";

export const FONT_STACK = "Inter, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif";

export function fontFaceCss(mode: "embed" | "system"): string {
  if (mode === "embed" && INTER_WOFF2_BASE64 !== null) {
    return `@font-face{font-family:Inter;font-style:normal;font-weight:400;src:url(data:font/woff2;base64,${INTER_WOFF2_BASE64}) format('woff2')}`;
  }
  return "";
}
