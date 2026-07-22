import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: {
    alias: {
      "@shared": path.resolve(import.meta.dirname, "shared"),
    },
  },
  test: {
    include: ["tests/**/*.test.ts"],
    environment: "node",
    // Pure-logic tests import service modules that transitively load db.ts.
    // A dummy URL satisfies env validation; no query is ever issued, so the
    // lazily-created pool never actually connects.
    env: {
      DATABASE_URL: "postgresql://test:test@localhost:5432/test",
    },
  },
});
