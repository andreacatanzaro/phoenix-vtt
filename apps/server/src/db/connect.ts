import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import pg from "pg";
import * as schema from "./schema";
import type { Database } from "./types";

export type Connection = { db: Database; close: () => Promise<void> };

/** Opens a pool on PostgreSQL and applies the versioned SQL migrations. */
export async function connect(databaseUrl: string, migrationsFolder: string): Promise<Connection> {
  const pool = new pg.Pool({ connectionString: databaseUrl });
  const db = drizzle(pool, { schema });
  await migrate(db, { migrationsFolder });
  return { db, close: () => pool.end() };
}
