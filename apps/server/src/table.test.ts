import { createScriptedRng } from "@phoenix/rules-core";
import type { TableEvent } from "@phoenix/shared";
import { eq } from "drizzle-orm";
import { tableMessages } from "./db/schema";
import { insertMessage, recentMessages, SNAPSHOT_MESSAGES } from "./table/store";
import { canSeeMessage } from "./table/visibility";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestApp, TEST_PASSWORD, field, idOf, makeClient, openTable, fakePng, type TableClient, type TestApp } from "./test-support";

let t: TestApp;
let c: ReturnType<typeof makeClient>;
beforeAll(async () => {
  t = await createTestApp({}, { rng: createScriptedRng(Array.from({ length: 400 }, (_, i) => (i % 6) + 1)) });
  c = makeClient(t.app);
});
afterAll(async () => {
  await t.close();
});

type Snapshot = Extract<TableEvent, { type: "snapshot" }>;
const isSnapshot = (e: TableEvent): e is Snapshot => e.type === "snapshot";

/** A world with a DM and two players, three scenes (one exit from the first to the second) and a running session. */
async function table(prefix: string) {
  const dm = await c.signUp(`${prefix}-dm`);
  const anna = await c.signUp(`${prefix}-anna`);
  const bruno = await c.signUp(`${prefix}-bruno`);
  const worldId = idOf(await c.post("/api/worlds", { name: "Mondo" }, dm), "world", "id");
  const base = `/api/worlds/${worldId}`;
  await c.post(`${base}/members`, { username: `${prefix}-anna` }, dm);
  await c.post(`${base}/members`, { username: `${prefix}-bruno` }, dm);
  const members = await c.get(`${base}/members`, dm);
  const idByName = (name: string): string => {
    for (let i = 0; i < 3; i++) if (field(members, "members", i, "username") === name) return idOf(members, "members", i, "accountId");
    throw new Error(`no member ${name}`);
  };
  const region = idOf(await c.post(`${base}/regions`, { name: "R" }, dm), "element", "id");
  const area = idOf(await c.post(`${base}/areas`, { name: "A", parentId: region }, dm), "element", "id");
  const place = idOf(await c.post(`${base}/places`, { name: "L", parentId: area }, dm), "element", "id");
  const scene = async (name: string): Promise<string> => idOf(await c.post(`${base}/scenes`, { name, parentId: place }, dm), "element", "id");
  const s1 = await scene("Sala");
  const s2 = await scene("Cantina");
  const s3 = await scene("Tetto");
  await c.post(`${base}/scene-links`, { fromSceneId: s1, toSceneId: s2 }, dm);
  const sessionId = idOf(await c.post(`${base}/sessions`, { title: "Prova" }, dm), "session", "id");
  await c.post(`${base}/sessions/${sessionId}/start`, {}, dm);
  return { dm, anna, bruno, worldId, base, s1, s2, s3, sessionId, annaId: idByName(`${prefix}-anna`), brunoId: idByName(`${prefix}-bruno`), dmId: idByName(`${prefix}-dm`) };
}

async function sit(w: { worldId: string }, token: string): Promise<{ client: TableClient; snapshot: Snapshot }> {
  const client = await openTable(t.app, w.worldId, token);
  const snapshot = await client.waitFor(isSnapshot);
  if (!isSnapshot(snapshot)) throw new Error("not a snapshot");
  return { client, snapshot };
}

const tokenEvent = (label: string) => (e: TableEvent): boolean => e.type === "token.upserted" && e.token.label === label;
const messageWith = (text: string) => (e: TableEvent): boolean => e.type === "message" && e.message.text === text;
const errorEvent = (e: TableEvent): boolean => e.type === "error";

describe("joining the table", () => {
  it("is refused without an account, for a stranger, and when no session is running", async () => {
    const w = await table("join");
    const stranger = await c.signUp("join-out");
    await expect(openTable(t.app, w.worldId, "token-inventato")).rejects.toThrow();
    await expect(openTable(t.app, w.worldId, stranger)).rejects.toThrow();
    await c.post(`${w.base}/sessions/${w.sessionId}/close`, {}, w.dm);
    await expect(openTable(t.app, w.worldId, w.anna)).rejects.toThrow();
  });

  it("answers the DM and a player with the state of the table and who they are", async () => {
    const w = await table("snap");
    const { snapshot: dmSnap, client: dmClient } = await sit(w, w.dm);
    const { snapshot: playerSnap, client: playerClient } = await sit(w, w.anna);
    expect(dmSnap.you).toMatchObject({ role: "dm", accountId: w.dmId });
    expect(playerSnap.you).toMatchObject({ role: "player", accountId: w.annaId });
    expect(dmSnap.session).toMatchObject({ id: w.sessionId, title: "Prova" });
    expect(playerSnap.scene).toBeNull();
    dmClient.close();
    playerClient.close();
  });

  it("tells who is at the table, once each, and when someone leaves", async () => {
    const w = await table("presence");
    const dm = await sit(w, w.dm);
    const mark = dm.client.mark();
    const anna = await sit(w, w.anna);
    const joined = await dm.client.waitFor((e) => e.type === "presence" && e.present.length === 2, mark);
    expect(joined.type === "presence" && joined.present.map((p) => p.username).sort()).toEqual(["presence-anna", "presence-dm"]);
    const second = await sit(w, w.anna);
    expect(second.snapshot.present).toHaveLength(2);
    const afterMark = dm.client.mark();
    anna.client.close();
    second.client.close();
    const left = await dm.client.waitFor((e) => e.type === "presence" && e.present.length === 1, afterMark);
    expect(left.type === "presence" && left.present[0]?.username).toBe("presence-dm");
    dm.client.close();
  });
});

