import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

export function openDatabase(databaseUrl: string) {
  const pool = new Pool({
    connectionString: databaseUrl,
    max: 4,
    connectionTimeoutMillis: 5_000,
    statement_timeout: 15_000,
  });
  pool.on("error", (error) =>
    console.error("Idle database connection failed", error.message),
  );

  return { db: drizzle(pool), pool };
}

export type Database = ReturnType<typeof openDatabase>["db"];
export type DatabaseTransaction = Parameters<
  Parameters<Database["transaction"]>[0]
>[0];
