import { expect, test, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";

const nodeOrder = (page: Page) =>
  page.evaluate(() =>
    (window as unknown as { __arq: { store: { getState(): { document: { nodes: { id: string }[] } } } } }).__arq.store
      .getState().document.nodes.map((n) => n.id));

async function exportSvg(page: Page, pick?: (dialog: ReturnType<Page["getByRole"]>) => Promise<void>) {
  await page.getByRole("button", { name: "Export", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Export" });
  await dialog.getByRole("button", { name: "SVG", exact: true }).click();
  await dialog.getByRole("button", { name: "Whole diagram" }).click();
  if (pick) await pick(dialog);
  const [dl] = await Promise.all([page.waitForEvent("download"), dialog.getByRole("button", { name: "Export SVG" }).click()]);
  return readFileSync((await dl.path())!, "utf8");
}

test("a shape can have no border, on the canvas and in the export", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Rectangle" }).dblclick();
  const outlined = /data-shape="rect"[^>]*>(?:(?!<\/g>).)*stroke="#/;
  expect(await exportSvg(page)).toMatch(outlined); // the check does see a border when there is one
  await page.locator(".react-flow__node").first().click();
  await page.getByTestId("inspector").getByRole("button", { name: "No border" }).click();
  // Every painted path of the outline is unstroked now.
  await expect.poll(() =>
    page.locator(".react-flow__node svg path").evaluateAll((ps) => ps.every((p) => p.getAttribute("stroke") === "none")),
  ).toBe(true);
  const svg = await exportSvg(page);
  expect(svg).not.toMatch(outlined);
});

test("overlapping shapes can be brought to the front and sent to the back", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Rectangle" }).dblclick();
  await page.getByRole("button", { name: "Ellipse" }).dblclick();
  expect(await nodeOrder(page)).toEqual(["rect-1", "ellipse-1"]);

  await page.locator(".react-flow__node").first().click({ position: { x: 8, y: 8 } });
  await page.getByTestId("inspector").getByRole("button", { name: /Bring to front/ }).click();
  expect(await nodeOrder(page)).toEqual(["ellipse-1", "rect-1"]);
  // The canvas draws in the same order: the rectangle's element now comes last.
  await expect.poll(() => page.locator(".react-flow__node").evaluateAll((els) => els.map((e) => e.getAttribute("data-id")))).toEqual(["ellipse-1", "rect-1"]);

  await page.keyboard.press("Control+Shift+BracketLeft"); // send to back
  expect(await nodeOrder(page)).toEqual(["rect-1", "ellipse-1"]);
  await page.keyboard.press("Control+z");
  expect(await nodeOrder(page)).toEqual(["ellipse-1", "rect-1"]);
});

test("the export's text follows the theme: light text for a dark export", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Settings" }).click();
  await page.getByLabel("Theme").selectOption("dark");
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Text", exact: true }).dblclick();

  // The dialog starts in the theme on screen.
  const dark = await exportSvg(page, async (dialog) => {
    await expect(dialog.getByRole("button", { name: "Dark", exact: true })).toHaveAttribute("aria-pressed", "true");
  });
  expect(dark).toMatch(/<text[^>]*fill="#ececec"/);
  const light = await exportSvg(page, (dialog) => dialog.getByRole("button", { name: "Light", exact: true }).click());
  expect(light).toMatch(/<text[^>]*fill="#1a1a1a"/);
});

test("the JSON can be copied, downloaded and browsed as a tree, and its errors copied", async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.goto("/");
  await page.getByRole("button", { name: "Split", exact: true }).click();
  await page.getByRole("button", { name: "Rectangle" }).dblclick();
  const panel = page.getByTestId("json-panel");

  await panel.getByRole("button", { name: "Copy JSON" }).click();
  expect(JSON.parse(await page.evaluate(() => navigator.clipboard.readText())).nodes).toHaveLength(1);

  const [dl] = await Promise.all([page.waitForEvent("download"), panel.getByRole("button", { name: "Download JSON" }).click()]);
  expect(dl.suggestedFilename()).toMatch(/\.json$/);
  expect(JSON.parse(readFileSync((await dl.path())!, "utf8")).nodes[0].shape).toBe("rect");

  // The outline: the shape summarised, and clicking it selects it.
  await panel.getByLabel("Tree").check();
  const tree = page.getByTestId("json-tree");
  await expect(tree).toBeVisible();
  await expect(panel.locator(".cm-editor")).toBeHidden();
  await tree.getByText("rect · \"Text\"").click();
  await expect(page.locator(".react-flow__node.selected")).toHaveCount(1);
  await panel.getByLabel("Tree").uncheck();

  // Break it, and copy the problems.
  await panel.locator(".cm-content").click();
  await page.keyboard.press("Control+a");
  await page.keyboard.insertText('{ "version": 2, "nodes": [{ "id": "a", "shape": "blob", "label": "" }] }');
  await expect(page.getByTestId("json-status")).toHaveText(/problem/);
  await panel.getByRole("button", { name: "Copy errors" }).click();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toContain("nodes[0].shape");
});
