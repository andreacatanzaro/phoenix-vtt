import { createScriptedRng } from "@phoenix/rules-core";
import { isMessageKey, renderLogLine } from "@phoenix/shared";
import { describe, expect, it } from "vitest";
import { gameTime } from "./game-time";
import { STABILIZE_DC, heal, isRecoveryDue, recoverFromStable, scheduleStableRecovery, rollDeathSave, stabilize, stabilizeWithMedicine, takeDamage, usesDeathSavesByDefault, vitalState, type VitalState } from "./death";

const withSaves = { kind: "character" } as const;
const hit = (amount: number, over: { critical?: boolean; knockOut?: boolean; melee?: boolean } = {}) => ({
  amount,
  critical: over.critical ?? false,
  ...(over.knockOut === undefined ? {} : { knockOut: over.knockOut }),
  ...(over.melee === undefined ? {} : { melee: over.melee }),
});
const dying = (over: Partial<VitalState> = {}): VitalState => ({ hp: 0, hpMax: 20, status: "dying", successes: 0, failures: 0, ...over });

describe("takeDamage while alive", () => {
  it("lowers the hit points when they stay above 0, with an event and a readable line", () => {
    const r = takeDamage(vitalState(15, 20), "hero", hit(5), withSaves);
    expect(r.state).toMatchObject({ hp: 10, status: "alive" });
    expect(r.events).toEqual([{ name: "creature.hp-changed", payload: { actorId: "hero", hp: 10, hpMax: 20, delta: -5 } }]);
    expect(r.log).toEqual([
      { key: "log.hp.lost", params: { actor: "hero", amount: 5, hp: 10, hpMax: 20 }, refs: { actor: "actor-id" } },
    ]);
    expect(renderLogLine(r.log[0] ?? { key: "", params: {} }, () => "Aria")).toBe("Aria perde 5 PF (10/20).");
  });

  it("drops to 0 and falls unconscious, dying, when the damage is not massive", () => {
    const r = takeDamage(vitalState(5, 20), "hero", hit(12), withSaves);
    expect(r.state).toEqual({ hp: 0, hpMax: 20, status: "dying", successes: 0, failures: 0 });
    expect(r.events).toEqual([{ name: "creature.dying", payload: { actorId: "hero" } }]);
    expect(r.log.map((l) => l.key)).toEqual(["log.death.drops"]);
  });

  it("kills outright when the damage left over after 0 reaches the maximum", () => {
    const r = takeDamage(vitalState(5, 20), "hero", hit(25), withSaves);
    expect(r.state.status).toBe("dead");
    expect(r.events.map((e) => e.name)).toEqual(["creature.dead"]);
    expect(r.log.map((l) => l.key)).toEqual(["log.death.instant"]);
    expect(takeDamage(vitalState(5, 20), "hero", hit(24), withSaves).state.status).toBe("dying");
  });

  it("makes NPCs and monsters die at 0 hit points by default", () => {
    for (const kind of ["npc", "monster"] as const) {
      const r = takeDamage(vitalState(5, 20), "orc", hit(6), { kind });
      expect(r.state.status, kind).toBe("dead");
      expect(r.log.map((l) => l.key)).toEqual(["log.death.no-saves"]);
    }
    expect(usesDeathSavesByDefault("character")).toBe(true);
    expect(usesDeathSavesByDefault("npc")).toBe(false);
    expect(usesDeathSavesByDefault("monster")).toBe(false);
  });

  it("treats companions like characters: they drop to dying and make death saves", () => {
    expect(usesDeathSavesByDefault("companion")).toBe(true);
    expect(takeDamage(vitalState(5, 20), "wolf", hit(6), { kind: "companion" }).state.status).toBe("dying");
  });

  it("lets the DM turn death saves on for one NPC or monster, or off for a character", () => {
    expect(takeDamage(vitalState(5, 20), "boss", hit(6), { kind: "monster", usesDeathSaves: true }).state.status).toBe("dying");
    expect(takeDamage(vitalState(5, 20), "hero", hit(6), { kind: "character", usesDeathSaves: false }).state.status).toBe("dead");
  });

  it("can knock out instead: unconscious and stable at 0", () => {
    const r = takeDamage(vitalState(5, 20), "orc", hit(8, { knockOut: true, melee: true }), { kind: "monster", usesDeathSaves: true });
    expect(r.state).toMatchObject({ hp: 0, status: "stable" });
    expect(r.events.map((e) => e.name)).toEqual(["creature.stable"]);
    expect(r.log.map((l) => l.key)).toEqual(["log.death.knocked-out"]);
  });

  it("lets a melee attack knock out an NPC or monster that would otherwise die at 0", () => {
    for (const kind of ["npc", "monster"] as const) {
      const r = takeDamage(vitalState(5, 20), "orc", hit(8, { knockOut: true, melee: true }), { kind });
      expect(r.state, kind).toMatchObject({ hp: 0, status: "stable" });
      expect(r.log.map((l) => l.key)).toEqual(["log.death.knocked-out"]);
    }
  });

  it("still kills outright on massive damage, even with a knock out", () => {
    const r = takeDamage(vitalState(5, 20), "orc", hit(25, { knockOut: true, melee: true }), { kind: "monster" });
    expect(r.state.status).toBe("dead");
    expect(r.log.map((l) => l.key)).toEqual(["log.death.instant"]);
  });

  it("refuses a knock out that does not come from a melee attack", () => {
    expect(() => takeDamage(vitalState(5, 20), "orc", hit(8, { knockOut: true }), withSaves)).toThrow();
    expect(() => takeDamage(vitalState(5, 20), "orc", hit(8, { knockOut: true, melee: false }), withSaves)).toThrow();
    expect(takeDamage(vitalState(5, 20), "orc", hit(8, { melee: true }), withSaves).state.status).toBe("dying");
  });

  it("ignores zero damage and rejects invalid amounts", () => {
    expect(takeDamage(vitalState(5, 20), "hero", hit(0), withSaves).state.hp).toBe(5);
    for (const bad of [-1, 1.5, Number.NaN]) expect(() => takeDamage(vitalState(5, 20), "hero", hit(bad), withSaves), String(bad)).toThrow();
  });

  it("refuses to hurt the dead", () => {
    expect(() => takeDamage({ ...dying(), status: "dead" }, "hero", hit(1), withSaves)).toThrow();
  });
});

