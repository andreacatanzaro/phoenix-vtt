import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { eq } from "drizzle-orm";
import { isMessageKey } from "@phoenix/shared";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { SESSION_COOKIE } from "./routes/auth";
import { accounts, sessions, worldMemberships, worlds } from "./db/schema";
import { createTestApp, type TestApp } from "./test-support";

let t: TestApp;
beforeAll(async () => {
  t = await createTestApp();
});
afterAll(async () => {
  await t.close();
});

const PASSWORD = "una-password-lunga";

type Reply = { statusCode: number; headers: Record<string, unknown>; json: () => unknown; cookies: { name: string; value: string; httpOnly?: boolean; sameSite?: string; secure?: boolean }[] };

function cookieOf(reply: Reply): string {
  const found = reply.cookies.find((c) => c.name === SESSION_COOKIE);
  if (found === undefined) throw new Error("no session cookie");
  return found.value;
}

async function post(url: string, payload: unknown, token?: string): Promise<Reply> {
  return t.app.inject({ method: "POST", url, payload: JSON.stringify(payload), headers: { "content-type": "application/json" }, ...(token === undefined ? {} : { cookies: { [SESSION_COOKIE]: token } }) });
}

async function get(url: string, token?: string): Promise<Reply> {
  return t.app.inject({ method: "GET", url, ...(token === undefined ? {} : { cookies: { [SESSION_COOKIE]: token } }) });
}

async function signUp(username: string): Promise<string> {
  const r = await post("/api/auth/register", { username, password: PASSWORD });
  expect(r.statusCode).toBe(201);
  return cookieOf(r);
}

function bodyOf(reply: Reply): Record<string, unknown> {
  const body = reply.json();
  if (typeof body !== "object" || body === null || Array.isArray(body)) throw new Error("expected an object body");
  return Object.fromEntries(Object.entries(body));
}

describe("health", () => {
  it("answers ok after a database round trip", async () => {
    const r = await get("/health");
    expect(r.statusCode).toBe(200);
    expect(bodyOf(r)).toEqual({ status: "ok" });
  });
});

describe("registration", () => {
  it("creates the account, starts a session and sets a safe cookie", async () => {
    const r = await post("/api/auth/register", { username: "Aldo", password: PASSWORD });
    expect(r.statusCode).toBe(201);
    expect(bodyOf(r)["account"]).toMatchObject({ username: "Aldo" });
    const cookie = r.cookies.find((c) => c.name === SESSION_COOKIE);
    expect(cookie).toMatchObject({ httpOnly: true, sameSite: "Lax" });
  });

  it("never sends the password or its hash back", async () => {
    const r = await post("/api/auth/register", { username: "Chiara", password: PASSWORD });
    expect(JSON.stringify(r.json())).not.toMatch(/password|argon2/i);
  });

  it("stores an argon2id hash and not the password", async () => {
    await signUp("Elena");
    const [row] = await t.db.select().from(accounts).where(eq(accounts.usernameKey, "elena"));
    expect(row?.passwordHash.startsWith("$argon2id$")).toBe(true);
    expect(row?.passwordHash).not.toContain(PASSWORD);
  });

  it("refuses a name already taken, whatever the case", async () => {
    await signUp("Marco");
    for (const name of ["Marco", "marco", "MARCO"]) {
      const r = await post("/api/auth/register", { username: name, password: PASSWORD });
      expect(r.statusCode).toBe(409);
      expect(bodyOf(r)["error"]).toBe("errors.auth.username-taken");
    }
  });

  it("two registrations of the same name at once leave one account and one clear refusal", async () => {
    const results = await Promise.all([
      post("/api/auth/register", { username: "Gemelli", password: PASSWORD }),
      post("/api/auth/register", { username: "gemelli", password: PASSWORD }),
    ]);
    expect(results.map((r) => r.statusCode).sort()).toEqual([201, 409]);
    expect(await t.db.select().from(accounts).where(eq(accounts.usernameKey, "gemelli"))).toHaveLength(1);
  });

  it("refuses invalid names and short passwords with a catalog error", async () => {
    for (const body of [{ username: "ab", password: PASSWORD }, { username: "spazi non ok", password: PASSWORD }, { username: "ok-name", password: "corta" }, { username: "x".repeat(33), password: PASSWORD }, {}, { username: 5, password: PASSWORD }]) {
      const r = await post("/api/auth/register", body);
      expect(r.statusCode).toBe(400);
      expect(bodyOf(r)["error"]).toBe("errors.invalid");
    }
  });

  it("refuses a body that is not JSON", async () => {
    const r = await t.app.inject({ method: "POST", url: "/api/auth/register", payload: "{broken", headers: { "content-type": "application/json" } });
    expect(r.statusCode).toBe(400);
  });
});

