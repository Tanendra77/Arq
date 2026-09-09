import { emptyDocument, parseDocument, serializeDocument } from "@arq/schema";
import type { EditorStore } from "../store/editor-store";
import type { Platform } from "../platform";

export type OpenResult = { ok: true } | { ok: false; errors: string[] } | { ok: false; cancelled: true };

export async function openDocument(store: EditorStore, platform: Platform): Promise<OpenResult> {
  const picked = await platform.openDocument();
  if (!picked) return { ok: false, cancelled: true };
  const parsed = parseDocument(picked.text);
  if (!parsed.ok) return { ok: false, errors: parsed.errors };
  store.getState().loadDocument(parsed.document, picked.path ?? null);
  return { ok: true };
}

export async function saveDocument(
  store: EditorStore,
  platform: Platform,
  opts: { as?: boolean } = {},
): Promise<boolean> {
  const { document, filePath } = store.getState();
  const text = serializeDocument(document);
  const path = opts.as ? undefined : filePath ?? undefined;
  const used = await platform.saveDocument(text, path);
  if (used === null) return false;
  store.getState().markSaved(used);
  return true;
}

/**
 * Route a thrown/rejected command failure into the store's notice so it reaches the toolbar
 * banner instead of being swallowed by a `void`ed promise.
 */
export function reportCommandError(store: EditorStore, e: unknown): void {
  store.getState().setNotice([String(e instanceof Error ? e.message : e)]);
}

export function newDocument(store: EditorStore): void {
  store.getState().loadDocument(emptyDocument(), null);
}

export function confirmDiscard(
  store: EditorStore,
  confirmFn: (msg: string) => boolean = (m) => window.confirm(m),
): boolean {
  if (!store.getState().dirty) return true;
  return confirmFn("You have unsaved changes. Discard them?");
}
