import { describe, expect, it } from "vitest";
import { DocumentSchema } from "@arq/schema";
import { freehandPathD, normaliseStroke, shapePathD } from "../src/shape-paths";
import { distanceToPolyline, edgePolyline } from "../src/edge-path";
import { renderSvg } from "../src/index";

const box = { x: 0, y: 0, w: 100, h: 100 };
const vertices = (d: string) => (d.match(/[ML]/g) ?? []).length;

describe("shapePathD", () => {
  it("draws a polygon with as many corners as it is asked for", () => {
    for (const n of [3, 5, 8, 12]) expect(vertices(shapePathD("polygon", box, n)!)).toBe(n);
  });

  it("defaults a polygon to six sides and a star to five points", () => {
    expect(vertices(shapePathD("polygon", box)!)).toBe(6);
    // A star alternates an outer and an inner vertex per point.
    expect(vertices(shapePathD("star", box)!)).toBe(10);
  });

  it("clamps a side count outside what the schema allows rather than drawing nonsense", () => {
    expect(vertices(shapePathD("polygon", box, 1)!)).toBe(3);
    expect(vertices(shapePathD("polygon", box, 99)!)).toBe(24);
  });

  it("closes every new outline, and leaves the original five to their primitives", () => {
    for (const s of ["polygon", "star", "parallelogram", "cylinder", "cloud", "note", "bubble"] as const) {
      expect(shapePathD(s, box)).toMatch(/Z/);
    }
    for (const s of ["rect", "ellipse", "diamond", "triangle", "text"] as const) {
      expect(shapePathD(s, box)).toBeUndefined();
    }
  });

  it("stays inside its box", () => {
    for (const s of ["polygon", "star", "parallelogram", "note", "bubble"] as const) {
      const nums = [...shapePathD(s, box, 7)!.matchAll(/-?\d+(\.\d+)?/g)].map((m) => Number(m[0]));
      expect(Math.min(...nums)).toBeGreaterThanOrEqual(0);
      expect(Math.max(...nums)).toBeLessThanOrEqual(100);
    }
  });
});

describe("freehand strokes", () => {
  const samples = [{ x: 10, y: 10 }, { x: 40, y: 30 }, { x: 80, y: 25 }, { x: 120, y: 60 }];

  it("normalises samples into a padded box and 0..1 points", () => {
    const { box: b, points } = normaliseStroke(samples, 2);
    expect(points.every(([px, py]) => px >= 0 && px <= 1 && py >= 0 && py <= 1)).toBe(true);
    // Padded, so the tapered ink is not clipped at the edge of its own node.
    expect(b.x).toBeLessThan(10);
    expect(b.x + b.w).toBeGreaterThan(120);
  });

  it("never collapses a perfectly straight stroke to a zero-size box", () => {
    const flat = normaliseStroke([{ x: 0, y: 50 }, { x: 200, y: 50 }], 1);
    expect(flat.box.h).toBeGreaterThanOrEqual(8);
  });

  it("draws the same ink every time, so the canvas and an export agree", () => {
    const { box: b, points } = normaliseStroke(samples, 2);
    const d = freehandPathD(points, b, 2);
    expect(d).toMatch(/^M.*Z$/);
    expect(freehandPathD(points, b, 2)).toBe(d);
  });

  it("renders as a filled ink path in the line colour, with no outline", () => {
    const { box: b, points } = normaliseStroke(samples, 2);
    const doc = DocumentSchema.parse({
      version: 2, title: "T", edges: [],
      nodes: [{ id: "f1", shape: "freehand", label: "", points, style: { stroke: "#223344" } }],
      layout: { pinned: { f1: b } },
    });
    const svg = renderSvg(doc, { resolveIcon: () => undefined, font: "system" });
    expect(svg).toMatch(/<path d="M[^"]+Z" fill="#223344" stroke="none"\/>/);
  });
});

describe("edge hit-testing", () => {
  it("measures distance along the routed line, not just to its ends", () => {
    const line = edgePolyline({ x: 0, y: 0 }, { x: 200, y: 0 }, "straight");
    expect(distanceToPolyline({ x: 100, y: 5 }, line)).toBeCloseTo(5);
    expect(distanceToPolyline({ x: 100, y: 50 }, line)).toBeCloseTo(50);
  });

  it("follows an orthogonal route's corners", () => {
    const line = edgePolyline({ x: 0, y: 0 }, { x: 200, y: 100 }, "orthogonal");
    // The vertical leg sits at x=100, far from the straight chord between the ends.
    expect(distanceToPolyline({ x: 100, y: 50 }, line)).toBeCloseTo(0);
  });
});
