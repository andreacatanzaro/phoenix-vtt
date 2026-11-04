import { and, asc, desc, eq, inArray, or, type SQL } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { isRecord } from "@phoenix/rules-core";
import type { MessageView, RollResultView, TableScene, TokenColor, TokenView } from "@phoenix/shared";
import { TOKEN_COLORS } from "@phoenix/shared";
import { accounts, gameSessions, images, scenes, tableMessages, tokens, worldMemberships } from "../db/schema";
import type { Database } from "../db/types";
import type { Viewer } from "./visibility";

export type SessionRow = typeof gameSessions.$inferSelect;
type TokenRow = typeof tokens.$inferSelect;

export const SNAPSHOT_MESSAGES = 100;

export async function runningSession(db: Database, worldId: string): Promise<SessionRow | null> {
  const rows = await db.select().from(gameSessions).where(and(eq(gameSessions.worldId, worldId), eq(gameSessions.status, "running"))).limit(1);
  return rows[0] ?? null;
}

export async function sessionById(db: Database, sessionId: string): Promise<SessionRow | null> {
  const rows = await db.select().from(gameSessions).where(eq(gameSessions.id, sessionId)).limit(1);
  return rows[0] ?? null;
}

export async function loadScene(db: Database, worldId: string, sceneId: string): Promise<TableScene | null> {
  const rows = await db
    .select({ scene: scenes, width: images.width, height: images.height })
    .from(scenes)
    .leftJoin(images, eq(images.id, scenes.mapImageId))
    .where(and(eq(scenes.id, sceneId), eq(scenes.worldId, worldId)))
    .limit(1);
  const row = rows[0];
  if (row === undefined) return null;
  const s = row.scene;
  return {
    id: s.id,
    name: s.name,
    mapImageId: s.mapImageId,
    mapWidth: row.width,
    mapHeight: row.height,
    gridPx: s.gridPx,
    gridOffsetX: s.gridOffsetX,
    gridOffsetY: s.gridOffsetY,
    start: { x: s.startX, y: s.startY, w: s.startW, h: s.startH },
  };
}

function color(value: string): TokenColor {
  return TOKEN_COLORS.find((c) => c === value) ?? "grey";
}

export function tokenView(row: TokenRow): TokenView {
  return { id: row.id, sceneId: row.sceneId, kind: row.kind === "text" ? "text" : "token", label: row.label, color: color(row.color), imageId: row.imageId, x: row.x, y: row.y, size: row.size, hidden: row.hidden, travels: row.travels, ownerAccountId: row.ownerAccountId };
}

export async function loadTokens(db: Database, sceneId: string): Promise<TokenView[]> {
  const rows = await db.select().from(tokens).where(eq(tokens.sceneId, sceneId)).orderBy(asc(tokens.createdAt), asc(tokens.id));
  return rows.map(tokenView);
}

export async function findToken(db: Database, worldId: string, tokenId: string): Promise<TokenRow | null> {
  const rows = await db.select().from(tokens).where(and(eq(tokens.id, tokenId), eq(tokens.worldId, worldId))).limit(1);
  return rows[0] ?? null;
}

/** The members of a world with their names and roles, by account id. */
export async function members(db: Database, worldId: string, ids?: readonly string[]): Promise<Map<string, { username: string; role: "dm" | "player" }>> {
  const rows = await db
    .select({ id: accounts.id, username: accounts.username, role: worldMemberships.role })
    .from(worldMemberships)
    .innerJoin(accounts, eq(accounts.id, worldMemberships.accountId))
    .where(ids === undefined ? eq(worldMemberships.worldId, worldId) : and(eq(worldMemberships.worldId, worldId), inArray(worldMemberships.accountId, [...ids])));
  return new Map(rows.map((r) => [r.id, { username: r.username, role: r.role }]));
}

const recipient = alias(accounts, "recipient");

function isNumbers(v: unknown): v is number[] {
  return Array.isArray(v) && v.every((n) => typeof n === "number");
}

function asRoll(value: unknown): RollResultView | null {
  if (!isRecord(value)) return null;
  const { dice, kept, modifier, total } = value;
  return isNumbers(dice) && isNumbers(kept) && typeof modifier === "number" && typeof total === "number" ? { dice, kept, modifier, total } : null;
}

type MessageRow = {
  message: typeof tableMessages.$inferSelect;
  author: string | null;
  to: string | null;
};

function messageView(row: MessageRow): MessageView {
  const m = row.message;
  const kind = m.kind === "roll" || m.kind === "system" ? m.kind : "chat";
  const audience = m.audience === "gm" || m.audience === "whisper" ? m.audience : "all";
  return {
    id: m.id,
    kind,
    audience,
    authorId: m.authorAccountId,
    authorName: row.author ?? "",
    recipientId: m.recipientAccountId,
    recipientName: row.to,
    text: m.text,
    notation: m.notation,
    roll: asRoll(m.roll),
    createdAt: m.createdAt.toISOString(),
  };
}

const messageSelect = { message: tableMessages, author: accounts.username, to: recipient.username };

/**
 * The same rule as `canSeeMessage`, as a condition on the database, so the limit on the history counts only the lines
 * the reader may see: lines meant for others must not use up the room of the public ones.
 */
function readableBy(viewer: Viewer): SQL {
  const mine = eq(tableMessages.authorAccountId, viewer.accountId);
  const reserved = viewer.role === "dm" ? eq(tableMessages.audience, "gm") : and(eq(tableMessages.audience, "gm"), mine);
  const whisper = and(eq(tableMessages.audience, "whisper"), or(mine, eq(tableMessages.recipientAccountId, viewer.accountId)));
  const readable = or(eq(tableMessages.audience, "all"), reserved, whisper);
  if (readable === undefined) throw new Error("No condition built");
  return readable;
}

/** The last lines of the session log that this reader may see, oldest first. */
export async function recentMessages(db: Database, sessionId: string, viewer: Viewer, limit = SNAPSHOT_MESSAGES): Promise<MessageView[]> {
  const rows = await db
    .select(messageSelect)
    .from(tableMessages)
    .leftJoin(accounts, eq(accounts.id, tableMessages.authorAccountId))
    .leftJoin(recipient, eq(recipient.id, tableMessages.recipientAccountId))
    .where(and(eq(tableMessages.gameSessionId, sessionId), readableBy(viewer)))
    .orderBy(desc(tableMessages.seq))
    .limit(limit);
  return rows.map(messageView).reverse();
}

export async function insertMessage(
  db: Database,
  input: { worldId: string; sessionId: string; authorId: string | null; kind: "chat" | "roll" | "system"; audience: "all" | "gm" | "whisper"; recipientId: string | null; text: string; notation: string | null; roll: RollResultView | null; at: Date },
): Promise<MessageView> {
  const [row] = await db
    .insert(tableMessages)
    .values({ worldId: input.worldId, gameSessionId: input.sessionId, authorAccountId: input.authorId, kind: input.kind, audience: input.audience, recipientAccountId: input.recipientId, text: input.text, notation: input.notation, roll: input.roll, createdAt: input.at })
    .returning({ id: tableMessages.id });
  if (row === undefined) throw new Error("Insert returned no row");
  const found = await db
    .select(messageSelect)
    .from(tableMessages)
    .leftJoin(accounts, eq(accounts.id, tableMessages.authorAccountId))
    .leftJoin(recipient, eq(recipient.id, tableMessages.recipientAccountId))
    .where(eq(tableMessages.id, row.id))
    .limit(1);
  const first = found[0];
  if (first === undefined) throw new Error("The message just inserted was not found");
  return messageView(first);
}
