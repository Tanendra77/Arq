import { expect, test } from "@playwright/test";

const viewport = (page: import("@playwright/test").Page) =>
  page.locator(".react-flow__viewport").evaluate((el) => getComputedStyle(el).transform);

test("the diagram survives a reload", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Rectangle" }).dblclick();
  await page.getByRole("button", { name: "Ellipse" }).dblclick();
  await expect(page.locator(".react-flow__node")).toHaveCount(2);

  await page.reload();
  await expect(page.locator(".react-flow__node")).toHaveCount(2);
  // Restored, but not saved to a file: still marked as unsaved.
  await expect(page.getByTestId("title")).toContainText("*");
});

test("copy, paste and duplicate the selection", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Rectangle" }).dblclick();
  await page.locator(".react-flow__node").first().click();

  await page.keyboard.press("Control+c");
  await page.keyboard.press("Control+v");
  await expect(page.locator(".react-flow__node")).toHaveCount(2);

  await page.keyboard.press("Control+d");
  await expect(page.locator(".react-flow__node")).toHaveCount(3);

  // The duplicate is selected, so the arrow keys move it — and only it.
  const box = async () => (await page.locator(".react-flow__node.selected").boundingBox())!;
  const before = await box();
  await page.keyboard.press("Shift+ArrowRight");
  await expect.poll(async () => (await box()).x).toBeGreaterThan(before.x + 5);

  await page.keyboard.press("Control+x");
  await expect(page.locator(".react-flow__node")).toHaveCount(2);
});

test("space-drag and the hand tool pan the view without moving shapes", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Rectangle" }).dblclick();
  const node = page.locator(".react-flow__node").first();
  const b = (await page.getByTestId("canvas").boundingBox())!;

  const start = await viewport(page);
  await page.mouse.move(b.x + 400, b.y + 300);
  await page.keyboard.down("Space");
  await page.mouse.down();
  await page.mouse.move(b.x + 480, b.y + 360, { steps: 6 });
  await page.mouse.up();
  await page.keyboard.up("Space");
  const afterSpace = await viewport(page);
  expect(afterSpace).not.toBe(start);

  // H picks up the hand; dragging straight across the shape pans rather than moving it.
  await page.keyboard.press("h");
  await expect(page.getByRole("button", { name: "Hand (H)" })).toHaveAttribute("aria-pressed", "true");
  const nb = (await node.boundingBox())!;
  await page.mouse.move(nb.x + nb.width / 2, nb.y + nb.height / 2);
  await page.mouse.down();
  await page.mouse.move(nb.x + nb.width / 2 - 100, nb.y + nb.height / 2, { steps: 6 });
  await page.mouse.up();
  expect(await viewport(page)).not.toBe(afterSpace);
  const pinned = await page.evaluate(() => {
    const doc = (window as unknown as { __arq: { store: { getState(): { document: { layout: { pinned: Record<string, unknown> } } } } } }).__arq.store.getState().document;
    return Object.values(doc.layout.pinned)[0];
  });
  expect(pinned).toEqual({ x: 80, y: 80 });
});

test("side panels resize by dragging their edge, and keep the width", async ({ page }) => {
  await page.goto("/");
  const palette = page.getByTestId("palette");
  const handle = page.getByRole("separator", { name: "Resize shapes panel" });
  const w0 = (await palette.boundingBox())!.width;
  const h = (await handle.boundingBox())!;
  await page.mouse.move(h.x + h.width / 2, h.y + 200);
  await page.mouse.down();
  await page.mouse.move(h.x + h.width / 2 + 80, h.y + 200, { steps: 5 });
  await page.mouse.up();
  await expect.poll(async () => (await palette.boundingBox())!.width).toBeGreaterThan(w0 + 60);

  const inspector = page.getByTestId("inspector");
  const i0 = (await inspector.boundingBox())!.width;
  const r = (await page.getByRole("separator", { name: "Resize inspector" }).boundingBox())!;
  await page.mouse.move(r.x + r.width / 2, r.y + 200);
  await page.mouse.down();
  await page.mouse.move(r.x + r.width / 2 - 80, r.y + 200, { steps: 5 });
  await page.mouse.up();
  await expect.poll(async () => (await inspector.boundingBox())!.width).toBeGreaterThan(i0 + 60);

  const grown = (await palette.boundingBox())!.width;
  await page.reload();
  await expect.poll(async () => (await palette.boundingBox())!.width).toBe(grown);
});

test("zoom buttons and the minimap follow the dark theme", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Settings" }).click();
  await page.getByLabel("Theme").selectOption("dark");
  await page.keyboard.press("Escape");

  await expect(page.getByTestId("rf__minimap")).toBeVisible();
  const bg = await page.locator(".react-flow__controls-button").first().evaluate((el) => getComputedStyle(el).backgroundColor);
  expect(bg).toBe("rgb(22, 22, 22)");

  await page.getByTestId("inspector").getByLabel("Minimap").uncheck();
  await expect(page.getByTestId("rf__minimap")).toHaveCount(0);
});