describe("scenes and tokens", () => {
  it("the DM opens a scene and everyone gets it, with its map and grid", async () => {
    const w = await table("open");
    const map = idOf(await t.app.inject({ method: "POST", url: `${w.base}/images?kind=map`, payload: fakePng(1400, 900), headers: { "content-type": "image/png" }, cookies: { phoenix_session: w.dm } }).then((r) => ({ statusCode: r.statusCode, json: (): unknown => r.json(), cookies: [] })), "image", "id");
    await c.patch(`${w.base}/scenes/${w.s1}/table`, { mapImageId: map, gridPx: 60 }, w.dm);
    const dm = await sit(w, w.dm);
    const anna = await sit(w, w.anna);
    const mark = anna.client.mark();
    dm.client.send({ type: "scene.open", sceneId: w.s1 });
    const snap = await anna.client.waitFor((e) => isSnapshot(e) && e.scene !== null, mark);
    expect(isSnapshot(snap) && snap.scene).toMatchObject({ id: w.s1, name: "Sala", mapImageId: map, mapWidth: 1400, mapHeight: 900, gridPx: 60 });
    expect(isSnapshot(snap) && snap.messages.at(-1)?.text).toContain("Sala");
    dm.client.close();
    anna.client.close();
  });

  it("saving the setup of the scene being played reaches everyone at once", async () => {
    const w = await table("setup");
    const dm = await sit(w, w.dm);
    const anna = await sit(w, w.anna);
    dm.client.send({ type: "scene.open", sceneId: w.s1 });
    await anna.client.waitFor((e) => isSnapshot(e) && e.scene !== null);
    const mark = anna.client.mark();
    await c.patch(`${w.base}/scenes/${w.s1}/table`, { gridPx: 90 }, w.dm);
    const snap = await anna.client.waitFor((e) => isSnapshot(e) && e.scene?.gridPx === 90, mark);
    expect(isSnapshot(snap) && snap.scene?.id).toBe(w.s1);
    // Another scene's setup is not news for this table.
    const mark2 = anna.client.mark();
    await c.patch(`${w.base}/scenes/${w.s3}/table`, { gridPx: 50 }, w.dm);
    dm.client.send({ type: "ping" });
    await dm.client.waitFor((e) => e.type === "pong", dm.client.mark() - 1);
    expect(anna.client.events.slice(mark2).some(isSnapshot)).toBe(false);
    dm.client.close();
    anna.client.close();
  });

  it("a player cannot open a scene, and an unknown scene is refused", async () => {
    const w = await table("openbad");
    const anna = await sit(w, w.anna);
    const dm = await sit(w, w.dm);
    anna.client.send({ type: "scene.open", sceneId: w.s1 });
    expect(await anna.client.waitFor(errorEvent)).toMatchObject({ error: "errors.forbidden" });
    dm.client.send({ type: "scene.open", sceneId: "00000000-0000-4000-8000-000000000000" });
    expect(await dm.client.waitFor(errorEvent)).toMatchObject({ error: "errors.table.bad-target" });
    anna.client.close();
    dm.client.close();
  });

  it("tokens need an open scene", async () => {
    const w = await table("noscene");
    const dm = await sit(w, w.dm);
    dm.client.send({ type: "token.add", label: "Goblin", x: 1, y: 1 });
    expect(await dm.client.waitFor(errorEvent)).toMatchObject({ error: "errors.table.no-scene" });
    dm.client.close();
  });

  async function opened(prefix: string) {
    const w = await table(prefix);
    const dm = await sit(w, w.dm);
    const anna = await sit(w, w.anna);
    const bruno = await sit(w, w.bruno);
    dm.client.send({ type: "scene.open", sceneId: w.s1 });
    await bruno.client.waitFor((e) => isSnapshot(e) && e.scene !== null);
    return { w, dm, anna, bruno, closeAll: () => { dm.client.close(); anna.client.close(); bruno.client.close(); } };
  }

  it("the DM adds a token, with its owner, and players see it", async () => {
    const { w, dm, anna, bruno, closeAll } = await opened("add");
    dm.client.send({ type: "token.add", label: "Elfo", color: "green", x: 2, y: 3, ownerAccountId: w.annaId });
    const seen = await bruno.client.waitFor(tokenEvent("Elfo"));
    expect(seen.type === "token.upserted" && seen.token).toMatchObject({ x: 2, y: 3, size: 1, color: "green", hidden: false, travels: true, ownerAccountId: w.annaId });
    await anna.client.waitFor(tokenEvent("Elfo"));
    closeAll();
  });

  it("a hidden token is never sent to a player, while the DM sees it", async () => {
    const { dm, anna, closeAll } = await opened("hidden");
    dm.client.send({ type: "token.add", label: "Imboscata", x: 5, y: 5, hidden: true });
    await dm.client.waitFor(tokenEvent("Imboscata"));
    dm.client.send({ type: "token.add", label: "Visibile", x: 6, y: 6 });
    await anna.client.waitFor(tokenEvent("Visibile"));
    expect(anna.client.events.some((e) => JSON.stringify(e).includes("Imboscata"))).toBe(false);
    closeAll();
  });

  it("a token that stays hidden is invisible to players in everything that happens to it, ids included", async () => {
    const { dm, anna, closeAll } = await opened("stayhidden");
    dm.client.send({ type: "token.add", label: "Tana", x: 3, y: 3, hidden: true });
    const added = await dm.client.waitFor(tokenEvent("Tana"));
    const tokenId = added.type === "token.upserted" ? added.token.id : "";
    dm.client.send({ type: "token.move", tokenId, x: 4, y: 4 });
    dm.client.send({ type: "token.update", tokenId, label: "Tana nera", size: 2 });
    dm.client.send({ type: "token.remove", tokenId });
    // The marker arrives after all of the above, so everything before it has been sent.
    dm.client.send({ type: "chat.send", text: "fine dei movimenti" });
    await anna.client.waitFor(messageWith("fine dei movimenti"));
    expect(anna.client.events.filter((e) => e.type === "token.upserted" || e.type === "token.removed")).toEqual([]);
    expect(anna.client.events.some((e) => JSON.stringify(e).includes(tokenId))).toBe(false);
    closeAll();
  });

  it("a token that was visible and is then removed is removed for the players too", async () => {
    const { dm, anna, closeAll } = await opened("visgone");
    dm.client.send({ type: "token.add", label: "Palo", x: 1, y: 1 });
    const added = await anna.client.waitFor(tokenEvent("Palo"));
    const tokenId = added.type === "token.upserted" ? added.token.id : "";
    const mark = anna.client.mark();
    dm.client.send({ type: "token.remove", tokenId });
    expect((await anna.client.waitFor((e) => e.type === "token.removed" && e.tokenId === tokenId, mark)).type).toBe("token.removed");
    closeAll();
  });

  it("hiding a token makes it vanish for the players, and showing it brings it back", async () => {
    const { dm, anna, closeAll } = await opened("toggle");
    dm.client.send({ type: "token.add", label: "Ombra", x: 1, y: 1 });
    const added = await dm.client.waitFor(tokenEvent("Ombra"));
    const tokenId = added.type === "token.upserted" ? added.token.id : "";
    await anna.client.waitFor(tokenEvent("Ombra"));
    const mark = anna.client.mark();
    dm.client.send({ type: "token.update", tokenId, hidden: true });
    expect(await anna.client.waitFor((e) => e.type === "token.removed" && e.tokenId === tokenId, mark)).toBeDefined();
    const mark2 = anna.client.mark();
    dm.client.send({ type: "token.update", tokenId, hidden: false });
    expect(await anna.client.waitFor(tokenEvent("Ombra"), mark2)).toBeDefined();
    closeAll();
  });

  it("a player moves their own token and nobody else's; the DM moves any", async () => {
    const { w, dm, anna, bruno, closeAll } = await opened("move");
    dm.client.send({ type: "token.add", label: "Anna", x: 0, y: 0, ownerAccountId: w.annaId });
    dm.client.send({ type: "token.add", label: "Bruno", x: 1, y: 0, ownerAccountId: w.brunoId });
    const annaTok = await anna.client.waitFor(tokenEvent("Anna"));
    const brunoTok = await anna.client.waitFor(tokenEvent("Bruno"));
    const annaId = annaTok.type === "token.upserted" ? annaTok.token.id : "";
    const brunoId = brunoTok.type === "token.upserted" ? brunoTok.token.id : "";
    const mark = bruno.client.mark();
    anna.client.send({ type: "token.move", tokenId: annaId, x: 4, y: 4 });
    const moved = await bruno.client.waitFor((e) => e.type === "token.upserted" && e.token.id === annaId && e.token.x === 4, mark);
    expect(moved.type === "token.upserted" && moved.token.y).toBe(4);
    anna.client.send({ type: "token.move", tokenId: brunoId, x: 9, y: 9 });
    expect(await anna.client.waitFor(errorEvent)).toMatchObject({ error: "errors.table.not-your-token" });
    const mark2 = anna.client.mark();
    dm.client.send({ type: "token.move", tokenId: brunoId, x: 7, y: 7 });
    expect((await anna.client.waitFor((e) => e.type === "token.upserted" && e.token.id === brunoId && e.token.x === 7, mark2)).type).toBe("token.upserted");
    closeAll();
  });

  it("refuses a move outside the limits, or of a token that does not exist", async () => {
    const { w, dm, anna, closeAll } = await opened("movebad");
    dm.client.send({ type: "token.add", label: "Anna", x: 0, y: 0, ownerAccountId: w.annaId });
    const tok = await anna.client.waitFor(tokenEvent("Anna"));
    const tokenId = tok.type === "token.upserted" ? tok.token.id : "";
    anna.client.send({ type: "token.move", tokenId, x: 100000, y: 0 });
    expect(await anna.client.waitFor(errorEvent)).toMatchObject({ error: "errors.invalid" });
    const mark = anna.client.mark();
    anna.client.send({ type: "token.move", tokenId: "00000000-0000-4000-8000-000000000000", x: 1, y: 1 });
    expect(await anna.client.waitFor(errorEvent, mark)).toMatchObject({ error: "errors.table.bad-target" });
    closeAll();
  });

  it("only the DM adds, edits and removes tokens; the owner must be a member", async () => {
    const { w, dm, anna, closeAll } = await opened("dmonly");
    anna.client.send({ type: "token.add", label: "Abuso", x: 0, y: 0 });
    expect(await anna.client.waitFor(errorEvent)).toMatchObject({ error: "errors.forbidden" });
    const stranger = await c.signUp("dmonly-out");
    expect(stranger.length).toBeGreaterThan(0);
    dm.client.send({ type: "token.add", label: "Estraneo", x: 0, y: 0, ownerAccountId: "00000000-0000-4000-8000-000000000000" });
    expect(await dm.client.waitFor(errorEvent)).toMatchObject({ error: "errors.table.bad-target" });
    dm.client.send({ type: "token.add", label: "Mio", x: 0, y: 0, ownerAccountId: w.annaId });
    const tok = await dm.client.waitFor(tokenEvent("Mio"));
    const tokenId = tok.type === "token.upserted" ? tok.token.id : "";
    const mark = anna.client.mark();
    anna.client.send({ type: "token.update", tokenId, label: "Rubato" });
    anna.client.send({ type: "token.remove", tokenId });
    expect(await anna.client.waitFor(errorEvent, mark)).toMatchObject({ error: "errors.forbidden" });
    const mark2 = anna.client.mark();
    dm.client.send({ type: "token.remove", tokenId });
    expect((await anna.client.waitFor((e) => e.type === "token.removed" && e.tokenId === tokenId, mark2)).type).toBe("token.removed");
    closeAll();
  });

  it("a token image must be a token picture of this world", async () => {
    const { w, dm, closeAll } = await opened("tokimg");
    const asReply = (r: Awaited<ReturnType<typeof t.app.inject>>) => ({ statusCode: r.statusCode, json: (): unknown => r.json(), cookies: [] });
    const map = idOf(asReply(await t.app.inject({ method: "POST", url: `${w.base}/images?kind=map`, payload: fakePng(100, 100), headers: { "content-type": "image/png" }, cookies: { phoenix_session: w.dm } })), "image", "id");
    dm.client.send({ type: "token.add", label: "Mappa", x: 0, y: 0, imageId: map });
    expect(await dm.client.waitFor(errorEvent)).toMatchObject({ error: "errors.table.bad-target" });
    const face = idOf(asReply(await t.app.inject({ method: "POST", url: `${w.base}/images?kind=token`, payload: fakePng(64, 64), headers: { "content-type": "image/png" }, cookies: { phoenix_session: w.dm } })), "image", "id");
    dm.client.send({ type: "token.add", label: "Volto", x: 0, y: 0, imageId: face });
    const ok = await dm.client.waitFor(tokenEvent("Volto"));
    expect(ok.type === "token.upserted" && ok.token.imageId).toBe(face);
    closeAll();
  });
});

