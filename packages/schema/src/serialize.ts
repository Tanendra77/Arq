import type { ZodError } from "zod";
import { DocumentSchema, type Document } from "./document";
import { migrate, MigrationError } from "./migrate";

/** One validation problem, with the path into the document it concerns (empty for the whole document). */
export interface ParseIssue {
  path: (string | number)[];
  message: string;
}

export type ParseResult =
  | { ok: true; document: Document }
  /** `errors` is `issues` formatted as readable lines; `issues` keeps the paths, for pointing at the text. */
  | { ok: false; errors: string[]; issues: ParseIssue[] };

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
    const message = `not valid JSON: ${(e as Error).message}`;
    return { ok: false, errors: [message], issues: [{ path: [], message }] };
  }
  let migrated: unknown;
  try {
    migrated = migrate(raw);
  } catch (e) {
    if (e instanceof MigrationError) return { ok: false, errors: [e.message], issues: [{ path: ["version"], message: e.message }] };
    throw e;
  }
  const result = DocumentSchema.safeParse(migrated);
  if (!result.success) {
    return {
      ok: false,
      errors: formatIssues(result.error),
      issues: result.error.issues.map((i) => ({ path: i.path, message: i.message })),
    };
  }
  return { ok: true, document: result.data };
}

export function serializeDocument(doc: Document): string {
  return JSON.stringify(doc, null, 2) + "\n";
}
