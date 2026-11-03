import { isMessageKey, renderLogLine } from "@phoenix/shared";
import { vitalState } from "@phoenix/rules-srd";
import { describe, expect, it } from "vitest";
import { champion, championCriticalFrom, remarkableAthleteBonus, survivorHealing } from "./champion";

describe("champion", () => {
  it("has the five SRD features at levels 3, 7, 10, 15 and 18", () => {
    expect(champion.levels.map((l) => [l.level, ...l.features])).toEqual([
      [3, "improved-critical"],
      [7, "remarkable-athlete"],
      [10, "additional-fighting-style"],
      [15, "superior-critical"],
      [18, "survivor"],
    ]);
  });

  it("every text key exists in the catalog", () => {
    const keys = [champion.nameKey, champion.descriptionKey, ...champion.features.flatMap((f) => [f.nameKey, f.descriptionKey, ...(f.dmNoteKey === undefined ? [] : [f.dmNoteKey])])];
    for (const key of keys) expect(isMessageKey(key), key).toBe(true);
  });

  it("the second fighting style at level 10 is a pending choice", () => {
    expect(champion.levels.find((l) => l.level === 10)?.choices?.[0]?.id).toBe("additional-fighting-style");
  });
});

describe("critical range", () => {
  it("19 from level 3, 18 from level 15", () => {
    expect([1, 2, 3, 14, 15, 20].map(championCriticalFrom)).toEqual([20, 20, 19, 19, 18, 18]);
    expect(() => championCriticalFrom(0)).toThrow();
  });
});

describe("remarkableAthleteBonus", () => {
  const base = { fighterLevel: 7, proficiencyBonus: 3, ability: "str", proficientInCheck: false } as const;

  it("adds half the proficiency bonus rounded up to unproficient Strength, Dexterity and Constitution checks", () => {
    expect(remarkableAthleteBonus(base)).toBe(2);
    expect(remarkableAthleteBonus({ ...base, proficiencyBonus: 4, ability: "dex" })).toBe(2);
    expect(remarkableAthleteBonus({ ...base, proficiencyBonus: 2, ability: "con" })).toBe(1);
  });

  it("does not apply to proficient checks, other abilities or before level 7", () => {
    expect(remarkableAthleteBonus({ ...base, proficientInCheck: true })).toBe(0);
    expect(remarkableAthleteBonus({ ...base, ability: "wis" })).toBe(0);
    expect(remarkableAthleteBonus({ ...base, fighterLevel: 6 })).toBe(0);
    expect(() => remarkableAthleteBonus({ ...base, proficiencyBonus: 1 })).toThrow();
  });
});

describe("survivorHealing", () => {
  const turn = (hp: number, over: { fighterLevel?: number; conModifier?: number; hpMax?: number } = {}) =>
    survivorHealing({ fighterLevel: over.fighterLevel ?? 18, actorId: "pg", vital: vitalState(hp, over.hpMax ?? 40), conModifier: over.conModifier ?? 2 });

  it("heals 5 plus Constitution at half the hit points or fewer", () => {
    const r = turn(20);
    expect(r.state.hp).toBe(27);
    expect(renderLogLine(r.log[0] ?? { key: "", params: {} }, () => "Aldo")).toBe("Aldo si rimette in sesto con Sopravvissuto: recupera 7 PF.");
  });

  it("does nothing above half, at 0 hit points, or before level 18", () => {
    expect(turn(21).state.hp).toBe(21);
    const down = survivorHealing({ fighterLevel: 18, actorId: "pg", vital: { ...vitalState(1, 40), hp: 0, status: "dying" }, conModifier: 2 });
    expect(down.state.hp).toBe(0);
    expect(turn(10, { fighterLevel: 17 }).state.hp).toBe(10);
    expect(turn(21).log).toEqual([]);
  });

  it("never heals a negative amount and reports only what was regained", () => {
    expect(turn(10, { conModifier: -6 }).state.hp).toBe(10);
    expect(turn(19, { hpMax: 40, conModifier: 5 }).state.hp).toBe(29);
    expect(survivorHealing({ fighterLevel: 18, actorId: "pg", vital: vitalState(19, 38), conModifier: 5 }).log[0]?.params).toMatchObject({ amount: 10 });
  });
});
