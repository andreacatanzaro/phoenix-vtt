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

/** A world with a DM and a player, and one region > area > place > scene already built. */
async function setup(prefix: string) {
  const dm = await c.signUp(`${prefix}-dm`);
  const player = await c.signUp(`${prefix}-pl`);
  const worldId = idOf(await c.post("/api/worlds", { name: `Mondo ${prefix}` }, dm), "world", "id");
  await c.post(`/api/worlds/${worldId}/members`, { username: `${prefix}-pl` }, dm);
  const base = `/api/worlds/${worldId}`;
  const region = idOf(await c.post(`${base}/regions`, { name: "Regno" }, dm), "element", "id");
  const area = idOf(await c.post(`${base}/areas`, { name: "Foresta", parentId: region }, dm), "element", "id");
  const place = idOf(await c.post(`${base}/places`, { name: "Locanda", parentId: area }, dm), "element", "id");
  const scene = idOf(await c.post(`${base}/scenes`, { name: "Sala comune", parentId: place, dmNotes: "segreto" }, dm), "element", "id");
  return { dm, player, worldId, base, region, area, place, scene };
}

describe("building the world", () => {
  it("creates the four levels, each inside its parent", async () => {
    const w = await setup("build");
    const tree = await c.get(`${w.base}/tree`, w.dm);
    expect(tree.statusCode).toBe(200);
    expect(field(tree, "regions", 0, "name")).toBe("Regno");
    expect(field(tree, "regions", 0, "areas", 0, "name")).toBe("Foresta");
    expect(field(tree, "regions", 0, "areas", 0, "places", 0, "name")).toBe("Locanda");
    expect(field(tree, "regions", 0, "areas", 0, "places", 0, "scenes", 0, "name")).toBe("Sala comune");
  });

  it("trims names and refuses empty or too long ones", async () => {
    const w = await setup("names");
    expect(field(await c.post(`${w.base}/regions`, { name: "  Spazi  " }, w.dm), "element", "name")).toBe("Spazi");
    for (const name of ["", "   ", "x".repeat(121)]) expect((await c.post(`${w.base}/regions`, { name }, w.dm)).statusCode).toBe(400);
  });

  it("a child needs a parent of the right level in the same world", async () => {
    const w = await setup("parents");
    const other = await setup("parents2");
    const err = async (path: string, body: unknown): Promise<unknown> => {
      const r = await c.post(`${w.base}/${path}`, body, w.dm);
      expect(r.statusCode).toBe(400);
      return field(r, "error");
    };
    expect(await err("areas", { name: "x" })).toBe("errors.world.parent-invalid");
    expect(await err("areas", { name: "x", parentId: w.place })).toBe("errors.world.parent-invalid");
    expect(await err("areas", { name: "x", parentId: other.region })).toBe("errors.world.parent-invalid");
    expect(await err("places", { name: "x", parentId: w.region })).toBe("errors.world.parent-invalid");
    expect(await err("scenes", { name: "x", parentId: w.area })).toBe("errors.world.parent-invalid");
    expect(await err("regions", { name: "x", parentId: w.region })).toBe("errors.world.parent-invalid");
  });

  it("renames, edits and reveals an element", async () => {
    const w = await setup("edit");
    const r = await c.patch(`${w.base}/scenes/${w.scene}`, { name: "Sala grande", description: "Un grande camino", revealed: true }, w.dm);
    expect(r.statusCode).toBe(200);
    expect(field(r, "element")).toMatchObject({ name: "Sala grande", description: "Un grande camino", revealed: true, dmNotes: "segreto" });
  });

  it("refuses an empty edit or a bad field", async () => {
    const w = await setup("badedit");
    expect((await c.patch(`${w.base}/scenes/${w.scene}`, {}, w.dm)).statusCode).toBe(400);
    expect((await c.patch(`${w.base}/scenes/${w.scene}`, { revealed: "si" }, w.dm)).statusCode).toBe(400);
  });

  it("an element of another world cannot be edited through this one", async () => {
    const w = await setup("mine");
    const other = await setup("theirs");
    expect((await c.patch(`${w.base}/scenes/${other.scene}`, { name: "x" }, w.dm)).statusCode).toBe(404);
    expect((await c.del(`${w.base}/scenes/${other.scene}`, w.dm)).statusCode).toBe(404);
  });

  it("deletes only what holds nothing", async () => {
    const w = await setup("delete");
    for (const [path, id] of [["regions", w.region], ["areas", w.area], ["places", w.place]] as const) {
      const r = await c.del(`${w.base}/${path}/${id}`, w.dm);
      expect(r.statusCode).toBe(409);
      expect(field(r, "error")).toBe("errors.world.not-empty");
    }
    expect((await c.del(`${w.base}/scenes/${w.scene}`, w.dm)).statusCode).toBe(204);
    expect((await c.del(`${w.base}/places/${w.place}`, w.dm)).statusCode).toBe(204);
    expect((await c.del(`${w.base}/areas/${w.area}`, w.dm)).statusCode).toBe(204);
    expect((await c.del(`${w.base}/regions/${w.region}`, w.dm)).statusCode).toBe(204);
    expect((await c.del(`${w.base}/regions/${w.region}`, w.dm)).statusCode).toBe(404);
  });

  it("an unknown level or a bad id is a 404", async () => {
    const w = await setup("unknown");
    expect((await c.post(`${w.base}/castelli`, { name: "x" }, w.dm)).statusCode).toBe(404);
    expect((await c.patch(`${w.base}/scenes/non-un-uuid`, { name: "x" }, w.dm)).statusCode).toBe(404);
  });
});

