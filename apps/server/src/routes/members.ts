import { and, eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { addMemberSchema, type MemberView } from "@phoenix/shared";
import { requireDm, requireMember } from "../access";
import { accounts, worldMemberships } from "../db/schema";
import type { Database } from "../db/types";
import type { TableHub } from "../table/hub";
import { runningSession } from "../table/store";
import { fail, isUniqueViolation, parseBody } from "../http";

const worldParams = z.object({ worldId: z.string() });
const memberParams = z.object({ worldId: z.string(), accountId: z.uuid() });

/**
 * Who is in the world. The DM adds a player by the username of an existing account. This lets any DM check whether a
 * username exists; usernames are not secret in a group of friends, and the lookup needs a signed-in DM.
 */
export function memberRoutes(app: FastifyInstance, db: Database, hub: TableHub): void {
  app.get("/api/worlds/:worldId/members", async (request, reply) => {
    const params = worldParams.safeParse(request.params);
    const access = await requireMember(request, reply, db, params.success ? params.data.worldId : null);
    if (access === null) return reply;
    const rows = await db
      .select({ accountId: worldMemberships.accountId, username: accounts.username, role: worldMemberships.role })
      .from(worldMemberships)
      .innerJoin(accounts, eq(accounts.id, worldMemberships.accountId))
      .where(eq(worldMemberships.worldId, access.worldId))
      .orderBy(worldMemberships.role, accounts.usernameKey);
    const members: MemberView[] = rows;
    return { members };
  });

  app.post("/api/worlds/:worldId/members", async (request, reply) => {
    const params = worldParams.safeParse(request.params);
    const access = await requireDm(request, reply, db, params.success ? params.data.worldId : null);
    if (access === null) return reply;
    const input = parseBody(request, reply, addMemberSchema);
    if (input === null) return reply;
    const found = await db.select({ id: accounts.id, username: accounts.username }).from(accounts).where(eq(accounts.usernameKey, input.username.toLowerCase())).limit(1);
    const account = found[0];
    if (account === undefined) return fail(reply, 404, "members.account-not-found");
    try {
      await db.insert(worldMemberships).values({ worldId: access.worldId, accountId: account.id, role: "player" });
    } catch (error) {
      if (isUniqueViolation(error)) return fail(reply, 409, "members.already-member");
      throw error;
    }
    const member: MemberView = { accountId: account.id, username: account.username, role: "player" };
    return reply.code(201).send({ member });
  });

  app.delete("/api/worlds/:worldId/members/:accountId", async (request, reply) => {
    const params = memberParams.safeParse(request.params);
    if (!params.success) return fail(reply, 404, "not-found");
    const access = await requireDm(request, reply, db, params.data.worldId);
    if (access === null) return reply;
    if (params.data.accountId === access.account.id) return fail(reply, 409, "members.cannot-remove-dm");
    // Removal and expulsion happen between two table commands, never in the middle of one: a command that has already
    // checked the person's role finishes before they are removed, and every later one finds them gone.
    const running = await runningSession(db, access.worldId);
    const remove = async (): Promise<boolean> => {
      const removed = await db
        .delete(worldMemberships)
        .where(and(eq(worldMemberships.worldId, access.worldId), eq(worldMemberships.accountId, params.data.accountId)))
        .returning({ accountId: worldMemberships.accountId });
      // Someone sitting at the table when they are removed is sent away at once.
      if (removed.length > 0) hub.evict(access.worldId, params.data.accountId);
      return removed.length > 0;
    };
    const done = running === null ? await remove() : await hub.serial(running.id, remove);
    if (!done) return fail(reply, 404, "not-found");
    return reply.code(204).send();
  });
}
