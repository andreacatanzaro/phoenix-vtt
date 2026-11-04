import { and, eq, ne } from "drizzle-orm";
import type { FastifyInstance, FastifyReply } from "fastify";
import { z } from "zod";
import { closeSessionSchema, createSessionSchema, reportSchema, updateSessionSchema, type SessionStatus, type SessionView } from "@phoenix/shared";
import { requireDm, requireMember, type WorldAccess } from "../access";
import { gameSessions } from "../db/schema";
import type { Database } from "../db/types";
import { deleteDraft, updateDetails } from "../game-session-writes";
import type { TableHub } from "../table/hub";
import { fail, isUniqueViolation, parseBody } from "../http";

const worldParams = z.object({ worldId: z.string() });
const sessionParams = z.object({ worldId: z.string(), sessionId: z.uuid() });

type Row = typeof gameSessions.$inferSelect;

function sessionView(row: Row): SessionView {
  return {
    id: row.id,
    title: row.title,
    scheduledAt: row.scheduledAt?.toISOString() ?? null,
    recommendedLevel: row.recommendedLevel,
    seats: row.seats,
    status: row.status,
    report: row.report,
    createdAt: row.createdAt.toISOString(),
    startedAt: row.startedAt?.toISOString() ?? null,
    closedAt: row.closedAt?.toISOString() ?? null,
  };
}

/**
 * The sessions of a world, as the board shows them. A session is a draft, then published, then running (only one at a
 * time), then closed with the DM's chronicle note. Players see everything except drafts.
 */
