import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { images } from "./db/schema";
import { IMAGE_GRACE_MS, IMAGE_SWEEP_MS, reclaimImages, startImageSweep } from "./image-gc";
import type { ImageStore } from "./image-store";
import { createTestApp, fakePng, idOf, makeClient, type TestApp } from "./test-support";

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
  const worldId = idOf(await c.post("/api/worlds", { name: "Mondo" }, dm), "world", "id");
  const base = `/api/worlds/${worldId}`;
  const region = idOf(await c.post(`${base}/regions`, { name: "R" }, dm), "element", "id");
  const area = idOf(await c.post(`${base}/areas`, { name: "A", parentId: region }, dm), "element", "id");
  const place = idOf(await c.post(`${base}/places`, { name: "L", parentId: area }, dm), "element", "id");
  const scene = idOf(await c.post(`${base}/scenes`, { name: "Sala", parentId: place }, dm), "element", "id");
  const upload = async (kind: "map" | "token"): Promise<string> => {
    const r = await t.app.inject({ method: "POST", url: `${base}/images?kind=${kind}`, payload: fakePng(100, 100), headers: { "content-type": "image/png" }, cookies: { phoenix_session: dm } });
    return idOf({ statusCode: r.statusCode, json: (): unknown => r.json(), cookies: [] }, "image", "id");
  };
  return { dm, base, scene, upload };
}

const exists = async (id: string): Promise<boolean> => (await t.db.select({ id: images.id }).from(images).where(eq(images.id, id))).length > 0;
const later = (ms: number): void => { t.clock.now = new Date(t.clock.now.getTime() + ms); };

