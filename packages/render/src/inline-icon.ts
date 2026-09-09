import type { Rect } from "./metrics";

const ID_SAFE = /[^A-Za-z0-9_-]/g;

export function inlineIcon(svgText: string, prefix: string, box: Rect): string {
  const p = prefix.replace(ID_SAFE, "_");
  const s = svgText
    .replace(/<\?xml[\s\S]*?\?>/g, "")
    .replace(/<!DOCTYPE[\s\S]*?>/gi, "")
    .replace(/<!--[\s\S]*?-->/g, "")
    .trim();
  const open = s.match(/<svg\b[^>]*>/i);
  if (!open) return placeholderBox(box, "invalid svg");
  const attrs = open[0];
  const inner = s.slice((open.index ?? 0) + attrs.length).replace(/<\/svg>\s*$/i, "");
  const viewBox =
    attrs.match(/\bviewBox="([^"]+)"/)?.[1] ??
    (() => {
      const w = parseFloat(attrs.match(/\bwidth="([\d.]+)/)?.[1] ?? "");
      const h = parseFloat(attrs.match(/\bheight="([\d.]+)/)?.[1] ?? "");
      return Number.isFinite(w) && Number.isFinite(h) ? `0 0 ${w} ${h}` : "0 0 72 72";
    })();
  const body = inner
    .replace(/\bid="([^"]+)"/g, (_m, id: string) => `id="${p}-${id}"`)
    .replace(/url\(#([^)]+)\)/g, (_m, id: string) => `url(#${p}-${id})`)
    .replace(/\b(xlink:href|href)="#([^"]+)"/g, (_m, attr: string, id: string) => `${attr}="#${p}-${id}"`);
  return `<svg x="${box.x}" y="${box.y}" width="${box.w}" height="${box.h}" viewBox="${viewBox}" preserveAspectRatio="xMidYMid meet">${body}</svg>`;
}

export function placeholderBox(box: Rect, text: string): string {
  return `<g class="arq-icon-missing"><rect x="${box.x}" y="${box.y}" width="${box.w}" height="${box.h}" rx="4" fill="none" stroke="#999" stroke-dasharray="4 3"/><text x="${box.x + box.w / 2}" y="${box.y + box.h / 2}" font-size="7" text-anchor="middle" dominant-baseline="middle" fill="#999">${escapeXml(text)}</text></g>`;
}

export function escapeXml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
