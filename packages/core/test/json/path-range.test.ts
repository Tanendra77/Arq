import { describe, expect, it } from "vitest";
import { EditorState } from "@codemirror/state";
import { json } from "@codemirror/lang-json";
import { pathRange } from "../../src/json/JsonPanel";

const text = `{
  "version": 2,
  "nodes": [
    { "id": "a", "shape": "rect", "label": "A" },
    {
      "id": "b",
      "shape": "blob",
      "label": "B"
    }
  ]
}`;
const state = EditorState.create({ doc: text, extensions: [json()] });
const at = (path: (string | number)[]) => {
  const r = pathRange(state, path);
  return { line: state.doc.lineAt(r.from).number, text: state.sliceDoc(r.from, r.to) };
};

describe("pathRange", () => {
  it("finds the value a path names", () => {
    expect(at(["nodes", 1, "shape"])).toEqual({ line: 7, text: '"blob"' });
    expect(at(["version"])).toEqual({ line: 2, text: "2" });
  });

  it("falls back to the deepest part that exists, on its first line only", () => {
    expect(at(["nodes", 1, "icon"]).line).toBe(5); // the object that is missing the key
    expect(at(["nodes", 1, "icon"]).text).toBe("{");
  });

  it("points at the start for a whole-document problem", () => {
    expect(at([]).line).toBe(1);
  });
});
