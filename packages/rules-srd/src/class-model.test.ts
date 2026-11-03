import { createScriptedRng } from "@phoenix/rules-core";
import { isMessageKey, renderLogLine } from "@phoenix/shared";
import { describe, expect, it } from "vitest";
import {
  ASI_LEVELS,
  SUBCLASS_LEVEL,
  chooseSubclass,
  defineClass,
  defineSubclass,
  gainHitPoints,
  levelForXp,
  levelUp,
  startingChoices,
  startingHitPoints,
  type ClassDefinition,
  type SubclassDefinition,
} from "./class-model";
import type { FeatureDefinition } from "./features";

// TEST FIXTURE: invented class used only to exercise the model. Never part of `content/`.
const feature = (id: string): FeatureDefinition => ({ id, nameKey: `classes.fixture.${id}.name`, descriptionKey: `classes.fixture.${id}.description`, source: "original", automation: "full" });
const fixtureLevels = Array.from({ length: 20 }, (_, i) => ({
  features: i === 0 ? ["fixture-stance"] : i === 4 ? ["fixture-double-strike"] : [],
  ...(i === 0 ? { choices: [{ id: "fixture-style", promptKey: "classes.fixture.style-prompt" }] } : {}),
}));
const fixtureBase: ClassDefinition = {
  id: "fixture-warrior",
  nameKey: "classes.fixture.name",
  hitDie: 10,
  saveProficiencies: ["str", "con"],
  proficiencies: { armor: ["light"], weapons: ["simple"], extra: [], skills: { count: 2, from: ["athletics", "perception", "survival"] } },
  levels: fixtureLevels,
  features: [feature("fixture-stance"), feature("fixture-double-strike")],
  asiLevels: [4, 6, 8],
  source: "original",
  automation: "full",
};
const fixture: ClassDefinition = defineClass(fixtureBase);
// TEST FIXTURE: invented subclass.
const fixturePath: SubclassDefinition = defineSubclass(
  {
    id: "fixture-path",
    classId: "fixture-warrior",
    nameKey: "classes.fixture.path.name",
    descriptionKey: "classes.fixture.path.description",
    levels: [
      { level: 3, features: ["fixture-path-gift"] },
      { level: 7, features: ["fixture-path-boon"], choices: [{ id: "fixture-path-pick", promptKey: "classes.fixture.path.pick-prompt" }] },
    ],
    features: [feature("fixture-path-gift"), feature("fixture-path-boon")],
    source: "original",
    automation: "full",
  },
  fixture,
);
// TEST FIXTURE: invented XP thresholds.
const thresholds = Array.from({ length: 20 }, (_, i) => i * 100);

describe("defineClass", () => {
  it("rejects a class that does not define every level", () => {
    expect(() => defineClass({ ...fixtureBase, levels: fixtureLevels.slice(0, 19) })).toThrow();
  });

  it("rejects a hit die that is not d6, d8, d10 or d12", () => {
    // @ts-expect-error 7 is not a HitDieSize: the runtime check backs up the type for data loaded from outside.
    expect(() => defineClass({ ...fixtureBase, hitDie: 7 })).toThrow();
  });

  it("rejects repeated saving throw proficiencies", () => {
    expect(() => defineClass({ ...fixtureBase, saveProficiencies: ["str", "str"] })).toThrow();
  });
});

describe("defineClass checks", () => {
  it("rejects a level that grants a feature the class does not define", () => {
    const levels = fixtureLevels.map((l, i) => (i === 1 ? { features: ["ghost"] } : l));
    expect(() => defineClass({ ...fixtureBase, levels })).toThrow();
  });

  it("rejects a skill choice larger than its list, and bad ASI levels", () => {
    expect(() => defineClass({ ...fixtureBase, proficiencies: { ...fixtureBase.proficiencies, skills: { count: 4, from: ["athletics"] } } })).toThrow();
    expect(() => defineClass({ ...fixtureBase, asiLevels: [8, 4] })).toThrow();
  });
});

