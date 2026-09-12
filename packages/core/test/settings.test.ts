import { beforeEach, describe, expect, it, vi } from "vitest";
import { DARK_SHAPE_COLORS, DEFAULT_SETTINGS, loadSettings, saveSettings, SETTINGS_KEY, themeColorDefaults } from "../src/settings";

beforeEach(() => localStorage.clear());

describe("settings", () => {
  it("returns defaults when nothing is stored", () => {
    expect(loadSettings()).toEqual(DEFAULT_SETTINGS);
  });

  it("round-trips a saved value", () => {
    saveSettings({ ...DEFAULT_SETTINGS, theme: "dark", gridSize: 20 });
    expect(loadSettings().theme).toBe("dark");
    expect(loadSettings().gridSize).toBe(20);
  });

  it("falls back to defaults on malformed JSON rather than throwing", () => {
    localStorage.setItem(SETTINGS_KEY, "{not json");
    expect(loadSettings()).toEqual(DEFAULT_SETTINGS);
  });

  it("fills in missing keys from defaults", () => {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify({ version: 1, theme: "dark" }));
    expect(loadSettings().gridSize).toBe(DEFAULT_SETTINGS.gridSize);
  });

  it("ignores an unknown settings version", () => {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify({ version: 99, theme: "dark" }));
    expect(loadSettings()).toEqual(DEFAULT_SETTINGS);
  });

  it("drops a malformed colour to its default but keeps other valid fields in the same blob", () => {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify({ version: 1, nodeFill: "blue", theme: "dark" }));
    const s = loadSettings();
    // The default a colour drops back to is the one for the *stored theme*, not the light-mode
    // constant: a dark-mode user who has never opened the colour pickers gets dark shape colours.
    expect(s.nodeFill).toBe(themeColorDefaults("dark").nodeFill);
    expect(s.theme).toBe("dark");
  });

  it("defaults shape colours to a dark fill with a light outline under the dark theme", () => {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify({ version: 1, theme: "dark" }));
    const s = loadSettings();
    expect(s.nodeFill).toBe(DARK_SHAPE_COLORS.nodeFill);
    expect(s.nodeStroke).toBe(DARK_SHAPE_COLORS.nodeStroke);
    expect(s.nodeFill).not.toBe(DEFAULT_SETTINGS.nodeFill);
  });

  it("keeps the light defaults under the light theme", () => {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify({ version: 1, theme: "light" }));
    const s = loadSettings();
    expect(s.nodeFill).toBe(DEFAULT_SETTINGS.nodeFill);
    expect(s.nodeStroke).toBe(DEFAULT_SETTINGS.nodeStroke);
  });

  it("keeps a colour the user actually chose, whatever the theme", () => {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify({ version: 1, theme: "dark", nodeFill: "#ff00ff" }));
    expect(loadSettings().nodeFill).toBe("#ff00ff");
  });

  it("drops a bogus edgeArrow to its default but keeps other valid fields in the same blob", () => {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify({ version: 1, edgeArrow: "star", gridSize: 25 }));
    const s = loadSettings();
    expect(s.edgeArrow).toBe(DEFAULT_SETTINGS.edgeArrow);
    expect(s.gridSize).toBe(25);
  });

  it("drops a non-positive gridSize to its default but keeps other valid fields in the same blob", () => {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify({ version: 1, gridSize: -5, theme: "light" }));
    const s = loadSettings();
    expect(s.gridSize).toBe(DEFAULT_SETTINGS.gridSize);
    expect(s.theme).toBe("light");
  });

  it("survives a localStorage that throws", () => {
    const spy = vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => { throw new Error("blocked"); });
    expect(loadSettings()).toEqual(DEFAULT_SETTINGS);
    spy.mockRestore();
  });

  it("does not throw when saving is blocked", () => {
    const spy = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("blocked"); });
    expect(() => saveSettings(DEFAULT_SETTINGS)).not.toThrow();
    spy.mockRestore();
  });
});

describe("canvas settings", () => {
  it("has no rulers until asked, and remembers the choice", () => {
    expect(loadSettings().rulers).toBe(false);
    localStorage.setItem(SETTINGS_KEY, JSON.stringify({ version: 1, rulers: true }));
    expect(loadSettings().rulers).toBe(true);
  });

  it("accepts every background pattern and rejects anything else", () => {
    for (const grid of ["off", "dots", "lines", "cross"] as const) {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify({ version: 1, grid }));
      expect(loadSettings().grid).toBe(grid);
    }
    localStorage.setItem(SETTINGS_KEY, JSON.stringify({ version: 1, grid: "tartan" }));
    expect(loadSettings().grid).toBe(DEFAULT_SETTINGS.grid);
  });
});