describe("takeDamage while dying", () => {
  it("adds one death save failure", () => {
    const r = takeDamage(dying(), "hero", hit(3), withSaves);
    expect(r.state).toMatchObject({ status: "dying", failures: 1 });
    expect(r.log.map((l) => l.key)).toEqual(["log.death.damage-at-zero"]);
  });

  it("adds two failures on a critical hit", () => {
    expect(takeDamage(dying(), "hero", hit(3, { critical: true }), withSaves).state.failures).toBe(2);
  });

  it("dies at the third failure and the log shows the damage that added it", () => {
    const r = takeDamage(dying({ failures: 2 }), "hero", hit(3), withSaves);
    expect(r.state.status).toBe("dead");
    expect(r.events.map((e) => e.name)).toEqual(["creature.dead"]);
    expect(r.log.map((l) => l.key)).toEqual(["log.death.damage-at-zero", "log.death.dead"]);
  });

  it("does the same when a critical hit adds the last two failures at once", () => {
    const r = takeDamage(dying({ failures: 1 }), "hero", hit(3, { critical: true }), withSaves);
    expect(r.state.status).toBe("dead");
    expect(r.log.map((l) => l.key)).toEqual(["log.death.damage-at-zero", "log.death.dead"]);
    expect(r.log[0]?.params).toMatchObject({ added: 2, failures: 3 });
  });

  it("dies at once when the damage reaches the maximum", () => {
    const r = takeDamage(dying(), "hero", hit(20), withSaves);
    expect(r.state.status).toBe("dead");
    expect(r.log.map((l) => l.key)).toEqual(["log.death.instant"]);
  });
});

