import type { Rect } from "./metrics";

const ID_SAFE = /[^A-Za-z0-9_-]/g;

/** name="value" or name='value' anywhere in an open tag. */
const ATTR = /([A-Za-z_:][-A-Za-z0-9_:.]*)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;

/**
 * Root attributes the nested <svg> sets for itself (geometry, identity, namespaces). Everything
 * else on the icon's root — fill, stroke, stroke-width, class, opacity — is presentation the
 * icon's own shapes inherit, so it has to be carried over or the icon exports as a solid blob.
 * Compared lowercased; `xmlns:*` is handled separately.
 */
const ROOT_ATTR_DROP = new Set([
  "xmlns", "x", "y", "width", "height", "viewbox", "preserveaspectratio", "id", "version",
]);

/**
 * Carried attributes are presentation only. Event handlers and link targets are not
 * presentation: an `onload` or a `javascript:` href on the icon root would execute in any
 * browser that opens the exported SVG, and in the app the same string is inlined into the DOM.
 * Icon packs are user-supplied files, so neither is trusted here even though a full sanitizer
 * runs at import time.
 */
function isUnsafeRootAttr(lowerName: string): boolean {
  return (
    lowerName.startsWith("on") ||
    lowerName === "href" ||
    lowerName === "xlink:href" ||
    lowerName === "xlink:actuate" ||
    lowerName === "xlink:show"
  );
}

/**
 * Re-emit a viewBox as four numbers rather than passing the source string through. The value is
 * interpolated into a quoted attribute, so echoing it verbatim would let `viewBox='0 0 1 1"
 * onload="…'` close the attribute and open an event handler.
 */
function safeViewBox(raw: string | undefined): string | undefined {
  if (raw === undefined) return undefined;
  const parts = raw.trim().split(/[\s,]+/).map(Number);
  if (parts.length !== 4 || !parts.every((n) => Number.isFinite(n))) return undefined;
  return parts.join(" ");
}

function parseAttributes(openTag: string): { name: string; value: string }[] {
  const out: { name: string; value: string }[] = [];
  ATTR.lastIndex = 0;
  for (let m = ATTR.exec(openTag); m !== null; m = ATTR.exec(openTag)) {
    const name = m[1];
    if (name === undefined) continue;
    out.push({ name, value: m[2] ?? m[3] ?? "" });
  }
  return out;
}

export function inlineIcon(svgText: string, prefix: string, box: Rect): string {
  const p = prefix.replace(ID_SAFE, "_");
  const s = svgText
    .replace(/<\?xml[\s\S]*?\?>/g, "")
    .replace(/<!DOCTYPE[\s\S]*?>/gi, "")
    .replace(/<!--[\s\S]*?-->/g, "")
    .trim();
  const open = s.match(/<svg\b[^>]*>/i);
  if (!open) return placeholderBox(box, "invalid svg");
  const openTag = open[0];
  const inner = s.slice((open.index ?? 0) + openTag.length).replace(/<\/svg>\s*$/i, "");
  const rootAttrs = parseAttributes(openTag);
  const rootAttr = (lowerName: string): string | undefined =>
    rootAttrs.find((a) => a.name.toLowerCase() === lowerName)?.value;
  const viewBox =
    safeViewBox(rootAttr("viewbox")) ??
    (() => {
      const w = parseFloat(rootAttr("width") ?? "");
      const h = parseFloat(rootAttr("height") ?? "");
      return Number.isFinite(w) && Number.isFinite(h) ? `0 0 ${w} ${h}` : "0 0 72 72";
    })();
  const carried = rootAttrs
    .filter((a) => {
      const n = a.name.toLowerCase();
      return !ROOT_ATTR_DROP.has(n) && !n.startsWith("xmlns:") && !isUnsafeRootAttr(n);
    })
    .map((a) => ` ${a.name}="${escapeXml(a.value)}"`)
    .join("");
  // Anchored on (^|\s) so `data-id` / `aria-labelledby` are not mistaken for `id` / `href`, and
  // both quoting styles are accepted so the rewrites stay consistent with the url(#id) rewrite.
  // Values are re-emitted inside double quotes, so a single-quoted source value carrying a
  // double quote would otherwise close the attribute and let the rest parse as new attributes.
  const body = inner
    .replace(/(^|\s)id\s*=\s*(?:"([^"]*)"|'([^']*)')/g, (_m, ws: string, dq: string | undefined, sq: string | undefined) => `${ws}id="${p}-${escapeXml(dq ?? sq ?? "")}"`)
    .replace(/url\(#([^)"']+)\)/g, (_m, id: string) => `url(#${p}-${id})`)
    .replace(
      /(^|\s)(xlink:href|href)\s*=\s*(?:"#([^"]*)"|'#([^']*)')/g,
      (_m, ws: string, attr: string, dq: string | undefined, sq: string | undefined) => `${ws}${attr}="#${p}-${escapeXml(dq ?? sq ?? "")}"`,
    );
  return `<svg x="${box.x}" y="${box.y}" width="${box.w}" height="${box.h}" viewBox="${viewBox}" preserveAspectRatio="xMidYMid meet"${carried}>${body}</svg>`;
}

export function placeholderBox(box: Rect, text: string): string {
  return `<g class="arq-icon-missing"><rect x="${box.x}" y="${box.y}" width="${box.w}" height="${box.h}" rx="4" fill="none" stroke="#999" stroke-dasharray="4 3"/><text x="${box.x + box.w / 2}" y="${box.y + box.h / 2}" font-size="7" text-anchor="middle" dominant-baseline="middle" fill="#999">${escapeXml(text)}</text></g>`;
}

export function escapeXml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
