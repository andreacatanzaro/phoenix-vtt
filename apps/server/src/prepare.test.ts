import type { TableEvent } from "@phoenix/shared";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { tokens } from "./db/schema";
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

/** A world with a DM and a player, two scenes, and no session (the preparation needs none). */
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
  return { dm, anna, worldId, base, s1, s2 };
}

type World = Awaited<ReturnType<typeof world>>;
const prepare = (w: World, sceneId: string, token: string): Promise<TableClient> => openTable(t.app, w.worldId, token, `scenes/${sceneId}/prepare`);

async function prepareSnapshot(w: World, sceneId: string, token: string): Promise<{ client: TableClient; snapshot: Snapshot }> {
  const client = await prepare(w, sceneId, token);
  const snapshot = await client.waitFor(isSnapshot);
  if (!isSnapshot(snapshot)) throw new Error("not a snapshot");
  return { client, snapshot };
}

const add = (label: string, extra: Record<string, unknown> = {}) => ({ type: "token.add", kind: "token", label, color: "gold", x: 1, y: 1, size: 1, hidden: false, travels: false, ownerAccountId: null, imageId: null, ...extra });
const upserted = (label: string) => (e: TableEvent): boolean => e.type === "token.upserted" && e.token.label === label;

describe("joining the preparation of a scene", () => {
  it("is for the DM only: a player, a stranger and a login that does not exist are turned away", async () => {
    const w = await world("p-join");
    const stranger = await c.signUp("p-join-out");
    await expect(prepare(w, w.s1, w.anna)).rejects.toThrow();
    await expect(prepare(w, w.s1, stranger)).rejects.toThrow();
    await expect(prepare(w, w.s1, "token-inventato")).rejects.toThrow();
  });

  it("is refused for a scene that is not in this world", async () => {
    const w = await world("p-other");
    const other = await world("p-other2");
    await expect(prepare(w, other.s1, w.dm)).rejects.toThrow();
    await expect(prepare(w, "00000000-0000-4000-8000-000000000000", w.dm)).rejects.toThrow();
  });

  it("needs no session, and answers with the scene, its tokens and no messages", async () => {
    const w = await world("p-snap");
    const first = await prepareSnapshot(w, w.s1, w.dm);
    expect(first.snapshot.mode).toBe("prepare");
    expect(first.snapshot.scene).toMatchObject({ id: w.s1, name: "Sala" });
    expect(first.snapshot.you).toMatchObject({ role: "dm" });
    expect(first.snapshot.tokens).toEqual([]);
    expect(first.snapshot.messages).toEqual([]);
    first.client.close();
  });
});

describe("preparing tokens and texts", () => {
  it("adds, moves, changes and removes tokens, and keeps them for the scene", async () => {
    const w = await world("p-tokens");
    const { client } = await prepareSnapshot(w, w.s1, w.dm);
    client.send(add("Goblin", { hidden: true }));
    const created = await client.waitFor(upserted("Goblin"));
    const id = created.type === "token.upserted" ? created.token.id : "";
    expect(created.type === "token.upserted" && created.token.hidden).toBe(true);
    client.send({ type: "token.move", tokenId: id, x: 5, y: 6 });
    await client.waitFor((e) => e.type === "token.upserted" && e.token.id === id && e.token.x === 5 && e.token.y === 6);
    client.send({ type: "token.update", tokenId: id, hidden: false, label: "Goblin capo" });
    await client.waitFor(upserted("Goblin capo"));
    const rows = await t.db.select().from(tokens).where(eq(tokens.sceneId, w.s1));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ label: "Goblin capo", x: 5, y: 6, hidden: false });
    client.send({ type: "token.remove", tokenId: id });
    await client.waitFor((e) => e.type === "token.removed" && e.tokenId === id);
    expect(await t.db.select().from(tokens).where(eq(tokens.sceneId, w.s1))).toHaveLength(0);
    client.close();
  });

  it("writes texts too", async () => {
    const w = await world("p-text");
    const { client } = await prepareSnapshot(w, w.s1, w.dm);
    client.send(add("Taverna", { kind: "text" }));
    const created = await client.waitFor(upserted("Taverna"));
    expect(created.type === "token.upserted" && created.token.kind).toBe("text");
    client.close();
  });

  it("what is prepared is what the scene has when it is opened: one state, no copy", async () => {
    const w = await world("p-one");
    const { client } = await prepareSnapshot(w, w.s1, w.dm);
    client.send(add("Orco"));
    await client.waitFor(upserted("Orco"));
    client.close();
    const again = await prepareSnapshot(w, w.s1, w.dm);
    expect(again.snapshot.tokens.map((x) => x.label)).toEqual(["Orco"]);
    const other = await prepareSnapshot(w, w.s2, w.dm);
    expect(other.snapshot.tokens).toEqual([]);
    again.client.close();
    other.client.close();
  });

  it("refuses an owner or a picture that does not belong to the world", async () => {
    const w = await world("p-bad");
    const { client } = await prepareSnapshot(w, w.s1, w.dm);
    const mark = client.mark();
    client.send(add("Spia", { ownerAccountId: "00000000-0000-4000-8000-000000000000" }));
    const refused = await client.waitFor((e) => e.type === "error", mark);
    expect(refused).toMatchObject({ error: "errors.table.bad-target" });
    client.close();
  });

  it("does nothing for tokens of another scene", async () => {
    const w = await world("p-scene");
    const a = await prepareSnapshot(w, w.s1, w.dm);
    a.client.send(add("Solo qui"));
    const created = await a.client.waitFor(upserted("Solo qui"));
    const id = created.type === "token.upserted" ? created.token.id : "";
    const b = await prepareSnapshot(w, w.s2, w.dm);
    const mark = b.client.mark();
    b.client.send({ type: "token.remove", tokenId: id });
    expect(await b.client.waitFor((e) => e.type === "error", mark)).toMatchObject({ error: "errors.table.bad-target" });
    a.client.close();
    b.client.close();
  });
});

