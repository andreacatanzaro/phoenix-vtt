import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { areas } from "./db/schema";
import { reclaimImages } from "./image-gc";
import { atlasQueueKey } from "./world-tree";
import { createTestApp, fakePng, field, idOf, makeClient, type TestApp } from "./test-support";

let t: TestApp;
let c: ReturnType<typeof makeClient>;
beforeAll(async () => {
  t = await createTestApp();
  c = makeClient(t.app);
});
afterAll(async () => {
  await t.close();
});

const square = [{ x: 0.1, y: 0.1 }, { x: 0.6, y: 0.1 }, { x: 0.6, y: 0.6 }, { x: 0.1, y: 0.6 }];

async function world(prefix: string) {
  const dm = await c.signUp(`${prefix}-dm`);
  const player = await c.signUp(`${prefix}-pl`);
  const worldId = idOf(await c.post("/api/worlds", { name: "Mondo" }, dm), "world", "id");
  const base = `/api/worlds/${worldId}`;
  await c.post(`${base}/members`, { username: `${prefix}-pl` }, dm);
  return { dm, player, worldId, base };
}
type World = Awaited<ReturnType<typeof world>>;

async function map(w: World, token = w.dm, kind = "map"): Promise<string> {
  const r = await t.app.inject({ method: "POST", url: `${w.base}/images?kind=${kind}`, payload: fakePng(1000, 800), headers: { "content-type": "image/png" }, cookies: { phoenix_session: token } });
  return idOf({ statusCode: r.statusCode, json: (): unknown => r.json(), cookies: [] }, "image", "id");
}

/** An area made before the maps: in the world, with no shape, under a region that may have a map now. */
async function insertArea(w: World, regionId: string): Promise<string> {
  const [row] = await t.db.insert(areas).values({ worldId: w.worldId, regionId, name: "Vecchia", description: "", dmNotes: "" }).returning({ id: areas.id });
  if (row === undefined) throw new Error("no area");
  return row.id;
}

const create = async (w: World, collection: string, body: Record<string, unknown>): Promise<string> => idOf(await c.post(`${w.base}/${collection}`, { name: "X", ...body }, w.dm), "element", "id");
const update = (w: World, collection: string, id: string, body: Record<string, unknown>) => c.patch(`${w.base}/${collection}/${id}`, body, w.dm);

/** A region with a map and an area drawn on it. */
async function mapped(prefix: string) {
  const w = await world(prefix);
  const region = await create(w, "regions", {});
  const regionMap = await map(w);
  await update(w, "regions", region, { mapImageId: regionMap });
  const area = await create(w, "areas", { parentId: region, polygon: square });
  return { w, region, regionMap, area };
}

describe("the map of a region", () => {
  it("is set and taken away, and the tree says which it is", async () => {
    const w = await world("rmap");
    const region = await create(w, "regions", {});
    expect(field(await c.get(`${w.base}/tree`, w.dm), "regions", 0, "mapImageId")).toBeNull();
    const image = await map(w);
    const done = await update(w, "regions", region, { mapImageId: image });
    expect(field(done, "element", "mapImageId")).toBe(image);
    expect(field(await c.get(`${w.base}/tree`, w.dm), "regions", 0, "mapImageId")).toBe(image);
    expect(field(await update(w, "regions", region, { mapImageId: null }), "element", "mapImageId")).toBeNull();
  });

  it("must be a map of this world: a picture of another world, a token picture or an unknown id are refused", async () => {
    const w = await world("rbad");
    const other = await world("rbad2");
    const region = await create(w, "regions", {});
    expect((await update(w, "regions", region, { mapImageId: await map(other, other.dm) })).statusCode).toBe(400);
    expect((await update(w, "regions", region, { mapImageId: await map(w, w.dm, "token") })).statusCode).toBe(400);
    expect((await update(w, "regions", region, { mapImageId: "00000000-0000-4000-8000-000000000000" })).statusCode).toBe(400);
  });

  it("cannot be taken away while areas are drawn on it", async () => {
    const { w, region } = await mapped("rkeep");
    const refused = await update(w, "regions", region, { mapImageId: null });
    expect(refused.statusCode).toBe(409);
    expect(field(refused, "error")).toBe("errors.world.map-in-use");
  });

  it("can be replaced by another map: what is drawn on it is a fraction of its size and stays", async () => {
    const { w, region, area } = await mapped("rswap");
    const other = await map(w);
    expect(field(await update(w, "regions", region, { mapImageId: other }), "element", "mapImageId")).toBe(other);
    expect(field(await c.get(`${w.base}/tree`, w.dm), "regions", 0, "areas", 0, "polygon", 0, "x")).toBe(0.1);
    expect(area).toBeTruthy();
  });

  it("only regions and places have a map", async () => {
    const { w, area } = await mapped("ronly");
    expect((await update(w, "areas", area, { mapImageId: await map(w) })).statusCode).toBe(400);
  });
});

