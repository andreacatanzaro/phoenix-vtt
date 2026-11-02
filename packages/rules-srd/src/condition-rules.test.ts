import { isMessageKey } from "@phoenix/shared";
import { describe, expect, it } from "vitest";
import {
  abilityCheckModes,
  attackModes,
  conditionDefenses,
  effectiveConditions,
  effectiveHpMax,
  exhaustionKills,
  hpMaxFactor,
  isIncapacitated,
  saveModes,
  speedFactor,
} from "./condition-rules";
import { CONDITION_IDS, type ActiveCondition, type ConditionId } from "./conditions";

const c = (...ids: ConditionId[]): ActiveCondition[] => ids.map((id) => ({ id, sourceId: "src" }));
const exhausted = (level: number): ActiveCondition[] => [{ id: "exhaustion", sourceId: "exhaustion", level }];
const melee = { targetWithinReach: true, attackerId: "a", targetId: "t" };
const far = { targetWithinReach: false, attackerId: "a", targetId: "t" };

describe("isIncapacitated", () => {
  it("is true for incapacitated and for every condition that includes it", () => {
    for (const id of ["incapacitated", "paralyzed", "petrified", "stunned", "unconscious"] as const) {
      expect(isIncapacitated(c(id)), id).toBe(true);
    }
  });

  it("is false for the others", () => {
    for (const id of CONDITION_IDS) {
      if (["incapacitated", "paralyzed", "petrified", "stunned", "unconscious"].includes(id)) continue;
      expect(isIncapacitated(id === "exhaustion" ? exhausted(5) : c(id)), id).toBe(false);
    }
  });
});

describe("speedFactor", () => {
  it("is 1 with no condition that slows", () => {
    expect(speedFactor([])).toBe(1);
    expect(speedFactor(c("blinded", "poisoned", "prone"))).toBe(1);
  });

  it("is 0 when grappled, restrained or unable to move", () => {
    for (const id of ["grappled", "restrained", "paralyzed", "petrified", "stunned", "unconscious"] as const) {
      expect(speedFactor(c(id)), id).toBe(0);
    }
  });

  it("follows exhaustion: halved from level 2, zero from level 5", () => {
    expect([1, 2, 3, 4, 5, 6].map((l) => speedFactor(exhausted(l)))).toEqual([1, 0.5, 0.5, 0.5, 0, 0]);
  });
});

