import type {
  Animation, AnimationDirection, AnimationSpeed, DashStyle, EdgeStyle, LabelPosition, NodeShape,
  NodeStyle, Pinned,
} from "@arq/schema";

export type Point = { x: number; y: number };
export type Rect = { x: number; y: number; w: number; h: number };

/**
 * The single source of truth for node and edge geometry. The canvas CSS and the SVG exporter both
 * derive their boxes from these numbers so what is on screen matches what is exported.
 */
export const METRICS = {
  nodeWidth: 120,
  iconSize: 48,
  padding: 6,
  gap: 4,
  labelFontSize: 13,
  labelLineHeight: 16,
  labelMaxChars: 16,
  labelMaxLines: 3,
  badgeHeight: 12,
  badgeFontSize: 10,
  groupPadding: 16,
  groupHeaderHeight: 24,
  groupRadius: 10,
  nodeRadius: 8,
  cornerRadius: 8,
  canvasPadding: 40,
} as const;

/** Word-wrap a label to `labelMaxChars` per line, at most `labelMaxLines`, last line ellipsised. */
export function wrapLabel(label: string): string[] {
  const max = METRICS.labelMaxChars;
  const words = label.trim().split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let cur = "";
  const push = () => { if (cur) lines.push(cur); cur = ""; };
  for (let w of words) {
    while (w.length > max) {
      push();
      lines.push(w.slice(0, max));
      w = w.slice(max);
    }
    if (!cur) cur = w;
    else if (cur.length + 1 + w.length <= max) cur += " " + w;
    else { push(); cur = w; }
  }
  push();
  if (lines.length === 0) return [""];
  if (lines.length > METRICS.labelMaxLines) {
    const kept = lines.slice(0, METRICS.labelMaxLines);
    const last = kept[METRICS.labelMaxLines - 1] ?? "";
    kept[METRICS.labelMaxLines - 1] = (last.length >= max ? last.slice(0, max - 1) : last) + "…";
    return kept;
  }
  return lines;
}

export const DEFAULT_NODE_SIZE = { w: 120, h: 80 } as const;
export const DEFAULT_TEXT_SIZE = { w: 120, h: 24 } as const;

/**
 * Built-in fallbacks for unset style fields. The renderer resolves against THESE and never
 * against user settings, so the same document exports the same bytes on every machine.
 */
export const STYLE_DEFAULTS = {
  node: { fill: "#ffffff", stroke: "#d0d0d0", strokeWidth: 1.5, strokeDash: "solid",
          radius: 8, fontSize: 13, textAlign: "center", rotate: 0, animate: "none", animateSpeed: "normal", animateDirection: "forward", roughness: 1 },
  edge: { stroke: "#1a1a1a", strokeWidth: 1.5, strokeDash: "solid",
          routing: "orthogonal", startArrow: "none", endArrow: "arrow", labelPos: "middle", animate: "none", animateSpeed: "normal", animateDirection: "forward", bend: 0.5, roughness: 1 },
  canvasBackground: "#ffffff",
} as const;

export const DASH_ARRAY: Record<DashStyle, string | undefined> = {
  solid: undefined,
  dashed: "8 4",
  dotted: "2 4",
};

export function shapeRect(pinned: Pinned | undefined, shape: NodeShape): Rect {
  const d = shape === "text" ? DEFAULT_TEXT_SIZE : DEFAULT_NODE_SIZE;
  return { x: pinned?.x ?? 0, y: pinned?.y ?? 0, w: pinned?.w ?? d.w, h: pinned?.h ?? d.h };
}

const fmt = (n: number) => String(Math.round(n * 100) / 100);

/** One SVG element for the shape's outline. Fill and stroke are applied by the caller. */
export function shapeOutline(shape: NodeShape, r: Rect, radius: number): string {
  const cx = r.x + r.w / 2;
  const cy = r.y + r.h / 2;
  switch (shape) {
    case "rect":
      return `<rect x="${fmt(r.x)}" y="${fmt(r.y)}" width="${fmt(r.w)}" height="${fmt(r.h)}" rx="${fmt(radius)}"/>`;
    case "ellipse":
      return `<ellipse cx="${fmt(cx)}" cy="${fmt(cy)}" rx="${fmt(r.w / 2)}" ry="${fmt(r.h / 2)}"/>`;
    case "diamond":
      return `<polygon points="${fmt(cx)},${fmt(r.y)} ${fmt(r.x + r.w)},${fmt(cy)} ${fmt(cx)},${fmt(r.y + r.h)} ${fmt(r.x)},${fmt(cy)}"/>`;
    case "triangle":
      return `<polygon points="${fmt(cx)},${fmt(r.y)} ${fmt(r.x + r.w)},${fmt(r.y + r.h)} ${fmt(r.x)},${fmt(r.y + r.h)}"/>`;
    case "text":
      return "";
  }
}

export type ResolvedNodeStyle = {
  fill: string; stroke: string; strokeWidth: number; strokeDash: DashStyle;
  radius: number; fontSize: number; textAlign: "left" | "center" | "right";
  rotate: number;
  animate: Animation;
  animateSpeed: AnimationSpeed;
  animateDirection: AnimationDirection;
  roughness: number;
  glow: { color: string } | undefined;
};

export function resolveNodeStyle(s: NodeStyle | undefined): ResolvedNodeStyle {
  const d = STYLE_DEFAULTS.node;
  return {
    fill: s?.fill ?? d.fill,
    stroke: s?.stroke ?? d.stroke,
    strokeWidth: s?.strokeWidth ?? d.strokeWidth,
    strokeDash: s?.strokeDash ?? d.strokeDash,
    radius: s?.radius ?? d.radius,
    fontSize: s?.fontSize ?? d.fontSize,
    textAlign: s?.textAlign ?? d.textAlign,
    rotate: s?.rotate ?? d.rotate,
    animate: s?.animate ?? d.animate,
    animateSpeed: s?.animateSpeed ?? d.animateSpeed,
    animateDirection: s?.animateDirection ?? d.animateDirection,
    roughness: s?.roughness ?? d.roughness,
    glow: s?.glow,
  };
}

export type ResolvedEdgeStyle = {
  stroke: string; strokeWidth: number; strokeDash: DashStyle;
  routing: "straight" | "curved" | "orthogonal";
  startArrow: string; endArrow: string;
  labelPos: LabelPosition;
  animate: Animation;
  animateSpeed: AnimationSpeed;
  animateDirection: AnimationDirection;
  bend: number;
  roughness: number;
  glow: { color: string } | undefined;
};

export function resolveEdgeStyle(s: EdgeStyle | undefined): ResolvedEdgeStyle {
  const d = STYLE_DEFAULTS.edge;
  return {
    stroke: s?.stroke ?? d.stroke,
    strokeWidth: s?.strokeWidth ?? d.strokeWidth,
    strokeDash: s?.strokeDash ?? d.strokeDash,
    routing: s?.routing ?? d.routing,
    startArrow: s?.startArrow ?? d.startArrow,
    endArrow: s?.endArrow ?? d.endArrow,
    labelPos: s?.labelPos ?? d.labelPos,
    animate: s?.animate ?? d.animate,
    animateSpeed: s?.animateSpeed ?? d.animateSpeed,
    animateDirection: s?.animateDirection ?? d.animateDirection,
    bend: s?.bend ?? d.bend,
    roughness: s?.roughness ?? d.roughness,
    glow: s?.glow,
  };
}
