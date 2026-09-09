import { describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { emptyDocument } from "@arq/schema";
import { Palette } from "../../src/components/Palette";
import { EditorStoreProvider } from "../../src/store/context";
import { createEditorStore } from "../../src/store/editor-store";
import { createFakePlatform } from "../platform-fake";
import { DRAG_MIME } from "../../src/flow/drag-payload";

describe("Palette", () => {
  it("lists all eleven node types and creates a node on double-click", () => {
    const store = createEditorStore(emptyDocument());
    const { container } = render(
      <EditorStoreProvider store={store} platform={createFakePlatform()}>
        <Palette />
      </EditorStoreProvider>,
    );
    expect(container.querySelectorAll("li")).toHaveLength(11);
    fireEvent.doubleClick(screen.getByText("Broker"));
    expect(store.getState().document.nodes[0]?.type).toBe("broker");
  });

  it("adds a node when a focused palette item is activated with Enter", () => {
    const store = createEditorStore(emptyDocument());
    render(
      <EditorStoreProvider store={store} platform={createFakePlatform()}>
        <Palette />
      </EditorStoreProvider>,
    );
    const item = screen.getByRole("button", { name: "Topic" });
    item.focus();
    expect(item).toHaveFocus();
    fireEvent.keyDown(item, { key: "Enter" });
    expect(store.getState().document.nodes).toHaveLength(1);
    expect(store.getState().document.nodes[0]?.type).toBe("topic");
  });

  it("sets the drag payload on dragstart", () => {
    const store = createEditorStore(emptyDocument());
    render(
      <EditorStoreProvider store={store} platform={createFakePlatform()}>
        <Palette />
      </EditorStoreProvider>,
    );
    const set = new Map<string, string>();
    const dataTransfer = { setData: (k: string, v: string) => set.set(k, v), effectAllowed: "" };
    fireEvent.dragStart(screen.getByText("Queue"), { dataTransfer });
    expect(JSON.parse(set.get(DRAG_MIME) ?? "{}")).toMatchObject({ nodeType: "queue" });
  });
});
