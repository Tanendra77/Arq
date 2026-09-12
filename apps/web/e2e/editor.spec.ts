import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";

test("create, connect, save, reload, open, export", async ({ page }) => {
  await page.goto("/");

  await page.getByRole("button", { name: "Rectangle" }).dblclick();
  await page.getByRole("button", { name: "Ellipse" }).dblclick();
  await expect(page.locator(".react-flow__node")).toHaveCount(2);

  // Spread the nodes apart by dragging the second one to the right: the two palette items land
  // only 40px apart (see Palette's `place()`). The offset scales with the node's own on-screen
  // width so it produces a real gap whatever the current zoom.
  const nodes = page.locator(".react-flow__node");
  const box = await nodes.nth(1).boundingBox();
  if (!box) throw new Error("node not laid out");
  const dragBy = box.width + 50;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + dragBy, box.y + box.height / 2, { steps: 10 });
  await page.mouse.up();

  // Connect rectangle -> ellipse with the arrow tool: arm it, then click each shape. Shapes carry
  // no visible connection points any more, and clicking anywhere on one mounts that end to it.
  await page.getByRole("button", { name: "Arrow" }).click();
  const centreOf = async (i: number) => {
    const r = await nodes.nth(i).boundingBox();
    if (!r) throw new Error(`node ${i} not laid out`);
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  };
  const from = await centreOf(0);
  const to = await centreOf(1);
  await page.mouse.click(from.x, from.y);
  await page.mouse.click(to.x, to.y);
  await expect(page.locator(".react-flow__edge")).toHaveCount(1);
  // Both ends bound to real shapes, so the saved document names them rather than coordinates.
  await expect(page.locator(".react-flow__node")).toHaveCount(2);

  // Save via Ctrl+S produces a download.
  const [download] = await Promise.all([page.waitForEvent("download"), page.keyboard.press("Control+s")]);
  const savedPath = await download.path();
  if (!savedPath) throw new Error("no download path");
  const saved = JSON.parse(readFileSync(savedPath, "utf8")) as {
    nodes: unknown[];
    edges: unknown[];
    layout: { pinned: Record<string, { x: number }> };
  };
  expect(saved.nodes).toHaveLength(2);
  expect(saved.edges).toHaveLength(1);
  expect(Object.values(saved.layout.pinned).some((p) => p.x > 200)).toBe(true);

  // Reload and open the saved file.
  await page.reload();
  await expect(page.locator(".react-flow__node")).toHaveCount(0);
  const [chooser] = await Promise.all([
    page.waitForEvent("filechooser"),
    page.getByRole("button", { name: "Open" }).click(),
  ]);
  await chooser.setFiles(savedPath);
  await expect(page.locator(".react-flow__node")).toHaveCount(2);
  await expect(page.locator(".react-flow__edge")).toHaveCount(1);

  // Export SVG.
  const [svgDl] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "Export SVG" }).click(),
  ]);
  const svgPath = await svgDl.path();
  if (!svgPath) throw new Error("no svg download path");
  const svg = readFileSync(svgPath, "utf8");
  expect(svg.startsWith("<svg")).toBe(true);
  // Both palette items now create the same editable placeholder label (DEFAULT_NODE_LABEL), so the
  // two nodes are told apart by `data-shape` — the outlines are hand-drawn rough.js paths now, not
  // <rect>/<ellipse> primitives.
  expect(svg.match(/>Text</g)).toHaveLength(2);
  expect(svg).toContain('data-shape="rect"');
  expect(svg).toContain('data-shape="ellipse"');
  expect(svg).toContain("@font-face"); // the sketch font travels with the file

  // Export PNG.
  const [pngDl] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "Export PNG" }).click(),
  ]);
  expect(pngDl.suggestedFilename()).toMatch(/\.png$/);
  const pngPath = await pngDl.path();
  if (!pngPath) throw new Error("no png download path");
  const png = readFileSync(pngPath);
  expect(png.length).toBeGreaterThan(1000);
  expect(png.subarray(0, 8)).toEqual(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
});
