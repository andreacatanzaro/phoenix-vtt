import { eq } from "drizzle-orm";
import { gameSessions, tokens } from "./db/schema";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createTestApp, fakeJpeg, fakePng, fakeWebp, field, idOf, makeClient, type TestApp } from "./test-support";

let t: TestApp;
let c: ReturnType<typeof makeClient>;
beforeAll(async () => {
  t = await createTestApp();
  c = makeClient(t.app);
});
afterAll(async () => {
  await t.close();
});

async function world(prefix: string) {
  const dm = await c.signUp(`${prefix}-dm`);
  const player = await c.signUp(`${prefix}-pl`);
  const worldId = idOf(await c.post("/api/worlds", { name: "Mondo" }, dm), "world", "id");
  await c.post(`/api/worlds/${worldId}/members`, { username: `${prefix}-pl` }, dm);
  const base = `/api/worlds/${worldId}`;
  const region = idOf(await c.post(`${base}/regions`, { name: "R" }, dm), "element", "id");
  const area = idOf(await c.post(`${base}/areas`, { name: "A", parentId: region }, dm), "element", "id");
  const place = idOf(await c.post(`${base}/places`, { name: "L", parentId: area }, dm), "element", "id");
  const scene = idOf(await c.post(`${base}/scenes`, { name: "S", parentId: place }, dm), "element", "id");
  return { dm, player, worldId, base, scene };
}

function upload(base: string, kind: string, bytes: Buffer, type: string, token?: string) {
  return t.app.inject({ method: "POST", url: `${base}/images?kind=${kind}`, payload: bytes, headers: { "content-type": type }, ...(token === undefined ? {} : { cookies: { phoenix_session: token } }) });
}

const asReply = (r: Awaited<ReturnType<typeof upload>>) => ({ statusCode: r.statusCode, json: (): unknown => r.json(), cookies: [] });

describe("uploading pictures", () => {
  it("the DM uploads a map, PNG, JPEG or WebP, and gets its size from the bytes", async () => {
    const w = await world("up");
    const png = asReply(await upload(w.base, "map", fakePng(1400, 900), "image/png", w.dm));
    expect(png.statusCode).toBe(201);
    expect(field(png, "image")).toMatchObject({ kind: "map", width: 1400, height: 900 });
    expect(field(asReply(await upload(w.base, "map", fakeJpeg(800, 600), "image/jpeg", w.dm)), "image")).toMatchObject({ width: 800, height: 600 });
    expect(field(asReply(await upload(w.base, "map", fakeWebp(1024, 768), "image/webp", w.dm)), "image")).toMatchObject({ width: 1024, height: 768 });
    expect(t.images.size()).toBeGreaterThanOrEqual(3);
  });

  it("refuses a file that is not a picture, or that says it is another type", async () => {
    const w = await world("bad");
    const text = await upload(w.base, "map", Buffer.from("<svg onload=alert(1)></svg>"), "image/png", w.dm);
    expect(text.statusCode).toBe(400);
    expect(field(asReply(text), "error")).toBe("errors.image.invalid");
    expect((await upload(w.base, "map", fakeJpeg(100, 100), "image/png", w.dm)).statusCode).toBe(400);
    expect((await upload(w.base, "map", Buffer.alloc(0), "image/png", w.dm)).statusCode).toBe(400);
  });

  it("refuses types other than PNG, JPEG and WebP, and an unknown kind", async () => {
    const w = await world("types");
    expect((await upload(w.base, "map", fakePng(10, 10), "image/svg+xml", w.dm)).statusCode).toBeGreaterThanOrEqual(400);
    expect((await upload(w.base, "map", fakePng(10, 10), "image/gif", w.dm)).statusCode).toBeGreaterThanOrEqual(400);
    expect((await upload(w.base, "poster", fakePng(10, 10), "image/png", w.dm)).statusCode).toBe(400);
  });

  it("refuses a picture that is too big in size or in weight, and stores nothing for it", async () => {
    const w = await world("big");
    const before = t.images.size();
    const wide = await upload(w.base, "map", fakePng(9000, 100), "image/png", w.dm);
    expect(wide.statusCode).toBe(413);
    expect(field(asReply(wide), "error")).toBe("errors.image.too-large");
    expect((await upload(w.base, "token", fakePng(2000, 2000), "image/png", w.dm)).statusCode).toBe(413);
    expect((await upload(w.base, "token", fakePng(100, 100, 3 * 1024 * 1024), "image/png", w.dm)).statusCode).toBe(413);
    const huge = await upload(w.base, "map", fakePng(100, 100, 11 * 1024 * 1024), "image/png", w.dm);
    expect(huge.statusCode).toBe(413);
    expect(field(asReply(huge), "error")).toBe("errors.too-large");
    expect(t.images.size()).toBe(before);
  });

  it("only the DM uploads; a player gets 403, a stranger 404, and nobody signed in 401", async () => {
    const w = await world("perm");
    const stranger = await c.signUp("perm-out");
    expect((await upload(w.base, "map", fakePng(10, 10), "image/png", w.player)).statusCode).toBe(403);
    expect((await upload(w.base, "map", fakePng(10, 10), "image/png", stranger)).statusCode).toBe(404);
    expect((await upload(w.base, "map", fakePng(10, 10), "image/png")).statusCode).toBe(401);
  });
});

