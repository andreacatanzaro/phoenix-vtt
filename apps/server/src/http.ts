import type { FastifyReply, FastifyRequest } from "fastify";
import type { z } from "zod";
import type { SessionAccount } from "./auth/sessions";

/** Every error body is `{ error: "<catalog key>" }`: the client translates it, the server never sends Italian text. */
export function fail(reply: FastifyReply, status: number, key: string): FastifyReply {
  return reply.code(status).send({ error: `errors.${key}` });
}

/** The request body checked against a schema; `null` after the 400 has been sent. */
export function parseBody<T extends z.ZodType>(request: FastifyRequest, reply: FastifyReply, schema: T): z.infer<T> | null {
  const parsed = schema.safeParse(request.body);
  if (!parsed.success) {
    fail(reply, 400, "invalid");
    return null;
  }
  return parsed.data;
}

/** The signed-in account, or `null` after the 401 has been sent. */
export function requireAccount(request: FastifyRequest, reply: FastifyReply): SessionAccount | null {
  if (request.account === null) {
    fail(reply, 401, "unauthenticated");
    return null;
  }
  return request.account;
}

/** PostgreSQL error 23503, whether it arrives bare or wrapped by the ORM. */
export function isForeignKeyViolation(error: unknown): boolean {
  if (hasCode(error, "23503")) return true;
  return typeof error === "object" && error !== null && "cause" in error && hasCode(error.cause, "23503");
}

function hasCode(value: unknown, code: string): boolean {
  return typeof value === "object" && value !== null && "code" in value && value.code === code;
}

/** PostgreSQL error 23505, whether it arrives bare or wrapped by the ORM. */
export function isUniqueViolation(error: unknown): boolean {
  if (hasCode(error, "23505")) return true;
  return typeof error === "object" && error !== null && "cause" in error && hasCode(error.cause, "23505");
}

declare module "fastify" {
  interface FastifyRequest {
    account: SessionAccount | null;
    /** The raw session cookie value, kept so logout can delete exactly that session. */
    sessionToken: string | null;
  }
}
