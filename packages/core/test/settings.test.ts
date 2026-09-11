import { beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_SETTINGS, loadSettings, saveSettings, SETTINGS_KEY } from "../src/settings";

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
    expect(s.nodeFill).toBe(DEFAULT_SETTINGS.nodeFill);
    expect(s.theme).toBe("dark");
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
