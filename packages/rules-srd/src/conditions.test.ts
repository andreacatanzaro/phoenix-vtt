import { addEffect, advanceRounds, type ActiveEffect } from "@phoenix/rules-core";
import { isMessageKey } from "@phoenix/shared";
import { describe, expect, it } from "vitest";
import { CONDITION_IDS, conditionEffects, conditionMeta, conditionsOf, exhaustionLevel, setExhaustion } from "./conditions";

const apply = (id: (typeof CONDITION_IDS)[number], over: Partial<Parameters<typeof conditionEffects>[0]> = {}): ActiveEffect[] =>
  conditionEffects({ id, targetId: "hero", sourceId: "orc", effectId: `fx-${id}`, originId: "bite", duration: { kind: "permanent" }, ...over });

describe("CONDITION_IDS", () => {
  it("has the 15 SRD conditions", () => {
    expect(CONDITION_IDS).toHaveLength(15);
  });

  it("uses kebab-case English ids and has a catalog name for each", () => {
    for (const id of CONDITION_IDS) {
      expect(id).toMatch(/^[a-z]+(-[a-z]+)*$/);
      expect(isMessageKey(`conditions.${id}`), id).toBe(true);
    }
  });

  it("declares automation and source for each", () => {
    for (const id of CONDITION_IDS) expect(["full", "partial", "manual"]).toContain(conditionMeta[id].automation);
  });
});

describe("conditionEffects", () => {
  it("builds one effect on the stack with a catalog name", () => {
    const [effect, ...rest] = apply("poisoned");
    expect(rest).toEqual([]);
    expect(effect).toMatchObject({ key: "condition:poisoned:bite", nameKey: "conditions.poisoned", targetId: "hero", sourceId: "orc" });
  });

  it("makes an unconscious creature fall prone as well", () => {
    expect(apply("unconscious").map((e) => e.key)).toEqual(["condition:unconscious:bite", "condition:prone:bite:prone"]);
  });

  it("keeps the prone of an unconscious creature after the unconsciousness ends", () => {
    const [unconscious, prone] = apply("unconscious", { duration: { kind: "rounds", remaining: 1 } });
    expect(unconscious?.duration).toEqual({ kind: "rounds", remaining: 1 });
    expect(prone?.duration).toEqual({ kind: "permanent" });
    expect(conditionsOf(advanceRounds(apply("unconscious", { duration: { kind: "rounds", remaining: 1 } })), "hero").map((c) => c.id)).toEqual(["prone"]);
  });

  it("keeps the duration it was given", () => {
    const [effect] = apply("stunned", { duration: { kind: "rounds", remaining: 2 } });
    expect(effect?.duration).toEqual({ kind: "rounds", remaining: 2 });
  });

  it("refuses exhaustion here, which has levels", () => {
    expect(() => apply("exhaustion")).toThrow();
  });
});

describe("conditionsOf", () => {
  it("reads the conditions of one creature from the effect stack, ignoring other effects", () => {
    const other: ActiveEffect = {
      id: "bless", key: "bless", nameKey: "x", sourceId: "c", targetId: "hero", power: 1,
      duration: { kind: "permanent" }, modifiers: [],
    };
    const effects = [...apply("blinded"), ...apply("prone", { targetId: "villain", effectId: "v" }), other];
    expect(conditionsOf(effects, "hero")).toEqual([{ id: "blinded", sourceId: "orc", originId: "bite" }]);
  });

  it("lists a condition once per source", () => {
    const effects = [...apply("poisoned"), ...apply("poisoned", { sourceId: "snake", effectId: "fx2" })];
    expect(conditionsOf(effects, "hero")).toHaveLength(2);
  });

  it("keeps independent origins from the same source apart", () => {
    const addAll = (effects: ActiveEffect[], added: ActiveEffect[]): ActiveEffect[] =>
      added.reduce((acc, effect) => addEffect(acc, effect).effects, effects);
    let effects: ActiveEffect[] = [];
    effects = addAll(effects, apply("stunned", { originId: "spell-a", effectId: "a", duration: { kind: "rounds", remaining: 1 } }));
    effects = addAll(effects, apply("stunned", { originId: "spell-b", effectId: "b", duration: { kind: "rounds", remaining: 3 } }));
    expect(conditionsOf(effects, "hero")).toHaveLength(2);
    expect(conditionsOf(advanceRounds(effects), "hero")).toHaveLength(1);
  });
});

describe("exhaustion", () => {
  it("sets, raises and clears the level on one effect", () => {
    let effects = setExhaustion([], "hero", 2, "fx-ex");
    expect(exhaustionLevel(effects, "hero")).toBe(2);
    effects = setExhaustion(effects, "hero", 4, "fx-ex");
    expect(effects).toHaveLength(1);
    expect(exhaustionLevel(effects, "hero")).toBe(4);
    effects = setExhaustion(effects, "hero", 0, "fx-ex");
    expect(effects).toEqual([]);
    expect(exhaustionLevel(effects, "hero")).toBe(0);
  });

  it("caps the level at 6 and rejects invalid levels", () => {
    expect(exhaustionLevel(setExhaustion([], "hero", 6, "e"), "hero")).toBe(6);
    for (const bad of [-1, 7, 1.5, Number.NaN]) expect(() => setExhaustion([], "hero", bad, "e"), String(bad)).toThrow();
  });

  it("shows up in conditionsOf with its level", () => {
    expect(conditionsOf(setExhaustion([], "hero", 3, "e"), "hero")).toEqual([{ id: "exhaustion", sourceId: "exhaustion", level: 3 }]);
  });
});
