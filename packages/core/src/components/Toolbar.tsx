import { useState } from "react";
import { useEditor, useEditorStore, usePlatform } from "../store/context";
import { confirmDiscard, newDocument, openDocument, reportCommandError, saveDocument } from "../commands/file-commands";
import { SettingsModal, useSettings } from "./SettingsModal";
import { ExportDialog } from "./ExportDialog";
import { EDITOR_VIEWS } from "../settings";

/** Toolbar glyphs, drawn in the current text colour so they follow the theme. */
const Icon = ({ d }: { d: string }) => (
  <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth={1.8}
    strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d={d} />
  </svg>
);

const GEAR =
  "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z";

/** The three views, each with the icon shown and the tooltip that says what it is for. */
const VIEWS = {
  canvas: { label: "Canvas", title: "Canvas — draw on the diagram", d: "M4 4h16v16H4z M8 14l3-3 2 2 3-4" },
  split: { label: "Split", title: "Split — canvas and JSON side by side", d: "M4 4h16v16H4z M12 4v16" },
  json: { label: "JSON", title: "JSON — edit the diagram as text", d: "M9 4H8a2 2 0 0 0-2 2v4l-2 2 2 2v4a2 2 0 0 0 2 2h1 M15 4h1a2 2 0 0 1 2 2v4l2 2-2 2v4a2 2 0 0 1-2 2h-1" },
} as const;

const UNDO_ICON = "M9 14 4 9l5-5 M4 9h10.5a5.5 5.5 0 0 1 0 11H11";
const REDO_ICON = "M15 14l5-5-5-5 M20 9H9.5a5.5 5.5 0 0 0 0 11H13";
const EXPORT_ICON = "M12 4v11 M7 10l5 5 5-5 M5 20h14";

export function Toolbar() {
  const store = useEditorStore();
  const platform = usePlatform();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
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
      <button type="button" className="arq-toolbar-icon" aria-label="Undo" title="Undo (Ctrl+Z)" disabled={!canUndo}
        onClick={() => store.getState().undo()}>
        <Icon d={UNDO_ICON} />
      </button>
      <button type="button" className="arq-toolbar-icon" aria-label="Redo" title="Redo (Ctrl+Y)" disabled={!canRedo}
        onClick={() => store.getState().redo()}>
        <Icon d={REDO_ICON} />
      </button>
      <span className="arq-toolbar-sep" />
      <button type="button" className="arq-toolbar-labelled" onClick={() => setExportOpen(true)} title="Export as PNG or SVG">
        <Icon d={EXPORT_ICON} /> Export
      </button>
      <ExportDialog open={exportOpen} onClose={() => setExportOpen(false)} />
      <span className="arq-toolbar-sep" />
      <span className="arq-view-switch" role="group" aria-label="View">
        {EDITOR_VIEWS.map((v) => (
          <button key={v} type="button" className="arq-toolbar-icon" aria-label={VIEWS[v].label} title={VIEWS[v].title}
            aria-pressed={settings.editorView === v} onClick={() => setSettings({ editorView: v })}>
            <Icon d={VIEWS[v].d} />
          </button>
        ))}
      </span>
      <button type="button" className="arq-toolbar-icon" aria-label="Settings" title="Settings" onClick={() => setSettingsOpen(true)}>
        <Icon d={GEAR} />
      </button>
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
