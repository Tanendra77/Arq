import { afterEach, describe, expect, it, vi } from "vitest";
import { emptyDocument } from "@arq/schema";
import { createEditorStore } from "../src/store/editor-store";
import { AUTOSAVE_KEY, restoreDraft, startAutosave } from "../src/autosave";

afterEach(() => {
  localStorage.clear();
  vi.useRealTimers();
});

describe("autosave", () => {
  it("writes the document after edits settle and restores it, still unsaved, in a new session", () => {
    vi.useFakeTimers();
    const first = createEditorStore(emptyDocument());
    const stop = startAutosave(first);
    first.getState().addNode({ shape: "rect", label: "kept", position: { x: 1, y: 2 } });
    expect(localStorage.getItem(AUTOSAVE_KEY)).toBeNull(); // debounced
    vi.advanceTimersByTime(400);
    stop();

    const second = createEditorStore(emptyDocument());
    expect(restoreDraft(second)).toBe(true);
    expect(second.getState().document.nodes.map((n) => n.label)).toEqual(["kept"]);
    expect(second.getState().dirty).toBe(true);
    expect(second.getState().past).toHaveLength(0); // a restored draft is not something to undo
  });

  it("flushes a pending write when stopped", () => {
    const store = createEditorStore(emptyDocument());
    const stop = startAutosave(store);
    store.getState().addNode({ shape: "rect", label: "x", position: { x: 0, y: 0 } });
    stop();
    const draft = JSON.parse(localStorage.getItem(AUTOSAVE_KEY)!) as { document: string };
    expect(JSON.parse(draft.document).nodes[0].label).toBe("x");
  });

  it("ignores a draft that is not a valid document", () => {
    localStorage.setItem(AUTOSAVE_KEY, JSON.stringify({ version: 1, document: "{not json", filePath: null, dirty: true }));
    const store = createEditorStore(emptyDocument());
    expect(restoreDraft(store)).toBe(false);
    expect(store.getState().document.nodes).toHaveLength(0);
  });
});
