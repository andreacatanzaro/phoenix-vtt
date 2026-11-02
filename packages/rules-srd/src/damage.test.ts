import { createScriptedRng } from "@phoenix/rules-core";
import { isMessageKey, renderLogLine } from "@phoenix/shared";
import { describe, expect, it } from "vitest";
import { applyDefenses, rollDamage, type DamagePart } from "./damage";

const longsword: DamagePart = { dice: "1d8", bonus: 3, type: "slashing" };

describe("rollDamage", () => {
  it("rolls the dice and adds the bonus", () => {
    const r = rollDamage([longsword], { critical: false }, createScriptedRng([5]));
    expect(r.parts).toEqual([{ type: "slashing", dice: [5], bonus: 3, amount: 8 }]);
    expect(r.byType).toEqual({ slashing: 8 });
  });

  it("doubles the number of dice and the bonus on a critical hit", () => {
    const r = rollDamage([longsword], { critical: true }, createScriptedRng([5, 7]));
    expect(r.parts[0]).toEqual({ type: "slashing", dice: [5, 7], bonus: 6, amount: 18 });
  });

  it("doubles every part of a multi-part attack, each with its own bonus", () => {
    const parts: DamagePart[] = [longsword, { dice: "2d6", bonus: 0, type: "fire" }];
    const r = rollDamage(parts, { critical: true }, createScriptedRng([1, 2, 3, 4, 5, 6]));
    expect(r.parts.map((p) => p.dice.length)).toEqual([2, 4]);
    expect(r.parts.map((p) => p.bonus)).toEqual([6, 0]);
    expect(r.byType).toEqual({ slashing: 9, fire: 18 });
  });

  it("merges parts of the same type", () => {
    const r = rollDamage(
      [longsword, { dice: "1d6", bonus: 0, type: "slashing" }],
      { critical: false },
      createScriptedRng([4, 2]),
    );
    expect(r.byType).toEqual({ slashing: 9 });
  });

  it("never goes below 0 for a part", () => {
    const r = rollDamage([{ dice: "1d4", bonus: -5, type: "bludgeoning" }], { critical: false }, createScriptedRng([2]));
    expect(r.parts[0]?.amount).toBe(0);
  });

  it("rejects dice notations that carry bonuses or keep rules", () => {
    for (const dice of ["1d8+3", "4d6kh3", "abc"]) {
      expect(() => rollDamage([{ dice, bonus: 0, type: "fire" }], { critical: false }, createScriptedRng([1, 1, 1, 1]))).toThrow();
    }
  });

  it("rejects bonuses that are not whole numbers", () => {
    expect(() => rollDamage([{ dice: "1d8", bonus: 1.5, type: "fire" }], { critical: false }, createScriptedRng([1]))).toThrow();
  });

  it("logs each part, the critical doubling and only catalog keys", () => {
    const r = rollDamage([longsword], { critical: true }, createScriptedRng([5, 7]));
    expect(r.log.map((l) => l.key)).toEqual(["log.damage.critical", "log.damage.part"]);
    for (const line of r.log) {
      expect(isMessageKey(line.key), line.key).toBe(true);
      expect(renderLogLine(line, (id) => id).length).toBeGreaterThan(0);
    }
  });
});

describe("applyDefenses", () => {
  it("halves resistant damage, rounding down", () => {
    const r = applyDefenses({ slashing: 9 }, { resistances: ["slashing"] });
    expect(r.byType).toEqual({ slashing: 4 });
    expect(r.total).toBe(4);
  });

  it("doubles vulnerable damage", () => {
    expect(applyDefenses({ fire: 7 }, { vulnerabilities: ["fire"] }).total).toBe(14);
  });

  it("removes immune damage", () => {
    expect(applyDefenses({ poison: 12 }, { immunities: ["poison"] }).total).toBe(0);
  });

  it("applies resistance before vulnerability when both apply", () => {
    expect(applyDefenses({ fire: 9 }, { resistances: ["fire"], vulnerabilities: ["fire"] }).total).toBe(8);
  });

  it("lets immunity win over everything else", () => {
    const r = applyDefenses({ fire: 9 }, { resistances: ["fire"], vulnerabilities: ["fire"], immunities: ["fire"] });
    expect(r.total).toBe(0);
  });

  it("leaves other types untouched and sums the total", () => {
    const r = applyDefenses({ slashing: 8, fire: 5 }, { resistances: ["slashing"] });
    expect(r.byType).toEqual({ slashing: 4, fire: 5 });
    expect(r.total).toBe(9);
  });

  it("logs each defense from the amount it actually received", () => {
    const r = applyDefenses({ fire: 9 }, { resistances: ["fire"], vulnerabilities: ["fire"] });
    expect(r.log.slice(0, 2)).toEqual([
      { key: "log.defense.resistance", params: { type: "damageTypes.fire", before: 9, after: 4 }, refs: { type: "text-key" } },
      { key: "log.defense.vulnerability", params: { type: "damageTypes.fire", before: 4, after: 8 }, refs: { type: "text-key" } },
    ]);
  });

  it("logs the amount an immunity removed", () => {
    const r = applyDefenses({ poison: 12 }, { immunities: ["poison"] });
    expect(r.log[0]?.params).toMatchObject({ before: 12, after: 0 });
  });

  it("explains each adjustment in the log, reading as Italian", () => {
    const r = applyDefenses({ slashing: 8, fire: 5 }, { resistances: ["slashing"] });
    expect(r.log.map((l) => l.key)).toEqual(["log.defense.resistance", "log.damage.total"]);
    for (const line of r.log) {
      expect(isMessageKey(line.key), line.key).toBe(true);
      expect(renderLogLine(line, (id) => id).length).toBeGreaterThan(0);
    }
  });
});
