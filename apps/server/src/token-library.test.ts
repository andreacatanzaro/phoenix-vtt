import type { TableEvent } from "@phoenix/shared";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { reclaimImages } from "./image-gc";
import { createTestApp, fakePng, field, idOf, makeClient, openTable, type TestApp } from "./test-support";

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
  const base = `/api/worlds/${worldId}`;
  await c.post(`${base}/members`, { username: `${prefix}-pl` }, dm);
  return { dm, player, worldId, base, url: `${base}/token-library` };
}
type World = Awaited<ReturnType<typeof world>>;

async function picture(w: World, kind = "token", token = w.dm): Promise<string> {
  const r = await t.app.inject({ method: "POST", url: `${w.base}/images?kind=${kind}`, payload: fakePng(200, 200), headers: { "content-type": "image/png" }, cookies: { phoenix_session: token } });
  return idOf({ statusCode: r.statusCode, json: (): unknown => r.json(), cookies: [] }, "image", "id");
}

const goblin = { name: "Goblin", color: "green", size: 1 };

describe("the token library of a world", () => {
  it("starts empty, and what the DM loads is listed, in the order it was loaded", async () => {
    const w = await world("lib-list");
    expect(field(await c.get(w.url, w.dm), "tokens")).toEqual([]);
    const first = await c.post(w.url, goblin, w.dm);
    expect(first.statusCode).toBe(201);
    expect(field(first, "token")).toMatchObject({ name: "Goblin", color: "green", size: 1, imageId: null });
    await c.post(w.url, { name: "Drago", color: "red", size: 4 }, w.dm);
    expect(field(await c.get(w.url, w.dm), "tokens", 0, "name")).toBe("Goblin");
    expect(field(await c.get(w.url, w.dm), "tokens", 1, "name")).toBe("Drago");
    expect(field(await c.get(w.url, w.dm), "tokens", 2)).toBeUndefined();
  });

  it("takes a picture of the world, the colour and the size, with sensible defaults", async () => {
    const w = await world("lib-fields");
    const image = await picture(w);
    expect(field(await c.post(w.url, { name: "Orco", color: "blue", size: 2, imageId: image }, w.dm), "token")).toMatchObject({ color: "blue", size: 2, imageId: image });
    expect(field(await c.post(w.url, { name: "Nudo" }, w.dm), "token")).toMatchObject({ color: "gold", size: 1, imageId: null });
  });

  it("is the DM's alone: a player, a stranger and someone not signed in get nothing", async () => {
    const w = await world("lib-who");
    const stranger = await c.signUp("lib-who-out");
    const made = idOf(await c.post(w.url, goblin, w.dm), "token", "id");
    for (const token of [w.player]) {
      expect((await c.get(w.url, token)).statusCode).toBe(403);
      expect((await c.post(w.url, goblin, token)).statusCode).toBe(403);
      expect((await c.patch(`${w.url}/${made}`, { name: "X" }, token)).statusCode).toBe(403);
      expect((await c.del(`${w.url}/${made}`, token)).statusCode).toBe(403);
    }
    expect((await c.get(w.url, stranger)).statusCode).toBe(404);
    expect((await c.get(w.url)).statusCode).toBe(401);
  });

  it("refuses what is not a token: no name, a name that is too long, a size or a colour out of range", async () => {
    const w = await world("lib-bad");
    for (const body of [{}, { name: "" }, { name: "   " }, { name: "x".repeat(41) }, { name: "A", size: 0 }, { name: "A", size: 9 }, { name: "A", size: 1.5 }, { name: "A", color: "rosa" }]) {
      expect((await c.post(w.url, body, w.dm)).statusCode, JSON.stringify(body)).toBe(400);
    }
  });

  it("takes only a token picture of this world: a map, a picture of another world or an unknown id are refused", async () => {
    const w = await world("lib-pic");
    const other = await world("lib-pic2");
    for (const imageId of [await picture(w, "map"), await picture(other, "token", other.dm), "00000000-0000-4000-8000-000000000000"]) {
      const refused = await c.post(w.url, { ...goblin, imageId }, w.dm);
      expect(refused.statusCode).toBe(400);
      expect(field(refused, "error")).toBe("errors.world.picture-invalid");
    }
  });

  it("is changed in part, and a picture can be taken away", async () => {
    const w = await world("lib-edit");
    const image = await picture(w);
    const id = idOf(await c.post(w.url, { ...goblin, imageId: image }, w.dm), "token", "id");
    expect(field(await c.patch(`${w.url}/${id}`, { name: "Goblin capo", size: 2 }, w.dm), "token")).toMatchObject({ name: "Goblin capo", size: 2, color: "green", imageId: image });
    expect(field(await c.patch(`${w.url}/${id}`, { imageId: null }, w.dm), "token", "imageId")).toBeNull();
    expect((await c.patch(`${w.url}/${id}`, {}, w.dm)).statusCode).toBe(400);
    expect((await c.patch(`${w.url}/${id}`, { imageId: await picture(w, "map") }, w.dm)).statusCode).toBe(400);
  });

  it("is taken out of the library, and an entry that is not there is not found", async () => {
    const w = await world("lib-del");
    const id = idOf(await c.post(w.url, goblin, w.dm), "token", "id");
    expect((await c.del(`${w.url}/${id}`, w.dm)).statusCode).toBe(204);
    expect(field(await c.get(w.url, w.dm), "tokens")).toEqual([]);
    expect((await c.del(`${w.url}/${id}`, w.dm)).statusCode).toBe(404);
    expect((await c.patch(`${w.url}/${id}`, { name: "X" }, w.dm)).statusCode).toBe(404);
  });

  it("is of its own world: another world's library does not show it, and cannot change it", async () => {
    const one = await world("lib-w1");
    const two = await world("lib-w2");
    const id = idOf(await c.post(one.url, goblin, one.dm), "token", "id");
    expect(field(await c.get(two.url, two.dm), "tokens")).toEqual([]);
    expect((await c.patch(`${two.url}/${id}`, { name: "X" }, two.dm)).statusCode).toBe(404);
    expect((await c.del(`${two.url}/${id}`, two.dm)).statusCode).toBe(404);
  });
});