describe("the areas of a region", () => {
  it("are drawn on the map of the region, and born with their shape", async () => {
    const { w } = await mapped("area");
    const tree = await c.get(`${w.base}/tree`, w.dm);
    expect(field(tree, "regions", 0, "areas", 0, "polygon")).toEqual(square);
  });

  it("need the region to have a map first", async () => {
    const w = await world("anomap");
    const region = await create(w, "regions", {});
    const refused = await c.post(`${w.base}/areas`, { name: "X", parentId: region, polygon: square }, w.dm);
    expect(refused.statusCode).toBe(400);
    expect(field(refused, "error")).toBe("errors.world.placement-invalid");
  });

  it("must have a sensible shape: three to sixty-four points, all on the map", async () => {
    const { w, region } = await mapped("ashape");
    const tooFew = [{ x: 0, y: 0 }, { x: 1, y: 1 }];
    const outside = [{ x: 0, y: 0 }, { x: 1.5, y: 0 }, { x: 1, y: 1 }];
    const many = Array.from({ length: 65 }, (_, i) => ({ x: (i % 10) / 10, y: Math.floor(i / 10) / 10 }));
    for (const polygon of [tooFew, outside, many]) expect((await c.post(`${w.base}/areas`, { name: "X", parentId: region, polygon }, w.dm)).statusCode).toBe(400);
  });

  it("can be redrawn, and taken off the map (it goes back to the list of what is to be placed)", async () => {
    const { w, area } = await mapped("aredo");
    const triangle = [{ x: 0.2, y: 0.2 }, { x: 0.9, y: 0.2 }, { x: 0.5, y: 0.9 }];
    expect(field(await update(w, "areas", area, { polygon: triangle }), "element", "polygon")).toEqual(triangle);
    expect(field(await update(w, "areas", area, { polygon: null }), "element", "polygon")).toBeNull();
  });

  it("can be created without a shape: that is how what was made before the maps is kept, waiting to be placed", async () => {
    const w = await world("aold");
    const region = await create(w, "regions", {});
    await create(w, "areas", { parentId: region });
    expect(field(await c.get(`${w.base}/tree`, w.dm), "regions", 0, "areas", 0, "polygon")).toBeNull();
  });

  it("cannot be redrawn so that a place falls outside, nor taken off the map while it has places", async () => {
    const { w, area } = await mapped("apin");
    await create(w, "places", { parentId: area, pin: { x: 0.3, y: 0.3 } });
    const small = [{ x: 0.1, y: 0.1 }, { x: 0.2, y: 0.1 }, { x: 0.2, y: 0.2 }];
    const refused = await update(w, "areas", area, { polygon: small });
    expect(refused.statusCode).toBe(409);
    expect(field(refused, "error")).toBe("errors.world.pins-outside");
    expect((await update(w, "areas", area, { polygon: null })).statusCode).toBe(409);
    const bigger = [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 }];
    expect((await update(w, "areas", area, { polygon: bigger })).statusCode).toBe(200);
  });
});