describe("chat and dice", () => {
  async function seated(prefix: string) {
    const w = await table(prefix);
    const dm = await sit(w, w.dm);
    const anna = await sit(w, w.anna);
    const bruno = await sit(w, w.bruno);
    return { w, dm, anna, bruno, closeAll: () => { dm.client.close(); anna.client.close(); bruno.client.close(); } };
  }

  it("a chat line reaches everyone with its author's name", async () => {
    const { anna, bruno, closeAll } = await seated("chat");
    anna.client.send({ type: "chat.send", text: "Ciao a tutti" });
    const got = await bruno.client.waitFor(messageWith("Ciao a tutti"));
    expect(got.type === "message" && got.message).toMatchObject({ kind: "chat", audience: "all", authorName: "chat-anna" });
    closeAll();
  });

  it("a whisper reaches only its recipient and its author, not even the DM", async () => {
    const { w, dm, anna, bruno, closeAll } = await seated("whisper");
    anna.client.send({ type: "chat.send", text: "Psst", whisperTo: w.brunoId });
    const got = await bruno.client.waitFor(messageWith("Psst"));
    expect(got.type === "message" && got.message).toMatchObject({ audience: "whisper", recipientName: "whisper-bruno" });
    await anna.client.waitFor(messageWith("Psst"));
    anna.client.send({ type: "chat.send", text: "Dopo" });
    await dm.client.waitFor(messageWith("Dopo"));
    expect(dm.client.events.some((e) => e.type === "message" && e.message.text === "Psst")).toBe(false);
    closeAll();
  });

  it("refuses a whisper to oneself or to someone who is not in the world", async () => {
    const { w, anna, closeAll } = await seated("whisperbad");
    anna.client.send({ type: "chat.send", text: "A me", whisperTo: w.annaId });
    expect(await anna.client.waitFor(errorEvent)).toMatchObject({ error: "errors.table.bad-target" });
    const mark = anna.client.mark();
    anna.client.send({ type: "chat.send", text: "A nessuno", whisperTo: "00000000-0000-4000-8000-000000000000" });
    expect(await anna.client.waitFor(errorEvent, mark)).toMatchObject({ error: "errors.table.bad-target" });
    closeAll();
  });

  it("the server rolls the dice and everyone sees the result", async () => {
    const { anna, bruno, closeAll } = await seated("roll");
    anna.client.send({ type: "roll.request", notation: "2d6+3" });
    const got = await bruno.client.waitFor((e) => e.type === "message" && e.message.kind === "roll");
    const roll = got.type === "message" ? got.message.roll : null;
    expect(roll?.dice).toHaveLength(2);
    expect(roll?.modifier).toBe(3);
    expect(roll?.total).toBe((roll?.kept ?? []).reduce((a, b) => a + b, 0) + 3);
    expect(got.type === "message" && got.message).toMatchObject({ audience: "all", notation: "2d6+3", authorName: "roll-anna" });
    closeAll();
  });

  it("keeps the highest dice when asked", async () => {
    const { anna, closeAll } = await seated("keep");
    anna.client.send({ type: "roll.request", notation: "4d6kh3" });
    const got = await anna.client.waitFor((e) => e.type === "message" && e.message.kind === "roll");
    const roll = got.type === "message" ? got.message.roll : null;
    expect(roll?.dice).toHaveLength(4);
    expect(roll?.kept).toHaveLength(3);
    closeAll();
  });

  it("a reserved roll is for the DM and the roller, never for the other players", async () => {
    const { dm, anna, bruno, closeAll } = await seated("reserved");
    anna.client.send({ type: "roll.request", notation: "1d20", reserved: true });
    const seenByDm = await dm.client.waitFor((e) => e.type === "message" && e.message.kind === "roll");
    expect(seenByDm.type === "message" && seenByDm.message.audience).toBe("gm");
    await anna.client.waitFor((e) => e.type === "message" && e.message.kind === "roll");
    anna.client.send({ type: "chat.send", text: "fine" });
    await bruno.client.waitFor(messageWith("fine"));
    expect(bruno.client.events.some((e) => e.type === "message" && e.message.kind === "roll")).toBe(false);
    closeAll();
  });

  it("refuses a notation that is not dice, or that is too big, and tells only the sender", async () => {
    const { anna, bruno, closeAll } = await seated("badroll");
    for (const notation of ["ciao", "d", "1000d6", "1d100000", "2d6+x", "1d20kh5"]) {
      const mark = anna.client.mark();
      anna.client.send({ type: "roll.request", notation });
      expect(await anna.client.waitFor(errorEvent, mark)).toMatchObject({ error: "errors.table.bad-notation" });
    }
    anna.client.send({ type: "chat.send", text: "ok" });
    await bruno.client.waitFor(messageWith("ok"));
    expect(bruno.client.events.some((e) => e.type === "error")).toBe(false);
    closeAll();
  });

  it("the log is saved: someone who joins later reads what they are allowed to read", async () => {
    const { w, anna, closeAll } = await seated("log");
    anna.client.send({ type: "chat.send", text: "Prima" });
    anna.client.send({ type: "chat.send", text: "Segreto", whisperTo: w.brunoId });
    anna.client.send({ type: "roll.request", notation: "1d20" });
    await anna.client.waitFor((e) => e.type === "message" && e.message.kind === "roll");
    const late = await sit(w, w.dm);
    expect(late.snapshot.messages.map((m) => m.text)).toContain("Prima");
    expect(late.snapshot.messages.map((m) => m.text)).not.toContain("Segreto");
    expect(late.snapshot.messages.some((m) => m.kind === "roll")).toBe(true);
    const lateBruno = await sit(w, w.bruno);
    expect(lateBruno.snapshot.messages.map((m) => m.text)).toContain("Segreto");
    late.client.close();
    lateBruno.client.close();
    closeAll();
  });

  it("a malformed frame, an unknown command and a too long text get an error, and the connection stays open", async () => {
    const { anna, closeAll } = await seated("junk");
    anna.client.send("not json at all");
    expect(await anna.client.waitFor(errorEvent)).toMatchObject({ error: "errors.invalid" });
    for (const bad of [{ type: "teleport" }, { type: "chat.send", text: "" }, { type: "chat.send", text: "x".repeat(2001) }, { type: "token.move", tokenId: "no", x: 1, y: 1 }]) {
      const mark = anna.client.mark();
      anna.client.send(bad);
      expect(await anna.client.waitFor(errorEvent, mark)).toMatchObject({ error: "errors.invalid" });
    }
    const mark = anna.client.mark();
    anna.client.send({ type: "ping" });
    expect((await anna.client.waitFor((e) => e.type === "pong", mark)).type).toBe("pong");
    closeAll();
  });
});