describe("what does not belong to preparing", () => {
  it("chat, dice, scene changes and the shared view are refused", async () => {
    const w = await world("p-no");
    const { client } = await prepareSnapshot(w, w.s1, w.dm);
    for (const command of [{ type: "chat.send", text: "ciao", whisperTo: null }, { type: "roll.request", notation: "1d20", reserved: false }, { type: "scene.open", sceneId: w.s2 }, { type: "scene.travel", toSceneId: w.s2 }, { type: "view.sync", x: 1, y: 1, zoom: 1 }]) {
      const mark = client.mark();
      client.send(command);
      expect(await client.waitFor((e) => e.type === "error", mark)).toMatchObject({ error: "errors.table.prepare-only" });
    }
    client.close();
  });

  it("the pointer is not shown to anyone", async () => {
    const w = await world("p-pointer");
    const one = await prepareSnapshot(w, w.s1, w.dm);
    const two = await prepareSnapshot(w, w.s1, w.dm);
    const mark = two.client.mark();
    one.client.send({ type: "pointer", x: 5, y: 5 });
    one.client.send(add("Dopo"));
    await two.client.waitFor(upserted("Dopo"), mark);
    expect(two.client.events.slice(mark).some((e) => e.type === "pointer")).toBe(false);
    one.client.close();
    two.client.close();
  });
});

describe("a scene that is in play", () => {
  async function inPlay(prefix: string) {
    const w = await world(prefix);
    const sessionId = idOf(await c.post(`${w.base}/sessions`, { title: "Prova" }, w.dm), "session", "id");
    await c.post(`${w.base}/sessions/${sessionId}/start`, {}, w.dm);
    return { w, sessionId };
  }

  it("is not opened in preparation, while any other scene is, with the session running", async () => {
    const { w } = await inPlay("p-play");
    const live = await openTable(t.app, w.worldId, w.dm);
    await live.waitFor(isSnapshot);
    live.send({ type: "scene.open", sceneId: w.s1 });
    await live.waitFor((e) => e.type === "snapshot" && e.scene?.id === w.s1);
    await expect(prepare(w, w.s1, w.dm)).rejects.toThrow();
    const other = await prepareSnapshot(w, w.s2, w.dm);
    expect(other.snapshot.scene?.id).toBe(w.s2);
    other.client.close();
    live.close();
  });

  it("what is prepared in another scene is not told to the players at the table", async () => {
    const { w } = await inPlay("p-quiet");
    const live = await openTable(t.app, w.worldId, w.dm);
    await live.waitFor(isSnapshot);
    live.send({ type: "scene.open", sceneId: w.s1 });
    await live.waitFor((e) => e.type === "snapshot" && e.scene?.id === w.s1);
    const player = await openTable(t.app, w.worldId, w.anna);
    await player.waitFor(isSnapshot);
    const mark = player.mark();
    const prep = await prepareSnapshot(w, w.s2, w.dm);
    prep.client.send(add("Segreto"));
    await prep.client.waitFor(upserted("Segreto"));
    // Something sent after it reaches the player, so if the token were sent too it would be before this.
    live.send({ type: "chat.send", text: "dopo", whisperTo: null });
    await player.waitFor((e) => e.type === "message" && e.message.text === "dopo", mark);
    expect(player.events.slice(mark).some((e) => e.type === "token.upserted")).toBe(false);
    prep.client.close();
    player.close();
    live.close();
  });

  it("a preparation open on a scene that is then opened at the table is closed, and its commands are refused", async () => {
    const { w } = await inPlay("p-late");
    const prep = await prepareSnapshot(w, w.s1, w.dm);
    const live = await openTable(t.app, w.worldId, w.dm);
    await live.waitFor(isSnapshot);
    live.send({ type: "scene.open", sceneId: w.s1 });
    const told = await prep.client.waitFor((e) => e.type === "error");
    expect(told).toMatchObject({ error: "errors.table.scene-in-play" });
    prep.client.close();
    live.close();
  });
});

