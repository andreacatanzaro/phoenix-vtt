import type { FastifyInstance, FastifyRequest } from "fastify";
import type { WebSocket } from "ws";
import { z } from "zod";
import { tableCommandSchema, type TableCommand, type TableEvent } from "@phoenix/shared";
import { requireDm, requireMember, roleIn } from "../access";
import type { Database } from "../db/types";
import { fail } from "../http";
import { applyCommand, CommandError, snapshotFor, type TableDeps } from "../table/commands";
import { applyPrepareCommand, prepareKey, sceneInPlay, snapshotForPrepare } from "../table/prepare";
import type { TableHub } from "../table/hub";
import { accountForToken, sessionId as storedSessionId } from "../auth/sessions";
import { FrameGate } from "../table/frame-gate";
import { pointerAuth } from "../table/pointer-auth";
import { loadScene, runningSession } from "../table/store";
import type { Viewer } from "../table/visibility";

const worldParams = z.object({ worldId: z.string() });
const prepareParams = z.object({ worldId: z.string(), sceneId: z.uuid() });
export const MAX_FRAME_BYTES = 16 * 1024;
const COMMANDS_PER_WINDOW = 40;
const WINDOW_MS = 10_000;
/** Commands of one connection waiting at the same time; past this the connection is cut off. */
const MAX_PENDING_FRAMES = 25;
/** The pointer moves with the mouse, so it has a much larger allowance of its own; past it, positions are just dropped. */
const POINTER_PER_WINDOW = 400;
/** A person may hold this many connections to one table (a few tabs and a phone); the oldest is closed for a new one. */
const MAX_CONNECTIONS_PER_ACCOUNT = 4;
const REPLACED_CODE = 4003;
/** The login of a connection is looked up again for pointer frames at most this often: they come many times a second. */
const POINTER_AUTH_MS = 5000;

/** The position, if this frame is a well-formed pointer command; null for anything else. */
function readPointer(raw: Buffer): { x: number | null; y: number | null } | null {
  let json: unknown;
  try {
    json = JSON.parse(raw.toString("utf8"));
  } catch {
    return null;
  }
  const parsed = tableCommandSchema.safeParse(json);
  return parsed.success && parsed.data.type === "pointer" ? { x: parsed.data.x, y: parsed.data.y } : null;
}

/** What a connection is attached to: the live table of a session, or the preparation of a scene. */
type Room = {
  /** The key the people in it are kept under in the hub. */
  key: string;
  worldId: string;
  /** Whether the pointer is relayed to the others (at the table only). */
  pointers: boolean;
  snapshot: (viewer: Viewer) => Promise<TableEvent>;
  apply: (viewer: Viewer, command: TableCommand, stillSignedIn: () => Promise<boolean>) => Promise<void>;
};

/**
 * The live table of a world, and the preparation of its scenes: one WebSocket per person. The table needs an account that
 * belongs to the world and a session that is running; the preparation needs the DM and a scene that is not in play.
 * Everything that arrives is a typed command, checked before it is applied.
 */
