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
    rootAttr("viewbox") ??
    (() => {
      const w = parseFloat(rootAttr("width") ?? "");
      const h = parseFloat(rootAttr("height") ?? "");
      return Number.isFinite(w) && Number.isFinite(h) ? `0 0 ${w} ${h}` : "0 0 72 72";
    })();
  const carried = rootAttrs
    .filter((a) => {
      const n = a.name.toLowerCase();
      return !ROOT_ATTR_DROP.has(n) && !n.startsWith("xmlns:");
    })
    .map((a) => ` ${a.name}="${a.value.replace(/"/g, "&quot;")}"`)
    .join("");
  // Anchored on (^|\s) so `data-id` / `aria-labelledby` are not mistaken for `id` / `href`, and
  // both quoting styles are accepted so the rewrites stay consistent with the url(#id) rewrite.
  const body = inner
    .replace(/(^|\s)id\s*=\s*(?:"([^"]*)"|'([^']*)')/g, (_m, ws: string, dq: string | undefined, sq: string | undefined) => `${ws}id="${p}-${dq ?? sq ?? ""}"`)
    .replace(/url\(#([^)]+)\)/g, (_m, id: string) => `url(#${p}-${id})`)
    .replace(
      /(^|\s)(xlink:href|href)\s*=\s*(?:"#([^"]*)"|'#([^']*)')/g,
      (_m, ws: string, attr: string, dq: string | undefined, sq: string | undefined) => `${ws}${attr}="#${p}-${dq ?? sq ?? ""}"`,
    );
  return `<svg x="${box.x}" y="${box.y}" width="${box.w}" height="${box.h}" viewBox="${viewBox}" preserveAspectRatio="xMidYMid meet"${carried}>${body}</svg>`;
}

export function placeholderBox(box: Rect, text: string): string {
  return `<g class="arq-icon-missing"><rect x="${box.x}" y="${box.y}" width="${box.w}" height="${box.h}" rx="4" fill="none" stroke="#999" stroke-dasharray="4 3"/><text x="${box.x + box.w / 2}" y="${box.y + box.h / 2}" font-size="7" text-anchor="middle" dominant-baseline="middle" fill="#999">${escapeXml(text)}</text></g>`;
}

export function escapeXml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
