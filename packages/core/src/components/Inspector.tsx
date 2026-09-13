import { useEffect, useState } from "react";
import {
  ANIMATION_DIRECTIONS, ANIMATION_SPEEDS, ARROW_STYLES, DASH_STYLES, LABEL_POSITIONS,
  type ArqEdge, type ArqNode, type Animation, type AnimationDirection, type AnimationSpeed,
  type ArrowStyle, type DashStyle,
  type LabelPosition, type Routing,
} from "@arq/schema";
import { resolveEdgeStyle, resolveNodeStyle, STYLE_DEFAULTS } from "@arq/render";
import { useEditor, useEditorStore } from "../store/context";
import type { StylePatch } from "../store/editor-store";
import { CheckboxField, ColorField, NumberField, TextField } from "./inspector/Field";
import {
  IconChoice, alignGlyph, animateGlyph, arrowGlyph, backgroundGlyph, dashGlyph, directionGlyph,
  labelPosGlyph, rotateGlyph, routingGlyph, sketchGlyph, speedGlyph,
} from "./inspector/IconChoice";
import { useSettings } from "./SettingsModal";
import type { Settings } from "../settings";

const TEXT_ALIGNMENTS = ["left", "center", "right"] as const;
/** rough.js roughness, named for what it looks like rather than by its number. 0 draws the exact
 *  geometric shape; 1 is the default, and is what makes a fresh diagram read as hand-drawn. */
const SKETCH_LEVELS = ["clean", "sketch", "rough"] as const;
type SketchLevel = (typeof SKETCH_LEVELS)[number];
const SKETCH_ROUGHNESS: Record<SketchLevel, number> = { clean: 0, sketch: 1, rough: 2 };
const sketchLevelOf = (r: number): SketchLevel => (r === 0 ? "clean" : r <= 1 ? "sketch" : "rough");

/**
 * The option tables the icon rows are built from. Every glyph is generated once, at module load,
 * from @arq/render's own geometry — a routing icon is drawn by the router, a sketch icon by
 * rough.js at that exact roughness — so an icon cannot come to mean something the editor no
 * longer does. `title` is the accessible name as well as the tooltip.
 */
const ROUTING_OPTIONS = [
  { value: "straight", title: "Direct", glyph: routingGlyph("straight") },
  { value: "curved", title: "Curved", glyph: routingGlyph("curved") },
  { value: "orthogonal", title: "Right angles", glyph: routingGlyph("orthogonal") },
] as const satisfies readonly { value: Routing; title: string; glyph: string }[];

const ARROW_TITLES: Record<ArrowStyle, string> = {
  none: "None", arrow: "Arrow", triangle: "Triangle", diamond: "Diamond", circle: "Circle",
};
const END_ARROW_OPTIONS = ARROW_STYLES.map((a) => ({
  value: a, title: `End: ${ARROW_TITLES[a]}`, glyph: arrowGlyph(a),
}));
/** The same heads mirrored, so the row reads as "this end of the line". */
const START_ARROW_OPTIONS = ARROW_STYLES.map((a) => ({
  value: a,
  title: `Start: ${ARROW_TITLES[a]}`,
  glyph: arrowGlyph(a).replace("<svg ", '<svg style="transform:scaleX(-1)" '),
}));

const DASH_TITLES: Record<DashStyle, string> = { solid: "Solid", dashed: "Dashed", dotted: "Dotted" };
const DASH_OPTIONS = DASH_STYLES.map((d) => ({ value: d, title: DASH_TITLES[d], glyph: dashGlyph(d) }));

const SKETCH_TITLES: Record<SketchLevel, string> = { clean: "Solid", sketch: "Sketch", rough: "Rough" };
const SKETCH_OPTIONS = SKETCH_LEVELS.map((l) => ({
  value: l, title: SKETCH_TITLES[l], glyph: sketchGlyph(SKETCH_ROUGHNESS[l]),
}));

const EDGE_ANIMATE_OPTIONS = [
  { value: "none", title: "Still", glyph: animateGlyph("none") },
  { value: "flow", title: "Flowing dashes", glyph: animateGlyph("flow") },
  { value: "packets", title: "Moving packets", glyph: animateGlyph("packets") },
  { value: "pulse", title: "Pulse", glyph: animateGlyph("pulse") },
] as const satisfies readonly { value: Animation; title: string; glyph: string }[];