describe("the log on reconnecting", () => {
  it("counts only what the reader may see: lines meant for others do not use up the room of the public ones", async () => {
    const w = await table("history");
    const insert = (over: Partial<Parameters<typeof insertMessage>[1]>) =>
      insertMessage(t.db, { worldId: w.worldId, sessionId: w.sessionId, authorId: w.annaId, kind: "chat", audience: "all", recipientId: null, text: "x", notation: null, roll: null, at: new Date(), ...over });
    await insert({ text: "pubblico antico" });
    // Far more private lines than the history holds, none of them for Anna.
    for (let i = 0; i < SNAPSHOT_MESSAGES + 10; i++) {
      await insert({ authorId: w.brunoId, audience: "whisper", recipientId: w.dmId, text: `sussurro ${String(i)}` });
      await insert({ authorId: w.brunoId, audience: "gm", kind: "roll", text: `riservato ${String(i)}` });
    }
    const anna = await sit(w, w.anna);
    expect(anna.snapshot.messages.map((m) => m.text)).toEqual(["pubblico antico"]);
    const dm = await sit(w, w.dm);
    // The DM sees the reserved rolls and the whispers addressed to them, the most recent hundred.
    expect(dm.snapshot.messages).toHaveLength(SNAPSHOT_MESSAGES);
    expect(dm.snapshot.messages.every((m) => m.authorName.endsWith("bruno"))).toBe(true);
    expect(dm.snapshot.messages.at(-1)?.text).toBe(`riservato ${String(SNAPSHOT_MESSAGES + 9)}`);
    const bruno = await sit(w, w.bruno);
    expect(bruno.snapshot.messages).toHaveLength(SNAPSHOT_MESSAGES);
    for (const x of [anna, dm, bruno]) x.client.close();
  });

  it("the database condition and the rule in code agree, for every viewer and every kind of line", async () => {
    const w = await table("agree");
    const kinds: { audience: "all" | "gm" | "whisper"; authorId: string; recipientId: string | null }[] = [];
    for (const authorId of [w.dmId, w.annaId, w.brunoId]) {
      kinds.push({ audience: "all", authorId, recipientId: null }, { audience: "gm", authorId, recipientId: null });
      for (const recipientId of [w.dmId, w.annaId, w.brunoId]) if (recipientId !== authorId) kinds.push({ audience: "whisper", authorId, recipientId });
    }
    for (const [i, k] of kinds.entries()) await insertMessage(t.db, { worldId: w.worldId, sessionId: w.sessionId, kind: "chat", text: String(i), notation: null, roll: null, at: new Date(), ...k });
    const everything = await recentMessages(t.db, w.sessionId, { accountId: w.dmId, username: "x", role: "dm" }, 1000);
    expect(everything.length).toBeLessThan(kinds.length);
    for (const viewer of [{ accountId: w.dmId, role: "dm" as const }, { accountId: w.annaId, role: "player" as const }, { accountId: w.brunoId, role: "player" as const }]) {
      const mine = await recentMessages(t.db, w.sessionId, { ...viewer, username: "x" }, 1000);
      const byRule = kinds.flatMap((k, i) => (canSeeMessage({ ...viewer, username: "x" }, { id: "", kind: "chat", audience: k.audience, authorId: k.authorId, authorName: "", recipientId: k.recipientId, recipientName: null, text: String(i), notation: null, roll: null, createdAt: "" }) ? [String(i)] : []));
      expect(mine.map((m) => m.text), viewer.role + viewer.accountId).toEqual(byRule);
    }
  });
});

