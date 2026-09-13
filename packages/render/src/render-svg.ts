import type { Document } from "@arq/schema";
import { collectDefs, glowId } from "./defs";
import { edgeEnds, edgeLabelPoint, edgePath, edgeRoute, edgeTangents } from "./edge-path";
import { FONT_STACK, fontFaceCss } from "./font";
import { escapeXml, inlineIcon, placeholderBox } from "./inline-icon";
import { layoutDocument, stackingOrder } from "./layout-document";
import {
  METRICS, STYLE_DEFAULTS, resolveEdgeStyle, resolveNodeStyle, textCss, wrapLabel,
  type Rect, type ResolvedTextStyle,
} from "./metrics";
import { FLOW_CSS, PULSE_CLASS, edgeMarkup, seedFromId, shapeMarkup } from "./sketch";

/**
 * A node's icon is whatever the document names, or nothing. There is no per-type fallback:
 * node types are gone and a node without an `icon` is drawn as its shape alone.
 */
export type RenderIconResolver = (id: string | undefined) => string | undefined;

export interface RenderOptions {
  resolveIcon: RenderIconResolver;
  font?: "embed" | "system";
  /**
   * What sits behind the diagram: the canvas colour (the default), nothing at all, or the canvas
   * colour with the editor's grid pattern drawn on it.
   */
  background?: "solid" | "transparent" | "grid";
  /** The grid drawn by `background: "grid"`, aligned to document coordinates like the editor's. */
  grid?: { variant: "dots" | "lines" | "cross"; size: number };
  /** Margin kept around the content, in document units. Defaults to the canvas padding. */
  padding?: number;
  /**
   * The colours for whatever the document leaves to the viewer: unstyled text, and the canvas when
   * the document sets no background. "light" (the default) is dark ink on white; "dark" is what the
   * editor shows in its dark theme, so an export matches the screen it was made on.
   */
  theme?: "light" | "dark";
  /**
   * Freeze every animation at this many seconds into its loop — one still frame, for a PNG, a still
   * SVG, or one frame of a GIF or video. Unset, the SVG animates by itself.
   */
  frame?: number;
}

/**
 * Pause the file's animations at `t` seconds. Each animation is paused and started `t` seconds
 * early, which is exactly its state at `t`: shifting the delay each element already carries (a
 * packet's place in its train) keeps the dots spaced as they were. The reduced-motion rule goes too,
 * or a machine set to reduce motion would render every frame identical.
 */
function freezeAt(svg: string, t: number): string {
  const shifted = svg.replace(/style="([^"]*)"/g, (whole, css: string) => {
    if (!css.includes("animation")) return whole;
    const withDelay = /animation-delay:(-?[\d.]+)s/.test(css)
      ? css.replace(/animation-delay:(-?[\d.]+)s/, (_m, d: string) => `animation-delay:${fmt(Number(d) - t)}s`)
      : `${css};animation-delay:${fmt(-t)}s`;
    return `style="${withDelay}"`;
  });
  return shifted.replace(
    FLOW_CSS,
    FLOW_CSS.replace(/@media \(prefers-reduced-motion[^}]*\}\}/, "") +
      `.${PULSE_CLASS}{animation-delay:${fmt(-t)}s}*{animation-play-state:paused!important}`,
  );
}

/** Ink and canvas for each theme — the editor's own dark palette (`--arq-fg`, `--arq-bg`). */
const THEME_COLORS = {
  light: { ink: STYLE_DEFAULTS.edge.stroke, canvas: STYLE_DEFAULTS.canvasBackground },
  dark: { ink: "#ececec", canvas: "#161616" },
} as const;

