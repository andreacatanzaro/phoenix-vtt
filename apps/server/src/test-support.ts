import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import type { FastifyInstance } from "fastify";
import { buildApp } from "./app";
import type { Config } from "./config";
import * as schema from "./db/schema";
import type { Database } from "./db/types";

/** Test helpers only: an in-memory PostgreSQL (PGlite) with the real migrations applied. Never imported by the server itself. */
export const testConfig: Config = {
  nodeEnv: "test",
  port: 0,
  host: "127.0.0.1",
  databaseUrl: "memory://",
  sessionSecret: "test-secret-test-secret-test-secret-test",
  cookieSecure: false,
  sessionDays: 30,
  staticDir: null,
};

export async function createTestDb(): Promise<{ db: Database; close: () => Promise<void> }> {
  const client = new PGlite();
  const db = drizzle(client, { schema });
  await migrate(db, { migrationsFolder: join(dirname(fileURLToPath(import.meta.url)), "..", "drizzle") });
  return { db, close: () => client.close() };
}

export type TestApp = { app: FastifyInstance; db: Database; clock: { now: Date }; close: () => Promise<void> };

export async function createTestApp(overrides: Partial<Config> = {}): Promise<TestApp> {
  const { db, close } = await createTestDb();
  const clock = { now: new Date("2026-01-01T12:00:00Z") };
  const app = await buildApp({ db, config: { ...testConfig, ...overrides }, now: () => clock.now });
  await app.ready();
  return {
    app,
    db,
    clock,
    close: async () => {
      await app.close();
      await close();
    },
  };
}