describe("reconnecting", () => {
  it("someone who comes back finds the table as it is: scene, tokens where they were left, and the recent log", async () => {
    const w = await table("back");
    const dm = await sit(w, w.dm);
    const anna = await sit(w, w.anna);
    dm.client.send({ type: "scene.open", sceneId: w.s1 });
    await anna.client.waitFor((e) => isSnapshot(e) && e.scene !== null);
    dm.client.send({ type: "token.add", label: "Anna", x: 1, y: 1, ownerAccountId: w.annaId });
    const added = await anna.client.waitFor(tokenEvent("Anna"));
    const tokenId = added.type === "token.upserted" ? added.token.id : "";
    anna.client.send({ type: "token.move", tokenId, x: 8, y: 6 });
    await dm.client.waitFor((e) => e.type === "token.upserted" && e.token.x === 8);
    anna.client.send({ type: "chat.send", text: "Torno subito" });
    await dm.client.waitFor(messageWith("Torno subito"));
    anna.client.close();
    await anna.client.closed;
    const back = await sit(w, w.anna);
    expect(back.snapshot.scene?.id).toBe(w.s1);
    expect(back.snapshot.tokens).toMatchObject([{ label: "Anna", x: 8, y: 6 }]);
    expect(back.snapshot.messages.map((m) => m.text)).toContain("Torno subito");
    back.client.close();
    dm.client.close();
  });
});

