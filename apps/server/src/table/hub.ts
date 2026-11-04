import type { TableEvent } from "@phoenix/shared";
import { RateLimiter } from "./rate-limit";
import { SerialQueue } from "./serial-queue";
import type { Viewer } from "./visibility";

export type Client = {
  worldId: string;
  /** The login session this connection was opened with (its stored id), so ending the session ends the connection. */
  sessionKey: string;
  viewer: Viewer;
  send(event: TableEvent): void;
  /** Closes the connection; `code` tells the client why (it does not reconnect on the codes that mean "over"). */
  close(code?: number): void;
};

/**
 * The people connected to the table of each running session, kept in memory (the service runs as one instance).
 * Everything sent goes through `broadcast`, which asks for the event each viewer may receive: nothing is sent to
 * everyone without passing the visibility rules.
 */
export class TableHub {
  private readonly rooms = new Map<string, Set<Client>>();
  private readonly queue = new SerialQueue();
  private readonly pointerLimits = new Map<string, RateLimiter>();

  /**
   * Whether this person may send one more pointer position now. The allowance is theirs, whatever number of connections
   * they have open, so opening more of them does not give more room.
   */
  allowPointer(accountId: string, nowMs: number, limit: number, windowMs: number): boolean {
    let limiter = this.pointerLimits.get(accountId);
    if (limiter === undefined) {
      limiter = new RateLimiter(limit, windowMs);
      this.pointerLimits.set(accountId, limiter);
    }
    return limiter.allow(nowMs);
  }

  /** How many connections this person has to the table of this session. */
  connections(sessionId: string, accountId: string): number {
    return this.clients(sessionId).filter((c) => c.viewer.accountId === accountId).length;
  }

  /**
   * Makes room for one more connection of this person: while they already have `max`, the oldest is closed (with the
   * code that tells the client it was replaced). A person cannot hold open an unlimited number of connections.
   */
  limitAccount(sessionId: string, accountId: string, max: number, replacedCode: number): void {
    const mine = this.clients(sessionId).filter((c) => c.viewer.accountId === accountId);
    for (const client of mine.slice(0, Math.max(0, mine.length - max + 1))) {
      this.leave(sessionId, client);
      client.close(replacedCode);
    }
  }

  /** How many changes to the table of a session are running or waiting. */
  queued(sessionId: string): number {
    return this.queue.depth(sessionId);
  }

  /** Runs a change to the table of a session after every change asked before it, from any connection. */
  serial<T>(sessionId: string, job: () => Promise<T>): Promise<T> {
    return this.queue.run(sessionId, job);
  }

  join(sessionId: string, client: Client): void {
    const room = this.rooms.get(sessionId) ?? new Set<Client>();
    room.add(client);
    this.rooms.set(sessionId, room);
  }

  leave(sessionId: string, client: Client): void {
    const room = this.rooms.get(sessionId);
    if (room === undefined) return;
    room.delete(client);
    if (room.size === 0) this.rooms.delete(sessionId);
    // The allowance of a person who has no connection left is forgotten, so the map does not grow forever.
    if (this.connections(sessionId, client.viewer.accountId) === 0) this.pointerLimits.delete(client.viewer.accountId);
  }

  clients(sessionId: string): Client[] {
    return [...(this.rooms.get(sessionId) ?? [])];
  }

  /** Who is at the table, once per account, in the order they arrived. */
  present(sessionId: string): { accountId: string; username: string }[] {
    const seen = new Map<string, string>();
    for (const c of this.clients(sessionId)) if (!seen.has(c.viewer.accountId)) seen.set(c.viewer.accountId, c.viewer.username);
    return [...seen].map(([accountId, username]) => ({ accountId, username }));
  }

  /** Sends each connected viewer the event made for them, or nothing when `make` returns null. */
  broadcast(sessionId: string, make: (viewer: Viewer) => TableEvent | null): void {
    for (const client of this.clients(sessionId)) {
      const event = make(client.viewer);
      if (event !== null) client.send(event);
    }
  }

  /** The person is no longer in the world: close every connection of theirs to its tables. */
  evict(worldId: string, accountId: string): void {
    this.dropWhere((c) => c.worldId === worldId && c.viewer.accountId === accountId);
  }

  /** The login session ended (logout): close every connection opened with it, and no other. */
  evictSession(sessionKey: string): void {
    this.dropWhere((c) => c.sessionKey === sessionKey);
  }

  private dropWhere(matches: (client: Client) => boolean): void {
    for (const [sessionId, room] of [...this.rooms]) {
      const gone = [...room].filter(matches);
      if (gone.length === 0) continue;
      // Out of the room first, so nothing more is sent to them while the connection closes.
      for (const client of gone) this.leave(sessionId, client);
      for (const client of gone) client.close();
      this.broadcast(sessionId, () => ({ type: "presence", present: this.present(sessionId) }));
    }
  }

  /** The session ended (or the room is no longer to be used): tell everyone why and close their connections. */
  endSession(sessionId: string, error = "errors.table.no-session"): void {
    for (const client of this.clients(sessionId)) {
      client.send({ type: "error", error });
      client.close();
    }
    this.rooms.delete(sessionId);
  }
}
