import { createScriptedRng } from "@phoenix/rules-core";
import { isMessageKey, renderLogLine } from "@phoenix/shared";
import { SUBCLASS_LEVEL, chooseSubclass, gainHitPoints, levelUp, restoreUses, startOfTurn, startingChoices, startingHitPoints, usesLeft, vitalState } from "@phoenix/rules-srd";
import { describe, expect, it } from "vitest";
import { champion } from "./champion";
import { actionSurge, attacksPerAction, fighter, indomitable, secondWind, useActionSurge, useIndomitable, useSecondWind } from "./fighter";

describe("fighter class", () => {
  it("has the SRD basics", () => {
    expect(fighter.hitDie).toBe(10);
    expect(fighter.saveProficiencies).toEqual(["str", "con"]);
    expect(fighter.proficiencies.armor).toEqual(["light", "medium", "heavy", "shields"]);
    expect(fighter.proficiencies.weapons).toEqual(["simple", "martial"]);
    expect(fighter.proficiencies.skills.count).toBe(2);
    expect(fighter.proficiencies.skills.from).toHaveLength(8);
    expect(SUBCLASS_LEVEL).toBe(3);
  });

  it("every text key it points to exists in the catalog", () => {
    const keys = [fighter.nameKey, ...fighter.features.flatMap((f) => [f.nameKey, f.descriptionKey, ...(f.dmNoteKey === undefined ? [] : [f.dmNoteKey])])];
    for (const key of keys) expect(isMessageKey(key), key).toBe(true);
    for (const level of fighter.levels) for (const c of level.choices ?? []) expect(isMessageKey(c.promptKey), c.promptKey).toBe(true);
  });

  it("level 1: 10 plus Constitution; later levels use the d10 or the average of 6", () => {
    expect(startingHitPoints(fighter, 2)).toBe(12);
    expect(gainHitPoints(fighter, "pg", 12, 2, "average", createScriptedRng([])).gained).toBe(8);
  });

  it("a new fighter owes two skills and a fighting style", () => {
    expect(startingChoices(fighter).map((c) => c.id)).toEqual(["skills", "fighting-style"]);
  });
});

describe("fighter progression", () => {
  const grants = (from: number): readonly string[] => levelUp(fighter, "pg", from - 1).grantedFeatures;

  it("grants features at the SRD levels", () => {
    expect(fighter.levels[0]?.features).toEqual(["second-wind", "fighting-style"]);
    expect(grants(2)).toEqual(["action-surge"]);
    expect(grants(5)).toEqual(["extra-attack"]);
    expect(grants(9)).toEqual(["indomitable"]);
    expect(grants(4)).toEqual([]);
  });

  it("owes the archetype at level 3", () => {
    expect(levelUp(fighter, "pg", 2).pendingChoices.map((c) => c.kind)).toContain("subclass");
  });

  it("has ability score improvements at 4, 6, 8, 12, 14, 16 and 19", () => {
    const withAsi = Array.from({ length: 19 }, (_, i) => i + 1).filter((from) =>
      levelUp(fighter, "pg", from).pendingChoices.some((c) => c.kind === "ability-or-feat"),
    );
    expect(withAsi.map((from) => from + 1)).toEqual([4, 6, 8, 12, 14, 16, 19]);
  });

  it("attacks per action: 1, 2 at level 5, 3 at 11, 4 at 20", () => {
    expect([1, 4, 5, 10, 11, 19, 20].map(attacksPerAction)).toEqual([1, 1, 2, 2, 3, 3, 4]);
    expect(() => attacksPerAction(0)).toThrow();
    expect(() => attacksPerAction(21)).toThrow();
  });

  it("the Champion joins at level 3 and is built on this class", () => {
    expect(champion.classId).toBe(fighter.id);
    expect(chooseSubclass(fighter, champion, 3).grantedFeatures).toEqual(["improved-critical"]);
  });
});

describe("limited uses", () => {
  it("second wind: one use, back after a short rest", () => {
    expect(usesLeft(secondWind, 1, {})).toBe(1);
    expect(usesLeft(secondWind, 1, { "second-wind": 1 })).toBe(0);
    expect(restoreUses(fighter.features, { "second-wind": 1, indomitable: 1 }, "short")).toEqual({ indomitable: 1 });
  });

  it("action surge: none at level 1, one from 2, two from 17", () => {
    expect([1, 2, 16, 17].map((l) => usesLeft(actionSurge, l, {}))).toEqual([0, 1, 1, 2]);
  });

  it("indomitable: 1, 2 and 3 uses, back only after a long rest", () => {
    expect([8, 9, 13, 17].map((l) => usesLeft(indomitable, l, {}))).toEqual([0, 1, 2, 3]);
    expect(restoreUses(fighter.features, { indomitable: 2 }, "long")).toEqual({});
  });
});

