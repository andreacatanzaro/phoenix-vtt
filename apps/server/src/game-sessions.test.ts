import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { gameSessions } from "./db/schema";
import { deleteDraft, updateDetails } from "./game-session-writes";
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
  await c.post(`/api/worlds/${worldId}/members`, { username: `${prefix}-pl` }, dm);
  const base = `/api/worlds/${worldId}/sessions`;
  const create = async (body: unknown = { title: "Prima sessione" }): Promise<string> => idOf(await c.post(base, body, dm), "session", "id");
  return { dm, player, worldId, base, create };
}

describe("creating sessions", () => {
  it("starts as a draft, with the details the board shows", async () => {
    const w = await world("create");
    const r = await c.post(w.base, { title: "  La locanda  ", scheduledAt: "2026-12-01T18:00:00.000Z", recommendedLevel: 3, seats: 5 }, w.dm);
    expect(r.statusCode).toBe(201);
    expect(field(r, "session")).toMatchObject({ title: "La locanda", status: "draft", recommendedLevel: 3, seats: 5, scheduledAt: "2026-12-01T18:00:00.000Z", report: "", startedAt: null, closedAt: null });
  });

  it("only the title is required", async () => {
    const w = await world("minimal");
    expect(field(await c.post(w.base, { title: "Solo titolo" }, w.dm), "session")).toMatchObject({ scheduledAt: null, recommendedLevel: null, seats: null });
  });

  it("refuses bad titles, levels, seats and dates", async () => {
    const w = await world("bad");
    for (const body of [{}, { title: "" }, { title: "x".repeat(121) }, { title: "ok", recommendedLevel: 0 }, { title: "ok", recommendedLevel: 21 }, { title: "ok", recommendedLevel: 2.5 }, { title: "ok", seats: 0 }, { title: "ok", seats: 21 }, { title: "ok", scheduledAt: "domani" }]) {
      expect((await c.post(w.base, body, w.dm)).statusCode, JSON.stringify(body)).toBe(400);
    }
  });

  it("a player cannot create, and a stranger sees nothing", async () => {
    const w = await world("perm");
    const stranger = await c.signUp("perm-out");
    expect((await c.post(w.base, { title: "x" }, w.player)).statusCode).toBe(403);
    expect((await c.post(w.base, { title: "x" }, stranger)).statusCode).toBe(404);
    expect((await c.get(w.base, stranger)).statusCode).toBe(404);
    expect((await c.get(w.base)).statusCode).toBe(401);
  });
});

describe("the board", () => {
  it("a player does not see drafts, but sees published, running and closed sessions", async () => {
    const w = await world("board");
    const draft = await w.create({ title: "Bozza" });
    const published = await w.create({ title: "Pubblicata" });
    await c.post(`${w.base}/${published}/publish`, {}, w.dm);
    const forPlayer = await c.get(w.base, w.player);
    expect(field(forPlayer, "sessions")).toMatchObject([{ title: "Pubblicata", status: "published" }]);
    expect((await c.get(`${w.base}/${draft}`, w.player)).statusCode).toBe(404);
    expect((await c.get(`${w.base}/${draft}`, w.dm)).statusCode).toBe(200);
    expect(field(await c.get(w.base, w.dm), "sessions")).toHaveLength(2);
  });

  it("a player cannot change a session or see a draft through the other routes", async () => {
    const w = await world("noedit");
    const draft = await w.create();
    for (const r of [
      await c.post(`${w.base}/${draft}/publish`, {}, w.player),
      await c.patch(`${w.base}/${draft}`, { title: "x" }, w.player),
      await c.del(`${w.base}/${draft}`, w.player),
    ]) expect(r.statusCode).toBe(403);
  });

  it("a session of another world is not reachable", async () => {
    const w = await world("mine");
    const other = await world("theirs");
    const theirs = await other.create();
    expect((await c.get(`${w.base}/${theirs}`, w.dm)).statusCode).toBe(404);
    expect((await c.post(`${w.base}/${theirs}/start`, {}, w.dm)).statusCode).toBe(404);
  });
});

