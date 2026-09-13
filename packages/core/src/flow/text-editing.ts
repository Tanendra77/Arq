import { useEffect, useSyncExternalStore, type CSSProperties } from "react";
import { textCss, type ResolvedTextStyle } from "@arq/render";

/**
 * Which element's label is being typed into on the canvas, if any. The inspector watches it to open
 * its Text tab, so the text settings are at hand while the text is being written.
 */
let editing: string | null = null;
const listeners = new Set<() => void>();
const set = (id: string | null) => {
  if (editing === id) return;
  editing = id;
  listeners.forEach((l) => l());
};

export function useTextEditing(): string | null {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => editing,
  );
}

/** Report `id` as being edited for as long as `active` holds. */
export function useReportTextEditing(id: string, active: boolean): void {
  useEffect(() => {
    if (!active) return;
    set(id);
    return () => {
      if (editing === id) set(null);
    };
  }, [id, active]);
}

/**
 * A label's text settings as React styles, from the same `textCss` the exporter writes — so a bold
 * mono label on the canvas is the bold mono label in the file. Unset colour follows the theme.
 */
export function labelStyle(t: ResolvedTextStyle): CSSProperties {
  const css = textCss(t);
  return {
    fontSize: t.fontSize,
    ...(css["font-family"] !== undefined ? { fontFamily: css["font-family"] } : {}),
    ...(t.bold ? { fontWeight: 700 } : {}),
    ...(t.italic ? { fontStyle: "italic" } : {}),
    ...(css["text-decoration"] !== undefined ? { textDecoration: css["text-decoration"] } : {}),
    ...(t.textColor !== undefined ? { color: t.textColor } : {}),
  };
}
