import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactFlowProps } from "@xyflow/react";
import { emptyDocument } from "@arq/schema";
import { App } from "../../src/components/App";
import { EditorStoreProvider } from "../../src/store/context";
import { createEditorStore, type EditorStore } from "../../src/store/editor-store";
import { loadSettings } from "../../src/settings";
import { createFakePlatform } from "../platform-fake";

// Captures the props Canvas hands to <ReactFlow>, the same technique Canvas.test.tsx uses, so the
// grid/snap settings can be proven to reach React Flow without reaching into its internals.
let capturedProps: ReactFlowProps | undefined;
vi.mock("@xyflow/react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@xyflow/react")>();
  return {
    ...actual,
    ReactFlow: (props: ReactFlowProps) => {
      capturedProps = props;
      return <actual.ReactFlow {...props} />;
    },
  };
});

function renderApp(): EditorStore {
  capturedProps = undefined;
  const store = createEditorStore(emptyDocument());
  render(
    <EditorStoreProvider store={store} platform={createFakePlatform()}>
      <App />
    </EditorStoreProvider>,
  );
  return store;
}

beforeEach(() => localStorage.clear());

describe("SettingsModal", () => {
  it("opens from the toolbar gear and closes on Escape", async () => {
    renderApp();
    await userEvent.click(screen.getByRole("button", { name: "Settings" }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("closes on a backdrop click but not on a click inside the dialog", async () => {
    renderApp();
    await userEvent.click(screen.getByRole("button", { name: "Settings" }));
    const dialog = screen.getByRole("dialog");
    fireEvent.click(dialog);
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    fireEvent.click(dialog.parentElement as Element);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("moves focus into the dialog on open, so Escape reaches it", async () => {
    renderApp();
    await userEvent.click(screen.getByRole("button", { name: "Settings" }));
    expect(screen.getByRole("dialog")).toHaveFocus();
  });

  it("gives the dialog and every control an accessible name", async () => {
    renderApp();
    await userEvent.click(screen.getByRole("button", { name: "Settings" }));
    expect(screen.getByRole("dialog", { name: "Settings" })).toBeInTheDocument();
    for (const label of [
      "Theme", "Grid", "Grid size", "Snap to grid",
      "Default shape fill", "Default shape stroke", "Default line stroke", "Default arrow style",
    ]) {
      expect(screen.getByLabelText(label)).toBeInTheDocument();
    }
  });

  it("persists a change to localStorage", async () => {
    renderApp();
    await userEvent.click(screen.getByRole("button", { name: "Settings" }));
    fireEvent.change(screen.getByLabelText("Theme"), { target: { value: "dark" } });
    expect(loadSettings().theme).toBe("dark");
  });

  it("sets data-theme on the document root when the theme changes", async () => {
    renderApp();
    await userEvent.click(screen.getByRole("button", { name: "Settings" }));
    fireEvent.change(screen.getByLabelText("Theme"), { target: { value: "dark" } });
    expect(document.documentElement.dataset.theme).toBe("dark");
    fireEvent.change(screen.getByLabelText("Theme"), { target: { value: "system" } });
    expect(document.documentElement.hasAttribute("data-theme")).toBe(false);
  });

  it("drives React Flow's snap and grid props from the grid settings", async () => {
    renderApp();
    expect(capturedProps?.snapToGrid).toBe(true); // DEFAULT_SETTINGS.snap
    await userEvent.click(screen.getByRole("button", { name: "Settings" }));
    fireEvent.change(screen.getByLabelText("Grid size"), { target: { value: "25" } });
    fireEvent.click(screen.getByLabelText("Snap to grid")); // on by default -> off
    expect(capturedProps?.snapToGrid).toBe(false);
    expect(capturedProps?.snapGrid).toEqual([25, 25]);
  });

  it("hides the grid background when grid is set to off", async () => {
    renderApp();
    await userEvent.click(screen.getByRole("button", { name: "Settings" }));
    fireEvent.change(screen.getByLabelText("Grid"), { target: { value: "off" } });
    expect(document.querySelector(".react-flow__background")).toBeNull();
  });

  it("applies the default fill to a newly created shape", async () => {
    const store = renderApp();
    await userEvent.click(screen.getByRole("button", { name: "Settings" }));
    fireEvent.change(screen.getByLabelText("Default shape fill"), { target: { value: "#123456" } });
    await userEvent.keyboard("{Escape}");
    await userEvent.dblClick(screen.getByRole("button", { name: "Rectangle" }));
    expect(store.getState().document.nodes[0]?.style?.fill).toBe("#123456");
  });

  it("never rewrites an existing document", async () => {
    const store = renderApp();
    await userEvent.dblClick(screen.getByRole("button", { name: "Rectangle" }));
    const before = JSON.stringify(store.getState().document);
    await userEvent.click(screen.getByRole("button", { name: "Settings" }));
    fireEvent.change(screen.getByLabelText("Default shape fill"), { target: { value: "#abcdef" } });
    expect(JSON.stringify(store.getState().document)).toBe(before);
  });
});
