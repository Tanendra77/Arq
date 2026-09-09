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
});
