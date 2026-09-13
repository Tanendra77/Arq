import { expect, test } from "@playwright/test";

test("the pen draws strokes and stays armed between them", async ({ page }) => {
  await page.goto("/");
  const b = (await page.getByTestId("canvas").boundingBox())!;
  await page.getByRole("button", { name: "Pen", exact: true }).click();

  for (const y of [150, 260]) {
    await page.mouse.move(b.x + 150, b.y + y);
    await page.mouse.down();
    await page.mouse.move(b.x + 260, b.y + y + 40, { steps: 8 });
    await page.mouse.move(b.x + 380, b.y + y - 10, { steps: 8 });
    await page.mouse.up();
  }

  // Two separate strokes without re-arming: the pen stays on, as a pen should.
  await expect(page.locator('.react-flow__node [data-shape="freehand"]')).toHaveCount(2);
  await expect(page.getByRole("button", { name: "Pen", exact: true })).toHaveAttribute("aria-pressed", "true");
});

test("the eraser removes what it wipes across, and one undo brings it all back", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Rectangle" }).dblclick();
  await page.getByRole("button", { name: "Ellipse" }).dblclick();
  await expect(page.locator(".react-flow__node")).toHaveCount(2);

  const nodes = page.locator(".react-flow__node");
  const first = (await nodes.nth(0).boundingBox())!;
  const second = (await nodes.nth(1).boundingBox())!;

  await page.getByRole("button", { name: "Eraser" }).click();
  await page.mouse.move(first.x + first.width / 2, first.y + first.height / 2);
  await page.mouse.down();
  await page.mouse.move(second.x + second.width / 2, second.y + second.height / 2, { steps: 12 });
  await page.mouse.up();
  await expect(page.locator(".react-flow__node")).toHaveCount(0);

  await page.keyboard.press("Escape"); // put the eraser down before using a shortcut
  await page.keyboard.press("Control+z");
  await expect(page.locator(".react-flow__node")).toHaveCount(2);
});

test("a polygon takes the number of sides picked before placing it", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Polygon" }).click();
  const sides = page.getByLabel("Sides");
  await expect(sides).toBeVisible();
  await sides.fill("7");

  const b = (await page.getByTestId("canvas").boundingBox())!;
  await page.mouse.move(b.x + 200, b.y + 200);
  await page.mouse.down();
  await page.mouse.move(b.x + 320, b.y + 320, { steps: 6 });
  await page.mouse.up();

  // Select it, then read the count straight back out of the inspector.
  await page.locator(".react-flow__node").first().click();
  await expect(page.getByTestId("inspector").getByLabel("Sides")).toHaveValue("7");
});
