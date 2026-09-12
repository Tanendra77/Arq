import { useEffect } from "react";
import {
  ARROW_STYLES, DASH_STYLES, LABEL_POSITIONS,
  type ArqEdge, type ArqNode, type ArrowStyle, type DashStyle, type EdgeAnimation,
  type LabelPosition, type Routing,
} from "@arq/schema";
import { resolveEdgeStyle, resolveNodeStyle, STYLE_DEFAULTS } from "@arq/render";
import { useEditor, useEditorStore } from "../store/context";
import type { StylePatch } from "../store/editor-store";
import { CheckboxField, ColorField, NumberField, TextField } from "./inspector/Field";
import {
  IconChoice, alignGlyph, animateGlyph, arrowGlyph, dashGlyph, labelPosGlyph, routingGlyph, sketchGlyph,
} from "./inspector/IconChoice";

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

const ANIMATE_OPTIONS = [
  { value: "none", title: "Still", glyph: animateGlyph("none") },
  { value: "flow", title: "Flowing", glyph: animateGlyph("flow") },
] as const satisfies readonly { value: EdgeAnimation; title: string; glyph: string }[];

const LABEL_POS_TITLES: Record<LabelPosition, string> = { start: "Near start", middle: "Middle", end: "Near end" };
const LABEL_POS_OPTIONS = LABEL_POSITIONS.map((p) => ({
  value: p, title: LABEL_POS_TITLES[p], glyph: labelPosGlyph(p),
}));

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

function DocumentPanel() {
  const store = useEditorStore();
  const title = useEditor((s) => s.document.title);
  const canvasBackground = useEditor((s) => s.document.canvasBackground);

  return (
    <div className="arq-inspector-inner">
      <h3>Document</h3>
      <TextField
        label="Title"
        value={title}
        onChange={(v) => store.getState().mutate("set title", (d) => { d.title = v; })}
      />
      <ColorField
        label="Canvas background"
        value={canvasBackground ?? STYLE_DEFAULTS.canvasBackground}
        onChange={(v) => store.getState().mutate(
          "set canvas background",
          (d) => { d.canvasBackground = v; },
          { mergeKey: "canvasBackground" },
        )}
      />
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
  const only = nodes.length === 1 ? nodes[0] : undefined;

  const fill = commonValue(resolved.map((r) => r.fill));
  const stroke = commonValue(resolved.map((r) => r.stroke));
  const strokeWidth = commonValue(resolved.map((r) => r.strokeWidth));
  const strokeDash = commonValue(resolved.map((r) => r.strokeDash));
  const radius = allRect ? commonValue(resolved.map((r) => r.radius)) : undefined;
  const fontSize = commonValue(resolved.map((r) => r.fontSize));
  const textAlign = commonValue(resolved.map((r) => r.textAlign));
  const roughness = commonValue(resolved.map((r) => r.roughness));
  const glowOn = commonValue(resolved.map((r) => r.glow !== undefined));
  const glowColor = glowOn === true ? commonValue(resolved.flatMap((r) => (r.glow ? [r.glow.color] : []))) : undefined;

  const patch = (p: StylePatch, mergeKey?: string) =>
    store.getState().setStyle(ids, p, mergeKey !== undefined ? { mergeKey } : undefined);

  return (
    <div className="arq-inspector-inner">
      <h3>{nodes.length === 1 ? "Shape" : `${nodes.length} shapes`}</h3>
      <div className="arq-field-pair">
        <ColorField label="Fill" value={fill} indeterminate={fill === undefined}
          onChange={(v) => patch({ fill: v }, "style:fill")} />
        <ColorField label="Line" value={stroke} indeterminate={stroke === undefined}
          onChange={(v) => patch({ stroke: v }, "style:stroke")} />
        <NumberField label="Width" value={strokeWidth} indeterminate={strokeWidth === undefined} min={0.5} step={0.5}
          onChange={(v) => patch({ strokeWidth: v }, "style:strokeWidth")} />
      </div>
      <IconChoice label="Stroke" value={strokeDash} indeterminate={strokeDash === undefined}
        options={DASH_OPTIONS} onChange={(v) => patch({ strokeDash: v })} />
      <IconChoice label="Style" value={roughness === undefined ? undefined : sketchLevelOf(roughness)}
        indeterminate={roughness === undefined} options={SKETCH_OPTIONS}
        onChange={(v) => patch({ roughness: SKETCH_ROUGHNESS[v] })} />
      {allRect ? (
        <NumberField label="Corner radius" value={radius} indeterminate={radius === undefined} min={0} step={1}
          onChange={(v) => patch({ radius: v }, "style:radius")} />
      ) : null}
      {only ? (
        <TextField label="Label" value={only.label} onChange={(v) => store.getState().setLabel(only.id, v)} />
      ) : null}
      <div className="arq-field-pair">
        <NumberField label="Text size" value={fontSize} indeterminate={fontSize === undefined} min={8} step={1}
          onChange={(v) => patch({ fontSize: v }, "style:fontSize")} />
      </div>
      <IconChoice label="Align" value={textAlign} indeterminate={textAlign === undefined}
        options={ALIGN_OPTIONS} onChange={(v) => patch({ textAlign: v })} />
      <GlowFields
        on={glowOn}
        color={glowColor}
        onToggle={(checked) => patch({ glow: checked ? { color: glowColor ?? DEFAULT_GLOW_COLOR } : undefined })}
        onColor={(v) => patch({ glow: { color: v } }, "style:glow")}
      />
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
  const roughness = commonValue(resolved.map((r) => r.roughness));
  const glowOn = commonValue(resolved.map((r) => r.glow !== undefined));
  const glowColor = glowOn === true ? commonValue(resolved.flatMap((r) => (r.glow ? [r.glow.color] : []))) : undefined;

  const patch = (p: StylePatch, mergeKey?: string) =>
    store.getState().setStyle(ids, p, mergeKey !== undefined ? { mergeKey } : undefined);

  return (
    <div className="arq-inspector-inner">
      <h3>{edges.length === 1 ? "Line" : `${edges.length} lines`}</h3>

      <IconChoice label="Shape" value={routing} indeterminate={routing === undefined}
        options={ROUTING_OPTIONS} onChange={(v) => patch({ routing: v })} />
      <IconChoice label="Ends" value={startArrow} indeterminate={startArrow === undefined}
        options={START_ARROW_OPTIONS} onChange={(v) => patch({ startArrow: v })} />
      <IconChoice label="" value={endArrow} indeterminate={endArrow === undefined}
        options={END_ARROW_OPTIONS} onChange={(v) => patch({ endArrow: v })} />
      <IconChoice label="Stroke" value={strokeDash} indeterminate={strokeDash === undefined}
        options={DASH_OPTIONS} onChange={(v) => patch({ strokeDash: v })} />
      <IconChoice label="Style" value={roughness === undefined ? undefined : sketchLevelOf(roughness)}
        indeterminate={roughness === undefined} options={SKETCH_OPTIONS}
        onChange={(v) => patch({ roughness: SKETCH_ROUGHNESS[v] })} />
      <IconChoice label="Flow" value={animate} indeterminate={animate === undefined}
        options={ANIMATE_OPTIONS} onChange={(v) => patch({ animate: v })} />

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

      <GlowFields
        on={glowOn}
        color={glowColor}
        onToggle={(checked) => patch({ glow: checked ? { color: glowColor ?? DEFAULT_GLOW_COLOR } : undefined })}
        onColor={(v) => patch({ glow: { color: v } }, "style:glow")}
      />
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
