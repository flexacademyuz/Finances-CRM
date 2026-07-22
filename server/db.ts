import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import * as schema from "@shared/schema";
import { env } from "./env";

const pool = new pg.Pool({ connectionString: env.databaseUrl });

export const db = drizzle(pool, { schema });
export { pool };
export type DB = typeof db;

/**
 * Wait for the database to accept connections before we run migrations. On
 * platforms like Railway the private network can take a few seconds to become
 * reachable after a deploy, so a single immediate connect may fail even though
 * the DB is fine moments later. Retries with backoff, then gives a clear error.
 */
export async function waitForDatabase(attempts = 10, delayMs = 2000): Promise<void> {
  const redactedHost = safeHost(env.databaseUrl);
  for (let i = 1; i <= attempts; i++) {
    try {
      const client = await pool.connect();
      client.release();
      if (i > 1) console.log(`[db] connected on attempt ${i}.`);
      return;
    } catch (err) {
      const msg = (err as Error).message;
      const localhost = /127\.0\.0\.1|::1|localhost/.test(msg);
      console.warn(`[db] connect attempt ${i}/${attempts} failed (host ${redactedHost}): ${msg}`);
      if (localhost) {
        // A localhost target means DATABASE_URL isn't the real DB — retrying
        // won't help, so fail fast with an actionable message.
        throw new Error(
          "DATABASE_URL points at localhost — the app is not receiving your database URL. " +
            "On Railway, set DATABASE_URL to a reference: ${{Postgres.DATABASE_URL}}.",
        );
      }
      if (i === attempts) throw err;
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }
}

/** Extract just the host:port from a connection string for safe logging. */
function safeHost(url: string): string {
  try {
    const u = new URL(url);
    return `${u.hostname}:${u.port || "5432"}`;
  } catch {
    return "unparseable";
  }
}
