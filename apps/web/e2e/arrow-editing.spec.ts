import { expect, test } from "@playwright/test";

/**
 * Regression guard for the editor unmounting itself.
 *
 * Selecting or dragging a loose arrow end used to loop: React Flow reported the selection, the
 * store pruned the synthetic endpoint id as "not a document node", the derived nodes came back
 * unselected, React Flow re-asserted it. React eventually threw "Maximum update depth exceeded"
 * and tore down the tree, which on screen looked like the whole canvas going black.
 */
test("selecting and dragging an arrow keeps the editor alive", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });

  await page.goto("/");
  const canvas = page.getByTestId("canvas");
  const b = (await canvas.boundingBox())!;

  // Draw a free-floating arrow: press, drag, release.
  await page.getByRole("button", { name: "Arrow" }).click();
  await page.mouse.move(b.x + 200, b.y + 200);
  await page.mouse.down();
  await page.mouse.move(b.x + 450, b.y + 350, { steps: 10 });
  await page.mouse.up();
  await expect(page.locator(".react-flow__edge")).toHaveCount(1);

  // Select it.
  await page.locator(".arq-edge-hit").click({ force: true });
  await expect(page.locator(".react-flow__edge.selected")).toHaveCount(1);

  // Drag one of its loose ends to a new position — the case that used to bring the editor down.
  const dot = page.locator(".arq-endpoint").first();
  const d = (await dot.boundingBox())!;
  await page.mouse.move(d.x + d.width / 2, d.y + d.height / 2);
  await page.mouse.down();
  await page.mouse.move(d.x + 120, d.y + 80, { steps: 10 });
  await page.mouse.up();

  // Still mounted, still one arrow, and nothing threw.
  await expect(page.getByTestId("inspector")).toBeVisible();
  await expect(page.locator(".react-flow__edge")).toHaveCount(1);
  expect(errors).toEqual([]);
});
