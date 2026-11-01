import { describe, expect, it } from "vitest";
import { createScriptedRng, createSeededRng } from "./rng";

describe("createSeededRng", () => {
  it("produces the same sequence for the same seed", () => {
    const a = createSeededRng(42);
    const b = createSeededRng(42);
    const seqA = Array.from({ length: 20 }, () => a.int(1, 20));
    const seqB = Array.from({ length: 20 }, () => b.int(1, 20));
    expect(seqA).toEqual(seqB);
  });

  it("stays inside the inclusive range", () => {
    const rng = createSeededRng(7);
    for (let i = 0; i < 500; i++) {
      const n = rng.int(1, 6);
      expect(n).toBeGreaterThanOrEqual(1);
      expect(n).toBeLessThanOrEqual(6);
    }
  });

  it("returns the only value of a one-value range", () => {
    expect(createSeededRng(1).int(3, 3)).toBe(3);
  });

  it("rejects an empty range", () => {
    expect(() => createSeededRng(1).int(5, 4)).toThrow();
  });
});

describe("createScriptedRng", () => {
  it("replays the given values in order", () => {
    const rng = createScriptedRng([20, 1, 7]);
    expect([rng.int(1, 20), rng.int(1, 20), rng.int(1, 20)]).toEqual([20, 1, 7]);
  });

  it("throws when the script is exhausted", () => {
    expect(() => createScriptedRng([]).int(1, 6)).toThrow();
  });

  it("throws when a scripted value is out of range", () => {
    expect(() => createScriptedRng([9]).int(1, 6)).toThrow();
  });
});
