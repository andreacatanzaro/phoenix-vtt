import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import type { FastifyInstance } from "fastify";
import type { Rng } from "@phoenix/rules-core";
import { tableEventSchema, type TableCommand, type TableEvent } from "@phoenix/shared";
import { buildApp } from "./app";
import { TableHub } from "./table/hub";
import { createMemoryImageStore } from "./image-store";
import type { Config } from "./config";
import * as schema from "./db/schema";
import type { Database } from "./db/types";

/** Test helpers only: an in-memory PostgreSQL (PGlite) with the real migrations applied. Never imported by the server itself. */
export const testConfig: Config = {
  nodeEnv: "test",
  port: 0,
  host: "127.0.0.1",
  databaseUrl: "memory://",
  sessionSecret: "test-secret-test-secret-test-secret-test",
  cookieSecure: false,
  sessionDays: 30,
  staticDir: null,
  storagePath: "memory",
};

export async function createTestDb(): Promise<{ db: Database; close: () => Promise<void> }> {
  const client = new PGlite();
  const db = drizzle(client, { schema });
  await migrate(db, { migrationsFolder: join(dirname(fileURLToPath(import.meta.url)), "..", "drizzle") });
  return { db, close: () => client.close() };
}

export type TestApp = { app: FastifyInstance; db: Database; clock: { now: Date }; images: ReturnType<typeof createMemoryImageStore>; hub: TableHub; close: () => Promise<void> };

export async function createTestApp(overrides: Partial<Config> = {}, extra: { rng?: Rng } = {}): Promise<TestApp> {
  const hub = new TableHub();
  const { db, close } = await createTestDb();
  const clock = { now: new Date("2026-01-01T12:00:00Z") };
  // Files are dated by the test clock, like everything else the tests move forward in time.
  const images = createMemoryImageStore(() => clock.now);
  const app = await buildApp({ db, config: { ...testConfig, ...overrides }, now: () => clock.now, imageStore: images, hub, ...(extra.rng === undefined ? {} : { rng: extra.rng }) });
  await app.ready();
  return {
    app,
    db,
    clock,
    images,
    hub,
    close: async () => {
      await app.close();
      await close();
    },
  };
}

export const TEST_PASSWORD = "una-password-lunga";

export type Reply = { statusCode: number; json: () => unknown; cookies: { name: string; value: string }[] };

/** A small client over `inject`: each signed-up person has a token, and every call takes the token of who is asking. */
export function makeClient(app: FastifyInstance) {
  const SESSION_COOKIE = "phoenix_session";
  const call = (method: "GET" | "POST" | "PATCH" | "DELETE", url: string, token?: string, payload?: unknown): Promise<Reply> =>
    app.inject({
      method,
      url,
      ...(payload === undefined ? {} : { payload: JSON.stringify(payload), headers: { "content-type": "application/json" } }),
      ...(token === undefined ? {} : { cookies: { [SESSION_COOKIE]: token } }),
    });
  return {
    get: (url: string, token?: string) => call("GET", url, token),
    post: (url: string, payload: unknown, token?: string) => call("POST", url, token, payload),
    patch: (url: string, payload: unknown, token?: string) => call("PATCH", url, token, payload),
    del: (url: string, token?: string) => call("DELETE", url, token),
    /** Registers an account and returns its session token. */
    async signUp(username: string): Promise<string> {
      const r = await call("POST", "/api/auth/register", undefined, { username, password: TEST_PASSWORD });
      const cookie = r.cookies.find((c) => c.name === SESSION_COOKIE);
      if (r.statusCode !== 201 || cookie === undefined) throw new Error(`sign-up of ${username} failed with ${String(r.statusCode)}`);
      return cookie.value;
    },
  };
}

/** Reads a field of a JSON reply without trusting its shape. */
export function field(reply: Reply, ...path: (string | number)[]): unknown {
  let value: unknown = reply.json();
  for (const key of path) {
    if (typeof value !== "object" || value === null) return undefined;
    value = Object.entries(value).find(([k]) => k === String(key))?.[1];
  }
  return value;
}

