import { describe, expect, it } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { emptyDocument } from "@arq/schema";
import { Toolbar } from "../../src/components/Toolbar";
import { EditorStoreProvider } from "../../src/store/context";
import { createEditorStore, type EditorStore } from "../../src/store/editor-store";
import { createFakePlatform } from "../platform-fake";

function renderToolbar(store: EditorStore) {
  return render(
    <EditorStoreProvider store={store} platform={createFakePlatform()}>
      <Toolbar />
    </EditorStoreProvider>,
  );
}

describe("Toolbar", () => {
  it("shows the first three notice lines plus a count of the rest, and clears on Dismiss", () => {
    const store = createEditorStore(emptyDocument());
    renderToolbar(store);
    expect(screen.queryByRole("alert")).toBeNull();

    act(() => store.getState().setNotice(["one", "two", "three", "four", "five"]));

    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent("one");
    expect(alert).toHaveTextContent("two");
    expect(alert).toHaveTextContent("three");
    expect(alert).toHaveTextContent("(+2 more)");
    expect(alert).not.toHaveTextContent("four");

    fireEvent.click(screen.getByRole("button", { name: "Dismiss" }));

    expect(screen.queryByRole("alert")).toBeNull();
    expect(store.getState().notice).toBeNull();
  });

  it("marks the title dirty after an edit and clean again after markSaved", () => {
    const store = createEditorStore(emptyDocument("Deck"));
    renderToolbar(store);
    expect(screen.getByTestId("title")).toHaveTextContent("Deck");

    act(() => { store.getState().addNode({ type: "app", label: "a", position: { x: 0, y: 0 } }); });
    expect(screen.getByTestId("title").textContent).toBe("Deck *");

    act(() => store.getState().markSaved("C:/fake/deck.arq"));
    expect(screen.getByTestId("title").textContent).toBe("Deck");
  });
});
