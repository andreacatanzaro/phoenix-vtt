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
  const worldId = idOf(await c.post("/api/worlds", { name: "Mondo" }, dm), "world", "id");
  return { dm, worldId, base: `/api/worlds/${worldId}/members` };
}

describe("members", () => {
  it("the DM adds a player by username, whatever the case, and the world shows up for that player", async () => {
    const w = await world("add");
    const player = await c.signUp("Add-Giocatore");
    const r = await c.post(w.base, { username: "add-giocatore" }, w.dm);
    expect(r.statusCode).toBe(201);
    expect(field(r, "member")).toMatchObject({ username: "Add-Giocatore", role: "player" });
    const mine = await c.get("/api/worlds", player);
    expect(field(mine, "worlds")).toMatchObject([{ id: w.worldId, role: "player" }]);
  });

  it("lists the members for any member, the DM first", async () => {
    const w = await world("list");
    const player = await c.signUp("list-pl");
    await c.post(w.base, { username: "list-pl" }, w.dm);
    const forPlayer = await c.get(w.base, player);
    expect(forPlayer.statusCode).toBe(200);
    expect(field(forPlayer, "members")).toMatchObject([{ username: "list-dm", role: "dm" }, { username: "list-pl", role: "player" }]);
  });

  it("refuses an unknown username and a repeated one", async () => {
    const w = await world("errors");
    await c.signUp("errors-pl");
    const unknown = await c.post(w.base, { username: "nessuno-qui" }, w.dm);
    expect(unknown.statusCode).toBe(404);
    expect(field(unknown, "error")).toBe("errors.members.account-not-found");
    expect((await c.post(w.base, { username: "errors-pl" }, w.dm)).statusCode).toBe(201);
    const again = await c.post(w.base, { username: "errors-pl" }, w.dm);
    expect(again.statusCode).toBe(409);
    expect(field(again, "error")).toBe("errors.members.already-member");
    const self = await c.post(w.base, { username: "errors-dm" }, w.dm);
    expect(self.statusCode).toBe(409);
  });

  it("refuses a body without a username", async () => {
    const w = await world("body");
    expect((await c.post(w.base, {}, w.dm)).statusCode).toBe(400);
    expect((await c.post(w.base, { username: "" }, w.dm)).statusCode).toBe(400);
  });

  it("only the DM adds or removes; a player gets 403 and a stranger 404", async () => {
    const w = await world("perm");
    const player = await c.signUp("perm-pl");
    const other = await c.signUp("perm-other");
    const stranger = await c.signUp("perm-out");
    await c.post(w.base, { username: "perm-pl" }, w.dm);
    expect((await c.post(w.base, { username: "perm-other" }, player)).statusCode).toBe(403);
    const accountId = idOf(await c.get(w.base, w.dm), "members", 1, "accountId");
    expect((await c.del(`${w.base}/${accountId}`, player)).statusCode).toBe(403);
    expect((await c.get(w.base, stranger)).statusCode).toBe(404);
    expect((await c.post(w.base, { username: "perm-other" }, stranger)).statusCode).toBe(404);
    expect(other.length).toBeGreaterThan(0);
  });

  it("removes a player, who then loses access; the DM cannot be removed", async () => {
    const w = await world("remove");
    const player = await c.signUp("remove-pl");
    await c.post(w.base, { username: "remove-pl" }, w.dm);
    const members = await c.get(w.base, w.dm);
    const dmId = idOf(members, "members", 0, "accountId");
    const playerId = idOf(members, "members", 1, "accountId");
    const own = await c.del(`${w.base}/${dmId}`, w.dm);
    expect(own.statusCode).toBe(409);
    expect(field(own, "error")).toBe("errors.members.cannot-remove-dm");
    expect((await c.del(`${w.base}/${playerId}`, w.dm)).statusCode).toBe(204);
    expect((await c.get(`/api/worlds/${w.worldId}/tree`, player)).statusCode).toBe(404);
    expect((await c.del(`${w.base}/${playerId}`, w.dm)).statusCode).toBe(404);
    expect((await c.del(`${w.base}/non-un-uuid`, w.dm)).statusCode).toBe(404);
  });
});