describe("subclass level", () => {
  it("is 3 for every class", () => {
    expect(SUBCLASS_LEVEL).toBe(3);
    expect(levelUp(fixture, "pg1", 1).pendingChoices.map((c) => c.kind)).not.toContain("subclass");
    expect(levelUp(fixture, "pg1", 2).pendingChoices.map((c) => c.kind)).toContain("subclass");
  });

  it("a new character owes no subclass choice at level 1", () => {
    expect(startingChoices(fixture).map((c) => c.kind)).not.toContain("subclass");
  });
});

describe("defineSubclass", () => {
  const base = { id: "p", classId: "fixture-warrior", nameKey: "n", descriptionKey: "d", features: [feature("a")], source: "original", automation: "full" } as const;

  it("must belong to the class and start no earlier than the subclass level", () => {
    expect(() => defineSubclass({ ...base, classId: "other", levels: [{ level: 3, features: ["a"] }] }, fixture)).toThrow();
    expect(() => defineSubclass({ ...base, levels: [{ level: 2, features: ["a"] }] }, fixture)).toThrow();
    expect(() => defineSubclass({ ...base, levels: [{ level: 7, features: ["a"] }, { level: 3, features: [] }] }, fixture)).toThrow();
  });
});

describe("startingChoices and chooseSubclass", () => {
  it("a new character owes skills and the class's first-level choices", () => {
    expect(startingChoices(fixture)).toEqual([
      { id: "skills", kind: "skills", level: 1, count: 2, from: ["athletics", "perception", "survival"] },
      { id: "fixture-style", kind: "class", level: 1, promptKey: "classes.fixture.style-prompt" },
    ]);
  });

  it("choosing the subclass at its level grants that level's features", () => {
    expect(chooseSubclass(fixture, fixturePath, 3)).toEqual({ grantedFeatures: ["fixture-path-gift"], pendingChoices: [] });
  });

  it("choosing late grants everything up to the current level", () => {
    const late = chooseSubclass(fixture, fixturePath, 8);
    expect(late.grantedFeatures).toEqual(["fixture-path-gift", "fixture-path-boon"]);
    expect(late.pendingChoices.map((c) => c.id)).toEqual(["fixture-path-pick"]);
  });

  it("cannot be chosen before its level or for another class", () => {
    expect(() => chooseSubclass(fixture, fixturePath, 2)).toThrow();
    expect(() => chooseSubclass({ ...fixture, id: "other" }, fixturePath, 3)).toThrow();
  });
});

describe("levelForXp", () => {
  it("returns the highest level whose threshold is reached", () => {
    expect(levelForXp(0, thresholds)).toBe(1);
    expect(levelForXp(99, thresholds)).toBe(1);
    expect(levelForXp(100, thresholds)).toBe(2);
    expect(levelForXp(1_000_000, thresholds)).toBe(20);
  });

  it("rejects bad thresholds and bad experience", () => {
    expect(() => levelForXp(-1, thresholds)).toThrow();
    expect(() => levelForXp(1.5, thresholds)).toThrow();
    expect(() => levelForXp(10, thresholds.slice(1))).toThrow();
    expect(() => levelForXp(10, thresholds.map((v) => (v === 300 ? 200 : v)))).toThrow();
  });
});

