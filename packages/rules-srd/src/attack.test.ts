import { createScriptedRng } from "@phoenix/rules-core";
import { isMessageKey, renderLogLine } from "@phoenix/shared";
import { describe, expect, it } from "vitest";
import { resolveAttackRoll } from "./attack";

const attack = (natural: number[], over: { modifier?: number; ac?: number; mode?: "normal" | "advantage" | "disadvantage" } = {}) =>
  resolveAttackRoll({ modifier: over.modifier ?? 5, ac: over.ac ?? 16, mode: over.mode ?? "normal" }, createScriptedRng(natural));

describe("resolveAttackRoll", () => {
  it("hits when the total meets the AC", () => {
    const r = attack([12], { modifier: 5, ac: 17 });
    expect(r.hit).toBe(true);
    expect(r.critical).toBe(false);
    expect(r.log[1]).toEqual({ key: "log.attack.hit", params: { total: 17, ac: 17 } });
  });

  it("misses when the total is below the AC", () => {
    const r = attack([10], { modifier: 5, ac: 16 });
    expect(r.hit).toBe(false);
    expect(r.log[1]).toEqual({ key: "log.attack.miss", params: { total: 15, ac: 16 } });
  });

  it("makes a natural 20 a hit and a critical whatever the AC", () => {
    const r = attack([20], { modifier: -5, ac: 40 });
    expect(r.hit).toBe(true);
    expect(r.critical).toBe(true);
    expect(r.notifyDm).toBe(true);
    expect(r.log[1]?.key).toBe("log.attack.critical-hit");
  });

  it("makes a natural 1 an automatic miss whatever the modifier", () => {
    const r = attack([1], { modifier: 30, ac: 5 });
    expect(r.hit).toBe(false);
    expect(r.critical).toBe(false);
    expect(r.notifyDm).toBe(true);
    expect(r.log[1]?.key).toBe("log.attack.critical-miss");
  });

  it("judges the natural after advantage or disadvantage", () => {
    expect(attack([1, 20], { mode: "advantage" }).critical).toBe(true);
    expect(attack([1, 20], { mode: "disadvantage" }).hit).toBe(false);
  });

  it("logs the full roll first and reads as Italian", () => {
    const r = attack([17], { modifier: 0, ac: 16 });
    expect(r.log[0]?.key).toBe("log.roll.detail");
    for (const line of r.log) {
      expect(isMessageKey(line.key), line.key).toBe(true);
      expect(renderLogLine(line, (id) => id).length).toBeGreaterThan(0);
    }
    expect(renderLogLine(r.log[1] ?? { key: "", params: {} }, (id) => id)).toBe("Attacco 17 contro CA 16: colpito.");
  });

  it("rejects an AC that is not a finite number", () => {
    expect(() => attack([10], { ac: Number.NaN })).toThrow();
  });
});