const NODE_ANIMATE_OPTIONS = [
  { value: "none", title: "Still", glyph: animateGlyph("none") },
  { value: "flow", title: "Marching border", glyph: animateGlyph("flow") },
  { value: "pulse", title: "Pulse", glyph: animateGlyph("pulse") },
] as const satisfies readonly { value: Animation; title: string; glyph: string }[];

const SPEED_TITLES: Record<AnimationSpeed, string> = { slow: "Slow", normal: "Normal", fast: "Fast" };
const SPEED_OPTIONS = ANIMATION_SPEEDS.map((v) => ({ value: v, title: SPEED_TITLES[v], glyph: speedGlyph(v) }));

const DIRECTION_TITLES: Record<AnimationDirection, string> = { forward: "Forward", reverse: "Reverse" };
const DIRECTION_OPTIONS = ANIMATION_DIRECTIONS.map((v) => ({
  value: v, title: DIRECTION_TITLES[v], glyph: directionGlyph(v),
}));

/**
 * The animation tab's shared body: what moves, how fast, which way, and glow.
 *
 * Speed and direction are hidden while nothing is animating — they would be controls with no
 * effect, and the panel is better for not carrying them.
 */
function AnimationFields({
  animate, speed, direction, options, glowOn, glowColor, patch,
}: {
  animate: Animation | undefined;
  speed: AnimationSpeed | undefined;
  direction: AnimationDirection | undefined;
  options: readonly { value: Animation; title: string; glyph: string }[];
  glowOn: boolean | undefined;
  glowColor: string | undefined;
  patch: (p: StylePatch, mergeKey?: string) => void;
}) {
  return (
    <>
      <IconChoice label="Motion" value={animate} indeterminate={animate === undefined}
        options={options} onChange={(v) => patch({ animate: v })} />
      {animate !== "none" ? (
        <>
          <IconChoice label="Speed" value={speed} indeterminate={speed === undefined}
            options={SPEED_OPTIONS} onChange={(v) => patch({ animateSpeed: v })} />
          <IconChoice label="Direction" value={direction} indeterminate={direction === undefined}
            options={DIRECTION_OPTIONS} onChange={(v) => patch({ animateDirection: v })} />
        </>
      ) : null}
      <GlowFields
        on={glowOn}
        color={glowColor}
        onToggle={(checked) => patch({ glow: checked ? { color: glowColor ?? DEFAULT_GLOW_COLOR } : undefined })}
        onColor={(v) => patch({ glow: { color: v } }, "style:glow")}
      />
    </>
  );
}

/** Quarter turns plus the upright default; anything else goes in the degrees field beside it. */
const ROTATE_OPTIONS = [0, 45, 90, 180].map((d) => ({
  value: String(d),
  title: d === 0 ? "Upright" : `${d}°`,
  glyph: rotateGlyph(d),
}));

const LABEL_POS_TITLES: Record<LabelPosition, string> = { start: "Near start", middle: "Middle", end: "Near end" };
const LABEL_POS_OPTIONS = LABEL_POSITIONS.map((p) => ({
  value: p, title: LABEL_POS_TITLES[p], glyph: labelPosGlyph(p),
}));

const BACKGROUND_OPTIONS = [
  { value: "off", title: "Plain", glyph: backgroundGlyph("off") },
  { value: "dots", title: "Dots", glyph: backgroundGlyph("dots") },
  { value: "lines", title: "Grid", glyph: backgroundGlyph("lines") },
  { value: "cross", title: "Crosses", glyph: backgroundGlyph("cross") },
] as const satisfies readonly { value: Settings["grid"]; title: string; glyph: string }[];

const PANEL_TABS = ["Style", "Animation"] as const;
type PanelTab = (typeof PANEL_TABS)[number];

const ALIGN_TITLES = { left: "Left", center: "Centre", right: "Right" } as const;
const ALIGN_OPTIONS = TEXT_ALIGNMENTS.map((a) => ({ value: a, title: ALIGN_TITLES[a], glyph: alignGlyph(a) }));
// The starting color the first time a selection's glow is switched on (no prior color to reuse).
// Matches the editor's own accent color (--arq-accent in styles.css).
const DEFAULT_GLOW_COLOR = "#00c895";

/** The shared value across a selection, or undefined when they disagree. Returning the first
 *  element's value instead would misrepresent every other selected element. */
