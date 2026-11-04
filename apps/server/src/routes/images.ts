import { and, eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { MAX_MAP_BYTES, MAX_MAP_SIDE, MAX_TOKEN_IMAGE_BYTES, MAX_TOKEN_IMAGE_SIDE, IMAGE_KINDS, sceneTableSchema, type ImageView, type SceneTableView } from "@phoenix/shared";
import { requireDm, requireMember } from "../access";
import { images, scenes } from "../db/schema";
import type { Database } from "../db/types";
import { playerMaySeeImage } from "../image-access";
import { fail, parseBody } from "../http";
import { readImageInfo } from "../image-info";
import type { ImageStore } from "../image-store";

const worldParams = z.object({ worldId: z.string() });
const imageParams = z.object({ worldId: z.string(), imageId: z.uuid() });
const sceneParams = z.object({ worldId: z.string(), sceneId: z.uuid() });
const uploadQuery = z.object({ kind: z.enum(IMAGE_KINDS) });
const ACCEPTED = ["image/png", "image/jpeg", "image/webp"];

function sceneView(row: typeof scenes.$inferSelect, map: { width: number; height: number } | null): SceneTableView {
  return {
    mapImageId: row.mapImageId,
    mapWidth: map?.width ?? null,
    mapHeight: map?.height ?? null,
    gridPx: row.gridPx,
    gridOffsetX: row.gridOffsetX,
    gridOffsetY: row.gridOffsetY,
    start: { x: row.startX, y: row.startY, w: row.startW, h: row.startH },
  };
}

/**
 * Pictures: the DM uploads maps and token images, any member of the world can look at them, and the DM sets which
 * map a scene uses and how its grid sits on it. The bytes are checked here, from the bytes themselves.
 */
export function imageRoutes(app: FastifyInstance, db: Database, store: ImageStore, now: () => Date, sceneSaved: (worldId: string, sceneId: string) => Promise<void>): void {
  // Pictures arrive as the raw body; the limit is the largest picture allowed, and each kind is checked below.
  app.addContentTypeParser(ACCEPTED, { parseAs: "buffer", bodyLimit: MAX_MAP_BYTES }, (_request, body, done) => {
    done(null, body);
  });

  app.post("/api/worlds/:worldId/images", async (request, reply) => {
    const params = worldParams.safeParse(request.params);
    const access = await requireDm(request, reply, db, params.success ? params.data.worldId : null);
    if (access === null) return reply;
    const query = uploadQuery.safeParse(request.query);
    if (!query.success) return fail(reply, 400, "invalid");
    const body = request.body;
    if (!(body instanceof Uint8Array)) return fail(reply, 400, "image.invalid");
    const info = readImageInfo(body);
    // The type comes from the bytes. A file that says it is one thing and is another is refused.
    if (info === null || info.mime !== request.headers["content-type"]) return fail(reply, 400, "image.invalid");
    const maxBytes = query.data.kind === "map" ? MAX_MAP_BYTES : MAX_TOKEN_IMAGE_BYTES;
    const maxSide = query.data.kind === "map" ? MAX_MAP_SIDE : MAX_TOKEN_IMAGE_SIDE;
    if (body.length > maxBytes || info.width > maxSide || info.height > maxSide) return fail(reply, 413, "image.too-large");
    const id = crypto.randomUUID();
    await store.put(id, body);
    try {
      await db.insert(images).values({ id, worldId: access.worldId, kind: query.data.kind, mime: info.mime, bytes: body.length, width: info.width, height: info.height, uploadedBy: access.account.id, createdAt: now() });
    } catch (error) {
      // The failure to report is the one that happened first; a file left behind is collected later, as it has no row.
      await store.remove(id).catch(() => undefined);
      throw error;
    }
    const image: ImageView = { id, kind: query.data.kind, width: info.width, height: info.height };
    return reply.code(201).send({ image });
  });

  app.get("/api/worlds/:worldId/images/:imageId", async (request, reply) => {
    const params = imageParams.safeParse(request.params);
    if (!params.success) return fail(reply, 404, "not-found");
    const access = await requireMember(request, reply, db, params.data.worldId);
    if (access === null) return reply;
    const rows = await db.select().from(images).where(and(eq(images.id, params.data.imageId), eq(images.worldId, access.worldId))).limit(1);
    const row = rows[0];
    if (row === undefined) return fail(reply, 404, "not-found");
    // Being in the world is not enough for a player: the picture must be something they can see now. Asked before the
    // file is read, so a refused request costs the disk nothing.
    if (access.role !== "dm" && !(await playerMaySeeImage(db, access.worldId, row.id))) return fail(reply, 404, "not-found");
    const bytes = await store.get(row.id);
    if (bytes === null) return fail(reply, 404, "not-found");
    return reply
      .header("content-type", row.mime)
      .header("x-content-type-options", "nosniff")
      // What a player may see changes with the table and with who is signed in, so nothing is kept by the browser.
      .header("cache-control", "private, no-store")
      .send(Buffer.from(bytes));
  });

  // The DM's setup of a scene for the table.
  app.get("/api/worlds/:worldId/scenes/:sceneId/table", async (request, reply) => {
    const params = sceneParams.safeParse(request.params);
    if (!params.success) return fail(reply, 404, "not-found");
    const access = await requireDm(request, reply, db, params.data.worldId);
    if (access === null) return reply;
    const rows = await db.select().from(scenes).where(and(eq(scenes.id, params.data.sceneId), eq(scenes.worldId, access.worldId))).limit(1);
    const row = rows[0];
    if (row === undefined) return fail(reply, 404, "not-found");
    const map = row.mapImageId === null ? null : ((await db.select({ width: images.width, height: images.height }).from(images).where(eq(images.id, row.mapImageId)).limit(1))[0] ?? null);
    return { scene: sceneView(row, map) };
  });

  app.patch("/api/worlds/:worldId/scenes/:sceneId/table", async (request, reply) => {
    const params = sceneParams.safeParse(request.params);
    if (!params.success) return fail(reply, 404, "not-found");
    const access = await requireDm(request, reply, db, params.data.worldId);
    if (access === null) return reply;
    const patch = parseBody(request, reply, sceneTableSchema);
    if (patch === null) return reply;
    let map: { width: number; height: number } | null = null;
    if (patch.mapImageId !== undefined && patch.mapImageId !== null) {
      const found = await db
        .select({ width: images.width, height: images.height })
        .from(images)
        .where(and(eq(images.id, patch.mapImageId), eq(images.worldId, access.worldId), eq(images.kind, "map")))
        .limit(1);
      map = found[0] ?? null;
      if (map === null) return fail(reply, 400, "image.map-invalid");
    }
    const { start, mapImageId, ...rest } = patch;
    const [row] = await db
      .update(scenes)
      .set({ ...rest, ...(mapImageId === undefined ? {} : { mapImageId }), ...(start === undefined ? {} : { startX: start.x, startY: start.y, startW: start.w, startH: start.h }) })
      .where(and(eq(scenes.id, params.data.sceneId), eq(scenes.worldId, access.worldId)))
      .returning();
    if (row === undefined) return fail(reply, 404, "not-found");
    if (map === null && row.mapImageId !== null) {
      map = (await db.select({ width: images.width, height: images.height }).from(images).where(eq(images.id, row.mapImageId)).limit(1))[0] ?? null;
    }
    await sceneSaved(access.worldId, row.id);
    return { scene: sceneView(row, map) };
  });
}