export function gameSessionRoutes(app: FastifyInstance, db: Database, now: () => Date, hub: TableHub): void {
  async function find(access: WorldAccess, sessionId: string): Promise<Row | null> {
    const rows = await db.select().from(gameSessions).where(and(eq(gameSessions.id, sessionId), eq(gameSessions.worldId, access.worldId))).limit(1);
    const row = rows[0];
    if (row === undefined || (access.role !== "dm" && row.status === "draft")) return null;
    return row;
  }

  /** Moves a session from one of `from` to `to`, or answers why it cannot. */
  async function transition(reply: FastifyReply, row: Row, from: readonly SessionStatus[], changes: Partial<Row> & { status: SessionStatus }, afterwards?: () => void): Promise<FastifyReply> {
    if (!from.includes(row.status)) return fail(reply, 409, "session.wrong-status");
    try {
      const [updated] = await db.update(gameSessions).set(changes).where(and(eq(gameSessions.id, row.id), eq(gameSessions.status, row.status))).returning();
      if (updated === undefined) return await fail(reply, 409, "session.wrong-status");
      afterwards?.();
      return await reply.send({ session: sessionView(updated) });
    } catch (error) {
      if (isUniqueViolation(error)) return fail(reply, 409, "session.already-running");
      throw error;
    }
  }

  app.get("/api/worlds/:worldId/sessions", async (request, reply) => {
    const params = worldParams.safeParse(request.params);
    const access = await requireMember(request, reply, db, params.success ? params.data.worldId : null);
    if (access === null) return reply;
    const rows = await db
      .select()
      .from(gameSessions)
      .where(access.role === "dm" ? eq(gameSessions.worldId, access.worldId) : and(eq(gameSessions.worldId, access.worldId), ne(gameSessions.status, "draft")))
      .orderBy(gameSessions.createdAt, gameSessions.id);
    return { sessions: rows.map(sessionView) };
  });

  app.get("/api/worlds/:worldId/sessions/:sessionId", async (request, reply) => {
    const params = sessionParams.safeParse(request.params);
    if (!params.success) return fail(reply, 404, "not-found");
    const access = await requireMember(request, reply, db, params.data.worldId);
    if (access === null) return reply;
    const row = await find(access, params.data.sessionId);
    if (row === null) return fail(reply, 404, "not-found");
    return { session: sessionView(row) };
  });

  app.post("/api/worlds/:worldId/sessions", async (request, reply) => {
    const params = worldParams.safeParse(request.params);
    const access = await requireDm(request, reply, db, params.success ? params.data.worldId : null);
    if (access === null) return reply;
    const input = parseBody(request, reply, createSessionSchema);
    if (input === null) return reply;
    const [row] = await db
      .insert(gameSessions)
      .values({
        worldId: access.worldId,
        title: input.title,
        scheduledAt: input.scheduledAt === null ? null : new Date(input.scheduledAt),
        recommendedLevel: input.recommendedLevel,
        seats: input.seats,
        createdAt: now(),
      })
      .returning();
    if (row === undefined) throw new Error("Insert returned no row");
    return reply.code(201).send({ session: sessionView(row) });
  });

  // Title, date, level and seats can change until the session is closed.
  app.patch("/api/worlds/:worldId/sessions/:sessionId", async (request, reply) => {
    const params = sessionParams.safeParse(request.params);
    if (!params.success) return fail(reply, 404, "not-found");
    const access = await requireDm(request, reply, db, params.data.worldId);
    if (access === null) return reply;
    const patch = parseBody(request, reply, updateSessionSchema);
    if (patch === null) return reply;
    const row = await find(access, params.data.sessionId);
    if (row === null) return fail(reply, 404, "not-found");
    const updated = await updateDetails(db, access.worldId, row.id, patch);
    if (updated === "missing") return fail(reply, 404, "not-found");
    if (updated === "closed") return fail(reply, 409, "session.closed");
    return { session: sessionView(updated) };
  });

  app.post("/api/worlds/:worldId/sessions/:sessionId/publish", async (request, reply) => {
    const params = sessionParams.safeParse(request.params);
    if (!params.success) return fail(reply, 404, "not-found");
    const access = await requireDm(request, reply, db, params.data.worldId);
    if (access === null) return reply;
    const row = await find(access, params.data.sessionId);
    if (row === null) return fail(reply, 404, "not-found");
    return transition(reply, row, ["draft"], { status: "published" });
  });

  app.post("/api/worlds/:worldId/sessions/:sessionId/start", async (request, reply) => {
    const params = sessionParams.safeParse(request.params);
    if (!params.success) return fail(reply, 404, "not-found");
    const access = await requireDm(request, reply, db, params.data.worldId);
    if (access === null) return reply;
    const row = await find(access, params.data.sessionId);
    if (row === null) return fail(reply, 404, "not-found");
    return transition(reply, row, ["draft", "published"], { status: "running", startedAt: now() });
  });

  app.post("/api/worlds/:worldId/sessions/:sessionId/close", async (request, reply) => {
    const params = sessionParams.safeParse(request.params);
    if (!params.success) return fail(reply, 404, "not-found");
    const access = await requireDm(request, reply, db, params.data.worldId);
    if (access === null) return reply;
    const input = parseBody(request, reply, closeSessionSchema);
    if (input === null) return reply;
    const row = await find(access, params.data.sessionId);
    if (row === null) return fail(reply, 404, "not-found");
    // After every table command already waiting, so none is saved once the session is closed; the table closes with it.
    return hub.serial(row.id, () => transition(reply, row, ["running"], { status: "closed", closedAt: now(), report: input.report }, () => { hub.endSession(row.id); }));
  });

  // The chronicle note can be written, or corrected, while the session runs and after it has closed.
  app.put("/api/worlds/:worldId/sessions/:sessionId/report", async (request, reply) => {
    const params = sessionParams.safeParse(request.params);
    if (!params.success) return fail(reply, 404, "not-found");
    const access = await requireDm(request, reply, db, params.data.worldId);
    if (access === null) return reply;
    const input = parseBody(request, reply, reportSchema);
    if (input === null) return reply;
    const row = await find(access, params.data.sessionId);
    if (row === null) return fail(reply, 404, "not-found");
    if (row.status !== "running" && row.status !== "closed") return fail(reply, 409, "session.wrong-status");
    const [updated] = await db.update(gameSessions).set({ report: input.report }).where(eq(gameSessions.id, row.id)).returning();
    if (updated === undefined) return fail(reply, 404, "not-found");
    return { session: sessionView(updated) };
  });

  // Only a draft can be thrown away: a session that was published or played stays in the history.
  app.delete("/api/worlds/:worldId/sessions/:sessionId", async (request, reply) => {
    const params = sessionParams.safeParse(request.params);
    if (!params.success) return fail(reply, 404, "not-found");
    const access = await requireDm(request, reply, db, params.data.worldId);
    if (access === null) return reply;
    const row = await find(access, params.data.sessionId);
    if (row === null) return fail(reply, 404, "not-found");
    const result = await deleteDraft(db, access.worldId, row.id);
    if (result === "missing") return fail(reply, 404, "not-found");
    if (result === "not-draft") return fail(reply, 409, "session.wrong-status");
    return reply.code(204).send();
  });
}