export function commonValue<T>(values: T[]): T | undefined {
  const [first, ...rest] = values;
  return rest.every((v) => v === first) ? first : undefined;
}

/**
 * Keeps the canvas surface (`--arq-canvas-bg` in styles.css) in sync with the document's own
 * `canvasBackground` field, whichever panel the Inspector currently shows. Mounted once at the
 * Inspector's top level (not inside `DocumentPanel`) so the canvas still reflects the document's
 * value even while a selection panel is displayed instead.
 */
function useSyncCanvasBackground(canvasBackground: string | undefined): void {
  useEffect(() => {
    if (canvasBackground !== undefined) {
      document.documentElement.style.setProperty("--arq-canvas-bg", canvasBackground);
    } else {
      document.documentElement.style.removeProperty("--arq-canvas-bg");
    }
  }, [canvasBackground]);
}

/**
 * What you get with nothing selected: the canvas itself.
 *
 * Two kinds of thing share the panel, which is why they are captioned apart. The title and the
 * background colour belong to the *document* — they travel with the file and land in an export.
 * The pattern, grid and rulers are *this machine's* view of it: they are preferences, they are
 * never serialized, and turning on rulers must not mark the document dirty or push an undo entry.
 * Keeping them here rather than behind the Settings button puts them where their effect is.
 */
function DocumentPanel() {
  const store = useEditorStore();
  const title = useEditor((s) => s.document.title);
  const canvasBackground = useEditor((s) => s.document.canvasBackground);
  const [settings, setSettingsPatch] = useSettings();

  return (
    <div className="arq-inspector-inner">
      <h3>Canvas</h3>
      <TextField
        label="Title"
        value={title}
        onChange={(v) => store.getState().mutate("set title", (d) => { d.title = v; })}
      />
      <ColorField
        label="Background colour"
        value={canvasBackground ?? STYLE_DEFAULTS.canvasBackground}
        onChange={(v) => store.getState().mutate(
          "set canvas background",
          (d) => { d.canvasBackground = v; },
          { mergeKey: "canvasBackground" },
        )}
      />

      <h4 className="arq-panel-section">View · this machine</h4>
      <IconChoice label="Pattern" value={settings.grid} options={BACKGROUND_OPTIONS}
        onChange={(v) => setSettingsPatch({ grid: v })} />
      <div className="arq-field-pair">
        <NumberField label="Grid size" value={settings.gridSize} min={2} step={1}
          onChange={(v) => setSettingsPatch({ gridSize: v })} />
      </div>
      <CheckboxField label="Snap to grid" checked={settings.snap}
        onChange={(v) => setSettingsPatch({ snap: v })} />
      <CheckboxField label="Rulers" checked={settings.rulers}
        onChange={(v) => setSettingsPatch({ rulers: v })} />
      <CheckboxField label="Minimap" checked={settings.minimap}
        onChange={(v) => setSettingsPatch({ minimap: v })} />
    </div>
  );
}

/**
 * Style and Animation live on separate tabs.
 *
 * Both panels had grown past a screenful, and the two groups are used at different moments — you
 * style a diagram while building it and animate it when explaining it — so paging between them
 * costs nothing and keeps either list short enough to scan.
 */
function PanelTabs({ tab, onTab }: { tab: PanelTab; onTab: (t: PanelTab) => void }) {
  return (
    <div className="arq-panel-tabs" role="tablist">
      {PANEL_TABS.map((t) => (
        <button
          key={t}
          type="button"
          role="tab"
          aria-selected={tab === t}
          className={tab === t ? "active" : undefined}
          onClick={() => onTab(t)}
        >
          {t}
        </button>
      ))}
    </div>
  );
}

function GlowFields({
  on, color, onToggle, onColor,
}: {
  on: boolean | undefined; color: string | undefined;
  onToggle: (v: boolean) => void; onColor: (v: string) => void;
}) {
  return (
    <>
      <CheckboxField label="Glow" checked={on === true} indeterminate={on === undefined} onChange={onToggle} />
      {on === true ? (
        <ColorField label="Glow color" value={color} indeterminate={color === undefined} onChange={onColor} />
      ) : null}
    </>
  );
}

