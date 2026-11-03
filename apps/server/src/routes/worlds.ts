import { and, eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { createWorldSchema, type WorldView } from "@phoenix/shared";
import { worldMemberships, worlds } from "../db/schema";
import type { Database } from "../db/types";
import { fail, parseBody, requireAccount } from "../http";

const idParams = z.object({ id: z.uuid() });

const worldColumns = { id: worlds.id, name: worlds.name, role: worldMemberships.role, gameTimeMinutes: worlds.gameTimeMinutes };

export function worldRoutes(app: FastifyInstance, db: Database): void {
  // Any account can create a world and becomes its DM. There is one DM per world.
  app.post("/api/worlds", async (request, reply) => {
    const account = requireAccount(request, reply);
    if (account === null) return reply;
    const input = parseBody(request, reply, createWorldSchema);
    if (input === null) return reply;
    const view = await db.transaction(async (tx) => {
      const [world] = await tx.insert(worlds).values({ name: input.name }).returning();
      if (world === undefined) throw new Error("Insert returned no row");
      await tx.insert(worldMemberships).values({ worldId: world.id, accountId: account.id, role: "dm" });
      const created: WorldView = { id: world.id, name: world.name, role: "dm", gameTimeMinutes: world.gameTimeMinutes };
      return created;
    });
    return reply.code(201).send({ world: view });
  });

  app.get("/api/worlds", async (request, reply) => {
    const account = requireAccount(request, reply);
    if (account === null) return reply;
    const rows = await db
      .select(worldColumns)
      .from(worldMemberships)
      .innerJoin(worlds, eq(worlds.id, worldMemberships.worldId))
      .where(eq(worldMemberships.accountId, account.id))
      .orderBy(worlds.createdAt);
    const list: WorldView[] = rows;
    return { worlds: list };
  });

  // A world the account does not belong to looks the same as one that does not exist.
  app.get("/api/worlds/:id", async (request, reply) => {
    const account = requireAccount(request, reply);
    if (account === null) return reply;
    const params = idParams.safeParse(request.params);
    if (!params.success) return fail(reply, 404, "not-found");
    const rows = await db
      .select(worldColumns)
      .from(worldMemberships)
      .innerJoin(worlds, eq(worlds.id, worldMemberships.worldId))
      .where(and(eq(worldMemberships.accountId, account.id), eq(worlds.id, params.data.id)))
      .limit(1);
    const world: WorldView | undefined = rows[0];
    if (world === undefined) return fail(reply, 404, "not-found");
    return { world };
  });
}
