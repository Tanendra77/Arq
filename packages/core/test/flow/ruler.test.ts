import { describe, expect, it } from "vitest";
import { documentAt, formatTick, niceStep, ticks } from "../../src/flow/ruler";

describe("niceStep", () => {
  it("keeps ticks at least minPx apart, in the 1-2-5 progression", () => {
    for (const zoom of [0.1, 0.37, 1, 2.5, 4]) {
      const step = niceStep(zoom);
      expect(step * zoom).toBeGreaterThanOrEqual(72);
      // A 1-2-5 number: dividing out the power of ten leaves 1, 2 or 5.
      const mantissa = step / 10 ** Math.floor(Math.log10(step));
      expect([1, 2, 5]).toContain(Math.round(mantissa));
    }
  });

  it("takes a coarser step as the view zooms out, never a finer one", () => {
    const steps = [4, 2, 1, 0.5, 0.25].map((z) => niceStep(z));
    expect(steps).toEqual([...steps].sort((a, b) => a - b));
  });

  it("survives a nonsense zoom rather than looping forever", () => {
    expect(niceStep(0)).toBe(1);
    expect(niceStep(Number.NaN)).toBe(1);
  });
});

describe("ticks", () => {
  it("places each tick where its document coordinate lands on screen", () => {
    // Unzoomed, panned right by 50px: the origin sits at x=50 and steps run every 100 units.
    const out = ticks(50, 400, 1, 100);
    expect(out.map((t) => t.value)).toEqual([0, 100, 200, 300]);
    expect(out.map((t) => t.pos)).toEqual([50, 150, 250, 350]);
  });

  it("covers only what is on screen, starting at the first whole step inside it", () => {
    const out = ticks(-250, 200, 1, 100);
    expect(out[0]?.value).toBe(300);
    expect(out.at(-1)?.value).toBe(400);
  });

  it("scales positions by zoom", () => {
    // 100 document units are 200px at 2x, and the tick landing exactly on the far edge is kept.
    expect(ticks(0, 400, 2, 100).map((t) => t.pos)).toEqual([0, 200, 400]);
  });

  it("labels the origin as 0, not -0", () => {
    expect(Object.is(ticks(0, 100, 1, 50)[0]?.value, -0)).toBe(false);
  });

  it("returns nothing for a degenerate ruler rather than hanging", () => {
    expect(ticks(0, 0, 1, 10)).toEqual([]);
    expect(ticks(0, 100, 0, 10)).toEqual([]);
    expect(ticks(0, 100, 1, 0)).toEqual([]);
  });
});

describe("documentAt", () => {
  it("inverts the tick placement, so the readout agrees with the ruler", () => {
    const [offset, zoom, step] = [37, 1.5, 100];
    for (const t of ticks(offset, 600, zoom, step)) {
      expect(documentAt(t.pos, offset, zoom)).toBeCloseTo(t.value, 6);
    }
  });
});

describe("formatTick", () => {
  it("drops decimals for whole steps and keeps them for fractional ones", () => {
    expect(formatTick(200, 100)).toBe("200");
    expect(formatTick(0.25, 0.25)).toBe("0.25");
  });
});
