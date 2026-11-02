import { isMessageKey, renderLogLine } from "@phoenix/shared";
import { describe, expect, it } from "vitest";
import { applyCondition, conditionImmunities, isImmuneToCondition } from "./condition-apply";
import { conditionsOf, type ActiveCondition } from "./conditions";

const input = { id: "poisoned", targetId: "hero", sourceId: "snake", effectId: "fx1", originId: "bite", duration: { kind: "permanent" } } as const;
const petrified: ActiveCondition[] = [{ id: "petrified", sourceId: "gorgon" }];

describe("conditionImmunities", () => {
  it("makes a petrified creature immune to poisoned", () => {
    expect(conditionImmunities(petrified)).toEqual(["poisoned"]);
    expect(conditionImmunities([])).toEqual([]);
  });
});

describe("isImmuneToCondition", () => {
  it("counts immunities from conditions and from other sources such as race or features", () => {
    expect(isImmuneToCondition(petrified, "poisoned")).toBe(true);
    expect(isImmuneToCondition([], "poisoned")).toBe(false);
    expect(isImmuneToCondition([], "charmed", ["charmed"])).toBe(true);
    expect(isImmuneToCondition([], "poisoned", ["charmed"])).toBe(false);
  });
});

describe("applyCondition", () => {
  it("adds the condition to the effect stack", () => {
    const r = applyCondition([], [], input);
    expect(r.applied).toBe(true);
    expect(conditionsOf(r.effects, "hero").map((c) => c.id)).toEqual(["poisoned"]);
    expect(r.log).toEqual([
      { key: "log.condition.applied", params: { target: "hero", condition: "conditions.poisoned" }, refs: { target: "actor-id", condition: "text-key" } },
    ]);
  });

  it("blocks an immune creature and explains why", () => {
    const r = applyCondition([], petrified, input);
    expect(r.applied).toBe(false);
    expect(r.effects).toEqual([]);
    expect(r.log).toEqual([
      { key: "log.condition.immune", params: { target: "hero", condition: "conditions.poisoned" }, refs: { target: "actor-id", condition: "text-key" } },
    ]);
  });

  it("honors immunities granted by other sources", () => {
    const r = applyCondition([], [], { ...input, id: "charmed" }, ["charmed"]);
    expect(r.applied).toBe(false);
  });

  it("keeps existing effects and does not stack the same condition from the same source", () => {
    const once = applyCondition([], [], input).effects;
    const twice = applyCondition(once, [], { ...input, effectId: "fx2" });
    expect(twice.effects).toHaveLength(1);
  });

  it("keeps the same condition from the same source through two different origins", () => {
    const once = applyCondition([], [], input).effects;
    const other = applyCondition(once, [], { ...input, effectId: "fx2", originId: "spit" });
    expect(other.applied).toBe(true);
    expect(other.effects).toHaveLength(2);
  });

  it("checks the prone that comes with unconsciousness against immunities on its own", () => {
    const r = applyCondition([], [], { ...input, id: "unconscious" }, ["prone"]);
    expect(r.applied).toBe(true);
    expect(conditionsOf(r.effects, "hero").map((c) => c.id)).toEqual(["unconscious"]);
    expect(r.log.map((l) => [l.key, l.params["condition"]])).toEqual([
      ["log.condition.applied", "conditions.unconscious"],
      ["log.condition.immune", "conditions.prone"],
    ]);
  });

  it("applies both conditions of unconsciousness when nothing blocks them", () => {
    const r = applyCondition([], [], { ...input, id: "unconscious" });
    expect(conditionsOf(r.effects, "hero").map((c) => c.id)).toEqual(["unconscious", "prone"]);
    expect(r.log.map((l) => l.key)).toEqual(["log.condition.applied", "log.condition.applied"]);
  });

  it("logs nothing when the same condition from the same origin is already there", () => {
    const once = applyCondition([], [], input).effects;
    const again = applyCondition(once, [], { ...input, effectId: "fx9" });
    expect(again.applied).toBe(false);
    expect(again.log).toEqual([]);
  });

  it("reads as Italian text", () => {
    const line = applyCondition([], petrified, input).log[0];
    expect(line && isMessageKey(line.key)).toBe(true);
    expect(renderLogLine(line ?? { key: "", params: {} }, () => "Aria")).toBe("Aria è immune alla condizione Avvelenato.");
    const applied = applyCondition([], [], input).log[0];
    expect(renderLogLine(applied ?? { key: "", params: {} }, () => "Aria")).toBe("Aria subisce la condizione Avvelenato.");
  });
});
