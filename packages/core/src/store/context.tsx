import { createContext, useContext, type ReactNode } from "react";
import { useStore } from "zustand";
import type { EditorState, EditorStore } from "./editor-store";
import type { Platform } from "../platform";

interface Ctx { store: EditorStore; platform: Platform }
const EditorContext = createContext<Ctx | null>(null);

export function EditorStoreProvider({ store, platform, children }: Ctx & { children: ReactNode }) {
  return <EditorContext.Provider value={{ store, platform }}>{children}</EditorContext.Provider>;
}

function useCtx(): Ctx {
  const ctx = useContext(EditorContext);
  if (!ctx) throw new Error("EditorStoreProvider is missing");
  return ctx;
}

export function useEditorStore(): EditorStore { return useCtx().store; }
export function usePlatform(): Platform { return useCtx().platform; }
export function useEditor<T>(selector: (s: EditorState) => T): T { return useStore(useCtx().store, selector); }
