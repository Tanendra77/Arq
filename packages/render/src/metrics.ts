import type { Pinned } from "@arq/schema";

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

export function nodeHeight(label: string): number {
  const m = METRICS;
  return m.padding + m.iconSize + m.gap + wrapLabel(label).length * m.labelLineHeight + m.gap + m.badgeHeight + m.padding;
}

export function nodeRect(pinned: Pinned | undefined, label: string): Rect {
  return { x: pinned?.x ?? 0, y: pinned?.y ?? 0, w: METRICS.nodeWidth, h: nodeHeight(label) };
}

export function edgeAnchors(from: Rect, to: Rect): { start: Point; end: Point } {
  return { start: { x: from.x + from.w, y: from.y + from.h / 2 }, end: { x: to.x, y: to.y + to.h / 2 } };
}