describe("looking at pictures", () => {
  it("the DM sees any picture of the world, with the right type and no sniffing, and a stranger does not", async () => {
    const w = await world("view");
    const stranger = await c.signUp("view-out");
    const bytes = fakePng(300, 200);
    const id = idOf(asReply(await upload(w.base, "map", bytes, "image/png", w.dm)), "image", "id");
    const seen = await t.app.inject({ method: "GET", url: `${w.base}/images/${id}`, cookies: { phoenix_session: w.dm } });
    expect(seen.statusCode).toBe(200);
    expect(seen.headers["content-type"]).toBe("image/png");
    expect(seen.headers["x-content-type-options"]).toBe("nosniff");
    expect(seen.rawPayload.equals(bytes)).toBe(true);
    expect((await c.get(`${w.base}/images/${id}`, stranger)).statusCode).toBe(404);
    expect((await c.get(`${w.base}/images/${id}`)).statusCode).toBe(401);
  });

  it("a picture of another world is not reachable through this one, and a bad id is a 404", async () => {
    const w = await world("mine");
    const other = await world("theirs");
    const theirs = idOf(asReply(await upload(other.base, "map", fakePng(10, 10), "image/png", other.dm)), "image", "id");
    expect((await c.get(`${w.base}/images/${theirs}`, w.dm)).statusCode).toBe(404);
    expect((await c.get(`${w.base}/images/non-un-uuid`, w.dm)).statusCode).toBe(404);
  });
});

describe("setting a scene for the table", () => {
  it("starts with defaults and takes a map, the grid and the start zone", async () => {
    const w = await world("scene");
    const url = `${w.base}/scenes/${w.scene}/table`;
    expect(field(await c.get(url, w.dm), "scene")).toMatchObject({ mapImageId: null, gridPx: 70, gridOffsetX: 0, gridOffsetY: 0, start: { x: 0, y: 0, w: 4, h: 4 } });
    const map = idOf(asReply(await upload(w.base, "map", fakePng(1400, 900), "image/png", w.dm)), "image", "id");
    const done = await c.patch(url, { mapImageId: map, gridPx: 50, gridOffsetX: 12, gridOffsetY: -8, start: { x: 2, y: 3, w: 5, h: 2 } }, w.dm);
    expect(done.statusCode).toBe(200);
    expect(field(done, "scene")).toEqual({ mapImageId: map, mapWidth: 1400, mapHeight: 900, gridPx: 50, gridOffsetX: 12, gridOffsetY: -8, start: { x: 2, y: 3, w: 5, h: 2 } });
    expect(field(await c.get(url, w.dm), "scene", "mapWidth")).toBe(1400);
  });

  it("a partial change keeps the rest, and the map can be taken away", async () => {
    const w = await world("partial");
    const url = `${w.base}/scenes/${w.scene}/table`;
    const map = idOf(asReply(await upload(w.base, "map", fakePng(500, 500), "image/png", w.dm)), "image", "id");
    await c.patch(url, { mapImageId: map, gridPx: 60 }, w.dm);
    expect(field(await c.patch(url, { gridOffsetX: 5 }, w.dm), "scene")).toMatchObject({ mapImageId: map, gridPx: 60, gridOffsetX: 5, mapWidth: 500 });
    expect(field(await c.patch(url, { mapImageId: null }, w.dm), "scene")).toMatchObject({ mapImageId: null, mapWidth: null, gridPx: 60 });
  });

  it("refuses a map that is not a map of this world, a token picture as a map, and bad grid values", async () => {
    const w = await world("refuse");
    const other = await world("refuse2");
    const url = `${w.base}/scenes/${w.scene}/table`;
    const theirs = idOf(asReply(await upload(other.base, "map", fakePng(10, 10), "image/png", other.dm)), "image", "id");
    const token = idOf(asReply(await upload(w.base, "token", fakePng(10, 10), "image/png", w.dm)), "image", "id");
    for (const body of [{ mapImageId: theirs }, { mapImageId: token }, { mapImageId: "00000000-0000-4000-8000-000000000000" }]) {
      const r = await c.patch(url, body, w.dm);
      expect(r.statusCode).toBe(400);
      expect(field(r, "error")).toBe("errors.image.map-invalid");
    }
    for (const body of [{}, { gridPx: 5 }, { gridPx: 401 }, { gridPx: 50.5 }, { start: { x: 0, y: 0, w: 0, h: 4 } }, { start: { x: 0, y: 0, w: 65, h: 4 } }, { start: { x: 501, y: 0, w: 4, h: 4 } }, { start: { x: 0, y: -501, w: 4, h: 4 } }, { gridOffsetX: 5000 }]) {
      expect((await c.patch(url, body, w.dm)).statusCode, JSON.stringify(body)).toBe(400);
    }
  });

  it("only the DM sets it, and a scene of another world is not reachable", async () => {
    const w = await world("permscene");
    const other = await world("permscene2");
    const url = `${w.base}/scenes/${w.scene}/table`;
    expect((await c.patch(url, { gridPx: 50 }, w.player)).statusCode).toBe(403);
    expect((await c.get(url, w.player)).statusCode).toBe(403);
    expect((await c.patch(`${w.base}/scenes/${other.scene}/table`, { gridPx: 50 }, w.dm)).statusCode).toBe(404);
    expect((await c.get(`${w.base}/scenes/non-un-uuid/table`, w.dm)).statusCode).toBe(404);
  });
});

