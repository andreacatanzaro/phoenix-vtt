import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestApp, field, idOf, makeClient, type TestApp } from "./test-support";

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
  const region = idOf(await c.post(`${base}/regions`, { name: "R", graphX: 10, graphY: 20 }, dm), "element", "id");
  const area = idOf(await c.post(`${base}/areas`, { name: "A", parentId: region }, dm), "element", "id");
  const place = idOf(await c.post(`${base}/places`, { name: "L", parentId: area }, dm), "element", "id");
  const scene = idOf(await c.post(`${base}/scenes`, { name: "S", parentId: place }, dm), "element", "id");
  return { dm, player, base, region, area, place, scene };
}

describe("where each element is on the graph of the structure", () => {
  it("is not set at the start, unless the element is made at a place", async () => {
    const w = await world("pos-start");
    const tree = await c.get(`${w.base}/tree`, w.dm);
    expect(field(tree, "regions", 0, "graphX")).toBe(10);
    expect(field(tree, "regions", 0, "graphY")).toBe(20);
    expect(field(tree, "regions", 0, "areas", 0, "graphX")).toBeNull();
    expect(field(tree, "regions", 0, "areas", 0, "graphY")).toBeNull();
  });

  it("is kept for each level, and moved by changing it", async () => {
    const w = await world("pos-set");
    const levels: [string, string][] = [["regions", w.region], ["areas", w.area], ["places", w.place], ["scenes", w.scene]];
    for (const [i, [collection, id]] of levels.entries()) {
      const done = await c.patch(`${w.base}/${collection}/${id}`, { graphX: 100 + i, graphY: -50.5 }, w.dm);
      expect(field(done, "element", "graphX")).toBe(100 + i);
      expect(field(done, "element", "graphY")).toBe(-50.5);
    }
    const tree = await c.get(`${w.base}/tree`, w.dm);
    expect(field(tree, "regions", 0, "areas", 0, "places", 0, "scenes", 0, "graphX")).toBe(103);
  });

  it("can be forgotten, so the element goes back to where the layout puts it", async () => {
    const w = await world("pos-reset");
    const done = await c.patch(`${w.base}/regions/${w.region}`, { graphX: null, graphY: null }, w.dm);
    expect(field(done, "element", "graphX")).toBeNull();
    expect(field(done, "element", "graphY")).toBeNull();
  });

  it("is changed together with other things, and alone", async () => {
    const w = await world("pos-mix");
    const done = await c.patch(`${w.base}/areas/${w.area}`, { name: "Nuova", graphX: 5, graphY: 6 }, w.dm);
    expect(field(done, "element", "name")).toBe("Nuova");
    expect(field(done, "element", "graphX")).toBe(5);
    expect((await c.patch(`${w.base}/areas/${w.area}`, { graphX: 7 }, w.dm)).statusCode).toBe(200);
    expect(field(await c.get(`${w.base}/tree`, w.dm), "regions", 0, "areas", 0, "graphY")).toBe(6);
  });

  it("must be a sensible place: a number, not too far from the middle", async () => {
    const w = await world("pos-bad");
    for (const body of [{ graphX: 1e9 }, { graphY: -1e9 }, { graphX: "a" }]) {
      expect((await c.patch(`${w.base}/regions/${w.region}`, body, w.dm)).statusCode, JSON.stringify(body)).toBe(400);
    }
    expect((await c.post(`${w.base}/regions`, { name: "X", graphX: 1e9 }, w.dm)).statusCode).toBe(400);
  });

  it("is the DM's to change, and a player sees it, so the graph looks the same to everyone", async () => {
    const w = await world("pos-who");
    expect((await c.patch(`${w.base}/regions/${w.region}`, { graphX: 1 }, w.player)).statusCode).toBe(403);
    await c.patch(`${w.base}/regions/${w.region}`, { revealed: true }, w.dm);
    expect(field(await c.get(`${w.base}/tree`, w.player), "regions", 0, "graphX")).toBe(10);
  });
});