describe("tokens placed from the library are copies", () => {
  async function scene(w: World): Promise<string> {
    const region = idOf(await c.post(`${w.base}/regions`, { name: "R" }, w.dm), "element", "id");
    const area = idOf(await c.post(`${w.base}/areas`, { name: "A", parentId: region }, w.dm), "element", "id");
    const place = idOf(await c.post(`${w.base}/places`, { name: "L", parentId: area }, w.dm), "element", "id");
    return idOf(await c.post(`${w.base}/scenes`, { name: "S", parentId: place }, w.dm), "element", "id");
  }
  const add = (label: string, imageId: string | null) => ({ type: "token.add", kind: "token", label, color: "green", x: 1, y: 1, size: 1, hidden: false, travels: false, ownerAccountId: null, imageId });
  const upserted = (label: string) => (e: TableEvent): boolean => e.type === "token.upserted" && e.token.label === label;

  it("taking the entry out of the library, or changing it, leaves the tokens already on a scene as they are", async () => {
    const w = await world("copy");
    const sceneId = await scene(w);
    const image = await picture(w);
    const id = idOf(await c.post(w.url, { ...goblin, imageId: image }, w.dm), "token", "id");
    const prep = await openTable(t.app, w.worldId, w.dm, `scenes/${sceneId}/prepare`);
    await prep.waitFor((e) => e.type === "snapshot");
    prep.send(add("Goblin", image));
    await prep.waitFor(upserted("Goblin"));
    await c.patch(`${w.url}/${id}`, { name: "Cambiato", size: 3 }, w.dm);
    await c.del(`${w.url}/${id}`, w.dm);
    const again = await openTable(t.app, w.worldId, w.dm, `scenes/${sceneId}/prepare`);
    const snap = await again.waitFor((e) => e.type === "snapshot");
    expect(snap.type === "snapshot" && snap.tokens.map((x) => ({ label: x.label, size: x.size, imageId: x.imageId }))).toEqual([{ label: "Goblin", size: 1, imageId: image }]);
    prep.close();
    again.close();
  });
});

describe("the pictures of the library", () => {
  const later = (): Date => new Date(Date.now() + 3 * 3600_000);
  const stillThere = async (w: World, id: string): Promise<boolean> => (await t.app.inject({ method: "GET", url: `${w.base}/images/${id}`, cookies: { phoenix_session: w.dm } })).statusCode === 200;

  it("a picture only the library uses is kept, even long after it was uploaded", async () => {
    const w = await world("lib-gc");
    const image = await picture(w);
    await c.post(w.url, { ...goblin, imageId: image }, w.dm);
    const lonely = await picture(w);
    await reclaimImages(t.db, t.images, later());
    expect(await stillThere(w, image)).toBe(true);
    expect(await stillThere(w, lonely)).toBe(false);
  });

  it("a picture that no entry and no token uses any more is cleaned away", async () => {
    const w = await world("lib-gc2");
    const image = await picture(w);
    const id = idOf(await c.post(w.url, { ...goblin, imageId: image }, w.dm), "token", "id");
    await c.del(`${w.url}/${id}`, w.dm);
    await reclaimImages(t.db, t.images, later());
    expect(await stillThere(w, image)).toBe(false);
  });

  it("is not for players: the picture of a library entry that is on no scene they see is not theirs to download", async () => {
    const w = await world("lib-priv");
    const image = await picture(w);
    await c.post(w.url, { ...goblin, imageId: image }, w.dm);
    const r = await t.app.inject({ method: "GET", url: `${w.base}/images/${image}`, cookies: { phoenix_session: w.player } });
    expect(r.statusCode).toBe(404);
  });
});
