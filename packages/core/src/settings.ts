import { ARROW_STYLES, ColorSchema, type ArrowStyle } from "@arq/schema";
import { STYLE_DEFAULTS } from "@arq/render";

export const SETTINGS_KEY = "arq.settings";

export interface Settings {
  version: 1;
  theme: "light" | "dark" | "system";
  grid: "off" | "dots" | "lines" | "cross";
  rulers: boolean;
  minimap: boolean;
  /** What the main area shows: the canvas, the diagram's JSON, or both side by side. */
  editorView: "canvas" | "split" | "json";
  /** Widths of the shape palette on the left and the inspector on the right, dragged by their edges. */
  paletteWidth: number;
  inspectorWidth: number;
  snap: boolean;
  gridSize: number;
  nodeFill: string;
  nodeStroke: string;
  edgeStroke: string;
  edgeArrow: ArrowStyle;
  /** Corners a new polygon is drawn with, and points a new star is drawn with. */
  polygonSides: number;
  starPoints: number;
}

export const DEFAULT_SETTINGS: Settings = {
  version: 1, theme: "system", grid: "dots", rulers: false, minimap: true, editorView: "canvas", snap: true, gridSize: 10,
  paletteWidth: 112, inspectorWidth: 260,
  nodeFill: STYLE_DEFAULTS.node.fill, nodeStroke: STYLE_DEFAULTS.node.stroke,
  edgeStroke: STYLE_DEFAULTS.edge.stroke, edgeArrow: "arrow",
  polygonSides: 6, starPoints: 5,
};

/** How far each side panel can be dragged. */
export const PANEL_LIMITS = {
  paletteWidth: { min: 72, max: 360 },
  inspectorWidth: { min: 200, max: 560 },
} as const;

const THEMES = ["light", "dark", "system"] as const;
const GRIDS = ["off", "dots", "lines", "cross"] as const;
export const EDITOR_VIEWS = ["canvas", "split", "json"] as const;

/**
 * Shape colours that read on a dark canvas: a near-black fill with a white outline, the inverse of
 * the light-mode default. `STYLE_DEFAULTS` cannot supply these — the renderer resolves against it
 * and must produce the same bytes on every machine — so they are a *creation* default, baked into
 * each new element's own style exactly like the light-mode pair.
 */
export const DARK_SHAPE_COLORS = { nodeFill: "#1e1e1e", nodeStroke: "#ffffff", edgeStroke: "#e6e6e6" } as const;

/** Whether a theme setting paints dark right now; "system" asks the OS. */
export function isDarkTheme(theme: Settings["theme"]): boolean {
  if (theme !== "system") return theme === "dark";
  try {
    return window.matchMedia("(prefers-color-scheme: dark)").matches;
  } catch {
    return false; // no matchMedia (jsdom without a stub, some embedders): treat as light
  }
}

/** The creation colours a theme starts from, before any explicit choice the user has stored. */
export function themeColorDefaults(theme: Settings["theme"]): Pick<Settings, "nodeFill" | "nodeStroke" | "edgeStroke"> {
  return isDarkTheme(theme)
    ? { ...DARK_SHAPE_COLORS }
    : { nodeFill: DEFAULT_SETTINGS.nodeFill, nodeStroke: DEFAULT_SETTINGS.nodeStroke, edgeStroke: DEFAULT_SETTINGS.edgeStroke };
}

/** Drops any single field that fails validation back to its default, rather than rejecting the
 *  whole stored blob — these values flow straight into `NodeSchema.parse`/`EdgeSchema.parse`
 *  on the next palette click or canvas drop, and one bad key must not cost the user every other
 *  preference too. */
function sanitize(parsed: Partial<Settings>): Settings {
  const theme = THEMES.includes(parsed.theme as (typeof THEMES)[number]) ? (parsed.theme as Settings["theme"]) : DEFAULT_SETTINGS.theme;
  // Colours start from whatever the *active theme* calls for, so a dark-mode user gets dark shapes
  // without touching a colour picker. An explicitly stored colour still overrides it below.
  const s: Settings = { ...DEFAULT_SETTINGS, ...themeColorDefaults(theme), theme };
  if (THEMES.includes(parsed.theme as (typeof THEMES)[number])) s.theme = parsed.theme as Settings["theme"];
  if (GRIDS.includes(parsed.grid as (typeof GRIDS)[number])) s.grid = parsed.grid as Settings["grid"];
  if (typeof parsed.snap === "boolean") s.snap = parsed.snap;
  if (typeof parsed.rulers === "boolean") s.rulers = parsed.rulers;
  if (typeof parsed.minimap === "boolean") s.minimap = parsed.minimap;
  if (EDITOR_VIEWS.includes(parsed.editorView as (typeof EDITOR_VIEWS)[number])) s.editorView = parsed.editorView as Settings["editorView"];
  for (const k of ["paletteWidth", "inspectorWidth"] as const) {
    const v = parsed[k];
    if (typeof v === "number" && v >= PANEL_LIMITS[k].min && v <= PANEL_LIMITS[k].max) s[k] = v;
  }
  if (typeof parsed.gridSize === "number" && parsed.gridSize > 0) s.gridSize = parsed.gridSize;
  if (ColorSchema.safeParse(parsed.nodeFill).success) s.nodeFill = parsed.nodeFill as string;
  if (ColorSchema.safeParse(parsed.nodeStroke).success) s.nodeStroke = parsed.nodeStroke as string;
  if (ColorSchema.safeParse(parsed.edgeStroke).success) s.edgeStroke = parsed.edgeStroke as string;
  if (ARROW_STYLES.includes(parsed.edgeArrow as ArrowStyle)) s.edgeArrow = parsed.edgeArrow as ArrowStyle;
  // Same bounds as NodeStyleSchema.sides: these go straight into a new node's style.
  const sides = (n: unknown): n is number => Number.isInteger(n) && (n as number) >= 3 && (n as number) <= 24;
  if (sides(parsed.polygonSides)) s.polygonSides = parsed.polygonSides;
  if (sides(parsed.starPoints)) s.starPoints = parsed.starPoints;
  return s;
}

/** Never throws. localStorage is unavailable in some privacy modes, and a settings failure
 *  must never stop the editor from loading. */
export function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (raw === null) return sanitize({});
    const parsed = JSON.parse(raw) as Partial<Settings>;
    if (parsed.version !== 1) return sanitize({});
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
