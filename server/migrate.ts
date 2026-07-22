import path from "node:path";
import fs from "node:fs";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { db } from "./db";

/**
 * Apply any pending SQL migrations from ./drizzle on startup. Idempotent — the
 * migrator records applied migrations in a `drizzle.__drizzle_migrations` table
 * and skips them next time, so this is safe to run on every boot. This is what
 * lets a fresh deploy create its own schema without a manual `db:push`.
 *
 * (For a multi-replica deployment, run migrations as a one-off release step
 * instead of on every instance's boot.)
 */
export async function runMigrations(): Promise<void> {
  // Resolve relative to the repo root (cwd), where the committed folder lives,
  // so it works whether we run from source (tsx) or the esbuild bundle.
  const candidates = [
    path.resolve(process.cwd(), "drizzle"),
    path.resolve(import.meta.dirname, "../drizzle"),
  ];
  const folder = candidates.find((p) => fs.existsSync(p));
  if (!folder) {
    console.warn("[migrate] no ./drizzle folder found — skipping migrations.");
    return;
  }
  await migrate(db, { migrationsFolder: folder });
  console.log("[migrate] database schema is up to date.");
}
