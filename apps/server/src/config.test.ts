import { describe, expect, it } from "vitest";
import { loadConfig } from "./config";

const base = { DATABASE_URL: "postgres://localhost/phoenix", SESSION_SECRET: "x".repeat(32) };

describe("loadConfig", () => {
  it("reads the required values and fills in defaults", () => {
    const c = loadConfig(base);
    expect(c).toMatchObject({ port: 3000, host: "0.0.0.0", nodeEnv: "development", sessionDays: 30, cookieSecure: false, staticDir: null });
    expect(loadConfig({ ...base, STATIC_DIR: "/app/client" }).staticDir).toBe("/app/client");
  });

  it("secure cookies are on by default in production only, and can be turned on explicitly elsewhere", () => {
    expect(loadConfig({ ...base, NODE_ENV: "production" }).cookieSecure).toBe(true);
    expect(loadConfig({ ...base, NODE_ENV: "production", COOKIE_SECURE: "true" }).cookieSecure).toBe(true);
    expect(loadConfig({ ...base, COOKIE_SECURE: "true" }).cookieSecure).toBe(true);
    expect(loadConfig({ ...base, COOKIE_SECURE: "false" }).cookieSecure).toBe(false);
  });

  it("refuses to turn secure cookies off in production", () => {
    expect(() => loadConfig({ ...base, NODE_ENV: "production", COOKIE_SECURE: "false" })).toThrow(/COOKIE_SECURE/);
  });

  it("refuses a missing database url or a short session secret, and says which", () => {
    expect(() => loadConfig({ SESSION_SECRET: base.SESSION_SECRET })).toThrow(/DATABASE_URL/);
    expect(() => loadConfig({ DATABASE_URL: base.DATABASE_URL, SESSION_SECRET: "short" })).toThrow(/SESSION_SECRET/);
  });

  it("refuses a bad port", () => {
    expect(() => loadConfig({ ...base, PORT: "70000" })).toThrow(/PORT/);
    expect(() => loadConfig({ ...base, PORT: "abc" })).toThrow(/PORT/);
  });
});
