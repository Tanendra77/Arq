import { expect, test, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";

/** Each frame's compressed image data, walked straight out of the GIF's block structure. */
function gifFrames(b: Buffer): string[] {
  const out: string[] = [];
  let i = 13 + (b[10]! & 0x80 ? 3 * 2 ** ((b[10]! & 7) + 1) : 0); // header, screen descriptor, global table
  const skipBlocks = () => { while (b[i] !== 0) i += b[i]! + 1; i += 1; };
  while (i < b.length && b[i] !== 0x3b) {
    if (b[i] === 0x21) { i += 2; skipBlocks(); continue; } // an extension
    const packed = b[i + 9]!;
    i += 10 + (packed & 0x80 ? 3 * 2 ** ((packed & 7) + 1) : 0) + 1; // descriptor, local table, LZW size
    const start = i;
    skipBlocks();
    out.push(b.subarray(start, i).toString("base64"));
  }
  return out;
}

type Api = { store: { getState(): { addEdge(e: unknown): string; addNode(n: unknown): string } } };

/** A line with travelling packets and a pulsing shape: 2.4s and 1.8s, so one loop is 7.2s. */
async function animatedDiagram(page: Page) {
  await page.goto("/");
  await page.evaluate(() => {
    const s = (window as unknown as { __arq: Api }).__arq.store.getState();
    s.addNode({ shape: "rect", label: "A", position: { x: 0, y: 0 }, style: { animate: "pulse" } });
    s.addEdge({ from: { x: 0, y: 120 }, to: { x: 240, y: 120 }, style: { animate: "packets", routing: "straight" } });
  });
}

async function exportAs(page: Page, format: string, tweak?: (d: ReturnType<Page["getByRole"]>) => Promise<void>) {
  await page.getByRole("button", { name: "Export", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Export" });
  await dialog.getByRole("button", { name: format, exact: true }).click();
  if (tweak) await tweak(dialog);
  const [dl] = await Promise.all([
    page.waitForEvent("download", { timeout: 60_000 }),
    dialog.getByRole("button", { name: /^Export (PNG|SVG|animated SVG|GIF|MP4)$/ }).click(),
  ]);
  return { name: dl.suggestedFilename(), bytes: readFileSync((await dl.path())!) };
}

test("SVG is a still frame, Animated SVG plays by itself", async ({ page }) => {
  await animatedDiagram(page);
  const still = await exportAs(page, "SVG");
  expect(still.bytes.toString()).toContain("animation-play-state:paused");
  const live = await exportAs(page, "Animated SVG");
  expect(live.name).toMatch(/\.svg$/);
  expect(live.bytes.toString()).not.toContain("animation-play-state");
  expect(live.bytes.toString()).toContain("@keyframes arq-packet");
});

test("a GIF records one seamless loop of the animation", async ({ page }) => {
  test.setTimeout(90_000);
  await animatedDiagram(page);
  const gif = await exportAs(page, "GIF", async (dialog) => {
    await dialog.getByRole("button", { name: "1x" }).click();
    await dialog.getByRole("button", { name: "12", exact: true }).click();
    await expect(dialog.getByTestId("export-size")).toContainText("7.2s, 86 frames");
  });
  expect(gif.name).toMatch(/\.gif$/);
  expect(gif.bytes.subarray(0, 6).toString()).toBe("GIF89a");
  const frames = gifFrames(gif.bytes);
  expect(frames).toHaveLength(86);
  // The frames really differ — the packets move and the shape breathes — rather than 86 copies of one.
  expect(new Set(frames).size).toBeGreaterThan(40);
});

test("an MP4 records the animation as video", async ({ page }) => {
  test.setTimeout(90_000);
  await animatedDiagram(page);
  const mp4 = await exportAs(page, "MP4", async (dialog) => {
    await dialog.getByRole("button", { name: "1x" }).click();
    await dialog.getByLabel("Length (s, 0 = one loop)").fill("1");
  });
  expect(mp4.name).toMatch(/\.mp4$/);
  expect(mp4.bytes.subarray(4, 8).toString()).toBe("ftyp");
  expect(mp4.bytes.length).toBeGreaterThan(2000);
});

test("the lines grid is graph paper: thin, medium every fifth, heavy every tenth", async ({ page }) => {
  await page.goto("/");
  await page.getByTestId("inspector").getByRole("button", { name: "Grid", exact: true }).click();
  const layers = page.locator(".react-flow__background.arq-graph-paper");
  await expect(layers).toHaveCount(3);
  const widths = await layers.evaluateAll((els) => els.map((e) => [
    Number(e.querySelector("pattern")!.getAttribute("width")),
    Number(getComputedStyle(e.querySelector("path")!).strokeWidth.replace("px", "")),
  ]));
  const [thin, medium, heavy] = widths;
  expect(medium![0]!).toBeCloseTo(thin![0]! * 5);
  expect(heavy![0]!).toBeCloseTo(thin![0]! * 10);
  expect(thin![1]!).toBeLessThan(medium![1]!);
  expect(medium![1]!).toBeLessThan(heavy![1]!);

  // Zoomed well out, the thin lines would pack into a grey wash, so they fade away; the heavy ones stay.
  await page.getByTestId("canvas").click({ position: { x: 400, y: 300 } });
  for (let i = 0; i < 6; i += 1) await page.keyboard.press("Control+-");
  await expect.poll(() => layers.count()).toBeLessThan(3);
  await expect(page.locator('.react-flow__background.arq-graph-paper pattern[id$="graph-10"]')).toHaveCount(1);
});

test("the app wears its logo: tab icon, install manifest and toolbar", async ({ page, request }) => {
  await page.goto("/");
  const icon = await page.locator('link[rel="icon"]').getAttribute("href");
  expect(icon).toBe("/favicon.png");
  const png = await request.get(icon!);
  expect(png.ok()).toBe(true);
  expect(png.headers()["content-type"]).toContain("image/png");
  const manifest = await (await request.get("/manifest.webmanifest")).json() as { name: string; icons: { src: string }[] };
  expect(manifest.name).toBe("Arq");
  for (const i of manifest.icons) expect((await request.get(i.src)).ok()).toBe(true);

  const logo = page.getByRole("img", { name: "Arq" });
  await expect(logo).toBeVisible();
  expect(await logo.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBeGreaterThan(0);
});
