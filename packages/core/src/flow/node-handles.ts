import type { Pinned } from "@arq/schema";

/** The four corners, named by which one stays put when the opposite is dragged. */
export const CORNERS = ["nw", "ne", "se", "sw"] as const;
export type Corner = (typeof CORNERS)[number];

export interface Point {
  x: number;
  y: number;
}

/** Local corner offsets from the box centre, before rotation. */
function localCorner(corner: Corner, w: number, h: number): Point {
  const sx = corner === "nw" || corner === "sw" ? -1 : 1;
  const sy = corner === "nw" || corner === "ne" ? -1 : 1;
  return { x: (sx * w) / 2, y: (sy * h) / 2 };
}

function rotate(p: Point, radians: number): Point {
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  return { x: p.x * cos - p.y * sin, y: p.x * sin + p.y * cos };
}

const opposite: Record<Corner, Corner> = { nw: "se", ne: "sw", se: "nw", sw: "ne" };

/**
 * Resize a rotated box by dragging one corner, keeping the opposite corner pinned.
 *
 * React Flow's own resizer works in unrotated screen space, so on a turned shape its handles drag
 * along the wrong axes — the reason this exists. The arithmetic is: find where the opposite corner
 * sits on screen, express the pointer in the box's *own* frame by unrotating around it, and read
 * the new width and height off that. The centre then moves to the middle of the new diagonal, and
 * the stored (unrotated) x/y follow from it — the document keeps an axis-aligned rect plus an
 * angle, which is what lets the edge router and the exporter stay in agreement.
 */
export function resizeRotated(
  pinned: { x: number; y: number; w: number; h: number },
  corner: Corner,
  pointer: Point,
  degrees: number,
  min: number,
): Pinned {
  const rad = (degrees * Math.PI) / 180;
  const centre = { x: pinned.x + pinned.w / 2, y: pinned.y + pinned.h / 2 };

  const fixedLocal = localCorner(opposite[corner], pinned.w, pinned.h);
  const fixedRotated = rotate(fixedLocal, rad);
  const fixed = { x: centre.x + fixedRotated.x, y: centre.y + fixedRotated.y };

  // The pointer in the box's own frame, measured from the corner that is staying put.
  const local = rotate({ x: pointer.x - fixed.x, y: pointer.y - fixed.y }, -rad);
  const w = Math.max(min, Math.abs(local.x));
  const h = Math.max(min, Math.abs(local.y));

  // Put the centre half way along the new diagonal, in the direction the drag actually went.
  const dir = { x: Math.sign(local.x) || 1, y: Math.sign(local.y) || 1 };
  const half = rotate({ x: (dir.x * w) / 2, y: (dir.y * h) / 2 }, rad);
  const newCentre = { x: fixed.x + half.x, y: fixed.y + half.y };

  return {
    x: Math.round(newCentre.x - w / 2),
    y: Math.round(newCentre.y - h / 2),
    w: Math.round(w),
    h: Math.round(h),
  };
}

/**
 * The angle that puts the rotation grip under the pointer.
 *
 * The grip sits above the shape, so straight up is 0°. `snap` quantises to 15° steps, which is
 * what Shift does while dragging.
 */
export function angleFromPointer(
  pinned: { x: number; y: number; w: number; h: number },
  pointer: Point,
  snap: boolean,
): number {
  const cx = pinned.x + pinned.w / 2;
  const cy = pinned.y + pinned.h / 2;
  const deg = (Math.atan2(pointer.y - cy, pointer.x - cx) * 180) / Math.PI + 90;
  const wrapped = ((deg % 360) + 360) % 360;
  return snap ? Math.round(wrapped / 15) * 15 : Math.round(wrapped);
}
