import { describe, expect, it } from "vitest";
import { angleFromPointer, resizeRotated } from "../../src/flow/node-handles";

const box = { x: 100, y: 100, w: 200, h: 100 };

describe("resizeRotated", () => {
  it("resizes an unrotated box by its corner, pinning the opposite one", () => {
    // Drag the south-east corner out to (400, 260): the north-west corner must not move.
    expect(resizeRotated(box, "se", { x: 400, y: 260 }, 0, 20)).toEqual({ x: 100, y: 100, w: 300, h: 160 });
    // Drag the north-west corner in: the south-east corner (300, 200) must not move.
    expect(resizeRotated(box, "nw", { x: 150, y: 150 }, 0, 20)).toEqual({ x: 150, y: 150, w: 150, h: 50 });
  });

  it("measures along the shape's own axes once it is turned", () => {
    // The same downward drag means different things at different angles: upright it makes the box
    // taller, and at 90° — where the box's local x runs down the screen — it makes it wider. React
    // Flow's own resizer reads both as "taller", which is the reason these handles exist.
    const downward = { x: 250, y: 400 };
    const upright = resizeRotated(box, "se", downward, 0, 20);
    const turned = resizeRotated(box, "se", downward, 90, 20);
    expect(upright.h).toBeGreaterThan(upright.w);
    expect(turned.w).toBeGreaterThan(turned.h);
  });

  it("keeps the rotated corner that is not being dragged exactly where it was", () => {
    const deg = 37;
    const rad = (deg * Math.PI) / 180;
    const corner = (b: typeof box) => {
      // The north-west corner in document space, for a box rotated about its own centre.
      const cx = b.x + b.w / 2;
      const cy = b.y + b.h / 2;
      const lx = -b.w / 2;
      const ly = -b.h / 2;
      return { x: cx + lx * Math.cos(rad) - ly * Math.sin(rad), y: cy + lx * Math.sin(rad) + ly * Math.cos(rad) };
    };
    const before = corner(box);
    const after = corner(resizeRotated(box, "se", { x: 420, y: 330 }, deg, 20));
    expect(after.x).toBeCloseTo(before.x, 0);
    expect(after.y).toBeCloseTo(before.y, 0);
  });

  it("never shrinks past the minimum, whatever the drag", () => {
    const tiny = resizeRotated(box, "se", { x: 100, y: 100 }, 0, 20);
    expect(tiny.w).toBe(20);
    expect(tiny.h).toBe(20);
  });
});

describe("angleFromPointer", () => {
  it("reads straight up as upright, and a quarter turn as 90", () => {
    const cx = box.x + box.w / 2;
    const cy = box.y + box.h / 2;
    expect(angleFromPointer(box, { x: cx, y: cy - 100 }, false)).toBe(0);
    expect(angleFromPointer(box, { x: cx + 100, y: cy }, false)).toBe(90);
    expect(angleFromPointer(box, { x: cx, y: cy + 100 }, false)).toBe(180);
  });

  it("wraps into 0-359 rather than going negative", () => {
    const cx = box.x + box.w / 2;
    const cy = box.y + box.h / 2;
    expect(angleFromPointer(box, { x: cx - 100, y: cy }, false)).toBe(270);
  });

  it("snaps to 15 degree steps when asked", () => {
    const cx = box.x + box.w / 2;
    const cy = box.y + box.h / 2;
    const loose = angleFromPointer(box, { x: cx + 100, y: cy - 92 }, false);
    expect(loose % 15).not.toBe(0);
    expect(angleFromPointer(box, { x: cx + 100, y: cy - 92 }, true) % 15).toBe(0);
  });
});