describe("reclaiming pictures", () => {
  it("keeps a picture that was just uploaded, so there is time to attach it", async () => {
    const w = await world("fresh");
    const id = await w.upload("map");
    expect(await reclaimImages(t.db, t.images, t.clock.now)).toBe(0);
    expect(await exists(id)).toBe(true);
    expect(await t.images.get(id)).not.toBeNull();
  });

  it("removes the row and the file of an old picture nothing uses", async () => {
    const w = await world("old");
    const id = await w.upload("token");
    later(IMAGE_GRACE_MS + 1000);
    expect(await reclaimImages(t.db, t.images, t.clock.now)).toBeGreaterThanOrEqual(1);
    expect(await exists(id)).toBe(false);
    expect(await t.images.get(id)).toBeNull();
  });

  it("keeps an old picture while a scene uses it as its map", async () => {
    const w = await world("usedmap");
    const id = await w.upload("map");
    await c.patch(`${w.base}/scenes/${w.scene}/table`, { mapImageId: id }, w.dm);
    later(IMAGE_GRACE_MS * 3);
    await reclaimImages(t.db, t.images, t.clock.now);
    expect(await exists(id)).toBe(true);
    expect(await t.images.get(id)).not.toBeNull();
  });

  it("replacing a map frees the old one once the grace time has passed", async () => {
    const w = await world("replace");
    const first = await w.upload("map");
    await c.patch(`${w.base}/scenes/${w.scene}/table`, { mapImageId: first }, w.dm);
    const second = await w.upload("map");
    await c.patch(`${w.base}/scenes/${w.scene}/table`, { mapImageId: second }, w.dm);
    // Too soon: the old one is only just unused.
    expect(await exists(first)).toBe(true);
    later(IMAGE_GRACE_MS + 1000);
    // Saving the scene again is enough to sweep.
    await c.patch(`${w.base}/scenes/${w.scene}/table`, { gridPx: 80 }, w.dm);
    expect(await exists(first)).toBe(false);
    expect(await t.images.get(first)).toBeNull();
    expect(await exists(second)).toBe(true);
  });

  it("deleting a scene frees its map", async () => {
    const w = await world("delscene");
    const id = await w.upload("map");
    await c.patch(`${w.base}/scenes/${w.scene}/table`, { mapImageId: id }, w.dm);
    later(IMAGE_GRACE_MS + 1000);
    expect((await c.del(`${w.base}/scenes/${w.scene}`, w.dm)).statusCode).toBe(204);
    expect(await exists(id)).toBe(false);
    expect(await t.images.get(id)).toBeNull();
  });

  it("a picture attached after it was found unused is kept, with its file", async () => {
    const w = await world("race");
    const id = await w.upload("map");
    later(IMAGE_GRACE_MS + 1000);
    // The picture is attached at the very moment the sweep is about to take it.
    const removed = await reclaimImages(t.db, t.images, t.clock.now, {
      beforeClaim: async (found) => {
        if (found === id) await c.patch(`${w.base}/scenes/${w.scene}/table`, { mapImageId: id }, w.dm);
      },
    });
    expect(removed).toBeGreaterThanOrEqual(0);
    expect(await exists(id)).toBe(true);
    expect(await t.images.get(id)).not.toBeNull();
  });

  it("a file that cannot be removed is reported, stays without a row, and the next sweep removes it", async () => {
    const w = await world("stubborn");
    const stuck = await w.upload("token");
    const free = await w.upload("token");
    later(IMAGE_GRACE_MS + 1000);
    const store: ImageStore = { put: (id, bytes) => t.images.put(id, bytes), get: (id) => t.images.get(id), list: () => t.images.list(), remove: (id) => (id === stuck ? Promise.reject(new Error("disk")) : t.images.remove(id)) };
    const problems: (string | null)[] = [];
    await reclaimImages(t.db, store, t.clock.now, { onError: (id) => problems.push(id) });
    // Nothing points at the stuck picture any more, so its row is gone; only the file is left, and it was reported.
    expect(await exists(stuck)).toBe(false);
    expect(await t.images.get(stuck)).not.toBeNull();
    expect(problems).toContain(stuck);
    expect(await exists(free)).toBe(false);
    expect(await t.images.get(free)).toBeNull();
    // The next sweep, with the disk back, finishes the job.
    await reclaimImages(t.db, t.images, t.clock.now);
    expect(await t.images.get(stuck)).toBeNull();
  });

  it("when the database cannot remove the row, the file is never touched", async () => {
    const w = await world("dbfail");
    const id = await w.upload("token");
    later(IMAGE_GRACE_MS + 1000);
    vi.spyOn(t.db, "delete").mockImplementationOnce(() => { throw new Error("db down"); });
    const problems: (string | null)[] = [];
    await reclaimImages(t.db, t.images, t.clock.now, { onError: (found) => problems.push(found) });
    vi.restoreAllMocks();
    expect(problems).toContain(id);
    expect(await exists(id)).toBe(true);
    expect(await t.images.get(id)).not.toBeNull();
  });

  it("a file with no row is removed once it is old, and not before", async () => {
    const stray = crypto.randomUUID();
    await t.images.put(stray, new Uint8Array([1, 2, 3]));
    await reclaimImages(t.db, t.images, t.clock.now);
    expect(await t.images.get(stray)).not.toBeNull();
    later(IMAGE_GRACE_MS + 1000);
    await reclaimImages(t.db, t.images, t.clock.now);
    expect(await t.images.get(stray)).toBeNull();
  });

  it("an upload that fails leaves a file behind only until the next sweep, and the failure reported is the first one", async () => {
    const w = await world("crash");
    const before = (await t.images.list()).length;
    vi.spyOn(t.db, "insert").mockImplementationOnce(() => { throw new Error("db down"); });
    vi.spyOn(t.images, "remove").mockImplementationOnce(() => Promise.reject(new Error("disk")));
    const failed = await t.app.inject({ method: "POST", url: `${w.base}/images?kind=map`, payload: fakePng(50, 50), headers: { "content-type": "image/png" }, cookies: { phoenix_session: w.dm } });
    vi.restoreAllMocks();
    expect(failed.statusCode).toBe(500);
    expect((await t.images.list()).length).toBe(before + 1);
    later(IMAGE_GRACE_MS + 1000);
    await reclaimImages(t.db, t.images, t.clock.now);
    expect((await t.images.list()).length).toBe(before);
  });

  it("a store that cannot even be listed is reported, and the rows are still cleaned", async () => {
    const w = await world("nolist");
    const id = await w.upload("token");
    later(IMAGE_GRACE_MS + 1000);
    const store: ImageStore = { put: (i, b) => t.images.put(i, b), get: (i) => t.images.get(i), remove: (i) => t.images.remove(i), list: () => Promise.reject(new Error("no disk")) };
    const problems: (string | null)[] = [];
    await reclaimImages(t.db, store, t.clock.now, { onError: (found) => problems.push(found) });
    expect(problems).toContain(null);
    expect(await exists(id)).toBe(false);
  });
});

describe("the hourly sweep", () => {
  it("runs at once, then every hour, and stops when told", async () => {
    vi.useFakeTimers();
    try {
      const task = vi.fn(() => Promise.resolve());
      const stop = startImageSweep(task, () => undefined);
      expect(task).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(IMAGE_SWEEP_MS);
      expect(task).toHaveBeenCalledTimes(2);
      stop();
      await vi.advanceTimersByTimeAsync(IMAGE_SWEEP_MS * 3);
      expect(task).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it("reports a failure, whether the task rejects or throws, and goes on", async () => {
    vi.useFakeTimers();
    try {
      const reported: string[] = [];
      let n = 0;
      const stop = startImageSweep(() => {
        n += 1;
        if (n === 1) throw new Error("threw");
        return Promise.reject(new Error("rejected"));
      }, (e) => { reported.push(e instanceof Error ? e.message : "?"); });
      await vi.advanceTimersByTimeAsync(IMAGE_SWEEP_MS);
      expect(reported).toEqual(["threw", "rejected"]);
      stop();
    } finally {
      vi.useRealTimers();
    }
  });
});
