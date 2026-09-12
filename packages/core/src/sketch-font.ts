import { FLOW_CSS, fontFaceCss } from "@arq/render";

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
  // FLOW_CSS comes from the same module the exporter uses, so an animated edge moves at the same
  // rate on the canvas as it does in an exported file.
  const el = doc.createElement("style");
  el.id = STYLE_ID;
  el.textContent = fontFaceCss("embed") + FLOW_CSS;
  doc.head.appendChild(el);
}
