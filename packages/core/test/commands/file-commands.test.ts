import { describe, expect, it } from "vitest";
import { emptyDocument, serializeDocument } from "@arq/schema";
import { createEditorStore } from "../../src/store/editor-store";
import { openDocument, saveDocument, newDocument, confirmDiscard } from "../../src/commands/file-commands";
import { createFakePlatform } from "../platform-fake";

describe("file commands", () => {
  it("open loads a valid document and records the path", async () => {
    const store = createEditorStore();
    const p = createFakePlatform();
    const doc = emptyDocument("From disk");
    p.nextOpen = { path: "C:/d.arq", text: serializeDocument(doc) };
    const r = await openDocument(store, p);
    expect(r).toEqual({ ok: true });
    expect(store.getState().document.title).toBe("From disk");
    expect(store.getState().filePath).toBe("C:/d.arq");
    expect(store.getState().dirty).toBe(false);
  });

  it("open reports validation errors and leaves the store untouched", async () => {
    const store = createEditorStore(emptyDocument("Keep"));
    const p = createFakePlatform();
    p.nextOpen = { text: '{ "version": 1, "nodes": "nope" }' };
    const r = await openDocument(store, p);
    expect(r.ok).toBe(false);
    if (!r.ok && "errors" in r) expect(r.errors[0]).toMatch(/nodes/);
    expect(store.getState().document.title).toBe("Keep");
  });

  it("open reports cancel", async () => {
    const r = await openDocument(createEditorStore(), createFakePlatform());
    expect(r).toEqual({ ok: false, cancelled: true });
  });

  it("save serializes, passes the current path, and clears dirty", async () => {
    const store = createEditorStore(emptyDocument("S"));
    store.getState().addNode({ type: "app", label: "a", position: { x: 0, y: 0 } });
    store.getState().markSaved("C:/s.arq");
    store.getState().addNode({ type: "app", label: "b", position: { x: 0, y: 0 } });
    const p = createFakePlatform();
    expect(await saveDocument(store, p)).toBe(true);
    expect(p.saved[0]?.path).toBe("C:/s.arq");
    expect(p.saved[0]?.text).toBe(serializeDocument(store.getState().document));
    expect(store.getState().dirty).toBe(false);
  });

  it("save as omits the path", async () => {
    const store = createEditorStore(emptyDocument("S"));
    store.getState().markSaved("C:/s.arq");
    const p = createFakePlatform();
    await saveDocument(store, p, { as: true });
    expect(p.saved[0]?.path).toBeUndefined();
    expect(store.getState().filePath).toBe("C:/fake/untitled.arq");
  });

  it("newDocument resets to an empty untitled document", () => {
    const store = createEditorStore(emptyDocument("Old"));
    newDocument(store);
    expect(store.getState().document.title).toBe("Untitled");
    expect(store.getState().filePath).toBeNull();
  });

  it("confirmDiscard only prompts when dirty", () => {
    const store = createEditorStore();
    let asked = 0;
    expect(confirmDiscard(store, () => { asked += 1; return false; })).toBe(true);
    store.getState().addNode({ type: "app", label: "a", position: { x: 0, y: 0 } });
    expect(confirmDiscard(store, () => { asked += 1; return false; })).toBe(false);
    expect(asked).toBe(1);
  });
});
