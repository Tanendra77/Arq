import { useEffect, useMemo, useRef, useState } from "react";
import { useEditor, useEditorStore, usePlatform } from "../store/context";
import {
  DEFAULT_EXPORT, exportDiagram, exportFileName, fileSlug, isRecording, recordingLength, renderExport, type ExportOptions,
} from "../commands/export-commands";
import { reportCommandError } from "../commands/file-commands";
import { parseEndpointNodeId } from "../flow/endpoint-id";
import { createIconResolver } from "../icons/resolver";
import { useSettings } from "./SettingsModal";
import { isDarkTheme } from "../settings";
import { NumberField, TextField } from "./inspector/Field";

const FORMAT_NAMES = { png: "PNG", svg: "SVG", "animated-svg": "animated SVG", gif: "GIF", mp4: "MP4" } as const;

/** A row of mutually exclusive buttons: a lighter radio group. */
function Choice<T extends string | number>({
  label, value, options, onChange,
}: {
  label: string;
  value: T;
  options: readonly { value: T; label: string; title?: string; disabled?: boolean }[];
  onChange: (v: T) => void;
}) {
  return (
    <div className="arq-field">
      <span>{label}</span>
      <div className="arq-choice" role="group" aria-label={label}>
        {options.map((o) => (
          <button
            key={String(o.value)}
            type="button"
            aria-pressed={o.value === value}
            disabled={o.disabled}
            title={o.title}
            onClick={() => onChange(o.value)}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

/**
 * The export at full size over the whole window: fitted to the screen, or at its real pixel size to
 * check the detail. Escape or a click outside the image closes it and returns to the dialog.
 */
function FullPreview({ url, width, height, onClose }: { url: string; width: number; height: number; onClose: () => void }) {
  const [actual, setActual] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => ref.current?.focus(), []);
  return (
    <div
      ref={ref}
      className="arq-export-full"
      role="dialog"
      aria-label="Export preview, full size"
      tabIndex={-1}
      onClick={onClose}
      onKeyDown={(e) => {
        if (e.key !== "Escape") return;
        e.stopPropagation(); // close the preview, not the export dialog behind it
        onClose();
      }}
    >
      <div className="arq-export-full-bar" onClick={(e) => e.stopPropagation()}>
        <span>{width} × {height}</span>
        <button type="button" aria-pressed={!actual} onClick={() => setActual(false)}>Fit</button>
        <button type="button" aria-pressed={actual} onClick={() => setActual(true)}>100%</button>
        <button type="button" onClick={onClose}>Close</button>
      </div>
      <div className={`arq-export-full-stage${actual ? " actual" : ""}`}>
        <img src={url} alt="Export preview, full size" onClick={(e) => e.stopPropagation()}
          style={actual ? { width, height } : undefined} />
      </div>
    </div>
  );
}

function ExportBody({ onClose }: { onClose: () => void }) {
  const store = useEditorStore();
  const platform = usePlatform();
  const doc = useEditor((s) => s.document);
  const selection = useEditor((s) => s.selection);
  const [settings] = useSettings();
  const resolveIcon = useMemo(() => createIconResolver([]), []);
  const hasSelection = selection.nodes.some((id) => parseEndpointNodeId(id) === null) || selection.edges.length > 0;

  const [o, setO] = useState<ExportOptions>(() => ({
    ...DEFAULT_EXPORT,
    name: fileSlug(doc.title),
    area: hasSelection ? "selection" : "all",
    // The export starts in the theme on screen, so the text is the colour it was when you wrote it.
    theme: isDarkTheme(settings.theme) ? "dark" : "light",
    grid: { variant: settings.grid === "off" ? "dots" : settings.grid, size: settings.gridSize },
  }));
  const set = (patch: Partial<ExportOptions>) => setO((prev) => ({ ...prev, ...patch }));
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [previewing, setPreviewing] = useState(false);

  // The preview is the export itself, font embedded, so what is shown is what is written.
  const out = useMemo(() => renderExport(doc, selection, o, resolveIcon), [doc, selection, o, resolveIcon]);
  const previewUrl = useMemo(() => URL.createObjectURL(new Blob([out.svg], { type: "image/svg+xml" })), [out.svg]);
  useEffect(() => () => URL.revokeObjectURL(previewUrl), [previewUrl]);

  const raster = o.format === "png" || isRecording(o.format);
  const px = (n: number) => Math.ceil(n * (raster ? o.scale : 1));
  const recording = isRecording(o.format) ? recordingLength(out.target, o) : null;
  const empty = (o.area === "all" ? doc.nodes.length + doc.edges.length : Number(hasSelection)) === 0;

  const run = () => {
    setBusy(true);
    exportDiagram(store, platform, resolveIcon, o, (done, total) => setProgress({ done, total }))
      .then(onClose)
      .catch((e: unknown) => reportCommandError(store, e))
      .finally(() => {
        setBusy(false);
        setProgress(null);
      });
  };

  return (
    <>
      <h2 id="arq-export-title">Export</h2>
      <div className="arq-export-preview" data-testid="export-preview">
        <img src={previewUrl} alt="Export preview" />
        <button type="button" className="arq-export-expand" onClick={() => setPreviewing(true)} title="See it full size">
          ⤢ Preview
        </button>
      </div>
      {previewing ? (
        <FullPreview
          url={previewUrl}
          width={px(out.width)}
          height={px(out.height)}
          onClose={() => setPreviewing(false)}
        />
      ) : null}
      <TextField label="File name" value={o.name} onChange={(v) => set({ name: v })} />
      <Choice label="Format" value={o.format} onChange={(v) => set({ format: v })} options={[
        { value: "png", label: "PNG", title: "A still image — for documents, slides and chat" },
        { value: "svg", label: "SVG", title: "A still vector — sharp at any size" },
        { value: "animated-svg", label: "Animated SVG", title: "Vector that plays its animations by itself, in any browser" },
        { value: "gif", label: "GIF", title: "An animated image that plays almost anywhere, chat and email included" },
        { value: "mp4", label: "MP4", title: "A video of the animation — for slides and screen recordings" },
      ]} />
      <Choice label="Background" value={o.background} onChange={(v) => set({ background: v })} options={[
        { value: "solid", label: "Plain", title: "The canvas colour" },
        { value: "transparent", label: "Transparent", title: "No background at all" },
        { value: "grid", label: "Grid", title: "The canvas colour with its grid pattern" },
      ]} />
      <Choice label="Theme" value={o.theme} onChange={(v) => set({ theme: v })} options={[
        { value: "light", label: "Light", title: "Dark text on a light canvas" },
        { value: "dark", label: "Dark", title: "Light text on a dark canvas, as the editor's dark theme shows it" },
      ]} />
      <Choice label="Area" value={o.area} onChange={(v) => set({ area: v })} options={[
        { value: "all", label: "Whole diagram" },
        { value: "selection", label: "Selection", disabled: !hasSelection, title: hasSelection ? "Only what is selected" : "Select something first" },
      ]} />
      <div className="arq-field-pair">
        <NumberField label="Padding" value={o.padding} min={0} step={10}
          onChange={(v) => set({ padding: Math.max(0, Math.min(400, v)) })} />
        {raster ? (
          <Choice label="Size" value={o.scale} onChange={(v) => set({ scale: v })} options={[
            { value: 1, label: "1x" }, { value: 2, label: "2x" }, { value: 3, label: "3x" }, { value: 4, label: "4x" },
          ]} />
        ) : null}
      </div>
      {recording ? (
        <div className="arq-field-pair">
          <Choice label="Frame rate" value={o.fps} onChange={(v) => set({ fps: v })} options={[
            { value: 12, label: "12" }, { value: 20, label: "20" }, { value: 30, label: "30" },
          ]} />
          <NumberField label="Length (s, 0 = one loop)" value={o.seconds} min={0} step={0.5}
            onChange={(v) => set({ seconds: Math.max(0, Math.min(30, v)) })} />
        </div>
      ) : null}
      <p className="arq-export-meta" data-testid="export-size">
        {exportFileName(o.name, doc.title, o.format)} · {px(out.width)} × {px(out.height)} {raster ? "px" : "units"}
        {recording ? ` · ${recording.seconds}s, ${recording.frames} frames` : ""}
      </p>
      {progress ? (
        <p className="arq-export-meta" role="status" data-testid="export-progress">
          Recording frame {progress.done} of {progress.total}…
        </p>
      ) : null}
      <div className="arq-modal-actions">
        <button type="button" onClick={onClose}>Cancel</button>
        <button type="button" className="primary" onClick={run} disabled={busy || empty}>
          {busy ? "Exporting…" : `Export ${FORMAT_NAMES[o.format]}`}
        </button>
      </div>
    </>
  );
}

/**
 * One Export button's dialog: pick the format, name the file, choose the background, the area and
 * the size, and see the result before writing it.
 */
export function ExportDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (open) ref.current?.focus();
  }, [open]);
  if (!open) return null;
  return (
    <div className="arq-modal-backdrop" onClick={onClose}>
      <div
        ref={ref}
        className="arq-modal arq-export"
        role="dialog"
        aria-modal="true"
        aria-labelledby="arq-export-title"
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          e.stopPropagation(); // typing a name must not reach the canvas shortcuts
          if (e.key === "Escape") onClose();
        }}
      >
        {/* Mounted per opening, so every export starts from the current title and selection. */}
        <ExportBody onClose={onClose} />
      </div>
    </div>
  );
}