export function idOf(reply: Reply, ...path: (string | number)[]): string {
  const value = field(reply, ...path);
  if (typeof value !== "string") throw new Error(`no id at ${path.join(".")}: ${JSON.stringify(reply.json())}`);
  return value;
}

/** Smallest byte strings that read as a picture of a given size: enough for the checks, not meant to be drawn. */
export function fakePng(width: number, height: number, padding = 0): Buffer {
  const b = Buffer.alloc(33 + padding);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(b, 0);
  b.writeUInt32BE(13, 8);
  b.write("IHDR", 12, "ascii");
  b.writeUInt32BE(width, 16);
  b.writeUInt32BE(height, 20);
  return b;
}

export function fakeJpeg(width: number, height: number): Buffer {
  const b = Buffer.alloc(20);
  b[0] = 0xff;
  b[1] = 0xd8;
  b[2] = 0xff;
  b[3] = 0xe0;
  b.writeUInt16BE(4, 4);
  b[8] = 0xff;
  b[9] = 0xc0;
  b.writeUInt16BE(11, 10);
  b[12] = 8;
  b.writeUInt16BE(height, 13);
  b.writeUInt16BE(width, 15);
  return b;
}

export function fakeWebp(width: number, height: number): Buffer {
  const b = Buffer.alloc(30);
  b.write("RIFF", 0, "ascii");
  b.writeUInt32LE(22, 4);
  b.write("WEBPVP8X", 8, "ascii");
  b.writeUInt32LE(10, 16);
  b.writeUIntLE(width - 1, 24, 3);
  b.writeUIntLE(height - 1, 27, 3);
  return b;
}

export type TableClient = {
  /** Every event received so far, in order. */
  events: TableEvent[];
  send(command: unknown): void;
  /** Waits for an event that matches, looking only at events from index `from` on. */
  waitFor(match: (event: TableEvent) => boolean, from?: number): Promise<TableEvent>;
  /** Where the next event will land, to wait only for what happens after this point. */
  mark(): number;
  closed: Promise<number>;
  close(): void;
};

/** Connects to the live table the way a browser would, and parses every event against the shared schema. */
export async function openTable(app: FastifyInstance, worldId: string, token: string): Promise<TableClient> {
  const events: TableEvent[] = [];
  const listeners = new Set<() => void>();
  let resolveClosed: (code: number) => void = () => undefined;
  const closed = new Promise<number>((resolve) => {
    resolveClosed = resolve;
  });
  // Listeners go on before the connection opens: the server sends the snapshot the moment it is open.
  const ws = await app.injectWS(`/api/worlds/${worldId}/table`, { headers: { cookie: `phoenix_session=${token}` } }, { onInit: (socket) => {
    socket.on("message", (raw: Buffer) => {
      events.push(tableEventSchema.parse(JSON.parse(raw.toString("utf8"))));
      for (const l of [...listeners]) l();
    });
    socket.on("close", (code: number) => {
      resolveClosed(code);
    });
  } });
  const waitFor = (match: (event: TableEvent) => boolean, from = 0): Promise<TableEvent> =>
    new Promise((resolve, reject) => {
      const look = (): boolean => {
        const found = events.slice(from).find(match);
        if (found === undefined) return false;
        listeners.delete(look);
        clearTimeout(timer);
        resolve(found);
        return true;
      };
      const timer = setTimeout(() => {
        listeners.delete(look);
        reject(new Error(`Timed out waiting for an event; got: ${events.slice(from).map((e) => e.type).join(", ")}`));
      }, 2500);
      if (!look()) listeners.add(look);
    });
  return {
    events,
    send: (command: unknown) => {
      ws.send(typeof command === "string" ? command : JSON.stringify(command));
    },
    waitFor,
    mark: () => events.length,
    closed,
    close: () => {
      ws.terminate();
    },
  };
}

export type { TableCommand };