describe("attackModes", () => {
  it("is plain with no condition", () => {
    expect(attackModes([], [], melee)).toEqual({ sources: [], autoCritOnHit: false, forbidden: false, notices: [] });
  });

  it("gives the attacker disadvantage when blinded, poisoned, prone or restrained", () => {
    for (const id of ["blinded", "poisoned", "prone", "restrained"] as const) {
      expect(attackModes(c(id), [], melee).sources, id).toEqual(["disadvantage"]);
    }
  });

  it("gives an invisible attacker advantage", () => {
    expect(attackModes(c("invisible"), [], melee).sources).toEqual(["advantage"]);
  });

  it("gives advantage against blinded, paralyzed, petrified, restrained, stunned and unconscious targets", () => {
    for (const id of ["blinded", "paralyzed", "petrified", "restrained", "stunned", "unconscious"] as const) {
      expect(attackModes([], c(id), far).sources, id).toEqual(["advantage"]);
    }
  });

  it("gives disadvantage against an invisible target", () => {
    expect(attackModes([], c("invisible"), melee).sources).toEqual(["disadvantage"]);
  });

  it("depends on the distance against a prone target: advantage within reach, disadvantage beyond", () => {
    expect(attackModes([], c("prone"), melee).sources).toEqual(["advantage"]);
    expect(attackModes([], c("prone"), far).sources).toEqual(["disadvantage"]);
  });

  it("turns a hit into a critical hit against paralyzed or unconscious targets within reach only", () => {
    for (const id of ["paralyzed", "unconscious"] as const) {
      expect(attackModes([], c(id), melee).autoCritOnHit, id).toBe(true);
      expect(attackModes([], c(id), far).autoCritOnHit, id).toBe(false);
    }
    expect(attackModes([], c("stunned"), melee).autoCritOnHit).toBe(false);
  });

  it("combines both sides, leaving cancelling to resolveRollMode", () => {
    expect(attackModes(c("poisoned"), c("restrained"), melee).sources).toEqual(["disadvantage", "advantage"]);
  });

  it("applies exhaustion level 3 to attack rolls but not level 2", () => {
    expect(attackModes(exhausted(2), [], melee).sources).toEqual([]);
    expect(attackModes(exhausted(3), [], melee).sources).toEqual(["disadvantage"]);
  });

  it("forbids a charmed creature from attacking its charmer, and nobody else", () => {
    const charmed: ActiveCondition[] = [{ id: "charmed", sourceId: "t" }];
    expect(attackModes(charmed, [], melee).forbidden).toBe(true);
    expect(attackModes(charmed, [], { ...melee, targetId: "other" }).forbidden).toBe(false);
  });

  it("applies frightened only when the source is known to be in sight, otherwise leaves it to the DM", () => {
    const afraid: ActiveCondition[] = [{ id: "frightened", sourceId: "dragon" }];
    expect(attackModes(afraid, [], { ...melee, seesSource: () => true }).sources).toEqual(["disadvantage"]);
    expect(attackModes(afraid, [], { ...melee, seesSource: () => false }).sources).toEqual([]);
    const unknown = attackModes(afraid, [], melee);
    expect(unknown.sources).toEqual([]);
    expect(unknown.notices).toEqual(["frightened.sight"]);
  });
});

describe("abilityCheckModes", () => {
  it("gives disadvantage when poisoned or exhausted", () => {
    expect(abilityCheckModes(c("poisoned"), {}).sources).toEqual(["disadvantage"]);
    expect(abilityCheckModes(exhausted(1), {}).sources).toEqual(["disadvantage"]);
  });

  it("stacks nothing extra for several sources of disadvantage", () => {
    expect(abilityCheckModes([...c("poisoned"), ...exhausted(2)], {}).sources).toEqual(["disadvantage", "disadvantage"]);
  });

  it("leaves checks that need sight or hearing to the DM", () => {
    expect(abilityCheckModes(c("blinded"), {}).notices).toEqual(["blinded.checks"]);
    expect(abilityCheckModes(c("deafened"), {}).notices).toEqual(["deafened.checks"]);
  });

  it("applies frightened with a known source in sight", () => {
    const afraid: ActiveCondition[] = [{ id: "frightened", sourceId: "dragon" }];
    expect(abilityCheckModes(afraid, { seesSource: () => true }).sources).toEqual(["disadvantage"]);
  });
});

describe("abilityCheckModes with tags", () => {
  it("fails a sight check automatically when blinded, and a hearing check when deafened", () => {
    expect(abilityCheckModes(c("blinded"), { tags: ["sight"] }).autoFail).toBe(true);
    expect(abilityCheckModes(c("deafened"), { tags: ["hearing"] }).autoFail).toBe(true);
  });

  it("does not fail checks that need neither, and has nothing to tell the DM", () => {
    const r = abilityCheckModes(c("blinded", "deafened"), { tags: [] });
    expect(r.autoFail).toBe(false);
    expect(r.notices).toEqual([]);
    expect(abilityCheckModes(c("blinded"), { tags: ["hearing"] }).autoFail).toBe(false);
  });

  it("still tells the DM when a check has no tags", () => {
    const r = abilityCheckModes(c("blinded"), {});
    expect(r.autoFail).toBe(false);
    expect(r.notices).toEqual(["blinded.checks"]);
  });

  it("gives the charmer advantage on social checks against the creature they charmed", () => {
    const charmed: ActiveCondition[] = [{ id: "charmed", sourceId: "witch" }];
    const social = { tags: ["social"] as const, rollerId: "witch", opponent: { id: "hero", conditions: charmed } };
    expect(abilityCheckModes([], social).sources).toEqual(["advantage"]);
    expect(abilityCheckModes([], { ...social, rollerId: "someone-else" }).sources).toEqual([]);
    expect(abilityCheckModes([], { ...social, tags: ["sight"] }).sources).toEqual([]);
  });
});

