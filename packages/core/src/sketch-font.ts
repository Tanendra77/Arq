import { fontFaceCss } from "@arq/render";

const STYLE_ID = "arq-sketch-font";

/**
 * Load the drawing typeface into the editor from the very same bytes the SVG exporter embeds.
 *
 * Going through `fontFaceCss` rather than a bundler asset import is deliberate: the canvas and the
 * export then cannot drift onto two different faces, which is the whole point of `@arq/render`
 * owning the look. It is a data: URL, so there is no network fetch and no flash of fallback text.
 *
 * Safe to call repeatedly — the second call finds its own <style> already there and returns.
 */
export function installSketchFont(doc: Document = document): void {
  if (doc.getElementById(STYLE_ID)) return;
  const css = fontFaceCss("embed");
  if (css === "") return; // no font was embedded at build time; the CSS fallback stack applies
  const el = doc.createElement("style");
  el.id = STYLE_ID;
  el.textContent = css;
  doc.head.appendChild(el);
}