describe("the places of an area", () => {
  it("are pins inside the area, on the map of the region", async () => {
    const { w, area } = await mapped("place");
    const place = await create(w, "places", { parentId: area, pin: { x: 0.3, y: 0.4 } });
    expect(place).toBeTruthy();
    expect(field(await c.get(`${w.base}/tree`, w.dm), "regions", 0, "areas", 0, "places", 0, "pin")).toEqual({ x: 0.3, y: 0.4 });
  });

  it("are refused outside the area, and in an area that is not on the map", async () => {
    const { w, region, area } = await mapped("pout");
    const refused = await c.post(`${w.base}/places`, { name: "X", parentId: area, pin: { x: 0.9, y: 0.9 } }, w.dm);
    expect(refused.statusCode).toBe(400);
    expect(field(refused, "error")).toBe("errors.world.placement-invalid");
    const loose = await insertArea(w, region);
    expect((await c.post(`${w.base}/places`, { name: "X", parentId: loose, pin: { x: 0.3, y: 0.3 } }, w.dm)).statusCode).toBe(400);
  });

  it("are moved inside the area, not out of it, and taken off the map", async () => {
    const { w, area } = await mapped("pmove");
    const place = await create(w, "places", { parentId: area, pin: { x: 0.3, y: 0.3 } });
    expect(field(await update(w, "places", place, { pin: { x: 0.5, y: 0.5 } }), "element", "pin")).toEqual({ x: 0.5, y: 0.5 });
    expect((await update(w, "places", place, { pin: { x: 0.95, y: 0.95 } })).statusCode).toBe(400);
    expect(field(await update(w, "places", place, { pin: null }), "element", "pin")).toBeNull();
  });

  it("have a map of their own, which cannot be taken away while scenes are pinned on it", async () => {
    const { w, area } = await mapped("pmap");
    const place = await create(w, "places", { parentId: area, pin: { x: 0.3, y: 0.3 } });
    const image = await map(w);
    expect(field(await update(w, "places", place, { mapImageId: image }), "element", "mapImageId")).toBe(image);
    await create(w, "scenes", { parentId: place, pin: { x: 0.5, y: 0.5 } });
    const refused = await update(w, "places", place, { mapImageId: null });
    expect(refused.statusCode).toBe(409);
    expect(field(refused, "error")).toBe("errors.world.map-in-use");
  });
});

describe("the scenes of a place", () => {
  async function placed(prefix: string) {
    const m = await mapped(prefix);
    const place = await create(m.w, "places", { parentId: m.area, pin: { x: 0.3, y: 0.3 } });
    await update(m.w, "places", place, { mapImageId: await map(m.w) });
    return { ...m, place };
  }

  it("are pins on the map of the place", async () => {
    const { w, place } = await placed("scene");
    await create(w, "scenes", { parentId: place, pin: { x: 0.7, y: 0.2 } });
    expect(field(await c.get(`${w.base}/tree`, w.dm), "regions", 0, "areas", 0, "places", 0, "scenes", 0, "pin")).toEqual({ x: 0.7, y: 0.2 });
  });

  it("need the place to have a map, and a pin on it", async () => {
    const { w, area } = await mapped("snomap");
    const bare = await create(w, "places", { parentId: area, pin: { x: 0.3, y: 0.3 } });
    const refused = await c.post(`${w.base}/scenes`, { name: "X", parentId: bare, pin: { x: 0.5, y: 0.5 } }, w.dm);
    expect(refused.statusCode).toBe(400);
    expect(field(refused, "error")).toBe("errors.world.placement-invalid");
    const { w: w2, place } = await placed("sbad");
    expect((await c.post(`${w2.base}/scenes`, { name: "X", parentId: place, pin: { x: 1.2, y: 0.5 } }, w2.dm)).statusCode).toBe(400);
  });

  it("move on the map and come off it", async () => {
    const { w, place } = await placed("smove");
    const scene = await create(w, "scenes", { parentId: place, pin: { x: 0.1, y: 0.1 } });
    expect(field(await update(w, "scenes", scene, { pin: { x: 0.8, y: 0.9 } }), "element", "pin")).toEqual({ x: 0.8, y: 0.9 });
    expect(field(await update(w, "scenes", scene, { pin: null }), "element", "pin")).toBeNull();
  });

  it("only places and scenes have a pin; regions and areas do not", async () => {
    const { w, region, area } = await mapped("pinonly");
    expect((await update(w, "regions", region, { pin: { x: 0.5, y: 0.5 } })).statusCode).toBe(400);
    expect((await update(w, "areas", area, { pin: { x: 0.5, y: 0.5 } })).statusCode).toBe(400);
  });
});

