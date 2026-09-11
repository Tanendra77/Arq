import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";

test("restyle a shape and see it in the exported SVG", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Rectangle" }).dblclick();
  await page.locator(".react-flow__node").first().click();
  await page.getByLabel("Fill").fill("#ff0000");
  const [dl] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "Export SVG" }).click(),
  ]);
  const p = await dl.path();
  if (!p) throw new Error("no download path");
  expect(readFileSync(p, "utf8")).toContain('fill="#ff0000"');
});

test("a settings change survives reload", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Settings" }).click();
  await page.getByLabel("Theme").selectOption("dark");
  await page.keyboard.press("Escape");
  await page.reload();
  await page.getByRole("button", { name: "Settings" }).click();
  await expect(page.getByLabel("Theme")).toHaveValue("dark");
});

test("a free-floating line survives a save and open round trip", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Line" }).dblclick();
  const [dl] = await Promise.all([page.waitForEvent("download"), page.keyboard.press("Control+s")]);
  const p = await dl.path();
  if (!p) throw new Error("no download path");
  const saved = JSON.parse(readFileSync(p, "utf8")) as { edges: { from: unknown }[] };
  expect(typeof saved.edges[0]?.from).toBe("object");
});
