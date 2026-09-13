import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { parseDocument } from "@arq/schema";
import { renderSvg } from "@arq/render";
// The @arq/core barrel pulls React Flow's stylesheet in, which Node cannot load.
// Reach for the DOM-free module directly instead.
import { createIconResolver } from "@arq/core/src/icons/resolver";

const here = dirname(fileURLToPath(import.meta.url));
const json = readFileSync(join(here, "fixtures", "parity.arq"), "utf8");

test("renderSvg output is byte-identical in Node and in the browser", async ({ page }) => {
  const parsed = parseDocument(json);
  if (!parsed.ok) throw new Error(parsed.errors.join("\n"));
  const fromNode = renderSvg(parsed.document, { resolveIcon: createIconResolver([]), font: "system" });
  await page.goto("/");
  const fromBrowser = await page.evaluate(
    (j) => (window as unknown as { __arq: { renderForParity(j: string): string } }).__arq.renderForParity(j),
    json,
  );
  expect(fromBrowser).toBe(fromNode);
});
