import { and, eq } from "drizzle-orm";
import { rollDice, type Rng } from "@phoenix/rules-core";
import { placeInZone, squaresOf, t, TEXT_MAX_LENGTH, TOKEN_LABEL_MAX_LENGTH, type MessageView, type TableCommand, type TableEvent, type TokenView } from "@phoenix/shared";
import { roleIn } from "../access";
import { gameSessions, images, sceneLinks, tokens } from "../db/schema";
import type { Database } from "../db/types";
import type { TableHub } from "./hub";
import { findToken, insertMessage, runningSession, loadScene, loadTokens, members, recentMessages, sessionById, tokenView, type SessionRow } from "./store";
import { canSeeMessage, messagesFor, tokenFor, tokensFor, type Viewer } from "./visibility";

/** A refused command: `key` is the catalog key the client shows. */
export class CommandError extends Error {
  constructor(readonly key: string) {
    super(key);
  }
}

export type TableDeps = { db: Database; hub: TableHub; rng: Rng; now: () => Date };

const refuse = (key: string): never => {
  throw new CommandError(`errors.${key}`);
};

/** Everything a viewer needs when they sit down, or when the scene changes under them. */
export async function snapshotFor(deps: TableDeps, session: SessionRow, viewer: Viewer): Promise<TableEvent> {
  const scene = session.currentSceneId === null ? null : await loadScene(deps.db, session.worldId, session.currentSceneId);
  const allTokens = scene === null ? [] : await loadTokens(deps.db, scene.id);
  return {
    type: "snapshot",
    session: { id: session.id, title: session.title },
    you: { accountId: viewer.accountId, username: viewer.username, role: viewer.role },
    scene,
    tokens: tokensFor(viewer, allTokens),
    messages: messagesFor(viewer, await recentMessages(deps.db, session.id, viewer)),
    present: deps.hub.present(session.id),
  };
}

async function sendSnapshots(deps: TableDeps, session: SessionRow): Promise<void> {
  const fresh = (await sessionById(deps.db, session.id)) ?? session;
  const events = new Map<string, TableEvent>();
  for (const client of deps.hub.clients(session.id)) events.set(client.viewer.accountId, await snapshotFor(deps, fresh, client.viewer));
  deps.hub.broadcast(session.id, (viewer) => events.get(viewer.accountId) ?? null);
}

/**
 * Tells everyone about a token. `wasHidden` is whether it was hidden before this change (a new token counts as hidden).
 * A player is told to forget a token only if they could see it a moment ago; for a token that stays hidden they get
 * nothing at all, not even its id.
 */
function broadcastToken(deps: TableDeps, sessionId: string, token: TokenView, wasHidden: boolean): void {
  deps.hub.broadcast(sessionId, (viewer) => {
    const seen = tokenFor(viewer, token);
    if (seen !== null) return { type: "token.upserted", token: seen };
    return wasHidden ? null : { type: "token.removed", tokenId: token.id };
  });
}

function broadcastMessage(deps: TableDeps, sessionId: string, message: MessageView): void {
  deps.hub.broadcast(sessionId, (viewer) => (canSeeMessage(viewer, message) ? { type: "message", message } : null));
}

async function say(deps: TableDeps, session: SessionRow, text: string): Promise<void> {
  const message = await insertMessage(deps.db, { worldId: session.worldId, sessionId: session.id, authorId: null, kind: "system", audience: "all", recipientId: null, text, notation: null, roll: null, at: deps.now() });
  broadcastMessage(deps, session.id, message);
}

function requireDm(viewer: Viewer): void {
  if (viewer.role !== "dm") refuse("forbidden");
}

async function checkOwner(deps: TableDeps, worldId: string, ownerId: string | null): Promise<void> {
  if (ownerId === null) return;
  const found = await members(deps.db, worldId, [ownerId]);
  if (!found.has(ownerId)) refuse("table.bad-target");
}

async function checkTokenImage(deps: TableDeps, worldId: string, imageId: string | null): Promise<void> {
  if (imageId === null) return;
  const rows = await deps.db.select({ id: images.id }).from(images).where(and(eq(images.id, imageId), eq(images.worldId, worldId), eq(images.kind, "token"))).limit(1);
  if (rows.length === 0) refuse("table.bad-target");
}

/** The token of the scene being played, or a refusal. */
async function tokenHere(deps: TableDeps, session: SessionRow, tokenId: string): Promise<typeof tokens.$inferSelect> {
  const row = await findToken(deps.db, session.worldId, tokenId);
  if (row === null || session.currentSceneId === null || row.sceneId !== session.currentSceneId) return refuse("table.bad-target");
  return row;
}