describe("taking everyone to another scene", () => {
  async function travelling(prefix: string) {
    const w = await table(prefix);
    await c.patch(`${w.base}/scenes/${w.s2}/table`, { start: { x: 10, y: 10, w: 2, h: 2 } }, w.dm);
    const dm = await sit(w, w.dm);
    const anna = await sit(w, w.anna);
    dm.client.send({ type: "scene.open", sceneId: w.s1 });
    await anna.client.waitFor((e) => isSnapshot(e) && e.scene !== null);
    return { w, dm, anna };
  }

  it("moves the tokens that travel to the start zone of the destination, and leaves the others", async () => {
    const { w, dm, anna } = await travelling("travel");
    dm.client.send({ type: "token.add", label: "Anna", x: 0, y: 0, ownerAccountId: w.annaId });
    dm.client.send({ type: "token.add", label: "Ostaggio", x: 1, y: 0, travels: true });
    dm.client.send({ type: "token.add", label: "Orco", x: 2, y: 0 });
    dm.client.send({ type: "token.add", label: "Ombra", x: 3, y: 0, hidden: true, travels: true });
    await dm.client.waitFor(tokenEvent("Ombra"));
    const mark = anna.client.mark();
    dm.client.send({ type: "scene.travel", toSceneId: w.s2 });
    const snap = await anna.client.waitFor((e) => isSnapshot(e) && e.scene?.id === w.s2, mark);
    const arrived = isSnapshot(snap) ? snap.tokens : [];
    expect(arrived.map((x) => x.label).sort()).toEqual(["Anna", "Ostaggio"]);
    // Three tokens travel (the hidden one too) into a zone of four squares: all inside it, none on another.
    const spots = arrived.map((x) => `${String(x.x)},${String(x.y)}`);
    expect(new Set(spots).size).toBe(2);
    for (const x of arrived) {
      expect(x.x).toBeGreaterThanOrEqual(10);
      expect(x.x).toBeLessThanOrEqual(11);
      expect(x.y).toBeGreaterThanOrEqual(10);
      expect(x.y).toBeLessThanOrEqual(11);
    }
    expect(isSnapshot(snap) && snap.messages.at(-1)?.text).toContain("Cantina");
    const dmSnap = await dm.client.waitFor((e) => isSnapshot(e) && e.scene?.id === w.s2, mark);
    expect(isSnapshot(dmSnap) && dmSnap.tokens.map((x) => x.label).sort()).toEqual(["Anna", "Ombra", "Ostaggio"]);
    // The ones that stayed are still in the first scene.
    dm.client.send({ type: "scene.open", sceneId: w.s1 });
    const back = await dm.client.waitFor((e) => isSnapshot(e) && e.scene?.id === w.s1, dm.client.mark());
    expect(isSnapshot(back) && back.tokens.map((x) => x.label)).toEqual(["Orco"]);
    dm.client.close();
    anna.client.close();
  });

  it("needs an exit: another scene, or a scene linked the other way, is refused", async () => {
    const { w, dm } = await travelling("noexit");
    dm.client.send({ type: "scene.travel", toSceneId: w.s3 });
    expect(await dm.client.waitFor(errorEvent)).toMatchObject({ error: "errors.table.no-exit" });
    dm.client.send({ type: "scene.open", sceneId: w.s2 });
    await dm.client.waitFor((e) => isSnapshot(e) && e.scene?.id === w.s2, dm.client.mark() - 1);
    const mark = dm.client.mark();
    dm.client.send({ type: "scene.travel", toSceneId: w.s1 });
    expect(await dm.client.waitFor(errorEvent, mark)).toMatchObject({ error: "errors.table.no-exit" });
    dm.client.close();
  });

  it("only the DM takes everyone, and not before a scene is open", async () => {
    const w = await table("travelperm");
    const dm = await sit(w, w.dm);
    const anna = await sit(w, w.anna);
    dm.client.send({ type: "scene.travel", toSceneId: w.s2 });
    expect(await dm.client.waitFor(errorEvent)).toMatchObject({ error: "errors.table.no-scene" });
    anna.client.send({ type: "scene.travel", toSceneId: w.s2 });
    expect(await anna.client.waitFor(errorEvent)).toMatchObject({ error: "errors.forbidden" });
    dm.client.close();
    anna.client.close();
  });

  it("tokens already waiting at the destination are not covered", async () => {
    const { w, dm } = await travelling("occupied");
    dm.client.send({ type: "scene.open", sceneId: w.s2 });
    await dm.client.waitFor((e) => isSnapshot(e) && e.scene?.id === w.s2, dm.client.mark() - 1);
    dm.client.send({ type: "token.add", label: "Guardia", x: 10, y: 10 });
    await dm.client.waitFor(tokenEvent("Guardia"));
    dm.client.send({ type: "scene.open", sceneId: w.s1 });
    await dm.client.waitFor((e) => isSnapshot(e) && e.scene?.id === w.s1, dm.client.mark() - 1);
    dm.client.send({ type: "token.add", label: "Eroe", x: 0, y: 0, travels: true });
    await dm.client.waitFor(tokenEvent("Eroe"));
    const mark = dm.client.mark();
    dm.client.send({ type: "scene.travel", toSceneId: w.s2 });
    const snap = await dm.client.waitFor((e) => isSnapshot(e) && e.scene?.id === w.s2, mark);
    const at = (label: string) => (isSnapshot(snap) ? snap.tokens.find((x) => x.label === label) : undefined);
    expect(at("Guardia")).toMatchObject({ x: 10, y: 10 });
    expect(at("Eroe")).toMatchObject({ x: 11, y: 10 });
    dm.client.close();
  });
});

describe("two people acting at once", () => {
  it("commands from different connections of one table are applied one after the other", async () => {
    const w = await table("race");
    await c.post(`${w.base}/scene-links`, { fromSceneId: w.s1, toSceneId: w.s3 }, w.dm);
    const first = await sit(w, w.dm);
    const second = await sit(w, w.dm);
    first.client.send({ type: "scene.open", sceneId: w.s1 });
    await first.client.waitFor((e) => isSnapshot(e) && e.scene?.id === w.s1);
    first.client.send({ type: "token.add", label: "Eroe", x: 0, y: 0, travels: true });
    await first.client.waitFor(tokenEvent("Eroe"));
    const mark1 = first.client.mark();
    const mark2 = second.client.mark();
    // Both leave the same scene by a different exit at the same moment.
    first.client.send({ type: "scene.travel", toSceneId: w.s2 });
    second.client.send({ type: "scene.travel", toSceneId: w.s3 });
    await Promise.race([first.client.waitFor(errorEvent, mark1), second.client.waitFor(errorEvent, mark2)]);
    const check = await sit(w, w.dm);
    // Whichever came first won; the other found the table already moved and was refused: the hero is where the table is.
    expect(check.snapshot.tokens.map((x) => x.label)).toEqual(["Eroe"]);
    const refused = [...first.client.events.slice(mark1), ...second.client.events.slice(mark2)].filter((e) => e.type === "error");
    expect(refused).toMatchObject([{ error: "errors.table.no-exit" }]);
    first.client.close();
    second.client.close();
    check.client.close();
  });
});

