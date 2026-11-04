import { describe, expect, it } from "vitest";
import { RateLimiter } from "./rate-limit";

describe("RateLimiter", () => {
  it("allows up to the limit in a window and then refuses", () => {
    const r = new RateLimiter(3, 1000);
    expect([0, 100, 200, 300].map((t) => r.allow(t))).toEqual([true, true, true, false]);
  });

  it("allows again once the window has passed", () => {
    const r = new RateLimiter(2, 1000);
    r.allow(0);
    r.allow(10);
    expect(r.allow(500)).toBe(false);
    expect(r.allow(1100)).toBe(true);
  });

  it("a refused action is not counted", () => {
    const r = new RateLimiter(1, 1000);
    r.allow(0);
    r.allow(100);
    r.allow(200);
    expect(r.allow(1001)).toBe(true);
  });
});
