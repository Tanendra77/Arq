import { expect, test, type Page } from "@playwright/test";

const editor = (page: Page) => page.getByTestId("json-panel").locator(".cm-content");
const text = (page: Page) => editor(page).evaluate((el) => (el as HTMLElement).innerText);

/** Replace everything in the JSON editor, the way a paste would. */
async function replaceJson(page: Page, json: string) {
  await editor(page).click();
  await page.keyboard.press("Control+a");
  await page.keyboard.insertText(json);
}

// What an AI would write: shapes, lines, styles, animation — and no positions.
const GENERATED = JSON.stringify({
  version: 2,
  title: "Orders",
  layout: { direction: "RIGHT" },
  nodes: [
    { id: "web", shape: "rect", label: "Web" },
    { id: "db", shape: "cylinder", label: "DB" },
    { id: "q", shape: "parallelogram", label: "orders/new" },
    { id: "bill", shape: "rect", label: "Billing", style: { animate: "pulse" } },
  ],
  edges: [
    { id: "e1", from: "web", to: "db", label: "write" },
    { id: "e2", from: "web", to: "q", style: { animate: "packets" } },
    { id: "e3", from: "q", to: "bill", style: { strokeDash: "dashed" } },
  ],
});

test("JSON with no positions becomes a laid-out diagram, live", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Split", exact: true }).click();
  await expect(editor(page)).toBeVisible();
  await expect(page.getByTestId("canvas")).toBeVisible();

  await replaceJson(page, GENERATED);
  await expect(page.locator(".react-flow__node")).toHaveCount(4);
  await expect(page.locator(".react-flow__edge")).toHaveCount(3);
  await expect(page.getByTestId("json-status")).toHaveText(/In sync/);

  // Laid out, not piled up at the origin: every shape has its own spot.
  const pinned = await page.evaluate(() => {
    const s = (window as unknown as { __arq: { store: { getState(): { document: { layout: { pinned: Record<string, { x: number; y: number }> } } } } } }).__arq.store;
    return s.getState().document.layout.pinned;
  });
  expect(new Set(Object.values(pinned).map((p) => `${p.x},${p.y}`)).size).toBe(4);
  await expect(page.locator(".react-flow__node").getByText("Billing")).toBeVisible();
});

test("broken JSON is reported on its line and leaves the diagram alone", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Split", exact: true }).click();
  await replaceJson(page, GENERATED);
  await expect(page.locator(".react-flow__node")).toHaveCount(4);

  // A shape the schema does not know.
  await replaceJson(page, GENERATED.replace('"cylinder"', '"blob"'));
  await expect(page.getByTestId("json-status")).toHaveText(/1 problem/);
  await expect(page.getByTestId("json-problems")).toContainText("nodes");
  await expect(page.locator(".react-flow__node")).toHaveCount(4);
  await expect(page.locator(".cm-lintRange-error")).toHaveCount(1);

  // Not JSON at all.
  await replaceJson(page, GENERATED.slice(0, -5));
  await expect(page.getByTestId("json-status")).toHaveText(/problem/);
  await expect(page.locator(".react-flow__node")).toHaveCount(4);

  await replaceJson(page, GENERATED);
  await expect(page.getByTestId("json-status")).toHaveText(/In sync/);
});

test("canvas edits rewrite the JSON, and a burst of typing is one undo", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Split", exact: true }).click();
  await page.getByRole("button", { name: "Rectangle" }).dblclick();
  await expect.poll(() => text(page)).toContain('"shape": "rect"');

  await replaceJson(page, GENERATED);
  await expect(page.locator(".react-flow__node")).toHaveCount(4);
  await page.getByTestId("palette").click({ position: { x: 5, y: 400 } }); // leave the editor
  await page.keyboard.press("Control+z");
  await expect(page.locator(".react-flow__node")).toHaveCount(1);
  await expect.poll(() => text(page)).not.toContain("Billing");
});

test("the JSON view takes the whole area and is remembered", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "JSON", exact: true }).click();
  await expect(editor(page)).toBeVisible();
  await expect(page.getByTestId("canvas")).toBeHidden();
  await page.reload();
  await expect(editor(page)).toBeVisible();
  await page.getByRole("button", { name: "Canvas", exact: true }).click();
  await expect(page.getByTestId("json-panel")).toHaveCount(0);
  await expect(page.getByTestId("canvas")).toBeVisible();
});

test("tidy lays the diagram out again, and the AI instructions copy to the clipboard", async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.goto("/");
  await page.getByRole("button", { name: "Split", exact: true }).click();
  await replaceJson(page, GENERATED);
  await expect(page.locator(".react-flow__node")).toHaveCount(4);

  // Pile two shapes on one spot, then tidy.
  const withPins = JSON.parse(GENERATED) as { layout: Record<string, unknown> };
  withPins.layout.pinned = { web: { x: 0, y: 0 }, db: { x: 0, y: 0 } };
  await replaceJson(page, JSON.stringify(withPins));
  await expect.poll(() => text(page)).toContain('"pinned"');
  await page.getByRole("button", { name: "Tidy layout" }).click();
  await expect.poll(async () => {
    const pinned = await page.evaluate(() => (window as unknown as { __arq: { store: { getState(): { document: { layout: { pinned: Record<string, { x: number; y: number }> } } } } } }).__arq.store.getState().document.layout.pinned);
    return `${pinned.web?.x},${pinned.web?.y}` === `${pinned.db?.x},${pinned.db?.y}`;
  }).toBe(false);

  await page.getByRole("button", { name: "Copy AI instructions" }).click();
  await expect(page.getByRole("button", { name: "Copied ✓" })).toBeVisible();
  const copied = await page.evaluate(() => navigator.clipboard.readText());
  expect(copied).toContain("You write diagrams for the Arq diagram editor as JSON");
});

test("a diagram written in the JSON-only view is all there, and in view, back on the canvas", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "JSON", exact: true }).click();
  await replaceJson(page, GENERATED);
  await expect(page.getByTestId("json-status")).toHaveText(/In sync/);

  await page.getByRole("button", { name: "Canvas", exact: true }).click();
  await expect(page.locator(".react-flow__node")).toHaveCount(4);
  await expect(page.locator(".react-flow__edge")).toHaveCount(3);
  const canvas = (await page.getByTestId("canvas").boundingBox())!;
  // Fitted once the canvas had a size again: every shape lands inside it.
  await expect.poll(async () => {
    const boxes = await page.locator(".react-flow__node").evaluateAll((els) => els.map((e) => e.getBoundingClientRect().toJSON() as DOMRect));
    return boxes.every((b) => b.x >= canvas.x && b.x + b.width <= canvas.x + canvas.width);
  }).toBe(true);
});
