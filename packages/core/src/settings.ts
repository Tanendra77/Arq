import { ARROW_STYLES, ColorSchema, type ArrowStyle } from "@arq/schema";
import { STYLE_DEFAULTS } from "@arq/render";

export const SETTINGS_KEY = "arq.settings";

export interface Settings {
  version: 1;
  theme: "light" | "dark" | "system";
  grid: "off" | "dots" | "lines";
  snap: boolean;
  gridSize: number;
  nodeFill: string;
  nodeStroke: string;
  edgeStroke: string;
  edgeArrow: ArrowStyle;
}

export const DEFAULT_SETTINGS: Settings = {
  version: 1, theme: "system", grid: "dots", snap: true, gridSize: 10,
  nodeFill: STYLE_DEFAULTS.node.fill, nodeStroke: STYLE_DEFAULTS.node.stroke,
  edgeStroke: STYLE_DEFAULTS.edge.stroke, edgeArrow: "arrow",
};

const THEMES = ["light", "dark", "system"] as const;
const GRIDS = ["off", "dots", "lines"] as const;

/** Drops any single field that fails validation back to its default, rather than rejecting the
 *  whole stored blob — these values flow straight into `NodeSchema.parse`/`EdgeSchema.parse`
 *  on the next palette click or canvas drop, and one bad key must not cost the user every other
 *  preference too. */
function sanitize(parsed: Partial<Settings>): Settings {
  const s: Settings = { ...DEFAULT_SETTINGS };
  if (THEMES.includes(parsed.theme as (typeof THEMES)[number])) s.theme = parsed.theme as Settings["theme"];
  if (GRIDS.includes(parsed.grid as (typeof GRIDS)[number])) s.grid = parsed.grid as Settings["grid"];
  if (typeof parsed.snap === "boolean") s.snap = parsed.snap;
  if (typeof parsed.gridSize === "number" && parsed.gridSize > 0) s.gridSize = parsed.gridSize;
  if (ColorSchema.safeParse(parsed.nodeFill).success) s.nodeFill = parsed.nodeFill as string;
  if (ColorSchema.safeParse(parsed.nodeStroke).success) s.nodeStroke = parsed.nodeStroke as string;
  if (ColorSchema.safeParse(parsed.edgeStroke).success) s.edgeStroke = parsed.edgeStroke as string;
  if (ARROW_STYLES.includes(parsed.edgeArrow as ArrowStyle)) s.edgeArrow = parsed.edgeArrow as ArrowStyle;
  return s;
}

/** Never throws. localStorage is unavailable in some privacy modes, and a settings failure
 *  must never stop the editor from loading. */
export function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (raw === null) return DEFAULT_SETTINGS;
    const parsed = JSON.parse(raw) as Partial<Settings>;
    if (parsed.version !== 1) return DEFAULT_SETTINGS;
    return sanitize(parsed);
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function saveSettings(s: Settings): void {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
  } catch {
    // Storage blocked. Settings stay in memory for this session; losing a preference is not
    // worth surfacing an error over.
  }
}
