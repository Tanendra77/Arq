import type { IconPack } from "../platform";

const svg = (body: string) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 72 72" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round">${body}</svg>`;

const broker = svg('<rect x="10" y="14" width="52" height="44" rx="6"/><path d="M10 30h52M22 42h8M34 42h16"/><circle cx="18" cy="22" r="2" fill="currentColor"/>');
const queue = svg('<rect x="8" y="26" width="56" height="20" rx="3"/><path d="M20 26v20M32 26v20M44 26v20"/><path d="M64 36l6 0M2 36l6 0"/>');
const topic = svg('<circle cx="36" cy="36" r="8"/><circle cx="36" cy="36" r="18"/><circle cx="36" cy="36" r="28" stroke-dasharray="4 4"/>');
const app = svg('<rect x="12" y="12" width="48" height="48" rx="8"/><path d="M26 30l-8 6 8 6M46 30l8 6-8 6M40 26l-8 20"/>');
const database = svg('<ellipse cx="36" cy="18" rx="22" ry="8"/><path d="M14 18v36c0 4.4 9.8 8 22 8s22-3.6 22-8V18"/><path d="M14 36c0 4.4 9.8 8 22 8s22-3.6 22-8"/>');
const cloud = svg('<path d="M22 54h30a12 12 0 0 0 2-23.8A16 16 0 0 0 23.5 28 11 11 0 0 0 22 54z"/>');
const shape = svg('<rect x="14" y="14" width="44" height="44" rx="4" stroke-dasharray="6 4"/>');

const BUILTIN_FILES: Record<string, string> = { broker, queue, topic, app, database, cloud, shape };

export const BUILTIN_PACK: IconPack = {
  manifest: {
    version: 1,
    id: "builtin",
    name: "Built-in primitives",
    count: Object.keys(BUILTIN_FILES).length,
    shapes: Object.keys(BUILTIN_FILES).map((slug) => ({
      id: `builtin/${slug}`,
      name: slug,
      category: "builtin",
      file: `builtin/${slug}.svg`,
      w: 72,
      h: 72,
      keywords: [slug],
    })),
  },
  svgs: Object.fromEntries(Object.entries(BUILTIN_FILES).map(([slug, text]) => [`builtin/${slug}`, text])),
};
