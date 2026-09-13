import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parseDocument } from "../src/index";

// The README points people at these files, so they must keep opening in this build.
const root = join(__dirname, "../../../examples");
const files = readdirSync(root, { recursive: true, encoding: "utf8" }).filter((f) => /\.(arq|json)$/.test(f));

describe("examples", () => {
  it("has examples", () => expect(files.length).toBeGreaterThan(0));
  it.each(files)("%s parses", (f) => {
    const r = parseDocument(readFileSync(join(root, f), "utf8"));
    expect(r.ok ? [] : r.errors).toEqual([]);
  });
});
