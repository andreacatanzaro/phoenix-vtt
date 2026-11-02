import { describe, expect, it } from "vitest";
import { parseDice, rollDice, rollD20 } from "./dice";
import { createScriptedRng } from "./rng";

describe("parseDice", () => {
  it("parses a plain expression", () => {
    expect(parseDice("2d6")).toEqual({ count: 2, sides: 6, modifier: 0, keep: null });
  });

  it("parses positive and negative modifiers", () => {
    expect(parseDice("1d8+3")).toMatchObject({ count: 1, sides: 8, modifier: 3 });
    expect(parseDice("d20-1")).toMatchObject({ count: 1, sides: 20, modifier: -1 });
  });

  it("parses keep highest and keep lowest", () => {
    expect(parseDice("4d6kh3")).toMatchObject({ count: 4, sides: 6, keep: { mode: "highest", n: 3 } });
    expect(parseDice("2d20kl1")).toMatchObject({ keep: { mode: "lowest", n: 1 } });
  });

  it("rejects malformed or impossible expressions", () => {
    for (const bad of ["", "abc", "0d6", "2d0", "3d6kh4", "2d6+", "1d6 + 2x"]) {
      expect(() => parseDice(bad), bad).toThrow();
    }
  });
});

describe("parseDice limits", () => {
  it("rejects absurd dice counts and sides before any allocation", () => {
    for (const bad of ["999999999d6", "101d6", "1d1001", "1d99999999999999999999", "2d6+99999999999999999999"]) {
      expect(() => parseDice(bad), bad).toThrow();
    }
  });

  it("accepts the documented maximums", () => {
    expect(parseDice("100d1000")).toMatchObject({ count: 100, sides: 1000 });
  });
});

describe("rollDice", () => {
  it("flags natural criticals on a single d20 written as notation", () => {
    expect(rollDice("1d20+4", createScriptedRng([20])).critical).toBe("success");
    expect(rollDice("d20", createScriptedRng([1])).critical).toBe("failure");
    expect(rollDice("1d20", createScriptedRng([10])).critical).toBeNull();
  });

  it("does not flag criticals on other dice", () => {
    expect(rollDice("1d12", createScriptedRng([12])).critical).toBeNull();
    expect(rollDice("2d20", createScriptedRng([20, 1])).critical).toBeNull();
  });

  it("sums dice and modifier", () => {
    const result = rollDice("2d6+3", createScriptedRng([4, 5]));
    expect(result.dice).toEqual([4, 5]);
    expect(result.total).toBe(12);
    expect(result.modifier).toBe(3);
  });

  it("drops the lowest die for 4d6kh3", () => {
    const result = rollDice("4d6kh3", createScriptedRng([2, 6, 5, 4]));
    expect(result.kept).toEqual([6, 5, 4]);
    expect(result.total).toBe(15);
  });
});

describe("rollD20 modifier validation", () => {
  it("rejects modifiers that are not whole, finite numbers within the limit", () => {
    for (const bad of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, 1.5, 1_000_001, -1_000_001]) {
      expect(() => rollD20({ modifier: bad, mode: "normal" }, createScriptedRng([10])), String(bad)).toThrow();
    }
  });

  it("does not consume any randomness when it rejects", () => {
    const rng = createScriptedRng([10]);
    expect(() => rollD20({ modifier: Number.NaN, mode: "normal" }, rng)).toThrow();
    expect(rollD20({ modifier: 0, mode: "normal" }, rng).total).toBe(10);
  });
});

describe("rollD20", () => {
  it("rolls one die without advantage", () => {
    const r = rollD20({ modifier: 5, mode: "normal" }, createScriptedRng([12]));
    expect(r.dice).toEqual([12]);
    expect(r.total).toBe(17);
    expect(r.critical).toBeNull();
  });

  it("keeps the highest of two with advantage", () => {
    const r = rollD20({ modifier: 0, mode: "advantage" }, createScriptedRng([4, 15]));
    expect(r.kept).toEqual([15]);
    expect(r.total).toBe(15);
  });

  it("keeps the lowest of two with disadvantage", () => {
    const r = rollD20({ modifier: 0, mode: "disadvantage" }, createScriptedRng([4, 15]));
    expect(r.kept).toEqual([4]);
  });

  it("flags natural 20 as critical success and natural 1 as critical failure", () => {
    expect(rollD20({ modifier: -5, mode: "normal" }, createScriptedRng([20])).critical).toBe("success");
    expect(rollD20({ modifier: 10, mode: "normal" }, createScriptedRng([1])).critical).toBe("failure");
  });

  it("judges the critical on the kept die", () => {
    const adv = rollD20({ modifier: 0, mode: "advantage" }, createScriptedRng([1, 20]));
    expect(adv.critical).toBe("success");
    const dis = rollD20({ modifier: 0, mode: "disadvantage" }, createScriptedRng([1, 20]));
    expect(dis.critical).toBe("failure");
  });
});
