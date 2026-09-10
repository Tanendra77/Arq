import { createIconResolver, mountApp } from "@arq/core";
import "@arq/core/styles.css";
import { parseDocument } from "@arq/schema";
import { renderSvg } from "@arq/render";
import { createWebPlatform } from "./web-platform";

const root = document.getElementById("root");
if (!root) throw new Error("#root missing");
const app = mountApp(root, createWebPlatform());

// Exposed for Playwright and manual debugging only. Not part of the product surface.
(window as unknown as { __arq: unknown }).__arq = {
  ...app,
  renderForParity(json: string): string {
    const r = parseDocument(json);
    if (!r.ok) throw new Error(r.errors.join("\n"));
    return renderSvg(r.document, { resolveIcon: createIconResolver([]), font: "system" });
  },
};
