import { useEffect, useRef, useSyncExternalStore } from "react";
import { ARROW_STYLES } from "@arq/schema";
import { loadSettings, saveSettings, themeColorDefaults, type Settings } from "../settings";
import { ColorField, SelectField } from "./inspector/Field";

const THEMES = ["light", "dark", "system"] as const;

/**
 * Settings are read live by Toolbar (the modal itself), Canvas (grid/snap) and Palette (creation
 * defaults), none of which share an ancestor dedicated to this concern — EditorStoreProvider is
 * scoped to the document, not the user's local preferences. A module-level store plus React's own
 * `useSyncExternalStore` gives every subscriber the same value and a re-render on change, without
 * adding a second context provider for something that isn't document state.
 *
 * `getSnapshot` re-reads localStorage on every call (cheap: nine primitive fields) rather than
 * trusting the cache blindly, so a test (or another tab) that changes storage outside `setSettings`
 * is still picked up on the next render instead of leaving stale state cached forever.
 */
let cache: Settings = loadSettings();
const listeners = new Set<() => void>();

function getSnapshot(): Settings {
  const fresh = loadSettings();
  if (JSON.stringify(fresh) !== JSON.stringify(cache)) cache = fresh;
  return cache;
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function setSettings(patch: Partial<Settings>): void {
  cache = { ...cache, ...patch };
  saveSettings(cache);
  listeners.forEach((l) => l());
}

export function useSettings(): [Settings, (patch: Partial<Settings>) => void] {
  const settings = useSyncExternalStore(subscribe, getSnapshot);
  return [settings, setSettings];
}

/**
 * Colours to carry along with a theme switch.
 *
 * Once any setting is saved the whole blob is persisted, including the colours — so without this a
 * user who had never picked a colour would still be stuck on the old theme's shape palette after
 * switching. Only colours still sitting at a theme default move; anything the user actually chose
 * is left exactly as they set it.
 */
export function retheme(current: Settings, next: Settings["theme"]): Partial<Settings> {
  const from = themeColorDefaults(current.theme);
  const to = themeColorDefaults(next);
  const patch: Partial<Settings> = {};
  if (current.nodeFill === from.nodeFill) patch.nodeFill = to.nodeFill;
  if (current.nodeStroke === from.nodeStroke) patch.nodeStroke = to.nodeStroke;
  if (current.edgeStroke === from.edgeStroke) patch.edgeStroke = to.edgeStroke;
  return patch;
}

/** Keeps the app root's `data-theme` (styles.css keys its dark/light variables off it) in sync
 *  with the setting. "system" removes the attribute so the `prefers-color-scheme` media query
 *  takes back over, matching DEFAULT_SETTINGS.theme. */
function useSyncTheme(theme: Settings["theme"]): void {
  useEffect(() => {
    if (theme === "system") document.documentElement.removeAttribute("data-theme");
    else document.documentElement.setAttribute("data-theme", theme);
  }, [theme]);
}

export function SettingsModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  // Called unconditionally (not after the `if (!open)` below) so the theme stays in sync with the
  // stored setting even while the dialog itself is closed.
  const [settings, setSettingsPatch] = useSettings();
  useSyncTheme(settings.theme);

  const dialogRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (open) dialogRef.current?.focus();
  }, [open]);

  if (!open) return null;

  return (
    <div className="arq-modal-backdrop" onClick={onClose}>
      <div
        ref={dialogRef}
        className="arq-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="arq-settings-title"
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          if (e.key === "Escape") onClose();
        }}
      >
        {/* Canvas appearance — pattern, grid, rulers — lives in the inspector with nothing
            selected, where its effect is visible. What is left here is app-wide: the theme, and
            the styles new elements are created with. */}
        <h2 id="arq-settings-title">Settings</h2>
        <SelectField label="Theme" value={settings.theme} options={THEMES}
          onChange={(v) => setSettingsPatch({ theme: v, ...retheme(settings, v) })} />
        <ColorField label="Default shape fill" value={settings.nodeFill}
          onChange={(v) => setSettingsPatch({ nodeFill: v })} />
        <ColorField label="Default shape stroke" value={settings.nodeStroke}
          onChange={(v) => setSettingsPatch({ nodeStroke: v })} />
        <ColorField label="Default line stroke" value={settings.edgeStroke}
          onChange={(v) => setSettingsPatch({ edgeStroke: v })} />
        <SelectField label="Default arrow style" value={settings.edgeArrow} options={ARROW_STYLES}
          onChange={(v) => setSettingsPatch({ edgeArrow: v })} />
        <button type="button" onClick={onClose}>Close</button>
      </div>
    </div>
  );
}