const turn = startOfTurn();

describe("useSecondWind", () => {
  it("heals 1d10 plus the fighter level and spends the use", () => {
    const r = useSecondWind({ actorId: "pg", level: 3, vital: vitalState(5, 30), spent: {}, economy: turn }, createScriptedRng([4]));
    expect(r.vital.hp).toBe(12);
    expect(r.economy.bonusActions).toBe(0);
    expect(r.economy.actions).toBe(1);
    expect(r.healed).toBe(7);
    expect(r.spent).toEqual({ "second-wind": 1 });
    expect(r.events[0]).toEqual({ name: "feature.used", payload: { actorId: "pg", featureId: "second-wind" } });
    expect(renderLogLine(r.log[0] ?? { key: "", params: {} }, () => "Aldo")).toBe("Aldo recupera energie: tira 4, più 3 (livello): 7 PF.");
  });

  it("stops at the hit point maximum and reports the real amount", () => {
    const r = useSecondWind({ actorId: "pg", level: 5, vital: vitalState(28, 30), spent: {}, economy: turn }, createScriptedRng([10]));
    expect(r.vital.hp).toBe(30);
    expect(r.healed).toBe(2);
  });

  it("cannot be used twice, while down, or without a bonus action", () => {
    const base = { actorId: "pg", level: 3, vital: vitalState(5, 30), spent: {}, economy: turn };
    expect(() => useSecondWind({ ...base, spent: { "second-wind": 1 } }, createScriptedRng([4]))).toThrow();
    expect(() => useSecondWind({ ...base, vital: { ...vitalState(1, 30), hp: 0, status: "dying" } }, createScriptedRng([4]))).toThrow();
    expect(() => useSecondWind({ ...base, economy: { ...turn, bonusActions: 0 } }, createScriptedRng([4]))).toThrow();
  });
});

describe("useActionSurge", () => {
  it("gives one extra action and spends the use", () => {
    const r = useActionSurge({ actorId: "pg", level: 2, spent: {}, economy: turn });
    expect(r.economy.actions).toBe(2);
    expect(r.spent).toEqual({ "action-surge": 1 });
    expect(r.events.map((e) => e.name)).toEqual(["feature.used"]);
  });

  it("at level 17 there are two uses, but only one in the same turn", () => {
    const first = useActionSurge({ actorId: "pg", level: 17, spent: {}, economy: turn });
    expect(() => useActionSurge({ actorId: "pg", level: 17, spent: first.spent, economy: first.economy })).toThrow();
    const nextTurn = useActionSurge({ actorId: "pg", level: 17, spent: first.spent, economy: turn });
    expect(nextTurn.spent).toEqual({ "action-surge": 2 });
    expect(() => useActionSurge({ actorId: "pg", level: 17, spent: nextTurn.spent, economy: turn })).toThrow();
  });

  it("is not available at level 1", () => {
    expect(() => useActionSurge({ actorId: "pg", level: 1, spent: {}, economy: turn })).toThrow();
  });
});

describe("useIndomitable", () => {
  it("rolls the save again and spends the use", () => {
    const r = useIndomitable({ actorId: "pg", level: 9, spent: {}, save: { modifier: 5, mode: "normal", dc: 15 } }, createScriptedRng([14]));
    expect(r.result.success).toBe(true);
    expect(r.spent).toEqual({ indomitable: 1 });
    expect(r.log[0]?.key).toBe("log.class.indomitable");
  });

  it("the new result stands even if worse, and a natural 1 still fails", () => {
    const r = useIndomitable({ actorId: "pg", level: 9, spent: {}, save: { modifier: 20, mode: "normal", dc: 15 } }, createScriptedRng([1]));
    expect(r.result.success).toBe(false);
  });

  it("is not available before level 9 or when spent", () => {
    const save = { modifier: 5, mode: "normal", dc: 15 } as const;
    expect(() => useIndomitable({ actorId: "pg", level: 8, spent: {}, save }, createScriptedRng([10]))).toThrow();
    expect(() => useIndomitable({ actorId: "pg", level: 9, spent: { indomitable: 1 }, save }, createScriptedRng([10]))).toThrow();
  });
});