describe("the life of a session", () => {
  it("goes draft, published, running, closed, with times and the chronicle note", async () => {
    const w = await world("life");
    const id = await w.create();
    expect(field(await c.post(`${w.base}/${id}/publish`, {}, w.dm), "session", "status")).toBe("published");
    t.clock.now = new Date("2026-01-10T20:00:00.000Z");
    const started = await c.post(`${w.base}/${id}/start`, {}, w.dm);
    expect(field(started, "session")).toMatchObject({ status: "running", startedAt: "2026-01-10T20:00:00.000Z" });
    t.clock.now = new Date("2026-01-10T23:30:00.000Z");
    const closed = await c.post(`${w.base}/${id}/close`, { report: "Il gruppo ha salvato il villaggio." }, w.dm);
    expect(field(closed, "session")).toMatchObject({ status: "closed", closedAt: "2026-01-10T23:30:00.000Z", report: "Il gruppo ha salvato il villaggio." });
  });

  it("can start straight from a draft, and close without a note", async () => {
    const w = await world("quick");
    const id = await w.create();
    expect(field(await c.post(`${w.base}/${id}/start`, {}, w.dm), "session", "status")).toBe("running");
    expect(field(await c.post(`${w.base}/${id}/close`, {}, w.dm), "session")).toMatchObject({ status: "closed", report: "" });
  });

  it("refuses steps that skip or repeat the order", async () => {
    const w = await world("order");
    const id = await w.create();
    for (const step of ["close", "publish-twice"]) {
      if (step === "publish-twice") {
        await c.post(`${w.base}/${id}/publish`, {}, w.dm);
        const r = await c.post(`${w.base}/${id}/publish`, {}, w.dm);
        expect(r.statusCode).toBe(409);
        expect(field(r, "error")).toBe("errors.session.wrong-status");
      } else {
        expect((await c.post(`${w.base}/${id}/${step}`, {}, w.dm)).statusCode).toBe(409);
      }
    }
    await c.post(`${w.base}/${id}/start`, {}, w.dm);
    expect((await c.post(`${w.base}/${id}/start`, {}, w.dm)).statusCode).toBe(409);
    expect((await c.post(`${w.base}/${id}/publish`, {}, w.dm)).statusCode).toBe(409);
    await c.post(`${w.base}/${id}/close`, {}, w.dm);
    for (const step of ["start", "publish", "close"]) expect((await c.post(`${w.base}/${id}/${step}`, {}, w.dm)).statusCode).toBe(409);
  });

  it("only one session runs at a time in a world, but another world is independent", async () => {
    const w = await world("single");
    const other = await world("single2");
    const first = await w.create({ title: "Uno" });
    const second = await w.create({ title: "Due" });
    await c.post(`${w.base}/${first}/start`, {}, w.dm);
    const clash = await c.post(`${w.base}/${second}/start`, {}, w.dm);
    expect(clash.statusCode).toBe(409);
    expect(field(clash, "error")).toBe("errors.session.already-running");
    expect(field(await c.get(`${w.base}/${second}`, w.dm), "session", "status")).toBe("draft");
    await c.post(`${w.base}/${first}/close`, {}, w.dm);
    expect((await c.post(`${w.base}/${second}/start`, {}, w.dm)).statusCode).toBe(200);
    expect((await c.post(`${other.base}/${await other.create()}/start`, {}, other.dm)).statusCode).toBe(200);
  });

  it("two requests to start at once leave exactly one running", async () => {
    const w = await world("race");
    const a = await w.create({ title: "A" });
    const b = await w.create({ title: "B" });
    const results = await Promise.all([c.post(`${w.base}/${a}/start`, {}, w.dm), c.post(`${w.base}/${b}/start`, {}, w.dm)]);
    expect(results.map((r) => r.statusCode).sort()).toEqual([200, 409]);
  });
});

