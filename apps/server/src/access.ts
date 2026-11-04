import { and, eq } from "drizzle-orm";
import type { FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import type { WorldRole } from "@phoenix/shared";
import type { SessionAccount } from "./auth/sessions";
import { worldMemberships } from "./db/schema";
import type { Database } from "./db/types";
import { fail, requireAccount } from "./http";

const worldIdSchema = z.uuid();

export type WorldAccess = { account: SessionAccount; worldId: string; role: WorldRole };

export async function roleIn(db: Database, worldId: string, accountId: string): Promise<WorldRole | null> {
  const rows = await db
    .select({ role: worldMemberships.role })
    .from(worldMemberships)
    .where(and(eq(worldMemberships.worldId, worldId), eq(worldMemberships.accountId, accountId)))
    .limit(1);
  return rows[0]?.role ?? null;
}

/**
 * The signed-in member of the world named in the path. A stranger gets the same 404 as for a world that does not exist,
 * so the answer never says which worlds exist. `null` after the answer has been sent.
 */
export async function requireMember(request: FastifyRequest, reply: FastifyReply, db: Database, rawWorldId: unknown): Promise<WorldAccess | null> {
  const account = requireAccount(request, reply);
  if (account === null) return null;
  const worldId = worldIdSchema.safeParse(rawWorldId);
  if (!worldId.success) {
    fail(reply, 404, "not-found");
    return null;
  }
  const role = await roleIn(db, worldId.data, account.id);
  if (role === null) {
    fail(reply, 404, "not-found");
    return null;
  }
  return { account, worldId: worldId.data, role };
}

/** Like `requireMember`, and the member must be the DM (403 for a player). */
export async function requireDm(request: FastifyRequest, reply: FastifyReply, db: Database, rawWorldId: unknown): Promise<WorldAccess | null> {
  const access = await requireMember(request, reply, db, rawWorldId);
  if (access === null) return null;
  if (access.role !== "dm") {
    fail(reply, 403, "forbidden");
    return null;
  }
  return access;
}
