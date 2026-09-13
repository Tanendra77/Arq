import type { ArrowStyle, Document } from "@arq/schema";
import { resolveEdgeStyle, resolveNodeStyle } from "./metrics";

export function colorKey(color: string): string {
  return color.replace("#", "").toLowerCase();
}

export function glowId(color: string): string {
  return `arq-glow-${colorKey(color)}`;
}

/**
 * Arrow body per style, in a `0 0 10 10` box pointing right.
 *
 * The renderer no longer uses these: `edgeMarkup` draws each head as real geometry so it picks up
 * the edge's hand-drawn character (see sketch.ts). They stay as the one source of arrow shapes for
 * chrome that needs a tiny fixed-size icon — the palette's Arrow swatch — rather than letting that
 * hand-author its own.
 */
export const ARROW_BODY: Record<Exclude<ArrowStyle, "none">, string> = {
  arrow: '<path d="M0 0L10 5L0 10z"/>',
  triangle: '<path d="M0 1L9 5L0 9z"/>',
  diamond: '<path d="M0 5L5 1L10 5L5 9z"/>',
  circle: '<circle cx="5" cy="5" r="4"/>',
};

function glowFilter(color: string): string {
  return `<filter id="${glowId(color)}" x="-50%" y="-50%" width="200%" height="200%"><feDropShadow dx="0" dy="0" stdDeviation="3" flood-color="${color}" flood-opacity="0.9"/></filter>`;
}

/**
 * The `<defs>` an exported document needs. Glow filters only: arrowheads used to live here as
 * `<marker>` elements, and are now drawn inline by `edgeMarkup`.
 */
export function collectDefs(doc: Document): string {
  const filters = new Map<string, string>();

  for (const e of doc.edges) {
    const s = resolveEdgeStyle(e.style);
    if (s.glow) filters.set(glowId(s.glow.color), glowFilter(s.glow.color));
  }
  for (const n of doc.nodes) {
    const s = resolveNodeStyle(n.style);
    if (s.glow) filters.set(glowId(s.glow.color), glowFilter(s.glow.color));
  }

  // Sorted by id, not by insertion order: the parity test compares bytes, so iteration order
  // must depend on content alone and never on the order elements happen to be authored in.
  const body = [...filters.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([, v]) => v)
    .join("");
  return `<defs>${body}</defs>`;
}
