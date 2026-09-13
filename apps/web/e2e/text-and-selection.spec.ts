import { expect, test, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";

type Store = { getState(): { selection: { nodes: string[]; edges: string[] }; document: { nodes: { id: string; style?: Record<string, unknown> }[]; edges: { id: string }[] } } };
const state = (page: Page) =>
  page.evaluate(() => {
    const s = (window as unknown as { __arq: { store: Store } }).__arq.store.getState();
    return { selection: s.selection, nodes: s.document.nodes, edges: s.document.edges };
  });

test("selecting on the canvas marks the element's JSON, and the cursor in the JSON selects on the canvas", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Split", exact: true }).click();
  await page.getByRole("button", { name: "Rectangle" }).dblclick();
  await page.getByRole("button", { name: "Ellipse" }).dblclick();
  const nodes = page.locator(".react-flow__node");
  await expect(nodes).toHaveCount(2);

  // Canvas → JSON: the ellipse's object is highlighted.
  const ellipse = (await nodes.nth(1).boundingBox())!;
  await page.mouse.click(ellipse.x + ellipse.width - 8, ellipse.y + ellipse.height / 2);
  const marked = page.locator(".cm-arq-selected");
  await expect(marked.first()).toBeVisible();
  await expect.poll(async () => (await marked.allInnerTexts()).join("\n")).toContain('"ellipse-1"');
  await expect.poll(async () => (await marked.allInnerTexts()).join("\n")).not.toContain('"rect-1"');

  // JSON → canvas: put the cursor inside the rectangle's object.
  await page.locator(".cm-line", { hasText: '"id": "rect-1"' }).click();
  await expect.poll(async () => (await state(page)).selection.nodes).toEqual(["rect-1"]);
  await expect(page.locator(".react-flow__node.selected")).toHaveCount(1);
});

test("editing a label opens the text settings, and bold reaches the export", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Rectangle" }).dblclick();
  await page.locator(".arq-node-label").first().dblclick();
  await expect(page.locator(".arq-node-label-input")).toBeFocused();

  // The inspector is on the shape, on its Text tab, while the text is being typed.
  const inspector = page.getByTestId("inspector");
  await expect(inspector.getByRole("tab", { name: "Text" })).toHaveAttribute("aria-selected", "true");
  await page.keyboard.press("Control+a");
  await page.keyboard.type("Hello");
  await inspector.getByRole("button", { name: "Bold" }).click();
  await inspector.getByRole("button", { name: "Serif", exact: true }).click();
  await expect(page.locator(".arq-node-label").first()).toHaveCSS("font-weight", "700");

  await page.getByRole("button", { name: "Export", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Export" });
  await dialog.getByRole("button", { name: "SVG", exact: true }).click();
  const [dl] = await Promise.all([page.waitForEvent("download"), dialog.getByRole("button", { name: "Export SVG" }).click()]);
  const svg = readFileSync((await dl.path())!, "utf8");
  expect(svg).toContain("font-weight:700");
  expect(svg).toContain("Georgia");
  expect(svg).toContain(">Hello<");
});

test("a line's label has no background unless one is chosen", async ({ page }) => {
  await page.goto("/");
  const b = (await page.getByTestId("canvas").boundingBox())!;
  await page.getByRole("button", { name: "Arrow" }).click();
  await page.mouse.move(b.x + 150, b.y + 200);
  await page.mouse.down();
  await page.mouse.move(b.x + 450, b.y + 200, { steps: 5 });
  await page.mouse.up();
  await page.locator(".arq-edge-hit").click({ force: true });
  const inspector = page.getByTestId("inspector");
  await inspector.getByRole("tab", { name: "Text" }).click();
  await inspector.getByLabel("Label", { exact: true }).fill("orders");

  const label = page.locator(".arq-edge-label");
  await expect(label).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
  await expect(label).toHaveCSS("border-top-width", "0px");

  await inspector.getByLabel("Text background").check();
  await inspector.getByLabel("Background colour").fill("#ff0000");
  await expect(label).toHaveCSS("background-color", "rgb(255, 0, 0)");
});

test("undo and redo are icons, and the export can be previewed full size", async ({ page }) => {
  await page.goto("/");
  for (const name of ["Undo", "Redo"]) {
    const button = page.getByRole("button", { name, exact: true });
    await expect(button.locator("svg")).toHaveCount(1);
    await expect(button).toHaveAttribute("title", new RegExp(name));
  }

  await page.getByRole("button", { name: "Rectangle" }).dblclick();
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(page.locator(".react-flow__node")).toHaveCount(0);
  await page.getByRole("button", { name: "Redo", exact: true }).click();
  await expect(page.locator(".react-flow__node")).toHaveCount(1);

  await page.getByRole("button", { name: "Export", exact: true }).click();
  await page.getByRole("button", { name: "Preview" }).click();
  const full = page.getByRole("dialog", { name: "Export preview, full size" });
  await expect(full.getByRole("img")).toBeVisible();
  await full.getByRole("button", { name: "100%" }).click();
  await expect(full.getByRole("button", { name: "100%" })).toHaveAttribute("aria-pressed", "true");
  await page.keyboard.press("Escape");
  await expect(full).toHaveCount(0);
  await expect(page.getByRole("dialog", { name: "Export" })).toBeVisible(); // only the preview closed
});
