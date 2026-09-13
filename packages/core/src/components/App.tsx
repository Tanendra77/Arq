import { lazy, Suspense, type CSSProperties } from "react";
import { Canvas } from "./Canvas";
import { Inspector } from "./Inspector";
import { Palette } from "./Palette";
import { Toolbar } from "./Toolbar";
import { useSettings } from "./SettingsModal";
import { DEFAULT_SETTINGS, PANEL_LIMITS, SPLIT_LIMITS } from "../settings";

type PanelKey = keyof typeof PANEL_LIMITS;

// CodeMirror and the JSON tooling load only when the JSON view is first opened.
const JsonPanel = lazy(() => import("../json/JsonPanel"));

/**
 * The drag handle on a side panel's inner edge. Pointer-drag to resize, arrow keys to step,
 * double-click to put it back. The width is remembered per machine, like the other view settings.
 */
function Splitter({ panel, label }: { panel: PanelKey; label: string }) {
  const [settings, setSettings] = useSettings();
  const width = settings[panel];
  const { min, max } = PANEL_LIMITS[panel];
  // The palette grows as the handle moves right; the inspector, on the other side, as it moves left.
  const sign = panel === "paletteWidth" ? 1 : -1;
  const set = (w: number) => setSettings({ [panel]: Math.round(Math.min(max, Math.max(min, w))) });

  return (
    <div
      className={`arq-splitter arq-splitter-${panel === "paletteWidth" ? "left" : "right"}`}
      role="separator"
      aria-orientation="vertical"
      aria-label={label}
      aria-valuenow={width}
      aria-valuemin={min}
      aria-valuemax={max}
      tabIndex={0}
      onPointerDown={(e) => {
        if (e.button !== 0) return;
        e.preventDefault(); // no text selection sweeping across the panels
        // Followed on the window, not by pointer capture: the handle moves as the panel resizes under
        // it, and Chromium drops the capture as soon as the layout shifts beneath the pointer.
        const el = e.currentTarget;
        const x0 = e.clientX;
        const w0 = width;
        el.classList.add("dragging");
        const move = (ev: PointerEvent) => set(w0 + sign * (ev.clientX - x0));
        const up = () => {
          el.classList.remove("dragging");
          window.removeEventListener("pointermove", move);
          window.removeEventListener("pointerup", up);
        };
        window.addEventListener("pointermove", move);
        window.addEventListener("pointerup", up);
      }}
      onDoubleClick={() => set(DEFAULT_SETTINGS[panel])}
      onKeyDown={(e) => {
        if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
        e.preventDefault();
        e.stopPropagation(); // not a nudge of the selected shapes
        set(width + (e.key === "ArrowRight" ? 16 : -16) * sign);
      }}
    />
  );
}

/**
 * The bar between the canvas and the JSON in the split view. Drag to share the width differently,
 * arrow keys to step, double-click for half and half.
 */
function SplitDivider() {
  const [settings, setSettings] = useSettings();
  const set = (r: number) => setSettings({ splitRatio: Math.round(Math.min(SPLIT_LIMITS.max, Math.max(SPLIT_LIMITS.min, r)) * 1000) / 1000 });
  return (
    <div
      className="arq-split-divider"
      role="separator"
      aria-orientation="vertical"
      aria-label="Resize canvas and JSON"
      aria-valuenow={Math.round(settings.splitRatio * 100)}
      aria-valuemin={SPLIT_LIMITS.min * 100}
      aria-valuemax={SPLIT_LIMITS.max * 100}
      tabIndex={0}
      onPointerDown={(e) => {
        if (e.button !== 0) return;
        e.preventDefault();
        const el = e.currentTarget;
        const main = el.parentElement!.getBoundingClientRect();
        el.classList.add("dragging");
        const move = (ev: PointerEvent) => set((ev.clientX - main.left) / main.width);
        const up = () => {
          el.classList.remove("dragging");
          window.removeEventListener("pointermove", move);
          window.removeEventListener("pointerup", up);
        };
        window.addEventListener("pointermove", move);
        window.addEventListener("pointerup", up);
      }}
      onDoubleClick={() => set(DEFAULT_SETTINGS.splitRatio)}
      onKeyDown={(e) => {
        if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
        e.preventDefault();
        e.stopPropagation();
        set(settings.splitRatio + (e.key === "ArrowRight" ? 0.05 : -0.05));
      }}
    />
  );
}

export function App() {
  const [settings] = useSettings();
  const widths = {
    "--arq-left": `${settings.paletteWidth}px`,
    "--arq-right": `${settings.inspectorWidth}px`,
    "--arq-split": settings.splitRatio,
  } as CSSProperties;
  return (
    <div className="arq-app" style={widths}>
      <header className="arq-toolbar" data-testid="toolbar"><Toolbar /></header>
      <aside className="arq-palette" data-testid="palette"><Palette /></aside>
      <main className={`arq-main view-${settings.editorView}`}>
        {/* The canvas stays mounted in the JSON view — hidden, not unmounted — so its shortcuts and
            viewport carry on and switching back is instant. */}
        <div className="arq-main-canvas"><Canvas /></div>
        {settings.editorView === "split" ? <SplitDivider /> : null}
        {settings.editorView !== "canvas" ? (
          <Suspense fallback={<div className="arq-json" aria-busy="true" />}>
            <JsonPanel />
          </Suspense>
        ) : null}
      </main>
      <aside className="arq-inspector" data-testid="inspector"><Inspector /></aside>
      <Splitter panel="paletteWidth" label="Resize shapes panel" />
      <Splitter panel="inspectorWidth" label="Resize inspector" />
    </div>
  );
}
