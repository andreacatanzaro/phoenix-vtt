import { tableEventSchema, type TableCommand, type TableEvent } from "@phoenix/shared";

export type SocketLike = {
  readyState: number;
  send(data: string): void;
  close(code?: number): void;
  onopen: (() => void) | null;
  onmessage: ((e: { data: unknown }) => void) | null;
  onclose: ((e: { code: number }) => void) | null;
};

export type ConnectionDeps = {
  open: (url: string) => SocketLike;
  setTimer: (fn: () => void, ms: number) => unknown;
  clearTimer: (id: unknown) => void;
};

export type ConnectionHandlers = {
  onEvent: (event: TableEvent) => void;
  onStatus: (status: "connecting" | "live" | "reconnecting" | "ended") => void;
};

/** The server closes with this code when the session is over or the person is no longer in the world. */
export const END_CODE = 4000;
const NOT_FOUND_CODE = 4404;
/** The login behind the connection is over: reconnecting with the same cookie would only be refused. */
export const SIGNED_OUT_CODE = 4001;
export const PING_MS = 25_000;
export const BACKOFF_MS = [1000, 2000, 4000, 8000];
export const MAX_ATTEMPTS = 8;
const OPEN = 1;

export type Connection = { send(command: TableCommand): boolean; close(): void };

/**
 * Keeps one connection to the table: it reconnects with a growing pause after a drop, and stops for good when the server
 * says the table is over. Events that do not match the shared schema are ignored.
 */
export function connectTable(url: string, handlers: ConnectionHandlers, deps: ConnectionDeps): Connection {
  let socket: SocketLike | null = null;
  let stopped = false;
  let attempts = 0;
  let retry: unknown = null;
  let ping: unknown = null;

  const stop = (): void => {
    stopped = true;
    if (retry !== null) deps.clearTimer(retry);
    if (ping !== null) deps.clearTimer(ping);
    retry = null;
    ping = null;
  };

  const schedulePing = (): void => {
    ping = deps.setTimer(() => {
      if (socket !== null && socket.readyState === OPEN) socket.send(JSON.stringify({ type: "ping" }));
      schedulePing();
    }, PING_MS);
  };

  const connect = (): void => {
    const s = deps.open(url);
    socket = s;
    s.onopen = () => {
      attempts = 0;
      schedulePing();
    };
    s.onmessage = (e) => {
      if (typeof e.data !== "string") return;
      let json: unknown;
      try {
        json = JSON.parse(e.data);
      } catch {
        return;
      }
      const parsed = tableEventSchema.safeParse(json);
      if (parsed.success) handlers.onEvent(parsed.data);
    };
    s.onclose = (e) => {
      if (ping !== null) deps.clearTimer(ping);
      ping = null;
      if (stopped) return;
      if (e.code === END_CODE || e.code === NOT_FOUND_CODE || e.code === SIGNED_OUT_CODE || attempts >= MAX_ATTEMPTS) {
        stop();
        handlers.onStatus("ended");
        return;
      }
      handlers.onStatus("reconnecting");
      const wait = BACKOFF_MS[Math.min(attempts, BACKOFF_MS.length - 1)] ?? 8000;
      attempts += 1;
      retry = deps.setTimer(connect, wait);
    };
  };

  handlers.onStatus("connecting");
  connect();

  return {
    send(command) {
      if (socket === null || socket.readyState !== OPEN) return false;
      socket.send(JSON.stringify(command));
      return true;
    },
    close() {
      stop();
      socket?.close();
    },
  };
}

/** The address of the table of a world, on the same host as the page. */
export function tableUrl(worldId: string, location: { protocol: string; host: string }): string {
  return `${location.protocol === "https:" ? "wss:" : "ws:"}//${location.host}/api/worlds/${encodeURIComponent(worldId)}/table`;
}
