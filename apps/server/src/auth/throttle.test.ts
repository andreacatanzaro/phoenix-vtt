import { describe, expect, it } from "vitest";
import { LoginThrottle } from "./throttle";

describe("LoginThrottle", () => {
  it("blocks after the allowed number of failures inside the window", () => {
    const t = new LoginThrottle(3, 1000);
    for (let i = 0; i < 2; i++) t.recordFailure("aldo", 100 + i);
    expect(t.isBlocked("aldo", 200)).toBe(false);
    t.recordFailure("aldo", 300);
    expect(t.isBlocked("aldo", 400)).toBe(true);
  });

  it("forgets failures once the window has passed", () => {
    const t = new LoginThrottle(2, 1000);
    t.recordFailure("aldo", 0);
    t.recordFailure("aldo", 10);
    expect(t.isBlocked("aldo", 500)).toBe(true);
    expect(t.isBlocked("aldo", 2000)).toBe(false);
  });

  it("does not grow without limit when every attempt uses a new name", () => {
    const t = new LoginThrottle(3, 1000, 50);
    for (let i = 0; i < 500; i++) t.recordFailure(`nome-${String(i)}`, i);
    expect(t.size).toBeLessThanOrEqual(51);
  });

  it("forgets names whose failures have all expired, even if nobody asks about them again", () => {
    const t = new LoginThrottle(3, 1000);
    for (let i = 0; i < 20; i++) t.recordFailure(`nome-${String(i)}`, 0);
    expect(t.size).toBe(20);
    t.recordFailure("nuovo", 5000);
    expect(t.size).toBe(1);
  });

  it("keeps the names that are still inside the window when it cleans up", () => {
    const t = new LoginThrottle(1, 1000);
    t.recordFailure("vecchio", 0);
    t.recordFailure("recente", 900);
    t.recordFailure("altro", 1100);
    expect(t.isBlocked("recente", 1200)).toBe(true);
    expect(t.isBlocked("vecchio", 1200)).toBe(false);
  });

  it("counts each name separately, and a success clears the count", () => {
    const t = new LoginThrottle(1, 1000);
    t.recordFailure("aldo", 0);
    expect(t.isBlocked("giovanni", 1)).toBe(false);
    t.clear("aldo");
    expect(t.isBlocked("aldo", 1)).toBe(false);
  });
});
