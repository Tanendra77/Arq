export class MigrationError extends Error {
  constructor(public readonly foundVersion: unknown) {
    super(`unsupported document version ${String(foundVersion)}; this build reads version 1`);
    this.name = "MigrationError";
  }
}

/** Identity for version 1. Future versions add steps here, oldest first. */
export function migrate(raw: unknown): unknown {
  const version = typeof raw === "object" && raw !== null ? (raw as { version?: unknown }).version : undefined;
  if (version === 1) return raw;
  throw new MigrationError(version);
}
