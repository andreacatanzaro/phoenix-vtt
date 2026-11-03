import { addEffect, endEffectsOnEvent, type ActiveEffect } from "@phoenix/rules-core";
import { describe, expect, it } from "vitest";
import { dodgeEffect, dodgeModes, helpEffect, helpEffectIds, isDodging } from "./action-effects";
import { conditionEffects } from "./conditions";

const condition = (id: "stunned" | "grappled" | "poisoned"): ActiveEffect[] =>
  conditionEffects({ id, targetId: "pg", sourceId: "orc", originId: "o", effectId: `c-${id}`, duration: { kind: "permanent" } });

describe("dodge", () => {
  it("gives disadvantage to attacks against and advantage on Dexterity saves", () => {
    const effects = [dodgeEffect("pg", "d1")];
    expect(dodgeModes(effects, "pg")).toEqual({ attacksAgainst: "disadvantage", dexteritySave: "advantage" });
    expect(dodgeModes(effects, "ally")).toEqual({ attacksAgainst: null, dexteritySave: null });
  });

  it("is lost while incapacitated or unable to move", () => {
    expect(isDodging([dodgeEffect("pg", "d1"), ...condition("stunned")], "pg")).toBe(false);
    expect(isDodging([dodgeEffect("pg", "d1"), ...condition("grappled")], "pg")).toBe(false);
    expect(isDodging([dodgeEffect("pg", "d1"), ...condition("poisoned")], "pg")).toBe(true);
  });

  it("ends at the start of the dodger's next turn, not anyone else's", () => {
    const effects = [dodgeEffect("pg", "d1")];
    expect(endEffectsOnEvent(effects, "turn.start", "orc")).toHaveLength(1);
    expect(endEffectsOnEvent(effects, "turn.start", "pg")).toHaveLength(0);
  });

  it("dodging twice does not stack", () => {
    const once = addEffect([], dodgeEffect("pg", "d1")).effects;
    expect(addEffect(once, dodgeEffect("pg", "d2")).applied).toBe(false);
  });
});

describe("help", () => {
  it("is found for the matching roll only", () => {
    const effects = [helpEffect("friend", "pg", { kind: "attack", enemyId: "orc" }, "h1"), helpEffect("friend", "pg", { kind: "check", task: "scalare" }, "h2")];
    expect(helpEffectIds(effects, "pg", { kind: "attack", enemyId: "orc" })).toEqual(["h1"]);
    expect(helpEffectIds(effects, "pg", { kind: "attack", enemyId: "troll" })).toEqual([]);
    expect(helpEffectIds(effects, "pg", { kind: "check", task: "scalare" })).toEqual(["h2"]);
    expect(helpEffectIds(effects, "other", { kind: "check", task: "scalare" })).toEqual([]);
    expect(helpEffectIds(effects, "pg", { kind: "check", task: "forzare la porta" })).toEqual([]);
  });

  it("lasts until the start of the helper's next turn", () => {
    const effects = [helpEffect("friend", "pg", { kind: "check", task: "scalare" }, "h2")];
    expect(endEffectsOnEvent(effects, "turn.start", "pg")).toHaveLength(1);
    expect(endEffectsOnEvent(effects, "turn.start", "friend")).toHaveLength(0);
  });
});