describe("login", () => {
  it("accepts the right password and starts a session", async () => {
    await signUp("Luca");
    const r = await post("/api/auth/login", { username: "luca", password: PASSWORD });
    expect(r.statusCode).toBe(200);
    expect(r.cookies.some((c) => c.name === SESSION_COOKIE)).toBe(true);
  });

  it("gives the same answer for a wrong password and for an unknown user", async () => {
    await signUp("Sara");
    const wrong = await post("/api/auth/login", { username: "Sara", password: "sbagliata-sbagliata" });
    const unknown = await post("/api/auth/login", { username: "nessuno-qui", password: PASSWORD });
    expect(wrong.statusCode).toBe(401);
    expect(unknown.statusCode).toBe(401);
    expect(wrong.json()).toEqual(unknown.json());
    expect(bodyOf(wrong)["error"]).toBe("errors.auth.invalid-credentials");
  });

  it("blocks a name after five failures, even with the right password, until the window passes", async () => {
    await signUp("Paolo");
    for (let i = 0; i < 5; i++) await post("/api/auth/login", { username: "Paolo", password: "sbagliata-sbagliata" });
    const blocked = await post("/api/auth/login", { username: "Paolo", password: PASSWORD });
    expect(blocked.statusCode).toBe(429);
    expect(bodyOf(blocked)["error"]).toBe("errors.too-many-attempts");
    t.clock.now = new Date(t.clock.now.getTime() + 16 * 60 * 1000);
    expect((await post("/api/auth/login", { username: "Paolo", password: PASSWORD })).statusCode).toBe(200);
  });

  it("a failure of one name does not block another", async () => {
    await signUp("Anna");
    await signUp("Bruno");
    for (let i = 0; i < 5; i++) await post("/api/auth/login", { username: "Anna", password: "sbagliata-sbagliata" });
    expect((await post("/api/auth/login", { username: "Bruno", password: PASSWORD })).statusCode).toBe(200);
  });
});

describe("session", () => {
  it("me answers for a signed-in account and 401 otherwise", async () => {
    const token = await signUp("Irene");
    const ok = await get("/api/auth/me", token);
    expect(ok.statusCode).toBe(200);
    expect(bodyOf(ok)["account"]).toMatchObject({ username: "Irene" });
    expect((await get("/api/auth/me")).statusCode).toBe(401);
    expect((await get("/api/auth/me", "token-inventato")).statusCode).toBe(401);
  });

  it("the database keeps a hash of the token, not the token", async () => {
    const token = await signUp("Dario");
    const stored = await t.db.select({ id: sessions.id }).from(sessions);
    expect(stored.some((s) => s.id === token)).toBe(false);
    expect(stored.every((s) => s.id.length === 64)).toBe(true);
  });

  it("logout ends exactly that session and clears the cookie", async () => {
    const first = await signUp("Giulia");
    const login = await post("/api/auth/login", { username: "Giulia", password: PASSWORD });
    const second = cookieOf(login);
    const out = await post("/api/auth/logout", {}, first);
    expect(out.statusCode).toBe(204);
    expect((await get("/api/auth/me", first)).statusCode).toBe(401);
    expect((await get("/api/auth/me", second)).statusCode).toBe(200);
  });

  it("logout without a session is harmless", async () => {
    expect((await post("/api/auth/logout", {})).statusCode).toBe(204);
  });

  it("a session stops working once it has expired", async () => {
    const token = await signUp("Tommaso");
    expect((await get("/api/auth/me", token)).statusCode).toBe(200);
    t.clock.now = new Date(t.clock.now.getTime() + 31 * 24 * 60 * 60 * 1000);
    expect((await get("/api/auth/me", token)).statusCode).toBe(401);
  });
});

