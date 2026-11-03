import { createScriptedRng } from "@phoenix/rules-core";
import { isMessageKey } from "@phoenix/shared";
import { describe, expect, it } from "vitest";
import {
  FIGHTING_STYLES,
  FIGHTING_STYLE_IDS,
  addFightingStyle,
  offHandDamageModifier,
  rerollLowDamageDice,
  styleArmorClassBonus,
  styleAttackBonus,
  styleDamageBonus,
} from "./fighting-styles";

describe("fighting styles", () => {
  it("lists the six SRD styles, each with catalog texts", () => {
    expect(FIGHTING_STYLES.map((s) => s.id)).toEqual([...FIGHTING_STYLE_IDS]);
    for (const s of FIGHTING_STYLES) {
      expect(isMessageKey(s.nameKey)).toBe(true);
      expect(isMessageKey(s.descriptionKey)).toBe(true);
      if (s.dmNoteKey !== undefined) expect(isMessageKey(s.dmNoteKey)).toBe(true);
      expect(s.source).toBe("srd");
    }
  });

  it("a partially automated style says what the DM resolves", () => {
    for (const s of FIGHTING_STYLES) if (s.automation !== "full") expect(s.dmNoteKey).toBeDefined();
  });

  it("cannot take the same style twice", () => {
    expect(addFightingStyle(["archery"], "defense")).toEqual(["archery", "defense"]);
    expect(() => addFightingStyle(["archery"], "archery")).toThrow();
  });
});

describe("style bonuses", () => {
  it("defense adds 1 AC only while wearing armor", () => {
    expect(styleArmorClassBonus(["defense"], { wearingArmor: true })).toBe(1);
    expect(styleArmorClassBonus(["defense"], { wearingArmor: false })).toBe(0);
    expect(styleArmorClassBonus(["archery"], { wearingArmor: true })).toBe(0);
  });

  it("archery adds 2 to ranged attacks only", () => {
    expect(styleAttackBonus(["archery"], { rangedWeapon: true })).toBe(2);
    expect(styleAttackBonus(["archery"], { rangedWeapon: false })).toBe(0);
    expect(styleAttackBonus([], { rangedWeapon: true })).toBe(0);
  });

  it("dueling adds 2 damage with one one-handed melee weapon", () => {
    expect(styleDamageBonus(["dueling"], { meleeWeaponInOneHandOnly: true })).toBe(2);
    expect(styleDamageBonus(["dueling"], { meleeWeaponInOneHandOnly: false })).toBe(0);
    expect(styleDamageBonus(["defense"], { meleeWeaponInOneHandOnly: true })).toBe(0);
  });

  it("the off-hand attack gets no ability modifier, unless it is negative or the style is taken", () => {
    expect(offHandDamageModifier([], 3)).toBe(0);
    expect(offHandDamageModifier(["dueling"], 3)).toBe(0);
    expect(offHandDamageModifier([], -1)).toBe(-1);
    expect(offHandDamageModifier(["two-weapon-fighting"], 3)).toBe(3);
    expect(offHandDamageModifier(["two-weapon-fighting"], -1)).toBe(-1);
    expect(() => offHandDamageModifier([], 1.5)).toThrow();
  });

  it("styles add up when the character has two", () => {
    const both = ["archery", "defense"] as const;
    expect(styleAttackBonus(both, { rangedWeapon: true }) + styleArmorClassBonus(both, { wearingArmor: true })).toBe(3);
  });
});

describe("great weapon fighting", () => {
  const gwf = ["great-weapon-fighting"] as const;

  it("rerolls dice showing 1 or 2 once, and keeps the new result even if low", () => {
    expect(rerollLowDamageDice(gwf, [1, 6, 2, 3], 6, { qualifyingWeapon: true }, createScriptedRng([2, 5]))).toEqual([2, 6, 5, 3]);
  });

  it("leaves the dice alone without the style or a qualifying weapon", () => {
    const rng = createScriptedRng([]);
    expect(rerollLowDamageDice([], [1, 2], 6, { qualifyingWeapon: true }, rng)).toEqual([1, 2]);
    expect(rerollLowDamageDice(gwf, [1, 2], 6, { qualifyingWeapon: false }, rng)).toEqual([1, 2]);
  });
});
