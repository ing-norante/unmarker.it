import { Pool, type PoolClient } from "pg";
import { getConfig } from "./config.ts";

let pool: Pool | undefined;
export function database() {
  pool ??= new Pool({
    connectionString: getConfig().databaseUrl,
    max: 5,
    connectionTimeoutMillis: 5000,
    idleTimeoutMillis: 10_000,
  });
  return pool;
}

export async function transaction<T>(
  operation: (db: PoolClient) => Promise<T>,
): Promise<T> {
  const db = await database().connect();
  try {
    await db.query("BEGIN");
    await db.query("SET LOCAL lock_timeout = '15000ms'");
    // Small inventory: one lock serializes reservation, activation and release across instances.
    await db.query("SELECT pg_advisory_xact_lock(74319, 1)");
    const result = await operation(db);
    await db.query("COMMIT");
    return result;
  } catch (error) {
    await db.query("ROLLBACK");
    throw error;
  } finally {
    db.release();
  }
}