export function tableRoutes(app: FastifyInstance, db: Database, deps: TableDeps, hub: TableHub, sessionSecret: string): void {
  /** Takes the connection into the room: the snapshot, the commands in order, the limits, and the goodbye. */
  const serve = async (socket: WebSocket, request: FastifyRequest, account: { id: string; username: string }, viewer: Viewer, room: Room): Promise<void> => {
    const send = (event: TableEvent): void => {
      if (socket.readyState === socket.OPEN) socket.send(JSON.stringify(event));
    };
    const token = request.sessionToken;
    if (token === null) {
      socket.close(4001, "unauthenticated");
      return;
    }
    /** Whether the login this connection was opened with is still good (not logged out, not expired). */
    const stillSignedIn = async (): Promise<boolean> => (await accountForToken(db, token, sessionSecret, deps.now()))?.id === account.id;
    const client = { worldId: room.worldId, sessionKey: storedSessionId(token, sessionSecret), viewer, send, close: (code?: number) => { socket.close(code ?? 4000, "session-ended"); } };
    hub.limitAccount(room.key, account.id, MAX_CONNECTIONS_PER_ACCOUNT, REPLACED_CODE);
    hub.join(room.key, client);
    send(await room.snapshot(viewer));
    hub.broadcast(room.key, () => ({ type: "presence", present: hub.present(room.key) }));

    const gate = new FrameGate(COMMANDS_PER_WINDOW, WINDOW_MS, MAX_PENDING_FRAMES);
    // The login is checked again for the pointer too, but not on every frame: the answer is kept for a few seconds.
    const pointerAllowed = pointerAuth({
      check: stillSignedIn,
      now: () => deps.now().getTime(),
      ttlMs: POINTER_AUTH_MS,
      onError: (error) => { request.log.error({ err: error }, "pointer login check failed"); },
    });
    const showPointer = (x: number | null, y: number | null): void => {
      if (!room.pointers) return;
      hub.broadcast(room.key, (to) => (to.accountId === viewer.accountId ? null : { type: "pointer", accountId: viewer.accountId, username: viewer.username, x, y }));
    };

    /** One frame from the client: checked, then applied. A refusal goes back to the sender only. */
    const handle = async (raw: Buffer): Promise<void> => {
      const tell = (error: string): void => {
        send({ type: "error", error });
      };
      let json: unknown;
      try {
        json = JSON.parse(raw.toString("utf8"));
      } catch {
        tell("errors.invalid");
        return;
      }
      const parsed = tableCommandSchema.safeParse(json);
      if (!parsed.success) {
        tell("errors.invalid");
        return;
      }
      if (parsed.data.type === "ping") {
        if (await stillSignedIn()) send({ type: "pong" });
        else socket.close(4001, "unauthenticated");
        return;
      }
      try {
        await room.apply(viewer, parsed.data, stillSignedIn);
      } catch (error) {
        if (error instanceof CommandError) {
          tell(error.key);
          // A connection whose login has ended is of no use any more.
          if (error.key === "errors.unauthenticated") socket.close(4001, "unauthenticated");
          return;
        }
        request.log.error({ err: error }, "table command failed");
        tell("errors.unavailable");
      }
    };

    // Commands of one connection are handled in the order they arrived. Each frame is judged when it arrives, before it
    // is queued, so a flood is turned away instead of piling up.
    let queue: Promise<void> = Promise.resolve();
    socket.on("message", (raw: Buffer) => {
      // The pointer is not a command that changes anything: it is passed on at once, outside the queue and its limits.
      const pointer = readPointer(raw);
      if (pointer !== null) {
        void pointerAllowed().then((ok) => {
          if (!ok) socket.close(4001, "unauthenticated");
          else if (hub.allowPointer(account.id, deps.now().getTime(), POINTER_PER_WINDOW, WINDOW_MS)) showPointer(pointer.x, pointer.y);
        });
        return;
      }
      const verdict = gate.admit(deps.now().getTime());
      if (verdict === "close") {
        socket.close(1008, "too-many-frames");
        return;
      }
      if (verdict === "refuse") {
        send({ type: "error", error: "errors.too-many-attempts" });
        return;
      }
      queue = queue.then(() => handle(raw)).finally(() => { gate.finished(); });
    });
    socket.on("close", () => {
      hub.leave(room.key, client);
      // A pointer left behind by someone who is gone would stay on the map for the others.
      showPointer(null, null);
      hub.broadcast(room.key, () => ({ type: "presence", present: hub.present(room.key) }));
    });
  };

  app.get(
    "/api/worlds/:worldId/table",
    {
      websocket: true,
      // Refused with a plain HTTP answer before the connection is upgraded.
      preValidation: async (request, reply) => {
        const params = worldParams.safeParse(request.params);
        const access = await requireMember(request, reply, db, params.success ? params.data.worldId : null);
        if (access === null) return reply;
        if ((await runningSession(db, access.worldId)) === null) return fail(reply, 409, "table.no-session");
        return undefined;
      },
    },
    async (socket, request) => {
      const params = worldParams.safeParse(request.params);
      const account = request.account;
      const session = params.success ? await runningSession(db, params.data.worldId) : null;
      const role = account === null || session === null ? null : await roleIn(db, session.worldId, account.id);
      if (account === null || session === null || role === null) {
        socket.close(4404, "no-session");
        return;
      }
      const viewer: Viewer = { accountId: account.id, username: account.username, role };
      await serve(socket, request, account, viewer, {
        key: session.id,
        worldId: session.worldId,
        pointers: true,
        snapshot: (to) => snapshotFor(deps, session, to),
        apply: (to, command, stillSignedIn) => applyCommand(deps, session.id, to, command, stillSignedIn),
      });
    },
  );

  app.get(
    "/api/worlds/:worldId/scenes/:sceneId/prepare",
    {
      websocket: true,
      preValidation: async (request, reply) => {
        const params = prepareParams.safeParse(request.params);
        const access = await requireDm(request, reply, db, params.success ? params.data.worldId : null);
        if (access === null) return reply;
        if (!params.success || (await loadScene(db, access.worldId, params.data.sceneId)) === null) return fail(reply, 404, "not-found");
        if (await sceneInPlay(deps, access.worldId, params.data.sceneId)) return fail(reply, 409, "table.scene-in-play");
        return undefined;
      },
    },
    async (socket, request) => {
      const params = prepareParams.safeParse(request.params);
      const account = request.account;
      const scene = params.success ? await loadScene(db, params.data.worldId, params.data.sceneId) : null;
      const role = account === null || !params.success ? null : await roleIn(db, params.data.worldId, account.id);
      if (account === null || !params.success || scene === null || role !== "dm") {
        socket.close(4404, "no-scene");
        return;
      }
      const viewer: Viewer = { accountId: account.id, username: account.username, role };
      const { worldId, sceneId } = params.data;
      await serve(socket, request, account, viewer, {
        key: prepareKey(sceneId),
        worldId,
        pointers: false,
        snapshot: (to) => snapshotForPrepare(deps, scene, to),
        apply: (to, command, stillSignedIn) => applyPrepareCommand(deps, worldId, sceneId, to, command, stillSignedIn),
      });
    },
  );
}
