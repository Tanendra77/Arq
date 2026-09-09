import type { ZodError } from "zod";
import { DocumentSchema, type Document } from "./document";
import { migrate, MigrationError } from "./migrate";

export type ParseResult = { ok: true; document: Document } | { ok: false; errors: string[] };

export function formatIssues(error: ZodError): string[] {
  return error.issues.map((issue) => {
    const path = issue.path
      .map((seg, i) => (typeof seg === "number" ? `[${seg}]` : i === 0 ? seg : `.${seg}`))
      .join("");
    return `${path || "document"}: ${issue.message}`;
  });
}

export function parseDocument(text: string): ParseResult {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (e) {
    return { ok: false, errors: [`not valid JSON: ${(e as Error).message}`] };
  }
  let migrated: unknown;
  try {
    migrated = migrate(raw);
  } catch (e) {
    if (e instanceof MigrationError) return { ok: false, errors: [e.message] };
    throw e;
  }
  const result = DocumentSchema.safeParse(migrated);
  if (!result.success) return { ok: false, errors: formatIssues(result.error) };
  return { ok: true, document: result.data };
}

export function serializeDocument(doc: Document): string {
  return JSON.stringify(doc, null, 2) + "\n";
}
