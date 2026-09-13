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

type Doc = { edges: { id: string; from: unknown; to: unknown; legs?: number[]; via?: { x: number; y: number }[]; style?: { routing?: string } }[] };
const doc = (page: import("@playwright/test").Page) =>
  page.evaluate(() => (window as unknown as { __arq: { store: { getState(): { document: Doc } } } }).__arq.store.getState().document);

/** Two shapes, apart on both axes, joined by an arrow drawn from one to the other; returns the arrow selected. */
async function connectedPair(page: import("@playwright/test").Page) {
  await page.goto("/");
  await page.getByRole("button", { name: "Rectangle" }).dblclick();
  await page.getByRole("button", { name: "Ellipse" }).dblclick();
  const nodes = page.locator(".react-flow__node");
  const second = (await nodes.nth(1).boundingBox())!;
  await page.mouse.move(second.x + second.width / 2, second.y + second.height / 2);
  await page.mouse.down();
  await page.mouse.move(second.x + 520, second.y + 260, { steps: 8 });
  await page.mouse.up();
  const centre = async (i: number) => { const r = (await nodes.nth(i).boundingBox())!; return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; };
  const a = await centre(0);
  const z = await centre(1);
  await page.getByRole("button", { name: "Arrow" }).click();
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move(z.x, z.y, { steps: 8 });
  await page.mouse.up();
  await expect(page.locator(".react-flow__edge")).toHaveCount(1);
  await page.locator(".arq-edge-hit").click({ force: true });
  await expect(page.locator(".react-flow__edge.selected")).toHaveCount(1);
}

const centreOf = async (loc: import("@playwright/test").Locator) => {
  const r = (await loc.locator(".arq-grip-dot").boundingBox())!;
  return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
};

test("an arrow's end sitting on a shape can be grabbed and pulled off it", async ({ page }) => {
  await connectedPair(page);
  const end = page.locator(".arq-edge-end").last();
  const at = await centreOf(end);
  // The dot itself is what is under the pointer — not the shape, not the line's hit area.
  const top = await page.evaluate(({ x, y }) => document.elementFromPoint(x, y)?.getAttribute("class"), at);
  expect(top).toBe("arq-grip-dot");

  await page.mouse.move(at.x, at.y);
  await page.mouse.down();
  await page.mouse.move(at.x + 150, at.y + 120, { steps: 8 });
  await page.mouse.up();
  expect(typeof (await doc(page)).edges[0]!.to).toBe("object"); // a loose point now
});

test("a right-angled arrow's legs can be dragged, and its end legs gain a turn", async ({ page }) => {
  await connectedPair(page);
  const legs = page.locator(".arq-bend-handle");
  await expect(legs).toHaveCount(3);

  // The middle (vertical) leg slides sideways.
  const middle = await centreOf(legs.nth(1));
  await page.mouse.move(middle.x, middle.y);
  await page.mouse.down();
  await page.mouse.move(middle.x - 60, middle.y, { steps: 6 });
  await page.mouse.up();
  const afterMiddle = (await doc(page)).edges[0]!.legs!;
  expect(afterMiddle).toHaveLength(1);

  // Pulling the first leg down adds a turn exactly there.
  const first = await centreOf(page.locator(".arq-bend-handle").first());
  await page.mouse.move(first.x, first.y);
  await page.mouse.down();
  await page.mouse.move(first.x, first.y + 40, { steps: 6 });
  await page.mouse.up();
  expect((await doc(page)).edges[0]!.legs!).toHaveLength(3);
  await expect(page.locator(".arq-bend-handle")).toHaveCount(5);

  // One undo per drag.
  await page.keyboard.press("Control+z");
  expect((await doc(page)).edges[0]!.legs).toEqual(afterMiddle);

  await page.getByTestId("inspector").getByRole("button", { name: "Reset route" }).click();
  expect((await doc(page)).edges[0]!.legs).toBeUndefined();
});

test("a straight line bends where a midpoint is dragged, and the bend goes on double-click", async ({ page }) => {
  await page.goto("/");
  const b = (await page.getByTestId("canvas").boundingBox())!;
  await page.getByRole("button", { name: "Arrow" }).click();
  await page.mouse.move(b.x + 150, b.y + 200);
  await page.mouse.down();
  await page.mouse.move(b.x + 450, b.y + 200, { steps: 5 });
  await page.mouse.up();
  await page.locator(".arq-edge-hit").click({ force: true });
  await page.getByTestId("inspector").getByRole("button", { name: "Direct" }).click();
  await expect(page.locator(".arq-via-add")).toHaveCount(1);

  const add = await centreOf(page.locator(".arq-via-add"));
  await page.mouse.move(add.x, add.y);
  await page.mouse.down();
  await page.mouse.move(add.x, add.y - 80, { steps: 6 });
  await page.mouse.up();
  const via = (await doc(page)).edges[0]!.via!;
  expect(via).toHaveLength(1);
  await expect(page.locator(".arq-via-point")).toHaveCount(1);
  await expect(page.locator(".arq-via-add")).toHaveCount(2);

  await page.locator(".arq-via-point").dblclick();
  expect((await doc(page)).edges[0]!.via).toBeUndefined();
});