describe("editing", () => {
  it("changes the details until the session is closed", async () => {
    const w = await world("edit");
    const id = await w.create();
    const r = await c.patch(`${w.base}/${id}`, { title: "Nuovo titolo", seats: 4, scheduledAt: null, recommendedLevel: 2 }, w.dm);
    expect(field(r, "session")).toMatchObject({ title: "Nuovo titolo", seats: 4, recommendedLevel: 2, scheduledAt: null });
    await c.post(`${w.base}/${id}/start`, {}, w.dm);
    expect((await c.patch(`${w.base}/${id}`, { seats: 6 }, w.dm)).statusCode).toBe(200);
    await c.post(`${w.base}/${id}/close`, {}, w.dm);
    const closed = await c.patch(`${w.base}/${id}`, { title: "x" }, w.dm);
    expect(closed.statusCode).toBe(409);
    expect(field(closed, "error")).toBe("errors.session.closed");
  });

  it("refuses an empty edit and bad values", async () => {
    const w = await world("badedit");
    const id = await w.create();
    expect((await c.patch(`${w.base}/${id}`, {}, w.dm)).statusCode).toBe(400);
    expect((await c.patch(`${w.base}/${id}`, { seats: 0 }, w.dm)).statusCode).toBe(400);
  });

  it("the chronicle note can be written while running and corrected after closing, but not on a draft", async () => {
    const w = await world("note");
    const id = await w.create();
    const put = (report: string) => t.app.inject({ method: "PUT", url: `${w.base}/${id}/report`, payload: JSON.stringify({ report }), headers: { "content-type": "application/json" }, cookies: { phoenix_session: w.dm } });
    expect((await put("troppo presto")).statusCode).toBe(409);
    await c.post(`${w.base}/${id}/start`, {}, w.dm);
    expect(field(await put("a metà"), "session", "report")).toBe("a metà");
    await c.post(`${w.base}/${id}/close`, { report: "finale" }, w.dm);
    expect(field(await put("finale corretto"), "session", "report")).toBe("finale corretto");
    expect(field(await c.get(`${w.base}/${id}`, w.player), "session", "report")).toBe("finale corretto");
  });

  it("only a draft can be deleted", async () => {
    const w = await world("delete");
    const draft = await w.create({ title: "Bozza" });
    const played = await w.create({ title: "Giocata" });
    await c.post(`${w.base}/${played}/publish`, {}, w.dm);
    expect((await c.del(`${w.base}/${played}`, w.dm)).statusCode).toBe(409);
    expect((await c.del(`${w.base}/${draft}`, w.dm)).statusCode).toBe(204);
    expect((await c.get(`${w.base}/${draft}`, w.dm)).statusCode).toBe(404);
  });

  it("deleting a world removes its sessions", async () => {
    const w = await world("cascade");
    await w.create();
    expect(field(await c.get(w.base, w.dm), "sessions")).toHaveLength(1);
  });
});

describe("writes that depend on the status", () => {
  async function aSession(prefix: string, status: "draft" | "published" | "running" | "closed") {
    const w = await world(prefix);
    const id = await w.create({ title: "Originale" });
    await t.db.update(gameSessions).set({ status }).where(eq(gameSessions.id, id));
    return { ...w, id };
  }

  it("a session that stopped being a draft meanwhile is not deleted, whatever the request had read", async () => {
    for (const status of ["published", "running", "closed"] as const) {
      const s = await aSession(`del-${status}`, "draft");
      // The request read a draft; another one changed it before this one writes.
      await t.db.update(gameSessions).set({ status }).where(eq(gameSessions.id, s.id));
      expect(await deleteDraft(t.db, s.worldId, s.id)).toBe("not-draft");
      expect(await t.db.select().from(gameSessions).where(eq(gameSessions.id, s.id))).toHaveLength(1);
    }
  });

  it("a draft is deleted, a missing session is reported as missing, and another world's session is untouched", async () => {
    const s = await aSession("del-draft", "draft");
    const other = await world("del-other");
    expect(await deleteDraft(t.db, other.worldId, s.id)).toBe("missing");
    expect(await deleteDraft(t.db, s.worldId, s.id)).toBe("deleted");
    expect(await deleteDraft(t.db, s.worldId, s.id)).toBe("missing");
  });

  it("a session that was closed meanwhile keeps its details, whatever the request had read", async () => {
    const s = await aSession("edit-closed", "running");
    await t.db.update(gameSessions).set({ status: "closed" }).where(eq(gameSessions.id, s.id));
    expect(await updateDetails(t.db, s.worldId, s.id, { title: "Cambiato" })).toBe("closed");
    const [row] = await t.db.select().from(gameSessions).where(eq(gameSessions.id, s.id));
    expect(row?.title).toBe("Originale");
  });

  it("an open session is edited, and a missing one is reported as missing", async () => {
    const s = await aSession("edit-open", "published");
    const updated = await updateDetails(t.db, s.worldId, s.id, { title: "Cambiato", seats: 4, scheduledAt: null });
    expect(typeof updated === "string" ? updated : updated.title).toBe("Cambiato");
    expect(await updateDetails(t.db, s.worldId, "00000000-0000-4000-8000-000000000000", { title: "x" })).toBe("missing");
  });
});