describe("takeDamage while stable", () => {
  it("makes the creature dying again with the counters cleared", () => {
    const r = takeDamage({ hp: 0, hpMax: 20, status: "stable", successes: 0, failures: 0 }, "hero", hit(3), withSaves);
    expect(r.state).toMatchObject({ status: "dying", successes: 0, failures: 0 });
  });
});

describe("takeDamage while stable and not entitled to death saves", () => {
  const stable: VitalState = { hp: 0, hpMax: 20, status: "stable", successes: 0, failures: 0 };

  it("kills a knocked-out NPC or monster that is hurt again", () => {
    for (const kind of ["npc", "monster"] as const) {
      const r = takeDamage(stable, "orc", hit(3), { kind });
      expect(r.state.status, kind).toBe("dead");
      expect(r.log.map((l) => l.key)).toEqual(["log.death.no-saves"]);
    }
  });

  it("starts death saves again if the DM enabled them for that creature", () => {
    expect(takeDamage(stable, "boss", hit(3), { kind: "monster", usesDeathSaves: true }).state.status).toBe("dying");
  });

  it("still starts them for characters and companions", () => {
    for (const kind of ["character", "companion"] as const) {
      expect(takeDamage(stable, "hero", hit(3), { kind }).state.status, kind).toBe("dying");
    }
  });
});

describe("rollDeathSave", () => {
  const save = (natural: number[], state = dying(), options: { modifier?: number } = {}) =>
    rollDeathSave(state, "hero", options, createScriptedRng(natural));

  it("succeeds on 10 or more and fails below 10", () => {
    expect(save([10]).state.successes).toBe(1);
    expect(save([9]).state.failures).toBe(1);
  });

  it("applies a modifier to the total", () => {
    expect(save([8], dying(), { modifier: 2 }).state.successes).toBe(1);
  });

  it("becomes stable at the third success", () => {
    const r = save([12], dying({ successes: 2 }));
    expect(r.state).toMatchObject({ status: "stable", successes: 0, failures: 0 });
    expect(r.events.map((e) => e.name)).toEqual(["creature.stable"]);
  });

  it("dies at the third failure", () => {
    const r = save([4], dying({ failures: 2 }));
    expect(r.state.status).toBe("dead");
    expect(r.events.map((e) => e.name)).toEqual(["creature.dead"]);
  });

  it("kills directly on a natural 1 (author's rule)", () => {
    const r = save([1]);
    expect(r.state.status).toBe("dead");
    expect(r.log.map((l) => l.key)).toContain("log.death.natural-1");
  });

  it("brings the creature back with 1 hit point on a natural 20", () => {
    const r = save([20], dying({ failures: 2, successes: 1 }));
    expect(r.state).toEqual({ hp: 1, hpMax: 20, status: "alive", successes: 0, failures: 0 });
    expect(r.events.map((e) => e.name)).toEqual(["creature.revived"]);
    expect(r.log.map((l) => l.key)).toContain("log.death.natural-20");
  });

  it("only works for a dying creature", () => {
    for (const status of ["alive", "stable", "dead"] as const) {
      expect(() => save([10], { ...dying(), status }), status).toThrow();
    }
  });

  it("logs the whole roll before the outcome and reads as Italian", () => {
    const r = save([12]);
    expect(r.log[0]?.key).toBe("log.roll.detail");
    for (const line of r.log) {
      expect(isMessageKey(line.key), line.key).toBe(true);
      expect(renderLogLine(line, () => "Aria").length).toBeGreaterThan(0);
    }
  });

  it("does not change its input", () => {
    const start = dying();
    const snapshot = JSON.stringify(start);
    save([10], start);
    expect(JSON.stringify(start)).toBe(snapshot);
  });
});