describe("worlds", () => {
  it("creating a world makes the account its DM", async () => {
    const token = await signUp("Vera");
    const r = await post("/api/worlds", { name: "  Phoenix  " }, token);
    expect(r.statusCode).toBe(201);
    expect(bodyOf(r)["world"]).toMatchObject({ name: "Phoenix", role: "dm", gameTimeMinutes: 0 });
    const list = await get("/api/worlds", token);
    expect(bodyOf(list)["worlds"]).toHaveLength(1);
  });

  it("needs a signed-in account and a valid name", async () => {
    expect((await post("/api/worlds", { name: "Mondo" })).statusCode).toBe(401);
    expect((await get("/api/worlds")).statusCode).toBe(401);
    const token = await signUp("Nico");
    for (const body of [{}, { name: "" }, { name: "   " }, { name: "x".repeat(81) }, { name: 3 }]) {
      expect((await post("/api/worlds", body, token)).statusCode).toBe(400);
    }
  });

  it("lists only the worlds the account belongs to", async () => {
    const a = await signUp("Marta");
    const b = await signUp("Oscar");
    await post("/api/worlds", { name: "Di Marta" }, a);
    await post("/api/worlds", { name: "Di Oscar" }, b);
    const list = bodyOf(await get("/api/worlds", a))["worlds"];
    expect(list).toHaveLength(1);
    expect(list).toMatchObject([{ name: "Di Marta" }]);
  });

  it("a world of someone else looks like one that does not exist", async () => {
    const owner = await signUp("Rita");
    const other = await signUp("Sergio");
    const created = bodyOf(await post("/api/worlds", { name: "Privato" }, owner))["world"];
    const id = typeof created === "object" && created !== null && "id" in created ? String(created.id) : "";
    expect((await get(`/api/worlds/${id}`, owner)).statusCode).toBe(200);
    const denied = await get(`/api/worlds/${id}`, other);
    const missing = await get("/api/worlds/00000000-0000-4000-8000-000000000000", other);
    expect(denied.statusCode).toBe(404);
    expect(denied.json()).toEqual(missing.json());
    expect((await get("/api/worlds/non-un-uuid", owner)).statusCode).toBe(404);
  });

  it("the database allows only one DM per world, but many players", async () => {
    const dm = await signUp("Ugo");
    const player = await signUp("Zoe");
    const world = bodyOf(await post("/api/worlds", { name: "Uno solo" }, dm))["world"];
    const worldId = typeof world === "object" && world !== null && "id" in world ? String(world.id) : "";
    const [other] = await t.db.select({ id: accounts.id }).from(accounts).where(eq(accounts.usernameKey, "zoe"));
    if (other === undefined) throw new Error("account missing");
    expect(player.length).toBeGreaterThan(0);
    await expect(t.db.insert(worldMemberships).values({ worldId, accountId: other.id, role: "dm" })).rejects.toThrow();
    await t.db.insert(worldMemberships).values({ worldId, accountId: other.id, role: "player" });
    const rows = await t.db.select().from(worldMemberships).where(eq(worldMemberships.worldId, worldId));
    expect(rows.filter((m) => m.role === "dm")).toHaveLength(1);
    expect(rows).toHaveLength(2);
  });

  it("deleting a world removes its memberships", async () => {
    const token = await signUp("Wanda");
    const world = bodyOf(await post("/api/worlds", { name: "Effimero" }, token))["world"];
    const worldId = typeof world === "object" && world !== null && "id" in world ? String(world.id) : "";
    await t.db.delete(worlds).where(eq(worlds.id, worldId));
    expect(await t.db.select().from(worldMemberships).where(eq(worldMemberships.worldId, worldId))).toHaveLength(0);
  });
});

describe("errors", () => {
  it("an unknown route is a 404 with a catalog key", async () => {
    const r = await get("/api/niente");
    expect(r.statusCode).toBe(404);
    expect(bodyOf(r)["error"]).toBe("errors.not-found");
  });

  it("every error key the API can send exists in the Italian catalog", () => {
    for (const key of ["errors.invalid", "errors.unauthenticated", "errors.not-found", "errors.too-many-attempts", "errors.unavailable", "errors.auth.username-taken", "errors.auth.invalid-credentials"]) {
      expect(isMessageKey(key), key).toBe(true);
    }
  });
});

describe("secure cookies", () => {
  it("are marked secure when the configuration says so", async () => {
    const secure = await createTestApp({ cookieSecure: true });
    try {
      const r = await secure.app.inject({ method: "POST", url: "/api/auth/register", payload: JSON.stringify({ username: "Sicuro", password: PASSWORD }), headers: { "content-type": "application/json" } });
      expect(r.cookies.find((c) => c.name === SESSION_COOKIE)).toMatchObject({ secure: true, httpOnly: true });
    } finally {
      await secure.close();
    }
  });
});

describe("serving the client", () => {
  it("serves the built client and falls back to index.html for screens, but not for the API", async () => {
    const dir = mkdtempSync(join(tmpdir(), "phoenix-static-"));
    writeFileSync(join(dir, "index.html"), "<!doctype html><title>client</title>");
    writeFileSync(join(dir, "app.js"), "console.log(1)");
    const hosted = await createTestApp({ staticDir: dir });
    try {
      expect((await hosted.app.inject({ method: "GET", url: "/" })).body).toContain("<title>client</title>");
      expect((await hosted.app.inject({ method: "GET", url: "/app.js" })).body).toBe("console.log(1)");
      expect((await hosted.app.inject({ method: "GET", url: "/mondi/uno" })).body).toContain("<title>client</title>");
      const api = await hosted.app.inject({ method: "GET", url: "/api/niente" });
      expect(api.statusCode).toBe(404);
      expect(api.json()).toEqual({ error: "errors.not-found" });
      expect((await hosted.app.inject({ method: "GET", url: "/health" })).json()).toEqual({ status: "ok" });
    } finally {
      await hosted.close();
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
