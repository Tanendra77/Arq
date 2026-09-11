import type { ArrowStyle } from "@arq/schema";
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

/** Never throws. localStorage is unavailable in some privacy modes, and a settings failure
 *  must never stop the editor from loading. */
export function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (raw === null) return DEFAULT_SETTINGS;
    const parsed = JSON.parse(raw) as Partial<Settings>;
    if (parsed.version !== 1) return DEFAULT_SETTINGS;
    return { ...DEFAULT_SETTINGS, ...parsed, version: 1 };
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
