import { defineConfig } from "vitest/config";
// Stub package until Task 12 adds the renderer; it has no test files yet, so an
// empty run must not fail the workspace-wide `pnpm test`.
export default defineConfig({ test: { include: ["test/**/*.test.ts"], passWithNoTests: true } });