describe("placing is required where there is a map to place on", () => {
  it("an area made under a region with a map needs its shape; under a region without one it needs none", async () => {
    const { w, region } = await mapped("req-area");
    const refused = await c.post(`${w.base}/areas`, { name: "X", parentId: region }, w.dm);
    expect(refused.statusCode).toBe(400);
    expect(field(refused, "error")).toBe("errors.world.placement-required");
    const bare = await world("req-area2");
    const loose = await create(bare, "regions", {});
    expect((await c.post(`${bare.base}/areas`, { name: "X", parentId: loose }, bare.dm)).statusCode).toBe(201);
  });

  it("a place made in an area that is drawn needs its pin; in an area that is not drawn it needs none", async () => {
    const { w, area, region } = await mapped("req-place");
    const refused = await c.post(`${w.base}/places`, { name: "X", parentId: area }, w.dm);
    expect(refused.statusCode).toBe(400);
    expect(field(refused, "error")).toBe("errors.world.placement-required");
    const undrawn = await insertArea(w, region);
    expect((await c.post(`${w.base}/places`, { name: "X", parentId: undrawn }, w.dm)).statusCode).toBe(201);
  });

  it("a scene made in a place with a map needs its pin; in a place without one it needs none", async () => {
    const { w, area } = await mapped("req-scene");
    const withMap = await create(w, "places", { parentId: area, pin: { x: 0.3, y: 0.3 } });
    await update(w, "places", withMap, { mapImageId: await map(w) });
    const refused = await c.post(`${w.base}/scenes`, { name: "X", parentId: withMap }, w.dm);
    expect(refused.statusCode).toBe(400);
    expect(field(refused, "error")).toBe("errors.world.placement-required");
    const without = await create(w, "places", { parentId: area, pin: { x: 0.4, y: 0.4 } });
    expect((await c.post(`${w.base}/scenes`, { name: "X", parentId: without }, w.dm)).statusCode).toBe(201);
  });

  it("what was made before stays as it is: an unplaced element under a map can still be changed", async () => {
    const { w, region } = await mapped("req-old");
    const old = await insertArea(w, region);
    expect(field(await update(w, "areas", old, { name: "Rinominata" }), "element", "name")).toBe("Rinominata");
  });
});

describe("changes made at the same time", () => {
  /** Holds the line of changes to the structure of this world, so what asked for a turn after it has to wait. */
  function hold(worldId: string): { release: () => void; done: Promise<void> } {
    let release: () => void = () => undefined;
    const done = t.hub.serial(atlasQueueKey(worldId), () => new Promise<void>((resolve) => { release = resolve; }));
    return { release: () => { release(); }, done };
  }
  const waits = async (request: Promise<unknown>): Promise<boolean> => (await Promise.race([request.then(() => "answered"), new Promise((resolve) => setTimeout(() => { resolve("waiting"); }, 250))])) === "waiting";

  it("a change to the shape of an area waits for the change before it, so each is checked against what the other left", async () => {
    const { w, area } = await mapped("queue1");
    const gate = hold(w.worldId);
    const small = [{ x: 0.1, y: 0.1 }, { x: 0.3, y: 0.1 }, { x: 0.3, y: 0.3 }, { x: 0.1, y: 0.3 }];
    const change = update(w, "areas", area, { polygon: small });
    expect(await waits(change)).toBe(true);
    gate.release();
    await gate.done;
    expect((await change).statusCode).toBe(200);
  });

  it("creating something placed waits too, and so does taking a map away", async () => {
    const m = await mapped("queue2");
    const gate = hold(m.w.worldId);
    const creating = c.post(`${m.w.base}/places`, { name: "X", parentId: m.area, pin: { x: 0.3, y: 0.3 } }, m.w.dm);
    const removing = update(m.w, "regions", m.region, { mapImageId: null });
    expect(await waits(creating)).toBe(true);
    expect(await waits(removing)).toBe(true);
    gate.release();
    await gate.done;
    // In the order asked: the place was created first, so the map, now with an area drawn on it, cannot go.
    expect((await creating).statusCode).toBe(201);
    expect((await removing).statusCode).toBe(409);
  });

  it("the changes of one world do not hold up another", async () => {
    const one = await world("queue3");
    const two = await mapped("queue4");
    const gate = hold(one.worldId);
    const free = await update(two.w, "areas", two.area, { name: "Altro" });
    expect(free.statusCode).toBe(200);
    gate.release();
    await gate.done;
  });
});