describe("heal", () => {
  it("brings a dying creature back with the healed amount, capped at the maximum, counters cleared", () => {
    const r = heal(dying({ failures: 2 }), "hero", 7);
    expect(r.state).toEqual({ hp: 7, hpMax: 20, status: "alive", successes: 0, failures: 0 });
    expect(r.events.map((e) => e.name)).toEqual(["creature.revived"]);
    expect(heal(dying(), "hero", 99).state.hp).toBe(20);
  });

  it("logs the hit points actually restored, not the amount requested", () => {
    expect(heal(dying(), "hero", 99).log[0]?.params["amount"]).toBe(20);
    expect(heal(dying(), "hero", 7).log[0]?.params["amount"]).toBe(7);
  });

  it("wakes a stable creature too", () => {
    expect(heal({ hp: 0, hpMax: 20, status: "stable", successes: 0, failures: 0 }, "hero", 4).state.status).toBe("alive");
  });

  it("raises an alive creature up to its maximum, logging only what it actually regained", () => {
    const r = heal(vitalState(15, 20), "hero", 99);
    expect(r.state.hp).toBe(20);
    expect(r.events).toEqual([{ name: "creature.hp-changed", payload: { actorId: "hero", hp: 20, hpMax: 20, delta: 5 } }]);
    expect(r.log[0]).toMatchObject({ key: "log.hp.gained", params: { amount: 5, hp: 20, hpMax: 20 } });
    expect(renderLogLine(r.log[0] ?? { key: "", params: {} }, () => "Aria")).toBe("Aria recupera 5 PF (20/20).");
  });

  it("says nothing when an alive creature is already at its maximum", () => {
    const r = heal(vitalState(20, 20), "hero", 5);
    expect(r.state.hp).toBe(20);
    expect(r.events).toEqual([]);
    expect(r.log).toEqual([]);
  });

  it("cannot heal the dead and rejects invalid amounts", () => {
    expect(() => heal({ ...dying(), status: "dead" }, "hero", 5)).toThrow();
    for (const bad of [-1, 1.5, Number.NaN]) expect(() => heal(dying(), "hero", bad), String(bad)).toThrow();
  });
});

describe("stabilize and recoverFromStable", () => {
  it("stabilizes only a dying creature", () => {
    const r = stabilize(dying({ failures: 2 }), "hero");
    expect(r.state).toMatchObject({ status: "stable", failures: 0 });
    expect(() => stabilize(vitalState(5, 20), "hero")).toThrow();
  });

  const stable: VitalState = { hp: 0, hpMax: 20, status: "stable", successes: 0, failures: 0 };

  it("rolls 1d4 hours for a stable creature and records when it will recover, in game time", () => {
    const r = scheduleStableRecovery(stable, "hero", gameTime(1000), createScriptedRng([3]));
    expect(r.state.recoversAt).toEqual(gameTime(1000 + 3 * 60));
    expect(r.log.map((l) => l.key)).toEqual(["log.roll.detail", "log.death.recovery-scheduled"]);
    for (const line of r.log) expect(isMessageKey(line.key), line.key).toBe(true);
    expect(renderLogLine(r.log[1] ?? { key: "", params: {} }, () => "Aria")).toBe("Aria si riprenderà tra 3 ore.");
  });

  it("keeps an existing recovery time and refuses non-stable creatures", () => {
    const planned = scheduleStableRecovery(stable, "hero", gameTime(0), createScriptedRng([2])).state;
    const again = scheduleStableRecovery(planned, "hero", gameTime(500), createScriptedRng([4]));
    expect(again.state.recoversAt).toEqual(gameTime(120));
    expect(again.log).toEqual([]);
    expect(() => scheduleStableRecovery(dying(), "hero", gameTime(0), createScriptedRng([2]))).toThrow();
  });

  it("recovers only when the game time has reached the recovery time", () => {
    const planned = scheduleStableRecovery(stable, "hero", gameTime(0), createScriptedRng([2])).state; // 120 minutes
    expect(isRecoveryDue(planned, gameTime(119))).toBe(false);
    expect(isRecoveryDue(planned, gameTime(120))).toBe(true);
    expect(() => recoverFromStable(planned, "hero", gameTime(119))).toThrow();
    const r = recoverFromStable(planned, "hero", gameTime(120));
    expect(r.state).toEqual({ hp: 1, hpMax: 20, status: "alive", successes: 0, failures: 0 });
    expect(r.events.map((e) => e.name)).toEqual(["creature.revived"]);
  });

  it("refuses to recover a creature whose time was never rolled, unless the DM forces it", () => {
    expect(() => recoverFromStable(stable, "hero", gameTime(99_999))).toThrow();
    expect(recoverFromStable(stable, "hero", gameTime(0), { force: true }).state.status).toBe("alive");
  });

  it("only works for a stable creature", () => {
    expect(() => recoverFromStable(dying(), "hero", gameTime(0), { force: true })).toThrow();
  });

  it("forgets the recovery time as soon as the creature stops being stable", () => {
    const planned = scheduleStableRecovery(stable, "hero", gameTime(0), createScriptedRng([2])).state;
    const hurtAgain = takeDamage(planned, "hero", hit(3), withSaves).state;
    expect(hurtAgain.status).toBe("dying");
    expect("recoversAt" in hurtAgain).toBe(false);
    expect("recoversAt" in heal(planned, "hero", 5).state).toBe(false);
  });
});