function NodePanel({ nodes }: { nodes: ArqNode[] }) {
  const store = useEditorStore();
  const ids = nodes.map((n) => n.id);
  const resolved = nodes.map((n) => resolveNodeStyle(n.style));
  const allRect = nodes.every((n) => n.shape === "rect");
  // Polygons and stars share the one `sides` field; the caption says which it means for this set.
  const allSided = nodes.every((n) => n.shape === "polygon" || n.shape === "star");
  const allStars = nodes.every((n) => n.shape === "star");
  // A pen stroke is ink in the line colour: fill, dash, sketch level and text mean nothing for it.
  const allInk = nodes.every((n) => n.shape === "freehand");
  const only = nodes.length === 1 ? nodes[0] : undefined;

  const fill = commonValue(resolved.map((r) => r.fill));
  const stroke = commonValue(resolved.map((r) => r.stroke));
  const strokeWidth = commonValue(resolved.map((r) => r.strokeWidth));
  const strokeDash = commonValue(resolved.map((r) => r.strokeDash));
  const radius = allRect ? commonValue(resolved.map((r) => r.radius)) : undefined;
  const sides = allSided
    ? commonValue(nodes.map((n, i) => resolved[i]!.sides ?? (n.shape === "star" ? 5 : 6)))
    : undefined;
  const fontSize = commonValue(resolved.map((r) => r.fontSize));
  const textAlign = commonValue(resolved.map((r) => r.textAlign));
  const rotate = commonValue(resolved.map((r) => r.rotate));
  const animate = commonValue(resolved.map((r) => r.animate));
  const speed = commonValue(resolved.map((r) => r.animateSpeed));
  const direction = commonValue(resolved.map((r) => r.animateDirection));
  const roughness = commonValue(resolved.map((r) => r.roughness));
  const glowOn = commonValue(resolved.map((r) => r.glow !== undefined));
  const glowColor = glowOn === true ? commonValue(resolved.flatMap((r) => (r.glow ? [r.glow.color] : []))) : undefined;

  const patch = (p: StylePatch, mergeKey?: string) =>
    store.getState().setStyle(ids, p, mergeKey !== undefined ? { mergeKey } : undefined);

  const [tab, setTab] = useState<PanelTab>("Style");

  return (
    <div className="arq-inspector-inner">
      <h3>{nodes.length === 1 ? "Shape" : `${nodes.length} shapes`}</h3>
      <PanelTabs tab={tab} onTab={setTab} />
      {tab === "Animation" ? (
        <AnimationFields
          animate={animate} speed={speed} direction={direction} options={NODE_ANIMATE_OPTIONS}
          glowOn={glowOn} glowColor={glowColor} patch={patch}
        />
      ) : (
        <>
      <div className="arq-field-pair">
        {!allInk ? (
          <ColorField label="Fill" value={fill} indeterminate={fill === undefined}
            onChange={(v) => patch({ fill: v }, "style:fill")} />
        ) : null}
        <ColorField label={allInk ? "Ink" : "Line"} value={stroke} indeterminate={stroke === undefined}
          onChange={(v) => patch({ stroke: v }, "style:stroke")} />
        <NumberField label="Width" value={strokeWidth} indeterminate={strokeWidth === undefined} min={0.5} step={0.5}
          onChange={(v) => patch({ strokeWidth: v }, "style:strokeWidth")} />
      </div>
      {allSided ? (
        <div className="arq-field-pair">
          <NumberField label={allStars ? "Points" : "Sides"} value={sides} indeterminate={sides === undefined}
            min={3} step={1} onChange={(v) => patch({ sides: Math.min(24, Math.round(v)) }, "style:sides")} />
        </div>
      ) : null}
      {!allInk ? (
        <>
          <IconChoice label="Stroke" value={strokeDash} indeterminate={strokeDash === undefined}
            options={DASH_OPTIONS} onChange={(v) => patch({ strokeDash: v })} />
          <IconChoice label="Style" value={roughness === undefined ? undefined : sketchLevelOf(roughness)}
            indeterminate={roughness === undefined} options={SKETCH_OPTIONS}
            onChange={(v) => patch({ roughness: SKETCH_ROUGHNESS[v] })} />
        </>
      ) : null}
      {allRect ? (
        <NumberField label="Corner radius" value={radius} indeterminate={radius === undefined} min={0} step={1}
          onChange={(v) => patch({ radius: v }, "style:radius")} />
      ) : null}
      {!allInk ? (
        <>
          {only ? (
            <TextField label="Label" value={only.label} onChange={(v) => store.getState().setLabel(only.id, v)} />
          ) : null}
          <div className="arq-field-pair">
            <NumberField label="Text size" value={fontSize} indeterminate={fontSize === undefined} min={8} step={1}
              onChange={(v) => patch({ fontSize: v }, "style:fontSize")} />
          </div>
          <IconChoice label="Align" value={textAlign} indeterminate={textAlign === undefined}
            options={ALIGN_OPTIONS} onChange={(v) => patch({ textAlign: v })} />
        </>
      ) : null}
      <IconChoice label="Turn" value={rotate === undefined ? undefined : String(rotate)}
        indeterminate={rotate === undefined || !ROTATE_OPTIONS.some((o) => o.value === String(rotate))}
        options={ROTATE_OPTIONS} onChange={(v) => patch({ rotate: Number(v) })} />
      <div className="arq-field-pair">
        <NumberField label="Degrees" value={rotate} indeterminate={rotate === undefined} step={1}
          onChange={(v) => patch({ rotate: v }, "style:rotate")} />
      </div>
        </>
      )}
    </div>
  );
}

