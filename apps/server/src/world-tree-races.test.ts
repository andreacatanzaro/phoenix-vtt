import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { createTestApp, idOf, makeClient, type TestApp } from "./test-support";
import { createElement, deleteElement } from "./world-tree";

let t: TestApp;
let c: ReturnType<typeof makeClient>;
beforeAll(async () => {
  t = await createTestApp();
  c = makeClient(t.app);
});
afterEach(() => {
  vi.restoreAllMocks();
});
afterAll(async () => {
  await t.close();
});

const foreignKeyError = (): Error => Object.assign(new Error("violates foreign key constraint"), { code: "23503" });

async function world(prefix: string) {
  const dm = await c.signUp(`${prefix}-dm`);
  const worldId = idOf(await c.post("/api/worlds", { name: "Mondo" }, dm), "world", "id");
  const base = `/api/worlds/${worldId}`;
  const region = idOf(await c.post(`${base}/regions`, { name: "R" }, dm), "element", "id");
  const area = idOf(await c.post(`${base}/areas`, { name: "A", parentId: region }, dm), "element", "id");
  const place = idOf(await c.post(`${base}/places`, { name: "L", parentId: area }, dm), "element", "id");
  // One empty element of each level, so a delete reaches the database instead of stopping at "not empty".
  const emptyRegion = idOf(await c.post(`${base}/regions`, { name: "R vuota" }, dm), "element", "id");
  const emptyArea = idOf(await c.post(`${base}/areas`, { name: "A vuota", parentId: region }, dm), "element", "id");
  const emptyPlace = idOf(await c.post(`${base}/places`, { name: "L vuoto", parentId: area }, dm), "element", "id");
  return { worldId, region, area, place, emptyRegion, emptyArea, emptyPlace };
}

describe("a child is added while its parent is being deleted", () => {
  it("the insert that the database refuses is 'no such parent', not a server error", async () => {
    const w = await world("insert");
    for (const [collection, parentId] of [["areas", w.region], ["places", w.area], ["scenes", w.place]] as const) {
      vi.spyOn(t.db, "insert").mockImplementationOnce(() => { throw foreignKeyError(); });
      expect(await createElement(t.db, w.worldId, collection, { name: "X", description: "", dmNotes: "", parentId })).toBe("parent-invalid");
    }
  });

  it("any other database failure is still a failure", async () => {
    const w = await world("other");
    vi.spyOn(t.db, "insert").mockImplementationOnce(() => { throw new Error("disk full"); });
    await expect(createElement(t.db, w.worldId, "areas", { name: "X", description: "", dmNotes: "", parentId: w.region })).rejects.toThrow("disk full");
  });

  it("the delete that the database refuses is 'not empty', for every level", async () => {
    const w = await world("delete");
    for (const [collection, id] of [["regions", w.emptyRegion], ["areas", w.emptyArea], ["places", w.emptyPlace]] as const) {
      vi.spyOn(t.db, "delete").mockImplementationOnce(() => { throw foreignKeyError(); });
      expect(await deleteElement(t.db, w.worldId, collection, id)).toBe("not-empty");
    }
  });

  it("a wrapped error from the ORM is recognised too, and other failures pass through", async () => {
    const w = await world("wrapped");
    vi.spyOn(t.db, "delete").mockImplementationOnce(() => { throw new Error("query failed", { cause: foreignKeyError() }); });
    expect(await deleteElement(t.db, w.worldId, "places", w.emptyPlace)).toBe("not-empty");
    vi.spyOn(t.db, "delete").mockImplementationOnce(() => { throw new Error("disk full"); });
    await expect(deleteElement(t.db, w.worldId, "places", w.emptyPlace)).rejects.toThrow("disk full");
  });
});