describe("preparing and opening a scene at the same time", () => {
  async function playing(prefix: string) {
    const w = await world(prefix);
    const sessionId = idOf(await c.post(`${w.base}/sessions`, { title: "Prova" }, w.dm), "session", "id");
    await c.post(`${w.base}/sessions/${sessionId}/start`, {}, w.dm);
    const live = await openTable(t.app, w.worldId, w.dm);
    await live.waitFor(isSnapshot);
    return { w, sessionId, live };
  }

  it("a change made in preparation waits for what is being done at the table", async () => {
    const { w, sessionId, live } = await playing("p-wait");
    const prep = await prepareSnapshot(w, w.s2, w.dm);
    // The table is busy: a change to it is under way.
    let release: () => void = () => undefined;
    const busy = t.hub.serial(sessionId, () => new Promise<void>((resolve) => { release = resolve; }));
    const mark = prep.client.mark();
    prep.client.send(add("In coda"));
    await new Promise((resolve) => setTimeout(resolve, 250));
    expect(prep.client.events.slice(mark).some((e) => e.type === "token.upserted")).toBe(false);
    release();
    await busy;
    await prep.client.waitFor(upserted("In coda"), mark);
    prep.client.close();
    live.close();
  });

  it("a token prepared just before the scene is opened is in what the table shows, not lost", async () => {
    const { w, sessionId, live } = await playing("p-race");
    const prep = await prepareSnapshot(w, w.s2, w.dm);
    let release: () => void = () => undefined;
    const busy = t.hub.serial(sessionId, () => new Promise<void>((resolve) => { release = resolve; }));
    prep.client.send(add("Prima dell'apertura"));
    // The command is waiting its turn; the scene is opened right after it.
    await new Promise((resolve) => setTimeout(resolve, 150));
    live.send({ type: "scene.open", sceneId: w.s2 });
    await new Promise((resolve) => setTimeout(resolve, 150));
    release();
    await busy;
    const shown = await live.waitFor((e) => e.type === "snapshot" && e.scene?.id === w.s2);
    expect(shown.type === "snapshot" && shown.tokens.map((x) => x.label)).toEqual(["Prima dell'apertura"]);
    prep.client.close();
    live.close();
  });

  it("a change made after the scene was opened is refused", async () => {
    const { w, live } = await playing("p-after");
    const prep = await prepareSnapshot(w, w.s2, w.dm);
    live.send({ type: "scene.open", sceneId: w.s2 });
    await live.waitFor((e) => e.type === "snapshot" && e.scene?.id === w.s2);
    const refused = await prep.client.waitFor((e) => e.type === "error");
    expect(refused).toMatchObject({ error: "errors.table.scene-in-play" });
    expect(await t.db.select().from(tokens).where(eq(tokens.sceneId, w.s2))).toHaveLength(0);
    prep.client.close();
    live.close();
  });
});

describe("asking whether a scene can be prepared", () => {
  it("the setup of a scene says whether it is the one in play", async () => {
    const w = await world("p-ask");
    expect(field(await c.get(`${w.base}/scenes/${w.s1}/table`, w.dm), "inPlay")).toBe(false);
    const sessionId = idOf(await c.post(`${w.base}/sessions`, { title: "Prova" }, w.dm), "session", "id");
    await c.post(`${w.base}/sessions/${sessionId}/start`, {}, w.dm);
    const live = await openTable(t.app, w.worldId, w.dm);
    await live.waitFor(isSnapshot);
    live.send({ type: "scene.open", sceneId: w.s1 });
    await live.waitFor((e) => e.type === "snapshot" && e.scene?.id === w.s1);
    expect(field(await c.get(`${w.base}/scenes/${w.s1}/table`, w.dm), "inPlay")).toBe(true);
    expect(field(await c.get(`${w.base}/scenes/${w.s2}/table`, w.dm), "inPlay")).toBe(false);
    live.close();
  });
});

describe("saving the setup of a scene", () => {
  it("shows it to whoever prepares that scene at once", async () => {
    const w = await world("p-setup");
    const { client } = await prepareSnapshot(w, w.s1, w.dm);
    const mark = client.mark();
    await c.patch(`${w.base}/scenes/${w.s1}/table`, { gridPx: 90.5, start: { x: 1, y: 2, w: 3, h: 4 } }, w.dm);
    const fresh = await client.waitFor((e) => e.type === "snapshot" && e.scene?.gridPx === 90.5, mark);
    expect(fresh.type === "snapshot" && fresh.scene?.start).toEqual({ x: 1, y: 2, w: 3, h: 4 });
    expect(field(await c.get(`${w.base}/scenes/${w.s1}/table`, w.dm), "scene", "gridPx")).toBe(90.5);
    client.close();
  });
});