function EdgePanel({ edges }: { edges: ArqEdge[] }) {
  const store = useEditorStore();
  const ids = edges.map((e) => e.id);
  const resolved = edges.map((e) => resolveEdgeStyle(e.style));
  const only = edges.length === 1 ? edges[0] : undefined;

  const stroke = commonValue(resolved.map((r) => r.stroke));
  const strokeWidth = commonValue(resolved.map((r) => r.strokeWidth));
  const strokeDash = commonValue(resolved.map((r) => r.strokeDash));
  const routing = commonValue(resolved.map((r) => r.routing));
  // resolveEdgeStyle widens the arrow fields to plain string (see render-svg.ts); the schema has
  // already constrained the stored value to ArrowStyle, so this narrows rather than asserts.
  const startArrow = commonValue(resolved.map((r) => r.startArrow)) as ArrowStyle | undefined;
  const endArrow = commonValue(resolved.map((r) => r.endArrow)) as ArrowStyle | undefined;
  const labelPos = commonValue(resolved.map((r) => r.labelPos));
  const animate = commonValue(resolved.map((r) => r.animate));
  const speed = commonValue(resolved.map((r) => r.animateSpeed));
  const direction = commonValue(resolved.map((r) => r.animateDirection));
  const roughness = commonValue(resolved.map((r) => r.roughness));
  const glowOn = commonValue(resolved.map((r) => r.glow !== undefined));
  const glowColor = glowOn === true ? commonValue(resolved.flatMap((r) => (r.glow ? [r.glow.color] : []))) : undefined;

  const patch = (p: StylePatch, mergeKey?: string) =>
    store.getState().setStyle(ids, p, mergeKey !== undefined ? { mergeKey } : undefined);
  const [tab, setTab] = useState<PanelTab>("Style");

  return (
    <div className="arq-inspector-inner">
      <h3>{edges.length === 1 ? "Line" : `${edges.length} lines`}</h3>
      <PanelTabs tab={tab} onTab={setTab} />
      {tab === "Animation" ? (
        <AnimationFields
          animate={animate} speed={speed} direction={direction} options={EDGE_ANIMATE_OPTIONS}
          glowOn={glowOn} glowColor={glowColor} patch={patch}
        />
      ) : (
        <>
      <IconChoice label="Shape" value={routing} indeterminate={routing === undefined}
        options={ROUTING_OPTIONS} onChange={(v) => patch({ routing: v })} />
      {/* Only once a route has been shaped by hand: hands it back to the automatic router. */}
      {edges.some((e) => e.legs !== undefined || e.via !== undefined) ? (
        <button type="button" className="arq-panel-action" title="Forget the bends dragged into this line"
          onClick={() => edges.forEach((e) => store.getState().setRoute(e.id, { legs: null, via: null }))}>
          ↺ Reset route
        </button>
      ) : null}
      <IconChoice label="Ends" value={startArrow} indeterminate={startArrow === undefined}
        options={START_ARROW_OPTIONS} onChange={(v) => patch({ startArrow: v })} />
      <IconChoice label="" value={endArrow} indeterminate={endArrow === undefined}
        options={END_ARROW_OPTIONS} onChange={(v) => patch({ endArrow: v })} />
      <IconChoice label="Stroke" value={strokeDash} indeterminate={strokeDash === undefined}
        options={DASH_OPTIONS} onChange={(v) => patch({ strokeDash: v })} />
      <IconChoice label="Style" value={roughness === undefined ? undefined : sketchLevelOf(roughness)}
        indeterminate={roughness === undefined} options={SKETCH_OPTIONS}
        onChange={(v) => patch({ roughness: SKETCH_ROUGHNESS[v] })} />
      <div className="arq-field-pair">
        <ColorField label="Colour" value={stroke} indeterminate={stroke === undefined}
          onChange={(v) => patch({ stroke: v }, "style:stroke")} />
        <NumberField label="Width" value={strokeWidth} indeterminate={strokeWidth === undefined} min={0.5} step={0.5}
          onChange={(v) => patch({ strokeWidth: v }, "style:strokeWidth")} />
      </div>

      {only ? (
        <TextField label="Label" value={only.label ?? ""} onChange={(v) => store.getState().setLabel(only.id, v)} />
      ) : null}
      <IconChoice label="Label at" value={labelPos} indeterminate={labelPos === undefined}
        options={LABEL_POS_OPTIONS} onChange={(v) => patch({ labelPos: v })} />
        </>
      )}
    </div>
  );
}