describe("closing the session while commands are waiting", () => {
  /** Holds the table's queue shut until `open()` is called, so commands pile up behind it. */
  function gate(sessionId: string): { open: () => void; held: Promise<void> } {
    let open: () => void = () => undefined;
    const closed = new Promise<void>((resolve) => { open = resolve; });
    return { open, held: t.hub.serial(sessionId, () => closed) };
  }
  const waitUntilQueued = async (sessionId: string, count: number): Promise<void> => {
    for (let i = 0; i < 100 && t.hub.queued(sessionId) < count; i++) await new Promise((r) => setTimeout(r, 10));
    expect(t.hub.queued(sessionId)).toBeGreaterThanOrEqual(count);
  };

  it("a command that came first is saved, and the closing waits for it", async () => {
    const w = await table("closefirst");
    const dm = await sit(w, w.dm);
    const g = gate(w.sessionId);
    dm.client.send({ type: "chat.send", text: "Ultima parola" });
    await waitUntilQueued(w.sessionId, 2);
    const closing = c.post(`${w.base}/sessions/${w.sessionId}/close`, { report: "Fine" }, w.dm);
    await waitUntilQueued(w.sessionId, 3);
    g.open();
    expect((await closing).statusCode).toBe(200);
    await g.held;
    const rows = await t.db.select({ text: tableMessages.text }).from(tableMessages).where(eq(tableMessages.gameSessionId, w.sessionId));
    expect(rows.map((r) => r.text)).toContain("Ultima parola");
  });

  it("a command that comes after the closing is refused and saves nothing", async () => {
    const w = await table("closelast");
    const dm = await sit(w, w.dm);
    const g = gate(w.sessionId);
    const closing = c.post(`${w.base}/sessions/${w.sessionId}/close`, {}, w.dm);
    await waitUntilQueued(w.sessionId, 2);
    dm.client.send({ type: "chat.send", text: "Troppo tardi" });
    await waitUntilQueued(w.sessionId, 3);
    g.open();
    expect((await closing).statusCode).toBe(200);
    await g.held;
    await dm.client.closed;
    const rows = await t.db.select({ text: tableMessages.text }).from(tableMessages).where(eq(tableMessages.gameSessionId, w.sessionId));
    expect(rows.map((r) => r.text)).not.toContain("Troppo tardi");
  });
});

describe("deleting scenes", () => {
  it("refuses a scene that has tokens, and the tokens are still there", async () => {
    const w = await table("delfull");
    const dm = await sit(w, w.dm);
    dm.client.send({ type: "scene.open", sceneId: w.s1 });
    await dm.client.waitFor((e) => isSnapshot(e) && e.scene?.id === w.s1);
    dm.client.send({ type: "token.add", label: "Goblin", x: 1, y: 1 });
    await dm.client.waitFor(tokenEvent("Goblin"));
    dm.client.send({ type: "scene.open", sceneId: w.s2 });
    await dm.client.waitFor((e) => isSnapshot(e) && e.scene?.id === w.s2, dm.client.mark() - 1);
    const refused = await c.del(`${w.base}/scenes/${w.s1}`, w.dm);
    expect(refused.statusCode).toBe(409);
    expect(field(refused, "error")).toBe("errors.world.not-empty");
    dm.client.send({ type: "scene.open", sceneId: w.s1 });
    const back = await dm.client.waitFor((e) => isSnapshot(e) && e.scene?.id === w.s1, dm.client.mark() - 1);
    expect(isSnapshot(back) && back.tokens.map((x) => x.label)).toEqual(["Goblin"]);
    dm.client.close();
  });

  it("refuses the scene being played, even when it is empty", async () => {
    const w = await table("delcurrent");
    const dm = await sit(w, w.dm);
    dm.client.send({ type: "scene.open", sceneId: w.s3 });
    await dm.client.waitFor((e) => isSnapshot(e) && e.scene?.id === w.s3);
    const refused = await c.del(`${w.base}/scenes/${w.s3}`, w.dm);
    expect(refused.statusCode).toBe(409);
    expect(field(refused, "error")).toBe("errors.world.scene-in-use");
    // Once the table has moved on, it can go.
    dm.client.send({ type: "scene.open", sceneId: w.s1 });
    await dm.client.waitFor((e) => isSnapshot(e) && e.scene?.id === w.s1, dm.client.mark() - 1);
    expect((await c.del(`${w.base}/scenes/${w.s3}`, w.dm)).statusCode).toBe(204);
    dm.client.close();
  });

  it("deletes an empty scene that nobody is playing, with no table running at all", async () => {
    const w = await table("delfree");
    await c.post(`${w.base}/sessions/${w.sessionId}/close`, {}, w.dm);
    expect((await c.del(`${w.base}/scenes/${w.s2}`, w.dm)).statusCode).toBe(204);
  });
});

describe("the login behind a connection", () => {
  const login = async (username: string): Promise<string> => {
    const r = await c.post("/api/auth/login", { username, password: TEST_PASSWORD });
    const cookie = r.cookies.find((x) => x.name === "phoenix_session");
    if (cookie === undefined) throw new Error("login failed");
    return cookie.value;
  };

  it("logging out closes the connections opened with that login at once, and no others", async () => {
    const w = await table("logout");
    const second = await login("logout-anna");
    const first = await sit(w, w.anna);
    const other = await sit(w, second);
    await c.post("/api/auth/logout", {}, w.anna);
    expect(await first.client.closed).toBe(4000);
    // Another login of the same person, say on another device, is not affected.
    other.client.send({ type: "chat.send", text: "Io sono ancora qui" });
    await other.client.waitFor(messageWith("Io sono ancora qui"));
    other.client.close();
  });

  it("a login that expires while the connection is open ends the connection at the next command", async () => {
    const w = await table("expire");
    const anna = await sit(w, w.anna);
    t.clock.now = new Date(t.clock.now.getTime() + 31 * 24 * 60 * 60 * 1000);
    anna.client.send({ type: "chat.send", text: "Sono scaduto" });
    expect(await anna.client.waitFor(errorEvent)).toMatchObject({ error: "errors.unauthenticated" });
    expect(await anna.client.closed).toBe(4001);
    const rows = await t.db.select({ text: tableMessages.text }).from(tableMessages).where(eq(tableMessages.gameSessionId, w.sessionId));
    expect(rows.map((r) => r.text)).not.toContain("Sono scaduto");
  });

  it("the keep-alive ping does not keep an expired login alive either", async () => {
    const w = await table("expireping");
    const anna = await sit(w, w.anna);
    t.clock.now = new Date(t.clock.now.getTime() + 31 * 24 * 60 * 60 * 1000);
    anna.client.send({ type: "ping" });
    expect(await anna.client.closed).toBe(4001);
    expect(anna.client.events.some((e) => e.type === "pong")).toBe(false);
  });
});

