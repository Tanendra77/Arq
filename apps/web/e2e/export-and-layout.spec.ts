import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";

test("export asks for a name, a background, an area and a size, and writes exactly that", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Rectangle" }).dblclick();
  await page.getByRole("button", { name: "Ellipse" }).dblclick();
  await page.locator(".react-flow__node").first().click({ position: { x: 8, y: 8 } }); // select one of the two (they overlap)

  await page.getByRole("button", { name: "Export", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("img", { name: "Export preview" })).toBeVisible();
  // Something is selected, so the export starts from the selection.
  await expect(dialog.getByRole("button", { name: "Selection" })).toHaveAttribute("aria-pressed", "true");

  await dialog.getByLabel("File name").fill("my deck");
  await dialog.getByRole("button", { name: "SVG", exact: true }).click();
  await dialog.getByRole("button", { name: "Transparent" }).click();
  await dialog.getByLabel("Padding").fill("0");
  await expect(dialog.getByTestId("export-size")).toContainText("my deck.svg · 120 × 80 units");

  const [dl] = await Promise.all([page.waitForEvent("download"), dialog.getByRole("button", { name: "Export SVG" }).click()]);
  expect(dl.suggestedFilename()).toBe("my deck.svg");
  const svg = readFileSync((await dl.path())!, "utf8");
  expect(svg.match(/data-shape=/g)).toHaveLength(1); // only the selected shape
  expect(svg).toContain("</title><g"); // no background
  await expect(dialog).toHaveCount(0);

  // A grid PNG at 3x.
  await page.getByRole("button", { name: "Export", exact: true }).click();
  await dialog.getByRole("button", { name: "Whole diagram" }).click();
  await dialog.getByRole("button", { name: "Grid" }).click();
  await dialog.getByRole("button", { name: "3x" }).click();
  await expect(dialog.getByTestId("export-size")).toContainText("px");
  const [png] = await Promise.all([page.waitForEvent("download"), dialog.getByRole("button", { name: "Export PNG" }).click()]);
  expect(png.suggestedFilename()).toMatch(/\.png$/);
  expect(readFileSync((await png.path())!).subarray(1, 4).toString()).toBe("PNG");
});

test("the toolbar shows icons, with their names on hover", async ({ page }) => {
  await page.goto("/");
  for (const [name, hint] of [["Settings", "Settings"], ["Canvas", "draw"], ["Split", "side by side"], ["JSON", "text"]] as const) {
    const button = page.getByRole("button", { name, exact: true });
    await expect(button).toHaveAttribute("title", new RegExp(hint));
    await expect(button).not.toHaveText(name); // an icon, not the word
  }
});

test("the split between canvas and JSON can be dragged, and is remembered", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Split", exact: true }).click();
  const canvas = page.getByTestId("canvas");
  const w0 = (await canvas.boundingBox())!.width;
  const bar = (await page.getByRole("separator", { name: "Resize canvas and JSON" }).boundingBox())!;
  await page.mouse.move(bar.x + bar.width / 2, bar.y + 200);
  await page.mouse.down();
  await page.mouse.move(bar.x + bar.width / 2 - 150, bar.y + 200, { steps: 6 });
  await page.mouse.up();
  await expect.poll(async () => (await canvas.boundingBox())!.width).toBeLessThan(w0 - 100);
  const narrowed = (await canvas.boundingBox())!.width;
  await page.reload();
  await expect.poll(async () => Math.round((await canvas.boundingBox())!.width)).toBe(Math.round(narrowed));
});