describe("what a player sees", () => {
  it("nothing is revealed at first, and a player sees an empty tree", async () => {
    const w = await setup("hidden");
    const tree = await c.get(`${w.base}/tree`, w.player);
    expect(tree.statusCode).toBe(200);
    expect(field(tree, "regions")).toEqual([]);
  });

  it("an element shows only when it and all its ancestors are revealed", async () => {
    const w = await setup("reveal");
    await c.patch(`${w.base}/scenes/${w.scene}`, { revealed: true }, w.dm);
    expect(field(await c.get(`${w.base}/tree`, w.player), "regions")).toEqual([]);
    for (const [path, id] of [["regions", w.region], ["areas", w.area], ["places", w.place]] as const) await c.patch(`${w.base}/${path}/${id}`, { revealed: true }, w.dm);
    const tree = await c.get(`${w.base}/tree`, w.player);
    expect(field(tree, "regions", 0, "areas", 0, "places", 0, "scenes", 0, "name")).toBe("Sala comune");
  });

  it("hiding a parent hides everything under it, and keeps what was revealed below", async () => {
    const w = await setup("rehide");
    for (const [path, id] of [["regions", w.region], ["areas", w.area], ["places", w.place], ["scenes", w.scene]] as const) await c.patch(`${w.base}/${path}/${id}`, { revealed: true }, w.dm);
    await c.patch(`${w.base}/areas/${w.area}`, { revealed: false }, w.dm);
    expect(field(await c.get(`${w.base}/tree`, w.player), "regions", 0, "areas")).toEqual([]);
    await c.patch(`${w.base}/areas/${w.area}`, { revealed: true }, w.dm);
    expect(field(await c.get(`${w.base}/tree`, w.player), "regions", 0, "areas", 0, "places", 0, "scenes", 0, "revealed")).toBe(true);
  });

  it("a player never receives the DM's notes, but the DM does", async () => {
    const w = await setup("notes");
    for (const [path, id] of [["regions", w.region], ["areas", w.area], ["places", w.place], ["scenes", w.scene]] as const) await c.patch(`${w.base}/${path}/${id}`, { revealed: true }, w.dm);
    const forPlayer = await c.get(`${w.base}/tree`, w.player);
    expect(JSON.stringify(forPlayer.json())).not.toContain("segreto");
    expect(JSON.stringify(forPlayer.json())).not.toContain("dmNotes");
    expect(field(await c.get(`${w.base}/tree`, w.dm), "regions", 0, "areas", 0, "places", 0, "scenes", 0, "dmNotes")).toBe("segreto");
  });

  it("a player cannot build, edit, delete or link", async () => {
    const w = await setup("nope");
    const second = idOf(await c.post(`${w.base}/scenes`, { name: "Altra", parentId: w.place }, w.dm), "element", "id");
    const attempts = [
      await c.post(`${w.base}/regions`, { name: "x" }, w.player),
      await c.patch(`${w.base}/scenes/${w.scene}`, { revealed: true }, w.player),
      await c.del(`${w.base}/scenes/${w.scene}`, w.player),
      await c.post(`${w.base}/scene-links`, { fromSceneId: w.scene, toSceneId: second }, w.player),
      await c.get(`${w.base}/scene-links`, w.player),
    ];
    for (const r of attempts) {
      expect(r.statusCode).toBe(403);
      expect(field(r, "error")).toBe("errors.forbidden");
    }
  });

  it("a stranger and an anonymous visitor get nothing", async () => {
    const w = await setup("strange");
    const stranger = await c.signUp("strange-out");
    expect((await c.get(`${w.base}/tree`, stranger)).statusCode).toBe(404);
    expect((await c.post(`${w.base}/regions`, { name: "x" }, stranger)).statusCode).toBe(404);
    expect((await c.get(`${w.base}/tree`)).statusCode).toBe(401);
  });
});

