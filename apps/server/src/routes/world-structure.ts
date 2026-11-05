import { and, eq, or } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { collectionSchema, createElementSchema, createSceneLinkSchema, updateElementSchema, type SceneLinkView } from "@phoenix/shared";
import { requireDm, requireMember } from "../access";
import { sceneLinks, scenes } from "../db/schema";
import type { Database } from "../db/types";
import { fail, isUniqueViolation, parseBody } from "../http";
import type { TableHub } from "../table/hub";
import { runningSession } from "../table/store";
import { atlasQueueKey, createElement, deleteElement, loadTree, updateElement, type DeleteResult } from "../world-tree";

const elementParams = z.object({ worldId: z.string(), collection: collectionSchema, id: z.uuid() });
const collectionParams = z.object({ worldId: z.string(), collection: collectionSchema });
const linkParams = z.object({ worldId: z.string(), linkId: z.uuid() });
const withTokensQuery = z.object({ withTokens: z.enum(["true", "false"]).optional() });

function linkView(row: { id: string; fromSceneId: string; toSceneId: string; label: string }): SceneLinkView {
  return { id: row.id, fromSceneId: row.fromSceneId, toSceneId: row.toSceneId, label: row.label };
}

export function worldStructureRoutes(app: FastifyInstance, db: Database, hub: TableHub, reclaim: () => Promise<void>): void {
  // Members see the tree; a player sees only what the DM has revealed, and no notes.
  app.get("/api/worlds/:worldId/tree", async (request, reply) => {
    const params = z.object({ worldId: z.string() }).safeParse(request.params);
    const access = await requireMember(request, reply, db, params.success ? params.data.worldId : null);
    if (access === null) return reply;
    return loadTree(db, access.worldId, access.role === "dm");
  });

  app.post("/api/worlds/:worldId/:collection", async (request, reply) => {
    const params = collectionParams.safeParse(request.params);
    if (!params.success) return fail(reply, 404, "not-found");
    const access = await requireDm(request, reply, db, params.data.worldId);
    if (access === null) return reply;
    const input = parseBody(request, reply, createElementSchema);
    if (input === null) return reply;
    // What is placed is checked against what is around it, so the changes to the structure of a world go one at a time.
    const created = await hub.serial(atlasQueueKey(access.worldId), () => createElement(db, access.worldId, params.data.collection, input));
    if (created === "parent-invalid") return fail(reply, 400, "world.parent-invalid");
    if (created === "placement-invalid") return fail(reply, 400, "world.placement-invalid");
    if (created === "placement-required") return fail(reply, 400, "world.placement-required");
    return reply.code(201).send(created);
  });

  app.patch("/api/worlds/:worldId/:collection/:id", async (request, reply) => {
    const params = elementParams.safeParse(request.params);
    if (!params.success) return fail(reply, 404, "not-found");
    const access = await requireDm(request, reply, db, params.data.worldId);
    if (access === null) return reply;
    const patch = parseBody(request, reply, updateElementSchema);
    if (patch === null) return reply;
    const result = await hub.serial(atlasQueueKey(access.worldId), () => updateElement(db, access.worldId, params.data.collection, params.data.id, patch));
    if (result === "not-found") return fail(reply, 404, "not-found");
    if (result === "invalid") return fail(reply, 400, "invalid");
    if (result === "map-invalid") return fail(reply, 400, "world.map-invalid");
    if (result === "placement-invalid") return fail(reply, 400, "world.placement-invalid");
    if (result === "map-in-use") return fail(reply, 409, "world.map-in-use");
    if (result === "pins-outside") return fail(reply, 409, "world.pins-outside");
    // A map taken off a region or a place may be the last use of a picture.
    if (patch.mapImageId !== undefined) await reclaim();
    return { element: result.element };
  });

  app.delete("/api/worlds/:worldId/:collection/:id", async (request, reply) => {
    const params = elementParams.safeParse(request.params);
    if (!params.success) return fail(reply, 404, "not-found");
    const access = await requireDm(request, reply, db, params.data.worldId);
    if (access === null) return reply;
    // A scene is checked and deleted after every table command already waiting, so a token cannot arrive in between.
    const running = params.data.collection === "scenes" ? await runningSession(db, access.worldId) : null;
    // A scene that still has tokens is deleted only when the request asks for it (`?withTokens=true`), after the DM confirmed.
    const withTokens = withTokensQuery.safeParse(request.query).data?.withTokens === "true";
    const remove = (): Promise<DeleteResult> => deleteElement(db, access.worldId, params.data.collection, params.data.id, withTokens);
    const result = running === null ? await remove() : await hub.serial(running.id, remove);
    if (result === "not-found") return fail(reply, 404, "not-found");
    if (result === "not-empty") return fail(reply, 409, "world.not-empty");
    if (result === "in-use") return fail(reply, 409, "world.scene-in-use");
    if (result === "has-tokens") return fail(reply, 409, "world.scene-has-tokens");
    // The map of the scene that is gone is no longer used by anything.
    await reclaim();
    return reply.code(204).send();
  });

  // Links between scenes are the DM's tool: players do not see where the exits lead.
  app.get("/api/worlds/:worldId/scene-links", async (request, reply) => {
    const params = z.object({ worldId: z.string() }).safeParse(request.params);
    const access = await requireDm(request, reply, db, params.success ? params.data.worldId : null);
    if (access === null) return reply;
    const rows = await db.select().from(sceneLinks).where(eq(sceneLinks.worldId, access.worldId)).orderBy(sceneLinks.createdAt, sceneLinks.id);
    return { links: rows.map(linkView) };
  });

  app.post("/api/worlds/:worldId/scene-links", async (request, reply) => {
    const params = z.object({ worldId: z.string() }).safeParse(request.params);
    const access = await requireDm(request, reply, db, params.success ? params.data.worldId : null);
    if (access === null) return reply;
    const input = parseBody(request, reply, createSceneLinkSchema);
    if (input === null) return reply;
    if (input.fromSceneId === input.toSceneId) return fail(reply, 400, "world.link-invalid");
    // Both scenes must be in this world, whatever their place, area or region.
    const found = await db
      .select({ id: scenes.id })
      .from(scenes)
      .where(and(eq(scenes.worldId, access.worldId), or(eq(scenes.id, input.fromSceneId), eq(scenes.id, input.toSceneId))));
    if (found.length !== 2) return fail(reply, 400, "world.link-invalid");
    try {
      const [row] = await db.insert(sceneLinks).values({ worldId: access.worldId, fromSceneId: input.fromSceneId, toSceneId: input.toSceneId, label: input.label }).returning();
      if (row === undefined) throw new Error("Insert returned no row");
      return await reply.code(201).send({ link: linkView(row) });
    } catch (error) {
      if (isUniqueViolation(error)) return fail(reply, 409, "world.link-exists");
      throw error;
    }
  });

  app.delete("/api/worlds/:worldId/scene-links/:linkId", async (request, reply) => {
    const params = linkParams.safeParse(request.params);
    if (!params.success) return fail(reply, 404, "not-found");
    const access = await requireDm(request, reply, db, params.data.worldId);
    if (access === null) return reply;
    const removed = await db.delete(sceneLinks).where(and(eq(sceneLinks.id, params.data.linkId), eq(sceneLinks.worldId, access.worldId))).returning({ id: sceneLinks.id });
    if (removed.length === 0) return fail(reply, 404, "not-found");
    return reply.code(204).send();
  });
}
