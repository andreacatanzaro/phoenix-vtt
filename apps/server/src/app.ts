import cookie from "@fastify/cookie";
import fastifyStatic from "@fastify/static";
import Fastify, { type FastifyInstance } from "fastify";
import type { Config } from "./config";
import type { Database } from "./db/types";
import { fail } from "./http";
import { authRoutes } from "./routes/auth";
import { healthRoutes } from "./routes/health";
import { worldRoutes } from "./routes/worlds";

export type AppDeps = { db: Database; config: Config; now?: () => Date };

export async function buildApp(deps: AppDeps): Promise<FastifyInstance> {
  const { db, config } = deps;
  const now = deps.now ?? ((): Date => new Date());
  const app = Fastify({
    // JSON logs, as the hosting platform expects; cookies and credentials never reach them.
    logger: config.nodeEnv === "test" ? false : { redact: ["req.headers.cookie", "req.headers.authorization", "res.headers[\"set-cookie\"]"] },
    bodyLimit: 1024 * 1024,
  });
  await app.register(cookie);

  app.setErrorHandler((error, request, reply) => {
    if (typeof error === "object" && error !== null && "statusCode" in error && typeof error.statusCode === "number" && error.statusCode >= 400 && error.statusCode < 500) {
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
  authRoutes(app, { db, config, now });
  worldRoutes(app, db);
  return app;
}