describe("links between scenes", () => {
  async function twoScenesApart(prefix: string) {
    const w = await setup(prefix);
    const region2 = idOf(await c.post(`${w.base}/regions`, { name: "Altro regno" }, w.dm), "element", "id");
    const area2 = idOf(await c.post(`${w.base}/areas`, { name: "Monti", parentId: region2 }, w.dm), "element", "id");
    const place2 = idOf(await c.post(`${w.base}/places`, { name: "Rifugio", parentId: area2 }, w.dm), "element", "id");
    const far = idOf(await c.post(`${w.base}/scenes`, { name: "Cima", parentId: place2 }, w.dm), "element", "id");
    return { ...w, far };
  }

  it("links scenes of different places, areas and regions, and lists the link", async () => {
    const w = await twoScenesApart("link");
    const r = await c.post(`${w.base}/scene-links`, { fromSceneId: w.scene, toSceneId: w.far, label: "Sentiero" }, w.dm);
    expect(r.statusCode).toBe(201);
    expect(field(r, "link")).toMatchObject({ fromSceneId: w.scene, toSceneId: w.far, label: "Sentiero" });
    expect(field(await c.get(`${w.base}/scene-links`, w.dm), "links")).toHaveLength(1);
  });

  it("a scene can have several exits, and a pair can be linked both ways", async () => {
    const w = await twoScenesApart("exits");
    const third = idOf(await c.post(`${w.base}/scenes`, { name: "Cantina", parentId: w.place }, w.dm), "element", "id");
    for (const [from, to] of [[w.scene, w.far], [w.scene, third], [w.far, w.scene]] as const) {
      expect((await c.post(`${w.base}/scene-links`, { fromSceneId: from, toSceneId: to }, w.dm)).statusCode).toBe(201);
    }
    expect(field(await c.get(`${w.base}/scene-links`, w.dm), "links")).toHaveLength(3);
  });

  it("refuses a link to itself, a repeated link, and a scene of another world", async () => {
    const w = await twoScenesApart("bad");
    const other = await setup("bad2");
    const link = (from: string, to: string) => c.post(`${w.base}/scene-links`, { fromSceneId: from, toSceneId: to }, w.dm);
    const self = await link(w.scene, w.scene);
    expect(self.statusCode).toBe(400);
    expect(field(self, "error")).toBe("errors.world.link-invalid");
    expect((await link(w.scene, w.far)).statusCode).toBe(201);
    const again = await link(w.scene, w.far);
    expect(again.statusCode).toBe(409);
    expect(field(again, "error")).toBe("errors.world.link-exists");
    expect((await link(w.scene, other.scene)).statusCode).toBe(400);
    expect((await link(w.scene, "00000000-0000-4000-8000-000000000000")).statusCode).toBe(400);
  });

  it("deleting a scene removes its links, and a link can be removed on its own", async () => {
    const w = await twoScenesApart("cascade");
    const linkId = idOf(await c.post(`${w.base}/scene-links`, { fromSceneId: w.scene, toSceneId: w.far }, w.dm), "link", "id");
    await c.post(`${w.base}/scene-links`, { fromSceneId: w.far, toSceneId: w.scene }, w.dm);
    expect((await c.del(`${w.base}/scene-links/${linkId}`, w.dm)).statusCode).toBe(204);
    expect((await c.del(`${w.base}/scene-links/${linkId}`, w.dm)).statusCode).toBe(404);
    expect((await c.del(`${w.base}/scenes/${w.far}`, w.dm)).statusCode).toBe(204);
    expect(field(await c.get(`${w.base}/scene-links`, w.dm), "links")).toEqual([]);
  });
});
