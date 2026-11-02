import { isMessageKey, translate } from "@phoenix/shared";
import { describe, expect, it } from "vitest";
import { ABILITIES, abilityModifier, checkModifier, proficiencyBonus } from "./abilities";

describe("abilityModifier", () => {
  it("follows floor((score - 10) / 2) across the whole range", () => {
    const expected: Record<number, number> = {
      1: -5, 2: -4, 3: -4, 4: -3, 5: -3, 6: -2, 7: -2, 8: -1, 9: -1, 10: 0,
      11: 0, 12: 1, 13: 1, 14: 2, 15: 2, 16: 3, 17: 3, 18: 4, 19: 4, 20: 5,
      21: 5, 22: 6, 24: 7, 26: 8, 28: 9, 30: 10,
    };
    for (const [score, modifier] of Object.entries(expected)) {
      expect(abilityModifier(Number(score)), score).toBe(modifier);
    }
  });

  it("rejects scores outside 1-30 and non-integers", () => {
    for (const bad of [0, 31, 10.5, Number.NaN]) {
      expect(() => abilityModifier(bad), String(bad)).toThrow();
    }
  });
});

describe("proficiencyBonus", () => {
  it("steps up every four levels", () => {
    const expected: Record<number, number> = { 1: 2, 4: 2, 5: 3, 8: 3, 9: 4, 12: 4, 13: 5, 16: 5, 17: 6, 20: 6 };
    for (const [level, bonus] of Object.entries(expected)) {
      expect(proficiencyBonus(Number(level)), level).toBe(bonus);
    }
  });

  it("rejects levels outside 1-20", () => {
    for (const bad of [0, 21, 2.5]) expect(() => proficiencyBonus(bad), String(bad)).toThrow();
  });
});

describe("checkModifier", () => {
  it("adds the proficiency bonus once for proficiency and twice for expertise", () => {
    expect(checkModifier({ score: 16, level: 5, proficiency: "none" })).toBe(3);
    expect(checkModifier({ score: 16, level: 5, proficiency: "proficient" })).toBe(6);
    expect(checkModifier({ score: 16, level: 5, proficiency: "expertise" })).toBe(9);
  });

  it("handles negative modifiers", () => {
    expect(checkModifier({ score: 8, level: 1, proficiency: "proficient" })).toBe(1);
  });
});

describe("ABILITIES", () => {
  it("has an Italian name in the catalog for every ability", () => {
    for (const id of ABILITIES) expect(isMessageKey(`abilities.${id}`), id).toBe(true);
    expect(ABILITIES.map((id) => translate(`abilities.${id}`))).toEqual([
      "Forza",
      "Destrezza",
      "Costituzione",
      "Intelligenza",
      "Saggezza",
      "Carisma",
    ]);
  });

  it("lists the six abilities in the usual order", () => {
    expect(ABILITIES).toEqual(["str", "dex", "con", "int", "wis", "cha"]);
  });
});
