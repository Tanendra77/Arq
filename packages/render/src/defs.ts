import type { ArrowStyle, Document } from "@arq/schema";
import { resolveEdgeStyle, resolveNodeStyle } from "./metrics";

export function colorKey(color: string): string {
  return color.replace("#", "").toLowerCase();
}

export function markerId(arrow: ArrowStyle, color: string): string {
  return `arq-mk-${arrow}-${colorKey(color)}`;
}

export function glowId(color: string): string {
  return `arq-glow-${colorKey(color)}`;
}

/** Marker body per arrow style, drawn in a 0 0 10 10 viewBox pointing right. */
const ARROW_BODY: Record<Exclude<ArrowStyle, "none">, string> = {
  arrow: '<path d="M0 0L10 5L0 10z"/>',
  triangle: '<path d="M0 1L9 5L0 9z"/>',
  diamond: '<path d="M0 5L5 1L10 5L5 9z"/>',
  circle: '<circle cx="5" cy="5" r="4"/>',
};

function marker(arrow: Exclude<ArrowStyle, "none">, color: string): string {
  return `<marker id="${markerId(arrow, color)}" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse" fill="${color}">${ARROW_BODY[arrow]}</marker>`;
}

function glowFilter(color: string): string {
  return `<filter id="${glowId(color)}" x="-50%" y="-50%" width="200%" height="200%"><feDropShadow dx="0" dy="0" stdDeviation="3" flood-color="${color}" flood-opacity="0.9"/></filter>`;
}

export function collectDefs(doc: Document): string {
  const markers = new Map<string, string>();
  const filters = new Map<string, string>();

  for (const e of doc.edges) {
    const s = resolveEdgeStyle(e.style);
    for (const a of [s.startArrow, s.endArrow] as ArrowStyle[]) {
      if (a === "none") continue;
      markers.set(markerId(a, s.stroke), marker(a as Exclude<ArrowStyle, "none">, s.stroke));
    }
    if (s.glow) filters.set(glowId(s.glow.color), glowFilter(s.glow.color));
  }
  for (const n of doc.nodes) {
    const s = resolveNodeStyle(n.style);
    if (s.glow) filters.set(glowId(s.glow.color), glowFilter(s.glow.color));
  }

  // Sorted by id, not by insertion order: the parity test compares bytes, so iteration order
  // must depend on content alone and never on the order elements happen to be authored in.
  const body = [...markers.entries(), ...filters.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([, v]) => v)
    .join("");
  return `<defs>${body}</defs>`;
}