describe("what players get", () => {
  async function revealedAll(prefix: string) {
    const m = await mapped(prefix);
    const { w } = m;
    const place = await create(w, "places", { parentId: m.area, pin: { x: 0.3, y: 0.3 } });
    const placeMap = await map(w);
    await update(w, "places", place, { mapImageId: placeMap });
    const scene = await create(w, "scenes", { parentId: place, pin: { x: 0.5, y: 0.5 } });
    for (const [collection, id] of [["regions", m.region], ["areas", m.area], ["places", place], ["scenes", scene]] as const) await update(w, collection, id, { revealed: true });
    return { ...m, place, placeMap, scene };
  }

  it("a player sees the maps, the shapes and the pins of what is revealed", async () => {
    const m = await revealedAll("pl-see");
    const tree = await c.get(`${m.w.base}/tree`, m.w.player);
    expect(field(tree, "regions", 0, "mapImageId")).toBe(m.regionMap);
    expect(field(tree, "regions", 0, "areas", 0, "polygon")).toEqual(square);
    expect(field(tree, "regions", 0, "areas", 0, "places", 0, "pin")).toEqual({ x: 0.3, y: 0.3 });
    expect(field(tree, "regions", 0, "areas", 0, "places", 0, "mapImageId")).toBe(m.placeMap);
    expect(field(tree, "regions", 0, "areas", 0, "places", 0, "scenes", 0, "pin")).toEqual({ x: 0.5, y: 0.5 });
  });

  it("a hidden element is not sent at all, with its pin and its map, nor what is inside it", async () => {
    const m = await revealedAll("pl-hide");
    await update(m.w, "places", m.place, { revealed: false });
    const tree = await c.get(`${m.w.base}/tree`, m.w.player);
    expect(field(tree, "regions", 0, "areas", 0, "places")).toEqual([]);
    expect(JSON.stringify(tree.json())).not.toContain(m.placeMap);
    await update(m.w, "regions", m.region, { revealed: false });
    expect(field(await c.get(`${m.w.base}/tree`, m.w.player), "regions")).toEqual([]);
  });

  it("a player downloads the map of a revealed region and place, and not of a hidden one", async () => {
    const m = await revealedAll("pl-img");
    const get = (id: string, token: string) => t.app.inject({ method: "GET", url: `${m.w.base}/images/${id}`, cookies: { phoenix_session: token } });
    expect((await get(m.regionMap, m.w.player)).statusCode).toBe(200);
    expect((await get(m.placeMap, m.w.player)).statusCode).toBe(200);
    await update(m.w, "places", m.place, { revealed: false });
    expect((await get(m.placeMap, m.w.player)).statusCode).toBe(404);
    expect((await get(m.placeMap, m.w.dm)).statusCode).toBe(200);
    await update(m.w, "regions", m.region, { revealed: false });
    expect((await get(m.regionMap, m.w.player)).statusCode).toBe(404);
  });

  it("a map is not for players when something above it is hidden, even if its own place is revealed", async () => {
    const m = await revealedAll("pl-up");
    await update(m.w, "areas", m.area, { revealed: false });
    const r = await t.app.inject({ method: "GET", url: `${m.w.base}/images/${m.placeMap}`, cookies: { phoenix_session: m.w.player } });
    expect(r.statusCode).toBe(404);
  });

  it("the DM's notes still never reach a player", async () => {
    const m = await revealedAll("pl-notes");
    await update(m.w, "areas", m.area, { dmNotes: "trappola" });
    expect(JSON.stringify((await c.get(`${m.w.base}/tree`, m.w.player)).json())).not.toContain("trappola");
  });
});

describe("the pictures of the atlas and the cleaning of unused ones", () => {
  it("a map used by a region or a place is kept, even long after it was uploaded", async () => {
    const m = await mapped("gc");
    const place = await create(m.w, "places", { parentId: m.area, pin: { x: 0.3, y: 0.3 } });
    const placeMap = await map(m.w);
    await update(m.w, "places", place, { mapImageId: placeMap });
    const lonely = await map(m.w);
    const later = new Date(Date.now() + 3 * 3600_000);
    await reclaimImages(t.db, t.images, later);
    const get = (id: string) => t.app.inject({ method: "GET", url: `${m.w.base}/images/${id}`, cookies: { phoenix_session: m.w.dm } });
    expect((await get(m.regionMap)).statusCode).toBe(200);
    expect((await get(placeMap)).statusCode).toBe(200);
    expect((await get(lonely)).statusCode).toBe(404);
  });

  it("a map that no region or place uses any more is cleaned away", async () => {
    const m = await mapped("gc2");
    const spare = await map(m.w);
    await update(m.w, "regions", m.region, { mapImageId: spare });
    await reclaimImages(t.db, t.images, new Date(Date.now() + 3 * 3600_000));
    const r = await t.app.inject({ method: "GET", url: `${m.w.base}/images/${m.regionMap}`, cookies: { phoenix_session: m.w.dm } });
    expect(r.statusCode).toBe(404);
  });
});