/** A pattern colour that shows on the given background without shouting over the diagram. */
function gridColor(bg: string): string {
  const hex = bg.length === 4 ? bg.replace(/^#(.)(.)(.)$/, "#$1$1$2$2$3$3") : bg;
  const n = Number.parseInt(hex.slice(1), 16);
  const luminance = (0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255;
  return luminance < 0.5 ? "#4a4a4a" : "#c8c8cc";
}

/**
 * Graph paper: a thin line every grid step, a medium one every fifth, a heavy one every tenth — the
 * same weights the editor draws (`GRAPH_PAPER` in the canvas).
 */
export const GRAPH_PAPER = [
  { every: 1, width: 0.5, opacity: 0.45 },
  { every: 5, width: 1, opacity: 0.7 },
  { every: 10, width: 1.5, opacity: 1 },
] as const;

function gridPattern(grid: NonNullable<RenderOptions["grid"]>, color: string): string {
  if (grid.variant === "lines") {
    // One tile ten steps wide, holding all three weights, so the heavy lines land every tenth step.
    const span = grid.size * 10;
    const lines = GRAPH_PAPER.map(({ every, width, opacity }) => {
      const step = grid.size * every;
      const d = Array.from({ length: Math.round(span / step) }, (_, i) => {
        const at = fmt(i * step);
        return `M${at} 0V${fmt(span)}M0 ${at}H${fmt(span)}`;
      }).join("");
      return `<path d="${d}" fill="none" stroke="${color}" stroke-width="${width}" stroke-opacity="${opacity}"/>`;
    }).join("");
    return `<pattern id="arq-grid" width="${fmt(span)}" height="${fmt(span)}" patternUnits="userSpaceOnUse">${lines}</pattern>`;
  }
  const g = fmt(grid.size);
  const mark =
    grid.variant === "dots" ? `<circle cx="${fmt(grid.size / 2)}" cy="${fmt(grid.size / 2)}" r="1" fill="${color}"/>`
    : `<path d="M${fmt(grid.size / 2 - 3)} ${fmt(grid.size / 2)} h6 M${fmt(grid.size / 2)} ${fmt(grid.size / 2 - 3)} v6" stroke="${color}" stroke-width="1"/>`;
  return `<pattern id="arq-grid" width="${g}" height="${g}" patternUnits="userSpaceOnUse">${mark}</pattern>`;
}

/**
 * The same two-decimal rounding metrics.ts and edge-path.ts use. Every number this module
 * interpolates into the output goes through it, so a coordinate can never reach the SVG as
 * `70.99999999999999` in one engine and `71` in another — the export is compared byte for byte
 * between a Node render and a browser render.
 */
const r2 = (n: number): number => Math.round(n * 100) / 100;
const fmt = (n: number): string => String(r2(n));

const FG = STYLE_DEFAULTS.edge.stroke;
const LINE = STYLE_DEFAULTS.node.stroke;

/** A label's non-default text settings as a `style` attribute (a CSS rule on `text` would beat a
 *  presentation attribute, so these have to be inline), or nothing at all when there are none. */
function textStyleAttr(t: ResolvedTextStyle): string {
  const css = Object.entries(textCss(t)).map(([k, v]) => `${k}:${v}`).join(";");
  return css ? ` style="${escapeXml(css)}"` : "";
}

/** Roughly how wide a line of text sets, for sizing the plate behind it without a layout engine. */
const textWidth = (chars: number, fontSize: number) => chars * fontSize * 0.56;

function renderGroup(id: string, label: string, r: Rect): string {
  const m = METRICS;
  return `<g class="arq-group" data-id="${escapeXml(id)}"><rect x="${fmt(r.x)}" y="${fmt(r.y)}" width="${fmt(r.w)}" height="${fmt(r.h)}" rx="${m.groupRadius}" fill="#f3f4f6" stroke="${LINE}"/><text x="${fmt(r.x + m.groupPadding)}" y="${fmt(r.y + m.groupHeaderHeight / 2)}" font-size="${m.labelFontSize}" font-weight="600" dominant-baseline="middle" fill="${FG}">${escapeXml(label)}</text></g>`;
}

function renderNode(doc: Document, id: string, r: Rect, resolveIcon: RenderIconResolver, ink: string): string {
  const n = doc.nodes.find((x) => x.id === id)!;
  const s = resolveNodeStyle(n.style);
  const m = METRICS;
  const filter = s.glow ? ` filter="url(#${glowId(s.glow.color)})"` : "";
  // One shared painter for the outline, hand-drawn or crisp, seeded off the node's own id so the
  // export wobbles exactly the way the editor drew it.
  const shaped = shapeMarkup(n.shape, r, s, seedFromId(id), n.points);

  const iconBox: Rect = {
    x: r2(r.x + (r.w - m.iconSize) / 2), y: r2(r.y + m.padding), w: m.iconSize, h: m.iconSize,
  };
  const svgText = n.icon !== undefined ? resolveIcon(n.icon) : undefined;
  const icon =
    n.icon === undefined ? ""
    : svgText !== undefined ? inlineIcon(svgText, `icon-${id}`, iconBox)
    : placeholderBox(iconBox, n.icon);

  const anchor = s.textAlign === "left" ? "start" : s.textAlign === "right" ? "end" : "middle";
  const tx =
    s.textAlign === "left" ? r.x + m.padding
    : s.textAlign === "right" ? r.x + r.w - m.padding
    : r.x + r.w / 2;
  const lines = wrapLabel(n.label);
  // With an icon the label sits under it; without one it is centred in the box, which is what
  // makes a `text` node (no outline, no icon) read as a plain label at its own position.
  const labelTop =
    n.icon !== undefined ? iconBox.y + iconBox.h + m.gap : r.y + (r.h - lines.length * m.labelLineHeight) / 2;
  const plate = s.textBackground !== undefined && lines.length > 0
    ? (() => {
        const w = Math.max(...lines.map((l) => textWidth(l.length, s.fontSize))) + 8;
        const x = anchor === "middle" ? tx - w / 2 : anchor === "start" ? tx - 4 : tx - w + 4;
        return `<rect x="${fmt(x)}" y="${fmt(labelTop - 2)}" width="${fmt(w)}" height="${fmt(lines.length * m.labelLineHeight + 4)}" rx="3" fill="${s.textBackground}"/>`;
      })()
    : "";
  const text = lines
    .map((line, i) => `<tspan x="${fmt(tx)}" y="${fmt(labelTop + i * m.labelLineHeight + m.labelLineHeight * 0.75)}">${escapeXml(line)}</tspan>`)
    .join("");

  // Rotation is applied to the whole node group about its own centre, so the outline, icon and
  // label turn together — and the rect the edge router anchors to stays the unrotated one, which
  // is what keeps the canvas and this export agreeing on where a line meets the shape.
  const rotate =
    s.rotate === 0 ? "" : ` transform="rotate(${fmt(s.rotate)} ${fmt(r.x + r.w / 2)} ${fmt(r.y + r.h / 2)})"`;
  const pulse = s.animate === "pulse" ? ` ${PULSE_CLASS}` : "";
  return `<g class="arq-node${pulse}" data-id="${escapeXml(id)}" data-shape="${n.shape}" color="${STYLE_DEFAULTS.edge.stroke}"${rotate}${filter}>${shaped}${icon}${plate}<text font-size="${fmt(s.fontSize)}" font-weight="500" text-anchor="${anchor}" fill="${s.textColor ?? ink}"${textStyleAttr(s)}>${text}</text></g>`;
}

function renderEdge(doc: Document, id: string, nodes: Map<string, Rect>, ink: string): string {
  const e = doc.edges.find((x) => x.id === id)!;
  const ends = edgeEnds(e, nodes);
  if (!ends) return "";
  const s = resolveEdgeStyle(e.style);
  const route = edgeRoute(e, s.bend);
  const { d, mid } = edgePath(ends.start, ends.end, s.routing, route);
  const filter = s.glow ? ` filter="url(#${glowId(s.glow.color)})"` : "";
  const path = edgeMarkup(d, s, seedFromId(id), {
    ...ends,
    ...edgeTangents(ends.start, ends.end, s.routing, route),
  });
  // `mid` is the path's own midpoint; the label sits wherever the style says, which is only the
  // same point when labelPos is "middle".
  const lp = s.labelPos === "middle" ? mid : edgeLabelPoint(ends.start, ends.end, s.routing, s.labelPos, route);
  // A label is bare text on the line unless it asks for a plate behind it.
  const plateW = textWidth(e.label?.length ?? 0, s.fontSize) + 8;
  const plate = s.textBackground !== undefined
    ? `<rect x="${fmt(lp.x - plateW / 2)}" y="${fmt(lp.y - s.fontSize / 2 - 3)}" width="${fmt(plateW)}" height="${fmt(s.fontSize + 6)}" rx="3" fill="${s.textBackground}"/>`
    : "";
  const label = e.label
    ? `<g>${plate}<text x="${fmt(lp.x)}" y="${fmt(lp.y)}" font-size="${fmt(s.fontSize)}" text-anchor="middle" dominant-baseline="middle" fill="${s.textColor ?? ink}"${textStyleAttr(s)}>${escapeXml(e.label)}</text></g>`
    : "";
  const pulse = s.animate === "pulse" ? ` ${PULSE_CLASS}` : "";
  return `<g class="arq-edge${pulse}" data-id="${escapeXml(id)}"${filter}>${path}${label}</g>`;
}

export function renderSvg(doc: Document, opts: RenderOptions): string {
  const font = opts.font ?? "embed";
  const layout = layoutDocument(doc, opts.padding);
  const b = layout.bounds;
  // FLOW_CSS travels with the file so an animated edge still animates when the SVG is opened on
  // its own, with no viewer-side scripting.
  const style = `<style>${fontFaceCss(font)}text{font-family:${FONT_STACK}}${FLOW_CSS}</style>`;
  const defs = collectDefs(doc);
  const groups = doc.groups.map((g) => { const r = layout.groups.get(g.id); return r ? renderGroup(g.id, g.label, r) : ""; }).join("");
  const theme = THEME_COLORS[opts.theme ?? "light"];
  // Shapes and lines in one stack, so a line brought forward draws over the shapes beneath it.
  const elements = stackingOrder(doc)
    .map((item) =>
      item.kind === "edge"
        ? renderEdge(doc, item.id, layout.nodes, theme.ink)
        : renderNode(doc, item.id, layout.nodes.get(item.id)!, opts.resolveIcon, theme.ink),
    )
    .join("");
  // The full-canvas background rect is the one place the document's own color (when set) wins
  // over the default — this is what makes screen and export agree on canvas color.
  const canvasFill = doc.canvasBackground ?? theme.canvas;
  const background = opts.background ?? "solid";
  const rect = (fill: string) => `<rect x="${fmt(b.x)}" y="${fmt(b.y)}" width="${fmt(b.w)}" height="${fmt(b.h)}" fill="${fill}"/>`;
  const backdrop =
    background === "transparent" ? ""
    : background === "grid" && opts.grid ? `<defs>${gridPattern(opts.grid, gridColor(canvasFill))}</defs>${rect(canvasFill)}${rect("url(#arq-grid)")}`
    : rect(canvasFill);
  const out = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="${fmt(b.x)} ${fmt(b.y)} ${fmt(b.w)} ${fmt(b.h)}" width="${fmt(b.w)}" height="${fmt(b.h)}">${style}${defs}<title>${escapeXml(doc.title)}</title>${backdrop}${groups}${elements}</svg>`;
  return opts.frame === undefined ? out : freezeAt(out, opts.frame);
}