describe("a flood of frames", () => {
  it("is cut off, and only the commands within the limit were ever applied", async () => {
    const w = await table("flood");
    const anna = await sit(w, w.anna);
    for (let i = 0; i < 200; i++) anna.client.send({ type: "chat.send", text: `spam ${String(i)}` });
    expect(await anna.client.closed).toBe(1008);
    await new Promise((r) => setTimeout(r, 200));
    const rows = await t.db.select({ text: tableMessages.text }).from(tableMessages).where(eq(tableMessages.gameSessionId, w.sessionId));
    const spam = rows.filter((r) => r.text.startsWith("spam"));
    expect(spam.length).toBeGreaterThan(0);
    expect(spam.length).toBeLessThanOrEqual(40);
  });
});

describe("a member removed while commands are waiting", () => {
  it("what was in line before the removal is applied, what comes after is refused, and nothing interleaves", async () => {
    const w = await table("kickqueue");
    const dm = await sit(w, w.dm);
    const anna = await sit(w, w.anna);
    dm.client.send({ type: "scene.open", sceneId: w.s1 });
    await anna.client.waitFor((e) => isSnapshot(e) && e.scene !== null);
    dm.client.send({ type: "token.add", label: "Anna", x: 0, y: 0, ownerAccountId: w.annaId });
    const added = await anna.client.waitFor(tokenEvent("Anna"));
    const tokenId = added.type === "token.upserted" ? added.token.id : "";
    let open: () => void = () => undefined;
    const closed = new Promise<void>((resolve) => { open = resolve; });
    const held = t.hub.serial(w.sessionId, () => closed);
    const queuedAtLeast = async (n: number): Promise<void> => {
      for (let i = 0; i < 100 && t.hub.queued(w.sessionId) < n; i++) await new Promise((r) => setTimeout(r, 10));
      expect(t.hub.queued(w.sessionId)).toBeGreaterThanOrEqual(n);
    };
    // The socket hands its commands over one at a time: the chat is waiting behind the gate, the move behind the chat.
    anna.client.send({ type: "chat.send", text: "Prima della rimozione" });
    anna.client.send({ type: "token.move", tokenId, x: 9, y: 9 });
    await queuedAtLeast(2);
    const removal = c.del(`${w.base}/members/${w.annaId}`, w.dm);
    await queuedAtLeast(3);
    open();
    expect((await removal).statusCode).toBe(204);
    await held;
    await new Promise((r) => setTimeout(r, 300));
    for (let i = 0; i < 100 && t.hub.queued(w.sessionId) > 0; i++) await new Promise((r) => setTimeout(r, 10));
    const rows = await t.db.select({ text: tableMessages.text }).from(tableMessages).where(eq(tableMessages.gameSessionId, w.sessionId));
    // The chat was already in line before the removal. The move reached the line after it, and was refused.
    expect(rows.map((r) => r.text)).toContain("Prima della rimozione");
    const check = await sit(w, w.dm);
    expect(check.snapshot.tokens.find((x) => x.id === tokenId)).toMatchObject({ x: 0, y: 0 });
    dm.client.close();
    check.client.close();
  });

  it("a command sent after the removal is refused and saves nothing", async () => {
    const w = await table("kicklate");
    const dm = await sit(w, w.dm);
    const anna = await sit(w, w.anna);
    await c.del(`${w.base}/members/${w.annaId}`, w.dm);
    await anna.client.closed;
    anna.client.send({ type: "chat.send", text: "Dopo la rimozione" });
    await new Promise((r) => setTimeout(r, 100));
    const rows = await t.db.select({ text: tableMessages.text }).from(tableMessages).where(eq(tableMessages.gameSessionId, w.sessionId));
    expect(rows.map((r) => r.text)).not.toContain("Dopo la rimozione");
    dm.client.close();
  });
});

describe("removing a member", () => {
  it("sends them away from the table at once, and they cannot come back", async () => {
    const w = await table("kick");
    const dm = await sit(w, w.dm);
    const anna = await sit(w, w.anna);
    const bruno = await sit(w, w.bruno);
    const mark = dm.client.mark();
    await c.del(`${w.base}/members/${w.annaId}`, w.dm);
    expect(await anna.client.closed).toBe(4000);
    // The others are told she left, and nothing more reaches her.
    await dm.client.waitFor((e) => e.type === "presence" && !e.present.some((p) => p.accountId === w.annaId), mark);
    bruno.client.send({ type: "chat.send", text: "Dopo l'espulsione" });
    await dm.client.waitFor(messageWith("Dopo l'espulsione"));
    expect(anna.client.events.some((e) => e.type === "message" && e.message.text === "Dopo l'espulsione")).toBe(false);
    await expect(openTable(t.app, w.worldId, w.anna)).rejects.toThrow();
    dm.client.close();
    bruno.client.close();
  });
});

describe("the end of the session", () => {
  it("closing the session sends everyone out of the table, and nobody can come back", async () => {
    const w = await table("end");
    const dm = await sit(w, w.dm);
    const anna = await sit(w, w.anna);
    await c.post(`${w.base}/sessions/${w.sessionId}/close`, { report: "Fine" }, w.dm);
    expect(await anna.client.waitFor(errorEvent)).toMatchObject({ error: "errors.table.no-session" });
    expect(await anna.client.closed).toBe(4000);
    expect(await dm.client.closed).toBe(4000);
    await expect(openTable(t.app, w.worldId, w.anna)).rejects.toThrow();
  });

  it("a command sent as the session ends is refused, not applied", async () => {
    const w = await table("late");
    const dm = await sit(w, w.dm);
    // Close it behind the table's back, so the connection is still open when the command arrives.
    await c.post(`${w.base}/sessions/${w.sessionId}/close`, {}, w.dm);
    const mark = dm.client.mark();
    dm.client.send({ type: "chat.send", text: "Troppo tardi" });
    await dm.client.closed;
    expect(dm.client.events.slice(mark).some((e) => e.type === "message")).toBe(false);
  });
});
