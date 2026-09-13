import { useMemo, useState } from "react";
import { useEditor, useEditorStore, usePlatform } from "../store/context";
import { confirmDiscard, newDocument, openDocument, reportCommandError, saveDocument } from "../commands/file-commands";
import { exportPng, exportSvg } from "../commands/export-commands";
import { createIconResolver } from "../icons/resolver";
import { SettingsModal, useSettings } from "./SettingsModal";
import { EDITOR_VIEWS } from "../settings";

const VIEW_LABELS = { canvas: "Canvas", split: "Split", json: "JSON" } as const;

export function Toolbar() {
  const store = useEditorStore();
  const platform = usePlatform();
  const [scale, setScale] = useState<1 | 2 | 3>(2);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const resolveIcon = useMemo(() => createIconResolver([]), []);
  const title = useEditor((s) => s.document.title);
  const dirty = useEditor((s) => s.dirty);
  const canUndo = useEditor((s) => s.past.length > 0);
  const canRedo = useEditor((s) => s.future.length > 0);
  const notice = useEditor((s) => s.notice);
  const [settings, setSettings] = useSettings();

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
      <span className="arq-toolbar-sep" />
      <button type="button" onClick={() => void exportSvg(store, platform, resolveIcon).catch((e: unknown) => reportCommandError(store, e))}>Export SVG</button>
      <select aria-label="PNG scale" value={scale} onChange={(e) => setScale(Number(e.target.value) as 1 | 2 | 3)}>
        <option value={1}>1x</option><option value={2}>2x</option><option value={3}>3x</option>
      </select>
      <button type="button" onClick={() => void exportPng(store, platform, resolveIcon, scale).catch((e: unknown) => reportCommandError(store, e))}>Export PNG</button>
      <span className="arq-toolbar-sep" />
      <button type="button" onClick={() => setSettingsOpen(true)}>Settings</button>
      <span className="arq-toolbar-sep" />
      <span className="arq-view-switch" role="group" aria-label="View">
        {EDITOR_VIEWS.map((v) => (
          <button key={v} type="button" aria-pressed={settings.editorView === v} onClick={() => setSettings({ editorView: v })}>
            {VIEW_LABELS[v]}
          </button>
        ))}
      </span>
      <SettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} />
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
