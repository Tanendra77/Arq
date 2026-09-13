import { parseDocument, serializeDocument } from "@arq/schema";
import type { EditorStore } from "./store/editor-store";

export const AUTOSAVE_KEY = "arq.autosave";

/** How long edits settle before the draft is written: long enough that a drag is one write, not hundreds. */
const DEBOUNCE_MS = 300;

interface Draft {
  version: 1;
  document: string;
  filePath: string | null;
  dirty: boolean;
}

/**
 * Put back the draft the last session left, the way Excalidraw reopens where you were.
 *
 * Browser storage is local to this machine and profile — the web build and the desktop app's webview
 * each keep their own. A draft that fails validation is ignored rather than trusted; it is
 * overwritten by the next autosave.
 */
export function restoreDraft(store: EditorStore): boolean {
  try {
    const raw = localStorage.getItem(AUTOSAVE_KEY);
    if (raw === null) return false;
    const draft = JSON.parse(raw) as Partial<Draft>;
    if (draft.version !== 1 || typeof draft.document !== "string") return false;
    const parsed = parseDocument(draft.document);
    if (!parsed.ok) return false;
    store.getState().loadDocument(parsed.document, typeof draft.filePath === "string" ? draft.filePath : null, {
      dirty: draft.dirty === true,
    });
    return true;
  } catch {
    return false; // storage blocked or the blob is not JSON: start from an empty canvas
  }
}

/** Write the draft whenever the document changes. Returns a stop function that flushes any pending write. */
export function startAutosave(store: EditorStore): () => void {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let failed = false;

  const write = () => {
    timer = undefined;
    const { document, filePath, dirty } = store.getState();
    const draft: Draft = { version: 1, document: serializeDocument(document), filePath, dirty };
    try {
      localStorage.setItem(AUTOSAVE_KEY, JSON.stringify(draft));
      failed = false;
    } catch {
      // Storage is full or blocked. Say so once — silently losing work on the next reload is the one
      // outcome this exists to prevent.
      if (!failed) store.getState().setNotice(["Autosave failed: browser storage is unavailable. Save to a file to keep this diagram."]);
      failed = true;
    }
  };
  const flush = () => {
    if (timer === undefined) return;
    clearTimeout(timer);
    write();
  };

  const unsubscribe = store.subscribe((s, prev) => {
    if (s.document === prev.document && s.filePath === prev.filePath && s.dirty === prev.dirty) return;
    if (timer !== undefined) clearTimeout(timer);
    timer = setTimeout(write, DEBOUNCE_MS);
  });
  // A reload or window close inside the debounce window must not drop the last edit.
  window.addEventListener("pagehide", flush);
  window.addEventListener("beforeunload", flush);
  return () => {
    flush();
    unsubscribe();
    window.removeEventListener("pagehide", flush);
    window.removeEventListener("beforeunload", flush);
  };
}
