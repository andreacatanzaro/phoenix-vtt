import { sql } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import type { Database } from "../db/types";
import { fail } from "../http";

/** Liveness plus a database round trip, for the hosting platform's health check. */
export function healthRoutes(app: FastifyInstance, db: Database): void {
  app.get("/health", async (_request, reply) => {
    try {
      await db.execute(sql`select 1`);
      return { status: "ok" };
    } catch (error) {
      app.log.error({ err: error }, "health check failed");
      return fail(reply, 503, "unavailable");
    }
  });
}
