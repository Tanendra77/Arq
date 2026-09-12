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

  // Drag one of its ends to a new position — the case that used to bring the editor down.
  const dot = page.locator(".arq-edge-end").first();
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

/**
 * The flow animation shipped twice looking motionless — once because rough.js splits a stroke into
 * dozens of sub-paths and `stroke-dashoffset` restarts at each one, and once because the dash
 * period was a unitless number, which made the keyframe's `calc()` invalid. Both failures left the
 * markup looking perfectly correct, so the only honest check is to watch the offset move.
 */
test("a flowing line's dashes actually travel", async ({ page }) => {
  await page.goto("/");
  const b = (await page.getByTestId("canvas").boundingBox())!;
  await page.getByRole("button", { name: "Arrow" }).click();
  await page.mouse.move(b.x + 150, b.y + 150);
  await page.mouse.down();
  await page.mouse.move(b.x + 500, b.y + 150, { steps: 5 });
  await page.mouse.up();

  await page.locator(".arq-edge-hit").click({ force: true });
  await page.getByRole("tab", { name: "Animation" }).click();
  await page.getByRole("button", { name: "Flowing dashes" }).click();
  // "attached", not "visible": a horizontal line has a zero-height bounding box, which Playwright
  // counts as hidden even though it is painted.
  await page.locator("path.arq-flow").first().waitFor({ state: "attached" });

  const moved = await page.evaluate(async () => {
    const el = document.querySelector("path.arq-flow");
    if (!el) return { reason: "no animated path" };
    const at = () => getComputedStyle(el).strokeDashoffset;
    const first = at();
    await new Promise((r) => setTimeout(r, 250));
    return { first, second: at() };
  });
  expect(moved.reason).toBeUndefined();
  expect(moved.second).not.toBe(moved.first);
  // Non-zero, i.e. the keyframe's value resolved rather than being dropped as invalid.
  expect(moved.second).not.toBe("0px");
});
