import { beforeEach, describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { emptyDocument } from "@arq/schema";
import { DEFAULT_NODE_LABEL, Palette, setActiveTool } from "../../src/components/Palette";
import { EditorStoreProvider } from "../../src/store/context";
import { createEditorStore, type EditorStore } from "../../src/store/editor-store";
import { createFakePlatform } from "../platform-fake";
import { DRAG_MIME } from "../../src/flow/drag-payload";

function renderPalette(): EditorStore {
  const store = createEditorStore(emptyDocument());
  render(
    <EditorStoreProvider store={store} platform={createFakePlatform()}>
      <Palette />
    </EditorStoreProvider>,
  );
  return store;
}

describe("Palette", () => {
  beforeEach(() => setActiveTool(null)); // module-level view state, shared across tests

  it("lists the seven basic items and no domain types", () => {
    renderPalette();
    for (const label of ["Rectangle", "Ellipse", "Diamond", "Triangle", "Text", "Line", "Arrow"]) {
      expect(screen.getByRole("button", { name: label })).toBeInTheDocument();
    }
    expect(screen.queryByText("Broker")).toBeNull();
  });

  it("shows the symbol alone, naming the item only for assistive tech and the tooltip", () => {
    renderPalette();
    const item = screen.getByRole("button", { name: "Rectangle" });
    expect(item.querySelector("svg")).not.toBeNull();
    // The name must not also be painted next to the swatch: that is what made the panel a tall
    // list of mostly-empty rows instead of a grid of tiles.
    expect(item.textContent).toBe("");
    expect(item).toHaveAttribute("title", expect.stringContaining("Rectangle"));
  });

  it("clicking an item arms it, and clicking it again disarms it", async () => {
    renderPalette();
    const item = screen.getByRole("button", { name: "Diamond" });
    await userEvent.click(item);
    expect(item).toHaveAttribute("aria-pressed", "true");
    await userEvent.click(item);
    expect(item).toHaveAttribute("aria-pressed", "false");
  });

  it("gives a new node the editable placeholder label, not the palette item's name", async () => {
    const store = renderPalette();
    await userEvent.dblClick(screen.getByRole("button", { name: "Rectangle" }));
    expect(store.getState().document.nodes[0]?.label).toBe(DEFAULT_NODE_LABEL);
  });

  it("double-clicking a shape adds a node of that shape", async () => {
    const store = renderPalette();
    await userEvent.dblClick(screen.getByRole("button", { name: "Ellipse" }));
    expect(store.getState().document.nodes[0]?.shape).toBe("ellipse");
  });

  it("double-clicking Arrow adds a free edge with an end arrow", async () => {
    const store = renderPalette();
    await userEvent.dblClick(screen.getByRole("button", { name: "Arrow" }));
    const e = store.getState().document.edges[0]!;
    expect(typeof e.from).toBe("object");
    expect(e.style?.endArrow).toBe("arrow");
  });

  it("double-clicking Line adds a free edge with no arrows", async () => {
    const store = renderPalette();
    await userEvent.dblClick(screen.getByRole("button", { name: "Line" }));
    expect(store.getState().document.edges[0]?.style?.endArrow).toBe("none");
  });

  it("adds a node when a focused palette item is activated with Enter", () => {
    const store = renderPalette();
    const item = screen.getByRole("button", { name: "Diamond" });
    item.focus();
    expect(item).toHaveFocus();
    fireEvent.keyDown(item, { key: "Enter" });
    expect(store.getState().document.nodes).toHaveLength(1);
    expect(store.getState().document.nodes[0]?.shape).toBe("diamond");
  });

  it("adds a node when a focused palette item is activated with Space", () => {
    const store = renderPalette();
    const item = screen.getByRole("button", { name: "Triangle" });
    fireEvent.keyDown(item, { key: " " });
    expect(store.getState().document.nodes[0]?.shape).toBe("triangle");
  });

  it("sets the drag payload on dragstart, naming the palette item key", () => {
    renderPalette();
    const set = new Map<string, string>();
    const dataTransfer = { setData: (k: string, v: string) => set.set(k, v), effectAllowed: "" };
    fireEvent.dragStart(screen.getByRole("button", { name: "Triangle" }), { dataTransfer });
    expect(JSON.parse(set.get(DRAG_MIME) ?? "{}")).toEqual({ item: "triangle" });
  });

  it("keeps the Icons tab disabled", () => {
    renderPalette();
    expect(screen.getByRole("button", { name: "Icons" })).toBeDisabled();
  });

  it("builds the Arrow swatch's arrowhead from @arq/render's shared ARROW_BODY, not a local copy", () => {
    renderPalette();
    const item = screen.getByRole("button", { name: "Arrow" });
    // This is @arq/render's ARROW_BODY.arrow path data (packages/render/src/defs.ts), hardcoded
    // here (not re-imported and re-derived) so that changing the real geometry actually moves
    // this test: if Palette.tsx ever reverts to a hand-authored arrowhead, or the shared geometry
    // changes without this assertion being updated, the swatch stops matching and this fails.
    expect(item.querySelector('path[d="M0 0L10 5L0 10z"]')).not.toBeNull();
  });
});