describe("poison suspended by petrification", () => {
  it("ignores poisoned on attacks and checks while petrified, without losing the condition", () => {
    const both = c("poisoned", "petrified");
    expect(attackModes(both, [], melee).sources).toEqual([]);
    expect(abilityCheckModes(both, {}).sources).toEqual([]);
    expect(effectiveConditions(both).map((x) => x.id)).toEqual(["petrified"]);
    expect(both.map((x) => x.id)).toEqual(["poisoned", "petrified"]);
  });

  it("applies poisoned again as soon as the creature is no longer petrified", () => {
    expect(attackModes(c("poisoned"), [], melee).sources).toEqual(["disadvantage"]);
    expect(abilityCheckModes(c("poisoned"), {}).sources).toEqual(["disadvantage"]);
  });
});

describe("saveModes", () => {
  it("fails Strength and Dexterity saves automatically when paralyzed, petrified, stunned or unconscious", () => {
    for (const id of ["paralyzed", "petrified", "stunned", "unconscious"] as const) {
      expect(saveModes(c(id), "str").autoFail, id).toBe(true);
      expect(saveModes(c(id), "dex").autoFail, id).toBe(true);
      expect(saveModes(c(id), "wis").autoFail, id).toBe(false);
    }
  });

  it("gives a restrained creature disadvantage on Dexterity saves only", () => {
    expect(saveModes(c("restrained"), "dex").sources).toEqual(["disadvantage"]);
    expect(saveModes(c("restrained"), "con").sources).toEqual([]);
  });

  it("gives disadvantage on every save from exhaustion level 3", () => {
    expect(saveModes(exhausted(2), "wis").sources).toEqual([]);
    expect(saveModes(exhausted(3), "wis").sources).toEqual(["disadvantage"]);
  });
});

describe("conditionDefenses", () => {
  it("makes a petrified creature resistant to all damage", () => {
    expect(conditionDefenses(c("petrified")).resistances).toHaveLength(13);
  });

  it("adds nothing for other conditions", () => {
    expect(conditionDefenses(c("poisoned", "prone"))).toEqual({});
  });
});

describe("exhaustion limits", () => {
  it("halves the hit point maximum from level 4", () => {
    expect([1, 3, 4, 5].map((l) => hpMaxFactor(exhausted(l)))).toEqual([1, 1, 0.5, 0.5]);
    expect(hpMaxFactor([])).toBe(1);
  });

  it("applies the factor to a hit point maximum, rounding down", () => {
    expect(effectiveHpMax(23, exhausted(4))).toBe(11);
    expect(effectiveHpMax(24, exhausted(4))).toBe(12);
    expect(effectiveHpMax(23, exhausted(3))).toBe(23);
    expect(effectiveHpMax(23, [])).toBe(23);
    expect(effectiveHpMax(1, exhausted(4))).toBe(1);
  });

  it("kills at level 6 only", () => {
    expect(exhaustionKills(exhausted(5))).toBe(false);
    expect(exhaustionKills(exhausted(6))).toBe(true);
    expect(exhaustionKills([])).toBe(false);
  });
});

describe("notices", () => {
  it("only name entries that exist in the Italian catalog", () => {
    const all = [
      ...abilityCheckModes(c("blinded", "deafened"), {}).notices,
      ...attackModes(c("frightened"), [], melee).notices,
    ];
    expect(all.length).toBeGreaterThan(0);
    for (const notice of all) expect(isMessageKey(`conditionNotices.${notice}`), notice).toBe(true);
  });
});