describe("levelUp", () => {
  it("grants the features of the new level and always owes the hit point choice", () => {
    const up = levelUp(fixture, "pg1", 4);
    expect(up.level).toBe(5);
    expect(up.grantedFeatures).toEqual(["fixture-double-strike"]);
    expect(up.pendingChoices).toEqual([{ id: "hp:5", kind: "hit-points", level: 5 }]);
    expect(up.events).toEqual([{ name: "level.up", payload: { actorId: "pg1", level: 5, classId: "fixture-warrior" } }]);
  });

  it("adds the ability score or feat choice at the standard levels", () => {
    expect(ASI_LEVELS).toEqual([4, 8, 12, 16, 19]);
    const standard = defineClass({ ...fixtureBase, asiLevels: ASI_LEVELS });
    for (const level of ASI_LEVELS) {
      expect(levelUp(standard, "pg1", level - 1).pendingChoices.map((c) => c.kind)).toContain("ability-or-feat");
    }
    expect(levelUp(standard, "pg1", 5).pendingChoices.map((c) => c.kind)).not.toContain("ability-or-feat");
  });

  it("a class can have its own ASI levels", () => {
    expect(levelUp(fixture, "pg1", 5).pendingChoices.map((c) => c.kind)).toContain("ability-or-feat");
    expect(levelUp(fixture, "pg1", 11).pendingChoices.map((c) => c.kind)).not.toContain("ability-or-feat");
  });

  it("owes the subclass at the subclass level, and grants its features once chosen", () => {
    expect(levelUp(fixture, "pg1", 2).pendingChoices).toContainEqual({ id: "subclass", kind: "subclass", level: 3 });
    const chosen = levelUp(fixture, "pg1", 6, fixturePath);
    expect(chosen.grantedFeatures).toEqual(["fixture-path-boon"]);
    expect(chosen.pendingChoices).toContainEqual({ id: "fixture-path-pick", kind: "class", level: 7, promptKey: "classes.fixture.path.pick-prompt" });
    expect(levelUp(fixture, "pg1", 2, fixturePath).pendingChoices.map((c) => c.kind)).not.toContain("subclass");
  });

  it("rejects a subclass that belongs to another class", () => {
    expect(() => levelUp({ ...fixture, id: "other" }, "pg1", 2, fixturePath)).toThrow();
  });

  it("cannot go past the last level or start from a bad level", () => {
    expect(() => levelUp(fixture, "pg1", 20)).toThrow();
    expect(() => levelUp(fixture, "pg1", 0)).toThrow();
    expect(() => levelUp(fixture, "pg1", 2.5)).toThrow();
  });

  it("writes a log line the catalog can render", () => {
    const line = levelUp(fixture, "pg1", 1).log[0];
    if (line === undefined) throw new Error("expected a log line");
    expect(isMessageKey(line.key)).toBe(true);
    expect(renderLogLine(line, () => "Aldo")).toBe("Aldo sale al livello 2.");
  });
});

describe("hit points", () => {
  it("level 1 is the highest hit die value plus the Constitution modifier", () => {
    expect(startingHitPoints(fixture, 2)).toBe(12);
    expect(startingHitPoints(fixture, -1)).toBe(9);
  });

  it("the average is rounded up", () => {
    const gain = gainHitPoints(fixture, "pg1", 12, 2, "average", createScriptedRng([]));
    expect(gain.gained).toBe(8);
    expect(gain.hpMax).toBe(20);
    expect(gainHitPoints({ ...fixture, hitDie: 8 }, "pg1", 10, 0, "average", createScriptedRng([])).gained).toBe(5);
  });

  it("a roll uses the server's die", () => {
    const gain = gainHitPoints(fixture, "pg1", 12, 1, "roll", createScriptedRng([7]));
    expect(gain.gained).toBe(8);
    expect(gain.hpMax).toBe(20);
  });

  it("the SRD sets no minimum per level: a negative result lowers the maximum", () => {
    const gain = gainHitPoints(fixture, "pg1", 12, -3, "roll", createScriptedRng([1]));
    expect(gain.gained).toBe(-2);
    expect(gain.hpMax).toBe(10);
  });

  it("but a maximum never drops below 1 (author's rule)", () => {
    const gain = gainHitPoints(fixture, "pg1", 2, -5, "roll", createScriptedRng([1]));
    expect(gain.hpMax).toBe(1);
    expect(gain.gained).toBe(-1);
  });

  it("rejects a bad maximum or modifier", () => {
    expect(() => gainHitPoints(fixture, "pg1", 0, 0, "average", createScriptedRng([]))).toThrow();
    expect(() => gainHitPoints(fixture, "pg1", 10, 0.5, "average", createScriptedRng([]))).toThrow();
    expect(() => startingHitPoints(fixture, 1.5)).toThrow();
  });

  it("writes a log line the catalog can render", () => {
    const line = gainHitPoints(fixture, "pg1", 12, 2, "average", createScriptedRng([])).log[0];
    if (line === undefined) throw new Error("expected a log line");
    expect(renderLogLine(line, () => "Aldo")).toBe("Aldo guadagna 8 PF massimi (ora 20).");
  });
});
