import cookie from "@fastify/cookie";
import websocket from "@fastify/websocket";
import fastifyStatic from "@fastify/static";
import Fastify, { type FastifyInstance } from "fastify";
import type { Rng } from "@phoenix/rules-core";
import type { Config } from "./config";
import type { ImageStore } from "./image-store";
import type { Database } from "./db/types";
import { fail } from "./http";
import { authRoutes } from "./routes/auth";
import { gameSessionRoutes } from "./routes/game-sessions";
import { imageRoutes } from "./routes/images";
import { healthRoutes } from "./routes/health";
import { memberRoutes } from "./routes/members";
import { tableRoutes, MAX_FRAME_BYTES } from "./routes/table";
import { refreshScene } from "./table/commands";
import { createCryptoRng } from "./table/crypto-rng";
import { reclaimImages, startImageSweep } from "./image-gc";
import { TableHub } from "./table/hub";
import { tokenLibraryRoutes } from "./routes/token-library";
import { worldStructureRoutes } from "./routes/world-structure";
import { worldRoutes } from "./routes/worlds";

export type AppDeps = { db: Database; config: Config; now?: () => Date; imageStore: ImageStore; rng?: Rng; hub?: TableHub };

export async function buildApp(deps: AppDeps): Promise<FastifyInstance> {
  const { db, config } = deps;
  const now = deps.now ?? ((): Date => new Date());
  const app = Fastify({
    // JSON logs, as the hosting platform expects; cookies and credentials never reach them.
    logger: config.nodeEnv === "test" ? false : { redact: ["req.headers.cookie", "req.headers.authorization", "res.headers[\"set-cookie\"]"] },
    bodyLimit: 1024 * 1024,
  });
  await app.register(cookie);
  await app.register(websocket, { options: { maxPayload: MAX_FRAME_BYTES } });

  app.setErrorHandler((error, request, reply) => {
    if (typeof error === "object" && error !== null && "statusCode" in error && typeof error.statusCode === "number" && error.statusCode >= 400 && error.statusCode < 500) {
      if (error.statusCode === 413) return fail(reply, 413, "too-large");
      return fail(reply, error.statusCode === 404 ? 404 : 400, error.statusCode === 404 ? "not-found" : "invalid");
    }
    request.log.error({ err: error }, "unhandled error");
    return fail(reply, 500, "unavailable");
  });
  const staticDir = config.staticDir;
  if (staticDir !== null) await app.register(fastifyStatic, { root: staticDir, wildcard: false });
  // The API answers JSON errors; any other unknown path is a screen of the client, which routes it itself.
  app.setNotFoundHandler((request, reply) => {
    const isApi = request.url === "/health" || request.url.startsWith("/api/");
    if (staticDir === null || isApi || request.method !== "GET") return fail(reply, 404, "not-found");
    return reply.sendFile("index.html");
  });

  healthRoutes(app, db);
  const hub = deps.hub ?? new TableHub();
  // Logging out closes the table connections opened with that login, at once.
  authRoutes(app, { db, config, now, onSessionEnded: (sessionKey) => { hub.evictSession(sessionKey); } });
  // Pictures nothing uses any more are removed when a scene changes and, whatever happens, once an hour.
  const cleanupHooks = { onError: (imageId: string | null, error: unknown): void => { app.log.error({ err: error, imageId }, "image cleanup step failed"); } };
  const reclaim = async (): Promise<void> => {
    try {
      await reclaimImages(db, deps.imageStore, now(), cleanupHooks);
    } catch (error) {
      app.log.error({ err: error }, "image cleanup failed");
    }
  };
  let stopSweep: (() => void) | null = null;
  app.addHook("onReady", () => {
    stopSweep = startImageSweep(() => reclaimImages(db, deps.imageStore, now(), cleanupHooks), (error) => { app.log.error({ err: error }, "image sweep failed"); });
  });
  app.addHook("onClose", () => {
    stopSweep?.();
  });
  worldRoutes(app, db);
  worldStructureRoutes(app, db, hub, reclaim);
  memberRoutes(app, db, hub);
  tokenLibraryRoutes(app, db, reclaim);
  gameSessionRoutes(app, db, now, hub);
  const tableDeps = { db, hub, rng: deps.rng ?? createCryptoRng(), now };
  imageRoutes(app, db, deps.imageStore, now, async (worldId, sceneId) => {
    await refreshScene(tableDeps, worldId, sceneId);
    await reclaim();
  });
  tableRoutes(app, db, tableDeps, hub, config.sessionSecret);
  return app;
}
