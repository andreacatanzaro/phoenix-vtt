import { and, asc, eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { libraryTokenInputSchema, libraryTokenUpdateSchema, TOKEN_COLORS, type LibraryTokenView } from "@phoenix/shared";
import { requireDm } from "../access";
import { images, tokenLibrary } from "../db/schema";
import type { Database } from "../db/types";
import { fail, parseBody } from "../http";

const worldParams = z.object({ worldId: z.string() });
const entryParams = z.object({ worldId: z.string(), tokenId: z.uuid() });

type Row = typeof tokenLibrary.$inferSelect;

function view(row: Row): LibraryTokenView {
  return { id: row.id, name: row.name, color: TOKEN_COLORS.find((c) => c === row.color) ?? "grey", size: row.size, imageId: row.imageId };
}

/** Whether this is a token picture of this world. */
async function isTokenPicture(db: Database, worldId: string, imageId: string): Promise<boolean> {
  const rows = await db.select({ id: images.id }).from(images).where(and(eq(images.id, imageId), eq(images.worldId, worldId), eq(images.kind, "token"))).limit(1);
  return rows.length > 0;
}

/**
 * The token library of a world: the DM's own list of tokens, loaded once and put on scenes many times. A token put on a
 * scene is a copy (the table's own `token.add`), so nothing here reaches what is already placed.
 */
export function tokenLibraryRoutes(app: FastifyInstance, db: Database, reclaim: () => Promise<void>): void {
  app.get("/api/worlds/:worldId/token-library", async (request, reply) => {
    const params = worldParams.safeParse(request.params);
    const access = await requireDm(request, reply, db, params.success ? params.data.worldId : null);
    if (access === null) return reply;
    const rows = await db.select().from(tokenLibrary).where(eq(tokenLibrary.worldId, access.worldId)).orderBy(asc(tokenLibrary.createdAt), asc(tokenLibrary.id));
    return { tokens: rows.map(view) };
  });

  app.post("/api/worlds/:worldId/token-library", async (request, reply) => {
    const params = worldParams.safeParse(request.params);
    const access = await requireDm(request, reply, db, params.success ? params.data.worldId : null);
    if (access === null) return reply;
    const input = parseBody(request, reply, libraryTokenInputSchema);
    if (input === null) return reply;
    if (input.imageId !== null && !(await isTokenPicture(db, access.worldId, input.imageId))) return fail(reply, 400, "world.picture-invalid");
    const [row] = await db.insert(tokenLibrary).values({ worldId: access.worldId, name: input.name, color: input.color, size: input.size, imageId: input.imageId }).returning();
    if (row === undefined) throw new Error("Insert returned no row");
    return reply.code(201).send({ token: view(row) });
  });

  app.patch("/api/worlds/:worldId/token-library/:tokenId", async (request, reply) => {
    const params = entryParams.safeParse(request.params);
    const access = await requireDm(request, reply, db, params.success ? params.data.worldId : null);
    if (access === null) return reply;
    if (!params.success) return fail(reply, 404, "not-found");
    const patch = parseBody(request, reply, libraryTokenUpdateSchema);
    if (patch === null) return reply;
    if (patch.imageId !== undefined && patch.imageId !== null && !(await isTokenPicture(db, access.worldId, patch.imageId))) return fail(reply, 400, "world.picture-invalid");
    const [row] = await db.update(tokenLibrary).set(patch).where(and(eq(tokenLibrary.id, params.data.tokenId), eq(tokenLibrary.worldId, access.worldId))).returning();
    if (row === undefined) return fail(reply, 404, "not-found");
    // A picture taken away or replaced may be the last use of the old one.
    if (patch.imageId !== undefined) await reclaim();
    return { token: view(row) };
  });

  app.delete("/api/worlds/:worldId/token-library/:tokenId", async (request, reply) => {
    const params = entryParams.safeParse(request.params);
    const access = await requireDm(request, reply, db, params.success ? params.data.worldId : null);
    if (access === null) return reply;
    if (!params.success) return fail(reply, 404, "not-found");
    const gone = await db.delete(tokenLibrary).where(and(eq(tokenLibrary.id, params.data.tokenId), eq(tokenLibrary.worldId, access.worldId))).returning({ id: tokenLibrary.id });
    if (gone.length === 0) return fail(reply, 404, "not-found");
    await reclaim();
    return reply.code(204).send();
  });
}
