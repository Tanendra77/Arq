import { createRoot } from "react-dom/client";
import type { Document } from "@arq/schema";
import { App } from "./components/App";
import { EditorStoreProvider } from "./store/context";
import { createEditorStore, type EditorStore } from "./store/editor-store";
import type { Platform } from "./platform";
import { installSketchFont } from "./sketch-font";

export function mountApp(el: HTMLElement, platform: Platform, initial?: Document): { unmount(): void; store: EditorStore } {
  installSketchFont();
  const store = createEditorStore(initial);
  const root = createRoot(el);
  root.render(
    <EditorStoreProvider store={store} platform={platform}>
      <App />
    </EditorStoreProvider>,
  );
  return { unmount: () => root.unmount(), store };
}
