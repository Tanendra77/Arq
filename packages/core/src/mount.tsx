import { createRoot } from "react-dom/client";
import type { Document } from "@arq/schema";
import { App } from "./components/App";
import { EditorStoreProvider } from "./store/context";
import { createEditorStore, type EditorStore } from "./store/editor-store";
import type { Platform } from "./platform";
import { installSketchFont } from "./sketch-font";
import { restoreDraft, startAutosave } from "./autosave";

export function mountApp(el: HTMLElement, platform: Platform, initial?: Document): { unmount(): void; store: EditorStore } {
  installSketchFont();
  const store = createEditorStore(initial);
  // An explicit document wins; otherwise pick up where the last session left off.
  if (initial === undefined) restoreDraft(store);
  const stopAutosave = startAutosave(store);
  const root = createRoot(el);
  root.render(
    <EditorStoreProvider store={store} platform={platform}>
      <App />
    </EditorStoreProvider>,
  );
  return {
    unmount: () => {
      stopAutosave();
      root.unmount();
    },
    store,
  };
}
