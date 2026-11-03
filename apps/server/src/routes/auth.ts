import { eq } from "drizzle-orm";
import type { FastifyInstance, FastifyReply } from "fastify";
import { loginSchema, registerSchema, type AccountView } from "@phoenix/shared";
import { DUMMY_HASH_PROMISE, hashPassword, verifyPassword } from "../auth/passwords";
import { accountForToken, createSession, deleteSession } from "../auth/sessions";
import { LoginThrottle } from "../auth/throttle";
import type { Config } from "../config";
import { accounts } from "../db/schema";
import type { Database } from "../db/types";
import { fail, isUniqueViolation, parseBody, requireAccount } from "../http";

export const SESSION_COOKIE = "phoenix_session";
const MAX_LOGIN_FAILURES = 5;
const LOGIN_WINDOW_MS = 15 * 60 * 1000;

export type AuthContext = { db: Database; config: Config; now: () => Date };

export function authRoutes(app: FastifyInstance, ctx: AuthContext): void {
  const { db, config } = ctx;
  const throttle = new LoginThrottle(MAX_LOGIN_FAILURES, LOGIN_WINDOW_MS);

  function setCookie(reply: FastifyReply, token: string, expiresAt: Date): void {
    reply.setCookie(SESSION_COOKIE, token, { httpOnly: true, secure: config.cookieSecure, sameSite: "lax", path: "/", expires: expiresAt });
  }

  async function startSession(reply: FastifyReply, accountId: string): Promise<void> {
    const { token, expiresAt } = await createSession(db, accountId, config.sessionSecret, ctx.now(), config.sessionDays);
    setCookie(reply, token, expiresAt);
  }

  // Looks up the signed-in account for every request, so routes only have to ask `requireAccount`.
  app.decorateRequest("account", null);
  app.decorateRequest("sessionToken", null);
  app.addHook("onRequest", async (request) => {
    const token = request.cookies[SESSION_COOKIE];
    if (token === undefined || token === "") return;
    request.sessionToken = token;
    request.account = await accountForToken(db, token, config.sessionSecret, ctx.now());
  });

  app.post("/api/auth/register", async (request, reply) => {
    const input = parseBody(request, reply, registerSchema);
    if (input === null) return reply;
    const usernameKey = input.username.toLowerCase();
    const existing = await db.select({ id: accounts.id }).from(accounts).where(eq(accounts.usernameKey, usernameKey)).limit(1);
    if (existing.length > 0) return fail(reply, 409, "auth.username-taken");
    const passwordHash = await hashPassword(input.password);
    try {
      const [created] = await db.insert(accounts).values({ username: input.username, usernameKey, passwordHash }).returning({ id: accounts.id, username: accounts.username });
      if (created === undefined) throw new Error("Insert returned no row");
      await startSession(reply, created.id);
      const view: AccountView = { id: created.id, username: created.username };
      return await reply.code(201).send({ account: view });
    } catch (error) {
      // Two registrations with the same name at once: the unique index decides.
      if (isUniqueViolation(error)) return fail(reply, 409, "auth.username-taken");
      throw error;
    }
  });

  app.post("/api/auth/login", async (request, reply) => {
    const input = parseBody(request, reply, loginSchema);
    if (input === null) return reply;
    const key = input.username.toLowerCase();
    const nowMs = ctx.now().getTime();
    if (throttle.isBlocked(key, nowMs)) return fail(reply, 429, "too-many-attempts");
    const rows = await db.select().from(accounts).where(eq(accounts.usernameKey, key)).limit(1);
    const account = rows[0];
    // A missing user is checked against a dummy hash, so the answer takes the same time as a wrong password.
    const ok = await verifyPassword(account?.passwordHash ?? (await DUMMY_HASH_PROMISE), input.password);
    if (account === undefined || !ok) {
      throttle.recordFailure(key, nowMs);
      return fail(reply, 401, "auth.invalid-credentials");
    }
    throttle.clear(key);
    await startSession(reply, account.id);
    const view: AccountView = { id: account.id, username: account.username };
    return { account: view };
  });

  app.post("/api/auth/logout", async (request, reply) => {
    if (request.sessionToken !== null) await deleteSession(db, request.sessionToken, config.sessionSecret);
    reply.clearCookie(SESSION_COOKIE, { path: "/" });
    return reply.code(204).send();
  });

  app.get("/api/auth/me", async (request, reply) => {
    const account = requireAccount(request, reply);
    if (account === null) return reply;
    const view: AccountView = { id: account.id, username: account.username };
    return { account: view };
  });
}
