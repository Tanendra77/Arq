import { describe, expect, it } from "vitest";
import { inlineIcon } from "../src/index";

const icon = `<?xml version="1.0"?><!-- c --><svg xmlns="http://www.w3.org/2000/svg" width="72" height="72" viewBox="0 0 72 72"><defs><linearGradient id="a"/></defs><path fill="url(#a)" d="M0 0"/><use href="#a"/><use xlink:href="#a"/></svg>`;

describe("inlineIcon", () => {
  it("prefixes ids and every reference to them, drops the prolog, and positions the box", () => {
    const out = inlineIcon(icon, "n1", { x: 10, y: 20, w: 48, h: 48 });
    expect(out.startsWith('<svg x="10" y="20" width="48" height="48" viewBox="0 0 72 72" preserveAspectRatio="xMidYMid meet">')).toBe(true);
    expect(out).toContain('id="n1-a"');
    expect(out).toContain('url(#n1-a)');
    expect(out).toContain('href="#n1-a"');
    expect(out).toContain('xlink:href="#n1-a"');
    expect(out).not.toContain("<?xml");
    expect(out).not.toContain("<!--");
    expect(out.endsWith("</svg>")).toBe(true);
  });
  it("derives a viewBox from width and height when none is present", () => {
    const out = inlineIcon('<svg width="30" height="20"><rect/></svg>', "p", { x: 0, y: 0, w: 48, h: 48 });
    expect(out).toContain('viewBox="0 0 30 20"');
  });
  it("falls back to 0 0 72 72 when nothing is declared", () => {
    expect(inlineIcon("<svg><rect/></svg>", "p", { x: 0, y: 0, w: 48, h: 48 })).toContain('viewBox="0 0 72 72"');
  });
  it("carries the root's presentation attributes onto the nested svg", () => {
    const out = inlineIcon(
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 72 72" fill="none" stroke="currentColor" stroke-width="2.5"><rect/></svg>',
      "p",
      { x: 0, y: 0, w: 48, h: 48 },
    );
    const openTag = out.slice(0, out.indexOf(">") + 1);
    expect(openTag).toContain('fill="none"');
    expect(openTag).toContain('stroke="currentColor"');
    expect(openTag).toContain('stroke-width="2.5"');
    expect(openTag).not.toContain("xmlns=");
    expect(openTag.match(/viewBox=/g)).toHaveLength(1);
  });
  it("prefixes ids and references that are single-quoted", () => {
    const out = inlineIcon(
      `<svg viewBox="0 0 72 72"><linearGradient id='g'/><rect fill="url(#g)"/><use href='#g'/></svg>`,
      "n1",
      { x: 0, y: 0, w: 48, h: 48 },
    );
    expect(out).toContain('id="n1-g"');
    expect(out).toContain("url(#n1-g)");
    expect(out).toContain('href="#n1-g"');
  });
  it("rewrites only real id attributes, not lookalikes", () => {
    const out = inlineIcon(
      '<svg viewBox="0 0 72 72"><g data-id="keep" id="a" aria-labelledby="keep2"/></svg>',
      "p",
      { x: 0, y: 0, w: 48, h: 48 },
    );
    expect(out).toContain('data-id="keep"');
    expect(out).toContain('aria-labelledby="keep2"');
    expect(out).toContain('id="p-a"');
  });
});