/** Multi-selection spanning both nodes and edges: only fields both style vocabularies share
 *  (stroke, stroke width, dash, glow) are meaningful across the whole selection. */
function MixedPanel({ nodes, edges }: { nodes: ArqNode[]; edges: ArqEdge[] }) {
  const store = useEditorStore();
  const ids = [...nodes.map((n) => n.id), ...edges.map((e) => e.id)];
  const nodeResolved = nodes.map((n) => resolveNodeStyle(n.style));
  const edgeResolved = edges.map((e) => resolveEdgeStyle(e.style));

  const stroke = commonValue([...nodeResolved.map((r) => r.stroke), ...edgeResolved.map((r) => r.stroke)]);
  const strokeWidth = commonValue([...nodeResolved.map((r) => r.strokeWidth), ...edgeResolved.map((r) => r.strokeWidth)]);
  const strokeDash = commonValue([...nodeResolved.map((r) => r.strokeDash), ...edgeResolved.map((r) => r.strokeDash)]);
  const glows = [...nodeResolved.map((r) => r.glow), ...edgeResolved.map((r) => r.glow)];
  const glowOn = commonValue(glows.map((g) => g !== undefined));
  const glowColor = glowOn === true ? commonValue(glows.flatMap((g) => (g ? [g.color] : []))) : undefined;

  const patch = (p: StylePatch, mergeKey?: string) =>
    store.getState().setStyle(ids, p, mergeKey !== undefined ? { mergeKey } : undefined);

  return (
    <div className="arq-inspector-inner">
      <h3>{ids.length} objects</h3>
      <div className="arq-field-pair">
        <ColorField label="Line" value={stroke} indeterminate={stroke === undefined}
          onChange={(v) => patch({ stroke: v }, "style:stroke")} />
        <NumberField label="Width" value={strokeWidth} indeterminate={strokeWidth === undefined} min={0.5} step={0.5}
          onChange={(v) => patch({ strokeWidth: v }, "style:strokeWidth")} />
      </div>
      <IconChoice label="Stroke" value={strokeDash} indeterminate={strokeDash === undefined}
        options={DASH_OPTIONS} onChange={(v) => patch({ strokeDash: v })} />
      <GlowFields
        on={glowOn}
        color={glowColor}
        onToggle={(checked) => patch({ glow: checked ? { color: glowColor ?? DEFAULT_GLOW_COLOR } : undefined })}
        onColor={(v) => patch({ glow: { color: v } }, "style:glow")}
      />
    </div>
  );
}

export function Inspector() {
  const selection = useEditor((s) => s.selection);
  const nodes = useEditor((s) => s.document.nodes);
  const edges = useEditor((s) => s.document.edges);
  const canvasBackground = useEditor((s) => s.document.canvasBackground);
  useSyncCanvasBackground(canvasBackground);

  const selectedNodes = nodes.filter((n) => selection.nodes.includes(n.id));
  const selectedEdges = edges.filter((e) => selection.edges.includes(e.id));

  if (selectedNodes.length === 0 && selectedEdges.length === 0) return <DocumentPanel />;
  if (selectedEdges.length === 0) return <NodePanel nodes={selectedNodes} />;
  if (selectedNodes.length === 0) return <EdgePanel edges={selectedEdges} />;
  return <MixedPanel nodes={selectedNodes} edges={selectedEdges} />;
}
