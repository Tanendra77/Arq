import type { Animation, ArrowStyle, DashStyle } from "@arq/schema";
import {
  ARROW_BODY, DASH_ARRAY, edgePath, edgePaths, edgeTangents, pathSpecToSvg, resolveEdgeStyle,
} from "@arq/render";

/**
 * A row of small buttons, one per option, in place of a labelled `<select>`.
 *
 * Two reasons this exists rather than more `SelectField`s: a caption plus a dropdown costs two
 * lines of panel height per property, and for these properties (routing, dash, arrowhead, sketch)
 * the *shape* of the option says what it does far faster than its name does. The name is still
 * there for assistive tech and on hover — it has simply stopped taking up room.
 */
export function IconChoice<T extends string>({
  label, value, indeterminate = false, options, onChange,
}: {
  label: string;
  value: T | undefined;
  indeterminate?: boolean;
  options: readonly { value: T; title: string; glyph: string }[];
  onChange: (v: T) => void;
}) {
  const blank = indeterminate || value === undefined;
  return (
    <div className="arq-field arq-field-icons" role="group" aria-label={label}>
      <span className="arq-field-caption">
        {label}
        {blank ? <em>mixed</em> : null}
      </span>
      <div className="arq-icon-row">
        {options.map((o) => (
          <button
            key={o.value}
            type="button"
            className={!blank && o.value === value ? "active" : undefined}
            aria-label={o.title}
            aria-pressed={!blank && o.value === value}
            title={o.title}
            onClick={() => onChange(o.value)}
            // Every glyph below is built from @arq/render's own geometry (see glyphs.ts) plus
            // attribute values this module computed — never from document or user text.
            dangerouslySetInnerHTML={{ __html: o.glyph }}
          />
        ))}
      </div>
    </div>
  );
}

const BOX = { w: 26, h: 18 };
const svg = (body: string) => `<svg viewBox="0 0 ${BOX.w} ${BOX.h}" width="${BOX.w}" height="${BOX.h}">${body}</svg>`;
const stroke = (d: string, extra = "") =>
  `<path d="${d}" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"${extra}/>`;

const LEFT = { x: 3, y: 9 };
const RIGHT = { x: 23, y: 9 };

/** Routing: the real router draws each preview, so the icon cannot drift from the behaviour. */
export function routingGlyph(routing: "straight" | "curved" | "orthogonal"): string {
  // A little vertical offset, or "straight" and "orthogonal" would draw the same flat line.
  const d = edgePath({ x: 3, y: 4 }, { x: 23, y: 14 }, routing).d;
  return svg(stroke(d));
}

export function dashGlyph(dash: DashStyle): string {
  const array = DASH_ARRAY[dash];
  return svg(stroke(`M${LEFT.x} ${LEFT.y} L${RIGHT.x} ${RIGHT.y}`, array ? ` stroke-dasharray="${array}"` : ""));
}

/** Sketch level, drawn by rough.js at that exact roughness: the glyph *is* the effect, produced by
 *  the same `edgePaths` the canvas and the exporter call. */
export function sketchGlyph(roughness: number): string {
  const style = {
    ...resolveEdgeStyle(undefined),
    roughness,
    routing: "straight" as const,
    stroke: "currentColor",
    strokeWidth: 1.4,
    startArrow: "none",
    endArrow: "none",
    animate: "none" as const,
  };
  const { d } = edgePath(LEFT, RIGHT, "straight");
  const specs = edgePaths(d, style, 7, { start: LEFT, end: RIGHT, ...edgeTangents(LEFT, RIGHT, "straight") });
  return svg(specs.map(pathSpecToSvg).join(""));
}

/** Arrowheads reuse ARROW_BODY, the same geometry the palette's Arrow swatch draws. */
export function arrowGlyph(arrow: ArrowStyle): string {
  const shaft = stroke(`M${LEFT.x} ${LEFT.y} L${arrow === "none" ? RIGHT.x : 16} ${RIGHT.y}`);
  if (arrow === "none") return svg(shaft);
  return svg(`${shaft}<g transform="translate(16,4) scale(1)" fill="currentColor">${ARROW_BODY[arrow]}</g>`);
}

/** Label position: a plate sitting at that fraction along the line. */
export function labelPosGlyph(pos: "start" | "middle" | "end"): string {
  const at = { start: 0.25, middle: 0.5, end: 0.75 }[pos];
  const x = LEFT.x + (RIGHT.x - LEFT.x) * at;
  return svg(
    `${stroke(`M${LEFT.x} ${LEFT.y} L${RIGHT.x} ${RIGHT.y}`)}<rect x="${x - 4}" y="5" width="8" height="8" rx="2" fill="currentColor"/>`,
  );
}

/** Animation: a still line, marching dashes, travelling dots, or a fading element. */
export function animateGlyph(animate: Animation): string {
  const d = `M${LEFT.x} ${LEFT.y} L${RIGHT.x} ${RIGHT.y}`;
  if (animate === "flow") {
    return svg(
      `${stroke(d, ' stroke-dasharray="5 4"')}` +
        `<path d="M17 4 L22 9 L17 14" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>`,
    );
  }
  if (animate === "packets") {
    // The dots the animation actually sends, drawn where they would be mid-flight.
    return svg(
      `${stroke(d, ' stroke-opacity="0.35"')}` +
        [6, 13, 20].map((x) => `<circle cx="${x}" cy="9" r="2.4" fill="currentColor"/>`).join(""),
    );
  }
  if (animate === "pulse") {
    return svg(
      `<circle cx="13" cy="9" r="7" fill="currentColor" fill-opacity="0.2"/>` +
        `<circle cx="13" cy="9" r="4" fill="currentColor"/>`,
    );
  }
  return svg(stroke(d));
}

/** Rotation, as a square tipped by the amount it names. */
export function rotateGlyph(degrees: number): string {
  const cx = BOX.w / 2;
  const cy = BOX.h / 2;
  return svg(
    `<rect x="${cx - 6}" y="${cy - 5}" width="12" height="10" rx="2" fill="none" stroke="currentColor" stroke-width="1.6" transform="rotate(${degrees} ${cx} ${cy})"/>`,
  );
}

export function alignGlyph(align: "left" | "center" | "right"): string {
  const rows = [14, 9, 20, 11];
  const body = rows
    .map((w, i) => {
      const y = 3 + i * 4;
      const x = align === "left" ? 3 : align === "right" ? 23 - w : (BOX.w - w) / 2;
      return `<rect x="${x}" y="${y}" width="${w}" height="2" rx="1" fill="currentColor"/>`;
    })
    .join("");
  return svg(body);
}
