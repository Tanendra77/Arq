export const DRAG_MIME = "application/x-arq-palette";

/** Names a `PALETTE_ITEMS` key; the consumer (Canvas's drop handler) resolves it. */
export interface DragPayload {
  item: string;
}

export function encodeDragPayload(p: DragPayload): string {
  return JSON.stringify(p);
}

export function decodeDragPayload(s: string | null): DragPayload | null {
  if (!s) return null;
  try {
    // Parser boundary: the drag payload arrives as untrusted JSON from the DataTransfer,
    // so it is narrowed to `Partial<DragPayload>` and validated field by field below.
    const raw = JSON.parse(s) as Partial<DragPayload>;
    if (typeof raw.item !== "string" || raw.item === "") return null;
    return { item: raw.item };
  } catch {
    return null;
  }
}
