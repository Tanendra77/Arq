import { useEditor, useEditorStore, usePlatform } from "../store/context";
import { confirmDiscard, newDocument, openDocument, reportCommandError, saveDocument } from "../commands/file-commands";

export function Toolbar() {
  const store = useEditorStore();
  const platform = usePlatform();
  const title = useEditor((s) => s.document.title);
  const dirty = useEditor((s) => s.dirty);
  const canUndo = useEditor((s) => s.past.length > 0);
  const canRedo = useEditor((s) => s.future.length > 0);
  const notice = useEditor((s) => s.notice);

  const open = () => {
    if (!confirmDiscard(store)) return;
    void openDocument(store, platform)
      .then((r) => {
        if (!r.ok && "errors" in r) store.getState().setNotice(r.errors);
      })
      .catch((e: unknown) => reportCommandError(store, e));
  };

  const save = (as: boolean) => {
    void saveDocument(store, platform, { as }).catch((e: unknown) => reportCommandError(store, e));
  };

  return (
    <>
      <button type="button" onClick={() => confirmDiscard(store) && newDocument(store)}>New</button>
      <button type="button" onClick={open}>Open</button>
      <button type="button" onClick={() => save(false)}>Save</button>
      <button type="button" onClick={() => save(true)}>Save As</button>
      <span className="arq-toolbar-sep" />
      <button type="button" disabled={!canUndo} onClick={() => store.getState().undo()}>Undo</button>
      <button type="button" disabled={!canRedo} onClick={() => store.getState().redo()}>Redo</button>
      <span className="arq-toolbar-title" data-testid="title">{title}{dirty ? " *" : ""}</span>
      {/* The notice carries save and other command failures as well as open errors, so the banner
          no longer prefixes "Could not open file"; each line describes itself. */}
      {notice ? (
        <div className="arq-toolbar-error" role="alert">
          {notice.slice(0, 3).join("; ")}{notice.length > 3 ? ` (+${notice.length - 3} more)` : ""}
          <button type="button" onClick={() => store.getState().setNotice(null)}>Dismiss</button>
        </div>
      ) : null}
    </>
  );
}
