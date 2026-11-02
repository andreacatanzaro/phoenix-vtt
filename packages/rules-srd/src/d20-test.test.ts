import { createScriptedRng } from "@phoenix/rules-core";
import { isMessageKey, renderLogLine } from "@phoenix/shared";
import { describe, expect, it } from "vitest";
import { resolveD20Test } from "./d20-test";

const test = (natural: number[], over: { modifier?: number; dc?: number; mode?: "normal" | "advantage" | "disadvantage" } = {}) =>
  resolveD20Test({ modifier: over.modifier ?? 0, dc: over.dc ?? 15, mode: over.mode ?? "normal" }, createScriptedRng(natural));

describe("resolveD20Test", () => {
  it("succeeds when the total meets the DC", () => {
    const r = test([12], { modifier: 3, dc: 15 });
    expect(r.success).toBe(true);
    expect(r.decidedByNatural).toBe(false);
  });

  it("fails when the total is below the DC", () => {
    const r = test([12], { modifier: 2, dc: 15 });
    expect(r.success).toBe(false);
    expect(r.log.map((l) => l.key)).toEqual(["log.roll.detail", "log.d20.failure"]);
    expect(r.log[1]).toEqual({ key: "log.d20.failure", params: { total: 14, dc: 15 } });
  });

  it("makes a natural 20 an automatic success whatever the DC", () => {
    const r = test([20], { modifier: -5, dc: 40 });
    expect(r.success).toBe(true);
    expect(r.decidedByNatural).toBe(true);
    expect(r.notifyDm).toBe(true);
    expect(r.log[1]).toEqual({ key: "log.d20.natural-success", params: { total: 15, dc: 40 } });
  });

  it("makes a natural 1 an automatic failure whatever the modifier", () => {
    const r = test([1], { modifier: 30, dc: 5 });
    expect(r.success).toBe(false);
    expect(r.decidedByNatural).toBe(true);
    expect(r.notifyDm).toBe(true);
    expect(r.log[1]).toEqual({ key: "log.d20.natural-failure", params: { total: 31, dc: 5 } });
  });

  it("does not notify the DM on ordinary rolls", () => {
    expect(test([10]).notifyDm).toBe(false);
  });

  it("applies advantage and disadvantage before judging the natural", () => {
    expect(test([1, 20], { mode: "advantage" }).success).toBe(true);
    expect(test([1, 20], { mode: "disadvantage" }).success).toBe(false);
  });

  it("rejects a modifier that is not a whole, finite number", () => {
    for (const bad of [Number.NaN, Number.POSITIVE_INFINITY, 2.5]) {
      expect(() => test([10], { modifier: bad }), String(bad)).toThrow();
    }
  });

  it("rejects a DC that is not a finite number", () => {
    expect(() => test([10], { dc: Number.NaN })).toThrow();
  });

  it("logs the full roll before the outcome so the roll can be rebuilt from the log", () => {
    const r = test([4, 15], { modifier: 3, dc: 10, mode: "advantage" });
    expect(r.log[0]).toMatchObject({ key: "log.roll.detail", params: { dice: "4, 15", kept: "15", modifier: "+3", total: 18 } });
  });

  it("renders every line of a result as Italian text", () => {
    for (const natural of [[1], [10], [20]]) {
      for (const line of test(natural, { dc: 12 }).log) {
        expect(renderLogLine(line, (id) => id).length).toBeGreaterThan(0);
      }
    }
  });

  it("only emits log keys that exist in the Italian catalog", () => {
    for (const natural of [[1], [10], [20]]) {
      for (const line of test(natural, { dc: 12 }).log) expect(isMessageKey(line.key), line.key).toBe(true);
    }
  });
});