describe("vitalState", () => {
  it("rejects hit points that make no sense", () => {
    expect(() => vitalState(-1, 10)).toThrow();
    expect(() => vitalState(11, 10)).toThrow();
    expect(() => vitalState(0, 10)).toThrow();
    expect(vitalState(10, 10).status).toBe("alive");
  });
});

describe("stabilizeWithMedicine", () => {
  const attempt = (natural: number[], state = dying({ failures: 2 }), options: { modifier: number } = { modifier: 0 }) =>
    stabilizeWithMedicine(state, "hero", options, createScriptedRng(natural));

  it("uses a DC of 10", () => {
    expect(STABILIZE_DC).toBe(10);
  });

  it("stabilizes the creature when the check meets the DC", () => {
    const r = attempt([8], dying({ failures: 2 }), { modifier: 2 });
    expect(r.check.success).toBe(true);
    expect(r.state).toMatchObject({ status: "stable", failures: 0, successes: 0 });
    expect(r.events.map((e) => e.name)).toEqual(["creature.stable"]);
  });

  it("leaves the creature dying, counters untouched, when the check fails", () => {
    const start = dying({ failures: 2, successes: 1 });
    const r = attempt([9], start);
    expect(r.check.success).toBe(false);
    expect(r.state).toEqual(start);
    expect(r.events).toEqual([]);
  });

  it("follows the natural 20 and natural 1 rule of d20 tests", () => {
    expect(attempt([20], dying(), { modifier: -20 }).state.status).toBe("stable");
    expect(attempt([1], dying(), { modifier: 20 }).state.status).toBe("dying");
  });

  it("honors advantage and disadvantage", () => {
    const adv = stabilizeWithMedicine(dying(), "hero", { modifier: 0, mode: "advantage" }, createScriptedRng([3, 14]));
    expect(adv.state.status).toBe("stable");
    const dis = stabilizeWithMedicine(dying(), "hero", { modifier: 0, mode: "disadvantage" }, createScriptedRng([3, 14]));
    expect(dis.state.status).toBe("dying");
  });

  it("logs the roll, the result and the stabilization as Italian text", () => {
    const r = attempt([12]);
    expect(r.log.map((l) => l.key)).toEqual(["log.roll.detail", "log.d20.success", "log.death.stable"]);
    for (const line of r.log) {
      expect(isMessageKey(line.key), line.key).toBe(true);
      expect(renderLogLine(line, () => "Aria").length).toBeGreaterThan(0);
    }
  });

  it("only works on a dying creature and rejects bad modifiers", () => {
    for (const status of ["alive", "stable", "dead"] as const) {
      expect(() => attempt([10], { ...dying(), status }), status).toThrow();
    }
    expect(() => attempt([10], dying(), { modifier: Number.NaN })).toThrow();
  });
});
