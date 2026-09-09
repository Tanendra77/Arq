import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { emptyDocument } from "@arq/schema";
import { App } from "../../src/components/App";
import { EditorStoreProvider } from "../../src/store/context";
import { createEditorStore } from "../../src/store/editor-store";
import { createFakePlatform } from "../platform-fake";

describe("App", () => {
  it("renders toolbar, palette, canvas and inspector regions", () => {
    render(
      <EditorStoreProvider store={createEditorStore(emptyDocument())} platform={createFakePlatform()}>
        <App />
      </EditorStoreProvider>,
    );
    for (const id of ["toolbar", "palette", "canvas", "inspector"]) expect(screen.getByTestId(id)).toBeInTheDocument();
  });
});
