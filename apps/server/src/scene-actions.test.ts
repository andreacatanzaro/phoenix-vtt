import type { TableEvent } from "@phoenix/shared";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestApp, field, idOf, makeClient, openTable, type TableClient, type TestApp } from "./test-support";

let t: TestApp;
let c: ReturnType<typeof makeClient>;
beforeAll(async () => {
  t = await createTestApp();
  c = makeClient(t.app);
});
afterAll(async () => {
  await t.close();
});

type Snapshot = Extract<TableEvent, { type: "snapshot" }>;
const isSnapshot = (e: TableEvent): e is Snapshot => e.type === "snapshot";

/** A world with a DM and a player, three scenes (an exit from the first to the second), and no session yet. */
async function world(prefix: string) {
  const dm = await c.signUp(`${prefix}-dm`);
  const anna = await c.signUp(`${prefix}-anna`);
  const worldId = idOf(await c.post("/api/worlds", { name: "Mondo" }, dm), "world", "id");
  const base = `/api/worlds/${worldId}`;
  await c.post(`${base}/members`, { username: `${prefix}-anna` }, dm);
  const region = idOf(await c.post(`${base}/regions`, { name: "R" }, dm), "element", "id");
  const area = idOf(await c.post(`${base}/areas`, { name: "A", parentId: region }, dm), "element", "id");
  const place = idOf(await c.post(`${base}/places`, { name: "L", parentId: area }, dm), "element", "id");
  const scene = async (name: string): Promise<string> => idOf(await c.post(`${base}/scenes`, { name, parentId: place }, dm), "element", "id");
  const s1 = await scene("Sala");
  const s2 = await scene("Cantina");
  const s3 = await scene("Tetto");
  await c.post(`${base}/scene-links`, { fromSceneId: s1, toSceneId: s2 }, dm);
  return { dm, anna, worldId, base, s1, s2, s3 };
}
type World = Awaited<ReturnType<typeof world>>;

async function startSession(w: World): Promise<string> {
  const sessionId = idOf(await c.post(`${w.base}/sessions`, { title: "Prova" }, w.dm), "session", "id");
  await c.post(`${w.base}/sessions/${sessionId}/start`, {}, w.dm);
  return sessionId;
}

async function sit(w: World, token: string): Promise<TableClient> {
  const client = await openTable(t.app, w.worldId, token);
  await client.waitFor(isSnapshot);
  return client;
}
const sceneIs = (id: string) => (e: TableEvent): boolean => e.type === "snapshot" && e.scene?.id === id;

describe("opening a scene at the table from the atlas", () => {
  it("the DM opens it, and everyone at the table is shown it, with a line in the log", async () => {
    const w = await world("open");
    await startSession(w);
    const dm = await sit(w, w.dm);
    const anna = await sit(w, w.anna);
    const opened = await c.post(`${w.base}/scenes/${w.s1}/open`, {}, w.dm);
    expect(opened.statusCode).toBe(204);
    await dm.waitFor(sceneIs(w.s1));
    await anna.waitFor(sceneIs(w.s1));
    await anna.waitFor((e) => e.type === "message" && e.message.kind === "system");
    dm.close();
    anna.close();
  });

  it("is the DM's alone, and only for a scene of this world", async () => {
    const w = await world("open-who");
    const other = await world("open-who2");
    await startSession(w);
    expect((await c.post(`${w.base}/scenes/${w.s1}/open`, {}, w.anna)).statusCode).toBe(403);
    expect((await c.post(`${w.base}/scenes/${other.s1}/open`, {}, w.dm)).statusCode).toBe(404);
    expect((await c.post(`${w.base}/scenes/00000000-0000-4000-8000-000000000000/open`, {}, w.dm)).statusCode).toBe(404);
    expect((await c.post(`${w.base}/scenes/${w.s1}/open`, {})).statusCode).toBe(401);
  });

  it("needs a session that is running", async () => {
    const w = await world("open-none");
    const refused = await c.post(`${w.base}/scenes/${w.s1}/open`, {}, w.dm);
    expect(refused.statusCode).toBe(409);
    expect(field(refused, "error")).toBe("errors.table.no-session");
  });

  it("closes the preparation of that scene, since it is edited at the table now", async () => {
    const w = await world("open-prep");
    await startSession(w);
    const prep = await openTable(t.app, w.worldId, w.dm, `scenes/${w.s2}/prepare`);
    await prep.waitFor(isSnapshot);
    await c.post(`${w.base}/scenes/${w.s2}/open`, {}, w.dm);
    expect(await prep.waitFor((e) => e.type === "error")).toMatchObject({ error: "errors.table.scene-in-play" });
    prep.close();
  });
});

describe("bringing everyone to a scene from the atlas", () => {
  async function playingFirst(prefix: string) {
    const w = await world(prefix);
    await startSession(w);
    const dm = await sit(w, w.dm);
    await c.post(`${w.base}/scenes/${w.s1}/open`, {}, w.dm);
    await dm.waitFor(sceneIs(w.s1));
    return { w, dm };
  }

  it("moves the whole table along an exit, and the travelling tokens arrive in the start zone", async () => {
    const { w, dm } = await playingFirst("travel");
    dm.send({ type: "token.add", kind: "token", label: "Aldric", color: "gold", x: 20, y: 20, size: 1, hidden: false, travels: true, ownerAccountId: null, imageId: null });
    await dm.waitFor((e) => e.type === "token.upserted" && e.token.label === "Aldric");
    const done = await c.post(`${w.base}/scenes/${w.s2}/travel`, {}, w.dm);
    expect(done.statusCode).toBe(204);
    const arrived = await dm.waitFor(sceneIs(w.s2));
    expect(arrived.type === "snapshot" && arrived.tokens.map((x) => x.label)).toEqual(["Aldric"]);
    dm.close();
  });

  it("is refused where no exit leads there", async () => {
    const { w, dm } = await playingFirst("travel-noexit");
    const refused = await c.post(`${w.base}/scenes/${w.s3}/travel`, {}, w.dm);
    expect(refused.statusCode).toBe(409);
    expect(field(refused, "error")).toBe("errors.table.no-exit");
    dm.close();
  });

  it("needs a scene being played, and a running session, and is the DM's alone", async () => {
    const w = await world("travel-none");
    expect(field(await c.post(`${w.base}/scenes/${w.s2}/travel`, {}, w.dm), "error")).toBe("errors.table.no-session");
    await startSession(w);
    const refused = await c.post(`${w.base}/scenes/${w.s2}/travel`, {}, w.dm);
    expect(refused.statusCode).toBe(409);
    expect(field(refused, "error")).toBe("errors.table.no-scene");
    expect((await c.post(`${w.base}/scenes/${w.s2}/travel`, {}, w.anna)).statusCode).toBe(403);
  });
});

describe("what the setup of a scene tells the DM about the table", () => {
  it("says whether a session is running and which scene is being played", async () => {
    const w = await world("ctx");
    const before = await c.get(`${w.base}/scenes/${w.s1}/table`, w.dm);
    expect(field(before, "running")).toBe(false);
    expect(field(before, "currentSceneId")).toBeNull();
    await startSession(w);
    const dm = await sit(w, w.dm);
    await c.post(`${w.base}/scenes/${w.s1}/open`, {}, w.dm);
    await dm.waitFor(sceneIs(w.s1));
    const during = await c.get(`${w.base}/scenes/${w.s2}/table`, w.dm);
    expect(field(during, "running")).toBe(true);
    expect(field(during, "currentSceneId")).toBe(w.s1);
    expect(field(during, "inPlay")).toBe(false);
    dm.close();
  });
});
