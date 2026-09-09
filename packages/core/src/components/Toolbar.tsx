import { useState } from "react";
import { useEditor, useEditorStore, usePlatform } from "../store/context";
import { confirmDiscard, newDocument, openDocument, saveDocument } from "../commands/file-commands";

export function Toolbar() {
  const store = useEditorStore();
  const platform = usePlatform();
  const title = useEditor((s) => s.document.title);
  const dirty = useEditor((s) => s.dirty);
  const canUndo = useEditor((s) => s.past.length > 0);
  const canRedo = useEditor((s) => s.future.length > 0);
  const [error, setError] = useState<string[] | null>(null);

  const open = async () => {
    if (!confirmDiscard(store)) return;
    const r = await openDocument(store, platform);
    setError(!r.ok && "errors" in r ? r.errors : null);
  };

  return (
    <>
      <button type="button" onClick={() => confirmDiscard(store) && newDocument(store)}>New</button>
      <button type="button" onClick={() => void open()}>Open</button>
      <button type="button" onClick={() => void saveDocument(store, platform)}>Save</button>
      <button type="button" onClick={() => void saveDocument(store, platform, { as: true })}>Save As</button>
      <span className="arq-toolbar-sep" />
      <button type="button" disabled={!canUndo} onClick={() => store.getState().undo()}>Undo</button>
      <button type="button" disabled={!canRedo} onClick={() => store.getState().redo()}>Redo</button>
      <span className="arq-toolbar-title" data-testid="title">{title}{dirty ? " *" : ""}</span>
      {error ? (
        <div className="arq-toolbar-error" role="alert">
          Could not open file: {error.slice(0, 3).join("; ")}{error.length > 3 ? ` (+${error.length - 3} more)` : ""}
          <button type="button" onClick={() => setError(null)}>Dismiss</button>
        </div>
      ) : null}
    </>
  );
}