/** The setup of a scene was saved: whoever is playing that scene gets it at once. */
export async function refreshScene(deps: TableDeps, worldId: string, sceneId: string): Promise<void> {
  const session = await runningSession(deps.db, worldId);
  if (session === null) return;
  await deps.hub.serial(session.id, async () => {
    // Read again inside the queue: the scene may have changed while this waited.
    const current = await sessionById(deps.db, session.id);
    if (current?.status === "running" && current.currentSceneId === sceneId) await sendSnapshots(deps, current);
  });
}

/**
 * Applies one command from a viewer to the running session. The session is read again every time, so a command on a
 * session that has just ended, or on a scene that has just changed, is refused instead of acting on stale data.
 */
export function applyCommand(deps: TableDeps, sessionId: string, viewer: Viewer, command: TableCommand, stillSignedIn: () => Promise<boolean>): Promise<void> {
  return deps.hub.serial(sessionId, () => run(deps, sessionId, viewer, command, stillSignedIn));
}

async function run(deps: TableDeps, sessionId: string, asked: Viewer, command: TableCommand, stillSignedIn: () => Promise<boolean>): Promise<void> {
  // The login may have ended (logout, expiry) while this waited in the queue.
  if (!(await stillSignedIn())) return refuse("unauthenticated");
  const session = await sessionById(deps.db, sessionId);
  if (session === null || session.status !== "running") return refuse("table.no-session");
  const { db } = deps;
  // The person may have been removed from the world while this waited in the queue: ask again, and trust the role as it is now.
  const role = await roleIn(db, session.worldId, asked.accountId);
  if (role === null) return refuse("forbidden");
  const viewer = { ...asked, role };

  switch (command.type) {
    case "ping":
    case "pointer":
      // The pointer is relayed as it arrives, without waiting in line (see the table route): nothing to do here.
      return;

    case "view.sync": {
      requireDm(viewer);
      deps.hub.broadcast(session.id, (to) => (to.accountId === viewer.accountId ? null : { type: "view.sync", x: command.x, y: command.y, zoom: command.zoom }));
      return;
    }

    case "chat.send": {
      let recipientId: string | null = null;
      if (command.whisperTo !== null) {
        if (command.whisperTo === viewer.accountId) refuse("table.bad-target");
        const found = await members(db, session.worldId, [command.whisperTo]);
        if (!found.has(command.whisperTo)) refuse("table.bad-target");
        recipientId = command.whisperTo;
      }
      const message = await insertMessage(db, { worldId: session.worldId, sessionId: session.id, authorId: viewer.accountId, kind: "chat", audience: recipientId === null ? "all" : "whisper", recipientId, text: command.text, notation: null, roll: null, at: deps.now() });
      broadcastMessage(deps, session.id, message);
      return;
    }

    case "roll.request": {
      let result;
      try {
        result = rollDice(command.notation, deps.rng);
      } catch {
        return refuse("table.bad-notation");
      }
      const message = await insertMessage(db, {
        worldId: session.worldId,
        sessionId: session.id,
        authorId: viewer.accountId,
        kind: "roll",
        audience: command.reserved ? "gm" : "all",
        recipientId: null,
        text: "",
        notation: result.notation,
        roll: { dice: result.dice, kept: result.kept, modifier: result.modifier, total: result.total },
        at: deps.now(),
      });
      broadcastMessage(deps, session.id, message);
      return;
    }

    case "token.move": {
      const row = await tokenHere(deps, session, command.tokenId);
      if (viewer.role !== "dm" && row.ownerAccountId !== viewer.accountId) return refuse("table.not-your-token");
      if (viewer.role !== "dm" && row.hidden) return refuse("table.bad-target");
      const [updated] = await db.update(tokens).set({ x: command.x, y: command.y }).where(eq(tokens.id, row.id)).returning();
      if (updated !== undefined) broadcastToken(deps, session.id, tokenView(updated), row.hidden);
      return;
    }

    case "token.add": {
      requireDm(viewer);
      if (session.currentSceneId === null) return refuse("table.no-scene");
      // Owner and picture only mean something for a token; for a text they are ignored, so they are not checked either.
      if (command.kind === "token") {
        await checkOwner(deps, session.worldId, command.ownerAccountId);
        await checkTokenImage(deps, session.worldId, command.imageId);
      }
      const [row] = await db
        .insert(tokens)
        .values({ worldId: session.worldId, sceneId: session.currentSceneId, kind: command.kind, label: command.label, color: command.color, imageId: command.kind === "text" ? null : command.imageId, x: command.x, y: command.y, size: command.kind === "text" ? 1 : command.size, hidden: command.hidden, travels: command.kind === "text" ? false : command.travels || command.ownerAccountId !== null, ownerAccountId: command.kind === "text" ? null : command.ownerAccountId, createdAt: deps.now() })
        .returning();
      if (row !== undefined) broadcastToken(deps, session.id, tokenView(row), true);
      return;
    }

    case "token.update": {
      requireDm(viewer);
      const row = await tokenHere(deps, session, command.tokenId);
      if (command.ownerAccountId !== undefined) await checkOwner(deps, session.worldId, command.ownerAccountId);
      if (command.imageId !== undefined) await checkTokenImage(deps, session.worldId, command.imageId);
      // A name is short and a text may be long: the limit is the one of what this is.
      if (command.label !== undefined && command.label.length > (row.kind === "text" ? TEXT_MAX_LENGTH : TOKEN_LABEL_MAX_LENGTH)) return refuse("invalid");
      // A text is words on the map: it has no owner, no picture and does not travel with the group.
      if (row.kind === "text" && (command.ownerAccountId !== undefined || command.travels === true || command.imageId !== undefined)) return refuse("invalid");
      const changes = {
        ...(command.label === undefined ? {} : { label: command.label }),
        ...(command.color === undefined ? {} : { color: command.color }),
        ...(command.size === undefined ? {} : { size: command.size }),
        ...(command.hidden === undefined ? {} : { hidden: command.hidden }),
        ...(command.travels === undefined ? {} : { travels: command.travels }),
        ...(command.ownerAccountId === undefined ? {} : { ownerAccountId: command.ownerAccountId }),
        ...(command.imageId === undefined ? {} : { imageId: command.imageId }),
      };
      if (Object.keys(changes).length === 0) return;
      const [updated] = await db.update(tokens).set(changes).where(eq(tokens.id, row.id)).returning();
      if (updated !== undefined) broadcastToken(deps, session.id, tokenView(updated), row.hidden);
      return;
    }

    case "token.remove": {
      requireDm(viewer);
      const row = await tokenHere(deps, session, command.tokenId);
      await db.delete(tokens).where(eq(tokens.id, row.id));
      // Only those who could see the token are told it is gone.
      deps.hub.broadcast(session.id, (viewer) => (viewer.role === "dm" || !row.hidden ? { type: "token.removed", tokenId: row.id } : null));
      return;
    }

    case "scene.open": {
      requireDm(viewer);
      const scene = await loadScene(db, session.worldId, command.sceneId);
      if (scene === null) return refuse("table.bad-target");
      await db.update(gameSessions).set({ currentSceneId: scene.id }).where(eq(gameSessions.id, session.id));
      await say(deps, session, t("table.system.scene-opened", { scene: scene.name }));
      await sendSnapshots(deps, session);
      return;
    }

    case "scene.travel": {
      requireDm(viewer);
      if (session.currentSceneId === null) return refuse("table.no-scene");
      const from = session.currentSceneId;
      const destination = await loadScene(db, session.worldId, command.toSceneId);
      if (destination === null) return refuse("table.bad-target");
      const exit = await db.select({ id: sceneLinks.id }).from(sceneLinks).where(and(eq(sceneLinks.worldId, session.worldId), eq(sceneLinks.fromSceneId, from), eq(sceneLinks.toSceneId, destination.id))).limit(1);
      if (exit.length === 0) return refuse("table.no-exit");
      await db.transaction(async (tx) => {
        const arriving = await tx.select().from(tokens).where(eq(tokens.sceneId, destination.id));
        const travelling = (await tx.select().from(tokens).where(and(eq(tokens.sceneId, from), eq(tokens.travels, true)))).sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime() || a.id.localeCompare(b.id));
        // Texts take no square of their own, so they do not keep a token out of a place.
        const occupied = new Set(arriving.filter((r) => r.kind !== "text").flatMap(squaresOf));
        const placed = placeInZone(destination.start, travelling.map((r) => ({ id: r.id, size: r.size })), occupied);
        for (const spot of placed) await tx.update(tokens).set({ sceneId: destination.id, x: spot.x, y: spot.y }).where(eq(tokens.id, spot.id));
        await tx.update(gameSessions).set({ currentSceneId: destination.id }).where(eq(gameSessions.id, session.id));
      });
      await say(deps, session, t("table.system.scene-travel", { scene: destination.name }));
      await sendSnapshots(deps, session);
      return;
    }
  }
}

