import { z } from "zod";
import { EdgeStyleSchema, NODE_SHAPES, NodeStyleSchema } from "@arq/schema";

/**
 * A zod type as a short, human (and model) readable description. Read from the schema itself, so the
 * instructions an AI is given can never drift from what the editor actually accepts.
 */
export function describeType(t: z.ZodTypeAny): string {
  if (t instanceof z.ZodOptional || t instanceof z.ZodDefault) return describeType(t._def.innerType as z.ZodTypeAny);
  if (t instanceof z.ZodEnum) return (t.options as string[]).map((o) => JSON.stringify(o)).join(" | ");
  if (t instanceof z.ZodBoolean) return "true | false";
  if (t instanceof z.ZodNumber) {
    const checks = t._def.checks;
    const int = checks.some((c) => c.kind === "int");
    const min = checks.find((c) => c.kind === "min");
    const max = checks.find((c) => c.kind === "max");
    const range = min && "value" in min && max && "value" in max ? ` ${min.value}–${max.value}` : "";
    return `${int ? "integer" : "number"}${range}`;
  }
  if (t instanceof z.ZodString) {
    const regex = t._def.checks.find((c) => c.kind === "regex");
    return regex?.message?.startsWith("expected ") ? `"${regex.message.slice("expected ".length)}"` : "string";
  }
  if (t instanceof z.ZodObject) {
    const shape = t.shape as Record<string, z.ZodTypeAny>;
    return `{ ${Object.entries(shape).map(([k, v]) => `"${k}": ${describeType(v)}`).join(", ")} }`;
  }
  return "value";
}

const styleLines = (schema: z.ZodObject<z.ZodRawShape>) =>
  Object.entries(schema.shape as Record<string, z.ZodTypeAny>).map(([k, v]) => `  - "${k}": ${describeType(v)}`).join("\n");

const EXAMPLE = {
  version: 2,
  title: "Order flow",
  layout: { direction: "RIGHT" },
  nodes: [
    { id: "web", shape: "rect", label: "Web shop" },
    { id: "orders", shape: "cylinder", label: "Orders DB", style: { fill: "#e7f5ff", stroke: "#1971c2" } },
    { id: "queue", shape: "parallelogram", label: "orders/new" },
    { id: "billing", shape: "rect", label: "Billing", style: { animate: "pulse" } },
    { id: "note", shape: "note", label: "Retries 3x", style: { fill: "#ffe98a" } },
  ],
  edges: [
    { id: "e1", from: "web", to: "orders", label: "write" },
    { id: "e2", from: "web", to: "queue", label: "publish", style: { animate: "packets", animateSpeed: "fast" } },
    { id: "e3", from: "queue", to: "billing", style: { strokeDash: "dashed", animate: "flow" } },
  ],
};

/** Everything a language model needs to write a diagram this editor will open, as one prompt to paste ahead of a request. */
export function aiInstructions(): string {
  return `You write diagrams for the Arq diagram editor as JSON. Reply with only the JSON document, no prose.

DOCUMENT
{ "version": 2, "title": string, "layout": { "direction": "RIGHT" | "DOWN" | "LEFT" | "UP" }, "nodes": Node[], "edges": Edge[] }

NODE
{ "id": string, "shape": string, "label": string, "style"?: NodeStyle }
- "id": unique; letters, digits, _ . : - only.
- "shape": ${NODE_SHAPES.filter((s) => s !== "freehand").map((s) => JSON.stringify(s)).join(" | ")}
- "label": the text shown in the shape; "" for none. Use \\n for a line break.

EDGE (a line or arrow)
{ "id": string, "from": node id, "to": node id, "label"?: string, "style"?: EdgeStyle }
- An end can also be pinned to a spot on a shape: { "node": id, "ax": 0–1, "ay": 0–1 } (fractions of the shape's box),
  or float free at a point: { "x": number, "y": number }.

NodeStyle — every key optional:
${styleLines(NodeStyleSchema)}

EdgeStyle — every key optional:
${styleLines(EdgeStyleSchema)}

RULES
- Do not give positions. Arq lays the diagram out itself, flowing in "layout.direction".
  (Only if a position truly matters: "layout": { "pinned": { "<node id>": { "x": n, "y": n, "w": n, "h": n } } }.)
- Omit a style key to get the default. Colours are "#rrggbb".
- Animations: "flow" moves dashes along a line, "packets" sends dots along it, "pulse" makes an element throb.
- Every "from"/"to" must name a node that exists.

EXAMPLE
${JSON.stringify(EXAMPLE, null, 2)}
`;
}