describe("what a player may look at", () => {
  /** A running session on scene `current`, a map on both scenes, and three tokens: a visible face, a hidden face, a face on the other scene. */
  async function table(prefix: string) {
    const w = await world(prefix);
    const other = idOf(await c.post(`${w.base}/scenes`, { name: "Altra", parentId: idOf(await c.post(`${w.base}/places`, { name: "L2", parentId: idOf(await c.post(`${w.base}/areas`, { name: "A2", parentId: idOf(await c.post(`${w.base}/regions`, { name: "R2" }, w.dm), "element", "id") }, w.dm), "element", "id") }, w.dm), "element", "id") }, w.dm), "element", "id");
    const pic = async (kind: "map" | "token"): Promise<string> => idOf(asReply(await upload(w.base, kind, fakePng(64, 64), "image/png", w.dm)), "image", "id");
    const ids = { map: await pic("map"), otherMap: await pic("map"), visible: await pic("token"), hidden: await pic("token"), elsewhere: await pic("token"), loose: await pic("token") };
    await c.patch(`${w.base}/scenes/${w.scene}/table`, { mapImageId: ids.map }, w.dm);
    await c.patch(`${w.base}/scenes/${other}/table`, { mapImageId: ids.otherMap }, w.dm);
    const sessionId = idOf(await c.post(`${w.base}/sessions`, { title: "Prova" }, w.dm), "session", "id");
    await c.post(`${w.base}/sessions/${sessionId}/start`, {}, w.dm);
    await t.db.update(gameSessions).set({ currentSceneId: w.scene }).where(eq(gameSessions.id, sessionId));
    const token = (sceneId: string, imageId: string, hidden: boolean) => t.db.insert(tokens).values({ worldId: w.worldId, sceneId, label: "T", color: "gold", imageId, x: 0, y: 0, size: 1, hidden, travels: false });
    await token(w.scene, ids.visible, false);
    await token(w.scene, ids.hidden, true);
    await token(other, ids.elsewhere, false);
    const status = async (who: string, id: string): Promise<number> => (await c.get(`${w.base}/images/${id}`, who)).statusCode;
    return { w, ids, other, sessionId, status };
  }

  it("a player gets the map of the scene being played and the face of a token they can see", async () => {
    const { w, ids, status } = await table("pl-ok");
    expect(await status(w.player, ids.map)).toBe(200);
    expect(await status(w.player, ids.visible)).toBe(200);
  });

  it("a player cannot get what is hidden, elsewhere or not yet used, even knowing the id", async () => {
    const { w, ids, status } = await table("pl-no");
    for (const id of [ids.hidden, ids.otherMap, ids.elsewhere, ids.loose]) expect(await status(w.player, id), id).toBe(404);
  });

  it("a refused request never reads the file, and what is served is never kept by the browser", async () => {
    const { w, ids } = await table("noread");
    const read = vi.spyOn(t.images, "get");
    expect((await c.get(`${w.base}/images/${ids.hidden}`, w.player)).statusCode).toBe(404);
    expect(read).not.toHaveBeenCalled();
    const served = await t.app.inject({ method: "GET", url: `${w.base}/images/${ids.map}`, cookies: { phoenix_session: w.player } });
    expect(served.statusCode).toBe(200);
    expect(read).toHaveBeenCalledTimes(1);
    expect(served.headers["cache-control"]).toBe("private, no-store");
    read.mockRestore();
  });

  it("the DM gets every one of them", async () => {
    const { w, ids, status } = await table("dm-all");
    for (const id of Object.values(ids)) expect(await status(w.dm, id), id).toBe(200);
  });

  it("what a player may see follows the table: a token that becomes hidden, a scene that changes", async () => {
    const { w, ids, other, sessionId, status } = await table("follow");
    await t.db.update(tokens).set({ hidden: true }).where(eq(tokens.imageId, ids.visible));
    expect(await status(w.player, ids.visible)).toBe(404);
    await t.db.update(gameSessions).set({ currentSceneId: other }).where(eq(gameSessions.id, sessionId));
    expect(await status(w.player, ids.map)).toBe(404);
    expect(await status(w.player, ids.otherMap)).toBe(200);
    expect(await status(w.player, ids.elsewhere)).toBe(200);
  });

  it("with no session running, a player gets nothing", async () => {
    const { w, ids, sessionId, status } = await table("closed");
    await c.post(`${w.base}/sessions/${sessionId}/close`, {}, w.dm);
    expect(await status(w.player, ids.map)).toBe(404);
    expect(await status(w.dm, ids.map)).toBe(200);
  });
});
