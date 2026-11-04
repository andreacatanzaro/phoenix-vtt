import { and, eq, ne } from "drizzle-orm";
import type { UpdateSessionInput } from "@phoenix/shared";
import { gameSessions } from "./db/schema";
import type { Database } from "./db/types";

type Row = typeof gameSessions.$inferSelect;

/**
 * Writes that depend on the status of a session. Each one states the status in the same statement that writes, so
 * a request that read the session a moment earlier cannot undo what another request did in between.
 */

/** Deletes the session only if it is a draft at this very moment. */
export async function deleteDraft(db: Database, worldId: string, sessionId: string): Promise<"deleted" | "not-draft" | "missing"> {
  const removed = await db
    .delete(gameSessions)
    .where(and(eq(gameSessions.id, sessionId), eq(gameSessions.worldId, worldId), eq(gameSessions.status, "draft")))
    .returning({ id: gameSessions.id });
  if (removed.length > 0) return "deleted";
  const still = await db.select({ id: gameSessions.id }).from(gameSessions).where(and(eq(gameSessions.id, sessionId), eq(gameSessions.worldId, worldId))).limit(1);
  return still.length > 0 ? "not-draft" : "missing";
}

/** Changes the details of the session unless it is closed at this very moment. */
export async function updateDetails(db: Database, worldId: string, sessionId: string, patch: UpdateSessionInput): Promise<Row | "closed" | "missing"> {
  const { scheduledAt, ...rest } = patch;
  const [updated] = await db
    .update(gameSessions)
    .set({ ...rest, ...(scheduledAt === undefined ? {} : { scheduledAt: scheduledAt === null ? null : new Date(scheduledAt) }) })
    .where(and(eq(gameSessions.id, sessionId), eq(gameSessions.worldId, worldId), ne(gameSessions.status, "closed")))
    .returning();
  if (updated !== undefined) return updated;
  const still = await db.select({ id: gameSessions.id }).from(gameSessions).where(and(eq(gameSessions.id, sessionId), eq(gameSessions.worldId, worldId))).limit(1);
  return still.length > 0 ? "closed" : "missing";
}
