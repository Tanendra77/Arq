import { NODE_TYPES, type NodeType } from "@arq/schema";

export const DRAG_MIME = "application/x-arq-palette";

export interface DragPayload {
  nodeType: NodeType;
  icon?: string;
  label: string;
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
    if (typeof raw.label !== "string" || !NODE_TYPES.includes(raw.nodeType as NodeType)) return null;
    return {
      nodeType: raw.nodeType as NodeType,
      label: raw.label,
      ...(raw.icon !== undefined ? { icon: raw.icon } : {}),
    };
  } catch {
    return null;
  }
}
