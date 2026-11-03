import { createHmac, randomBytes } from "node:crypto";
import { and, eq, gt } from "drizzle-orm";
import { accounts, sessions } from "../db/schema";
import type { Database } from "../db/types";

export type SessionAccount = { id: string; username: string };

/** What is stored is an HMAC of the token, so a copy of the database cannot be used to log in. */
export function sessionId(token: string, secret: string): string {
  return createHmac("sha256", secret).update(token).digest("hex");
}

export function newToken(): string {
  return randomBytes(32).toString("base64url");
}

export async function createSession(db: Database, accountId: string, secret: string, now: Date, days: number): Promise<{ token: string; expiresAt: Date }> {
  const token = newToken();
  const expiresAt = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);
  await db.insert(sessions).values({ id: sessionId(token, secret), accountId, createdAt: now, expiresAt });
  return { token, expiresAt };
}

export async function accountForToken(db: Database, token: string, secret: string, now: Date): Promise<SessionAccount | null> {
  const rows = await db
    .select({ id: accounts.id, username: accounts.username })
    .from(sessions)
    .innerJoin(accounts, eq(accounts.id, sessions.accountId))
    .where(and(eq(sessions.id, sessionId(token, secret)), gt(sessions.expiresAt, now)))
    .limit(1);
  return rows[0] ?? null;
}

export async function deleteSession(db: Database, token: string, secret: string): Promise<void> {
  await db.delete(sessions).where(eq(sessions.id, sessionId(token, secret)));
}
