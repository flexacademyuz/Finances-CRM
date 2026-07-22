import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import * as schema from "@shared/schema";
import { env } from "./env";

const pool = new pg.Pool({ connectionString: env.databaseUrl });

export const db = drizzle(pool, { schema });
export { pool };
export type DB = typeof db;
