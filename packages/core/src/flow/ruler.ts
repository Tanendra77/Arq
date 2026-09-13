/**
 * Ruler arithmetic, kept apart from the component that draws it so the awkward part — choosing a
 * tick spacing that stays readable at every zoom, and placing ticks in document coordinates — can
 * be reasoned about and tested on its own.
 *
 * One mapping underlies all of it: a document coordinate `v` sits at screen pixel
 * `v * zoom + offset`, where `offset` is the viewport's own translation.
 */

/** The 1-2-5 progression, which is what rulers and chart axes have always stepped in. */
const MANTISSAS = [1, 2, 5] as const;

/**
 * The smallest 1-2-5 step whose on-screen spacing is at least `minPx`.
 *
 * Labels need room: pick purely by document units and they crowd into each other as you zoom out,
 * pick purely by pixels and the numbers stop being round.
 */
export function niceStep(zoom: number, minPx = 72): number {
  if (!Number.isFinite(zoom) || zoom <= 0) return 1;
  for (let power = -3; power <= 7; power += 1) {
    for (const m of MANTISSAS) {
      const step = m * 10 ** power;
      if (step * zoom >= minPx) return step;
    }
  }
  return 10 ** 7;
}

export interface Tick {
  /** Where it falls along the ruler, in pixels from its start. */
  pos: number;
  /** The document coordinate it marks. */
  value: number;
}

/**
 * Every tick visible along a ruler of `lengthPx`, in order.
 *
 * `-0` is normalised to `0`: it would otherwise print as "-0" on the label for the origin.
 */
export function ticks(offset: number, lengthPx: number, zoom: number, step: number): Tick[] {
  if (!Number.isFinite(zoom) || zoom <= 0 || step <= 0 || lengthPx <= 0) return [];
  const first = Math.ceil(-offset / zoom / step) * step;
  const last = (lengthPx - offset) / zoom;
  const out: Tick[] = [];
  // Guard against a pathological step/zoom pair asking for an unbounded list.
  for (let v = first, i = 0; v <= last && i < 1000; v += step, i += 1) {
    out.push({ pos: v * zoom + offset, value: v === 0 ? 0 : v });
  }
  return out;
}

/** The document coordinate at a pixel along the ruler. */
export function documentAt(px: number, offset: number, zoom: number): number {
  return (px - offset) / zoom;
}

/** Tick labels drop their decimals once the step is a whole number, which it usually is. */
export function formatTick(value: number, step: number): string {
  return step >= 1 ? String(Math.round(value)) : value.toFixed(Math.min(3, String(step).split(".")[1]?.length ?? 0));
}
