import { createEngine, createScriptedRng, emptyState, type GameEvent, type JsonObject, type ResolutionState, type Rng } from "@phoenix/rules-core";
import { conditionEffects, readUses, readVital, registerCombatant, srdTurnHooks, turnOf, vitalState } from "@phoenix/rules-srd";
import { isMessageKey } from "@phoenix/shared";
import { describe, expect, it } from "vitest";
import { attacksPerAction } from "./fighter";
import { fighterHooks, registerFighter } from "./fighter-hooks";

const engine = createEngine([...srdTurnHooks(), ...fighterHooks()]);
const ev = (name: string, payload: JsonObject = {}): GameEvent => ({ name, payload });
const noRolls = createScriptedRng([]);

function play(state: ResolutionState, event: GameEvent, rng: Rng = noRolls): ResolutionState {
  const result = engine.run(engine.submit(state, event), rng);
  if (result.status !== "done") throw new Error(`expected done, got ${result.status}`);
  return result.state;
}

/** A fighter of the given level, with 20/40 hit points and a +2 Constitution modifier. */
function fighterAt(level: number, extra: JsonObject = {}): ResolutionState {
  const state = emptyState();
  state.store = {
    ...registerCombatant({ actorId: "pg", speedMeters: 9, attacksPerAction: attacksPerAction(level) }),
    "level:pg:fighter": level,
    "vital:pg": vitalState(20, 40),
    "con-mod:pg": 2,
    ...extra,
  };
  return play(state, ev("turn.start", { actorId: "pg", round: 1 }));
}

const keys = (s: ResolutionState): string[] => s.log.map((l) => l.key);
const names = (s: ResolutionState): string[] => s.processed.map((e) => e.name);
const use = (feature: string): GameEvent => ev("feature.declared", { actorId: "pg", feature });

describe("action surge", () => {
  it("gives a second action and records the use", () => {
    const s = play(fighterAt(2), use("action-surge"));
    expect(turnOf(s.store, "pg")?.actions).toBe(2);
    expect(readUses(s.store, "pg")).toEqual({ "action-surge": 1 });
  });

  it("lets the fighter take the Attack action twice in a turn, keeping the attacks of both", () => {
    let s = play(fighterAt(5), use("action-surge"));
    s = play(s, ev("action.declared", { actorId: "pg", action: "attack" }));
    s = play(s, ev("action.declared", { actorId: "pg", action: "attack" }));
    expect(turnOf(s.store, "pg")).toMatchObject({ actions: 0, attacksLeft: 4 });
  });

  it("is refused at level 1, when spent, and for a second use in the same turn at level 17", () => {
    expect(keys(play(fighterAt(1), use("action-surge"))).slice(-1)).toEqual(["log.feature.refused"]);
    const spent = play(fighterAt(2), use("action-surge"));
    expect(keys(play(spent, use("action-surge"))).slice(-1)).toEqual(["log.feature.refused"]);
    const twice = play(fighterAt(17), use("action-surge"));
    expect(keys(play(twice, use("action-surge"))).slice(-1)).toEqual(["log.feature.refused"]);
    expect(readUses(twice.store, "pg")).toEqual({ "action-surge": 1 });
  });
});

describe("missing data and validation", () => {
  it("second wind without a vital state on record says so, not that no use is left", () => {
    const s = fighterAt(3, { "vital:pg": null });
    expect(keys(play(s, use("second-wind"), createScriptedRng([5]))).slice(-1)).toEqual(["log.feature.missing-data"]);
  });

  it("second wind is refused for a creature that is down, even with data", () => {
    const down = fighterAt(3, { "vital:pg": { ...vitalState(1, 40), hp: 0, status: "dying" } });
    expect(keys(play(down, use("second-wind"), createScriptedRng([5]))).slice(-1)).toEqual(["log.feature.refused"]);
  });

  it("a level.up with a level outside 1 to 20 is refused with a log, and nothing is thrown", () => {
    for (const level of [0, 21, 2.5]) {
      const s = play(fighterAt(4), ev("level.up", { actorId: "pg", level, classId: "fighter" }));
      expect(keys(s).slice(-1)).toEqual(["log.class.level-invalid"]);
      expect(s.store["level:pg:fighter"]).toBe(4);
    }
  });
});

describe("features need an active, able creature", () => {
  it("are refused outside the fighter's turn", () => {
    const s = play(fighterAt(3), ev("turn.end", { actorId: "pg", round: 1 }));
    expect(keys(play(s, use("action-surge"))).slice(-1)).toEqual(["log.feature.refused"]);
    expect(keys(play(s, use("second-wind"), createScriptedRng([5]))).slice(-1)).toEqual(["log.feature.refused"]);
  });

  it("are refused once the fighter is incapacitated", () => {
    const s = fighterAt(3);
    const stunned = { ...s, effects: conditionEffects({ id: "stunned", targetId: "pg", sourceId: "x", originId: "o", effectId: "st", duration: { kind: "permanent" } }) };
    expect(keys(play(stunned, use("second-wind"), createScriptedRng([5]))).slice(-1)).toEqual(["log.feature.refused"]);
    expect(readVital(stunned.store, "pg")?.hp).toBe(20);
  });
});

describe("second wind", () => {
  it("heals 1d10 plus level with the bonus action", () => {
    const s = play(fighterAt(3), use("second-wind"), createScriptedRng([6]));
    expect(readVital(s.store, "pg")?.hp).toBe(29);
    expect(turnOf(s.store, "pg")?.bonusActions).toBe(0);
    expect(readUses(s.store, "pg")).toEqual({ "second-wind": 1 });
  });

  it("is refused once the bonus action or the use is gone", () => {
    const s = play(fighterAt(3), use("second-wind"), createScriptedRng([6]));
    expect(keys(play(s, use("second-wind"))).slice(-1)).toEqual(["log.feature.refused"]);
  });

  it("does nothing for an event about another feature", () => {
    const s = play(fighterAt(3), use("something-else"));
    expect(readVital(s.store, "pg")?.hp).toBe(20);
  });
});

describe("rests", () => {
  const spent = { "uses:pg": { "second-wind": 1, "action-surge": 1, indomitable: 1 } };

  it("a short rest restores second wind and action surge but not indomitable", () => {
    const s = play(fighterAt(9, spent), ev("rest.short", { actorId: "pg" }));
    expect(readUses(s.store, "pg")).toEqual({ indomitable: 1 });
    expect(keys(s)).toContain("log.class.uses-restored");
  });

  it("a long rest restores everything", () => {
    expect(readUses(play(fighterAt(9, spent), ev("rest.long", { actorId: "pg" })).store, "pg")).toEqual({});
  });

  it("says nothing when the rest restores nothing (only a long-rest feature spent, short rest)", () => {
    const s = play(fighterAt(9, { "uses:pg": { indomitable: 1 } }), ev("rest.short", { actorId: "pg" }));
    expect(keys(s)).not.toContain("log.class.uses-restored");
    expect(readUses(s.store, "pg")).toEqual({ indomitable: 1 });
  });

  it("changes nothing when nothing was spent, or for someone who is not a fighter", () => {
    expect(keys(play(fighterAt(9), ev("rest.long", { actorId: "pg" }))).includes("log.class.uses-restored")).toBe(false);
    expect(play(fighterAt(9, spent), ev("rest.long", { actorId: "someone" })).store["uses:pg"]).toEqual(spent["uses:pg"]);
  });
});

describe("Great Weapon Fighting", () => {
  const swing = (over: JsonObject = {}): GameEvent =>
    ev("attack.declared", { withinReach: true, actorId: "pg", targetId: "orc", modifier: 5, ac: 10, damage: [{ dice: "2d6", bonus: 3, type: "slashing" }], twoHandedMelee: true, ...over });
  const withStyle = (styles: string[] = ["great-weapon-fighting"]): ResolutionState =>
    play(fighterAt(3, { "styles:pg": styles }), ev("action.declared", { actorId: "pg", action: "attack" }));

  function asked(state: ResolutionState, rolls: number[]) {
    const first = engine.run(engine.submit(state, swing()), createScriptedRng(rolls));
    if (first.status !== "awaiting") throw new Error("expected a question");
    return first;
  }

  it("asks the player before rerolling dice that showed 1 or 2, and rerolls nothing on its own", () => {
    const first = asked(withStyle(), [15, 1, 5]);
    expect(first.request.to).toEqual({ kind: "actor", actorId: "pg" });
    expect(isMessageKey(first.request.promptKey)).toBe(true);
    expect(first.state.processed.map((e) => e.name)).not.toContain("damage.rolled");
  });

  it("yes rerolls only the low dice and the new result stands, even if low again", () => {
    const first = asked(withStyle(), [15, 1, 5]);
    const done = engine.resume(first.state, first.request.id, "yes", createScriptedRng([2]));
    if (done.status !== "done") throw new Error("expected done");
    const dealt = done.state.processed.find((e) => e.name === "damage.rolled");
    expect(dealt?.payload).toMatchObject({ byType: { slashing: 2 + 5 + 3 }, rerolledLow: true });
    expect(keys(done.state)).toContain("log.class.great-weapon-reroll");
  });

  it("no keeps the dice as they were", () => {
    const first = asked(withStyle(), [15, 1, 5]);
    const done = engine.resume(first.state, first.request.id, "no", noRolls);
    if (done.status !== "done") throw new Error("expected done");
    expect(done.state.processed.find((e) => e.name === "damage.rolled")?.payload).toMatchObject({ byType: { slashing: 1 + 5 + 3 } });
  });

  it("an unanswered question counts as no", () => {
    const first = asked(withStyle(), [15, 2, 6]);
    const done = engine.expire(first.state, first.request.id, noRolls);
    if (done.status !== "done") throw new Error("expected done");
    expect(done.state.processed.find((e) => e.name === "damage.rolled")?.payload).toMatchObject({ byType: { slashing: 2 + 6 + 3 } });
  });

  it("does not ask when no die is a 1 or a 2", () => {
    const s = play(withStyle(), swing(), createScriptedRng([15, 3, 6]));
    expect(s.processed.map((e) => e.name)).toContain("damage.rolled");
  });

  it("does not ask without the style, or when the weapon is not held in two hands", () => {
    expect(engine.run(engine.submit(withStyle([]), swing()), createScriptedRng([15, 1, 1])).status).toBe("done");
    expect(engine.run(engine.submit(withStyle(), swing({ twoHandedMelee: false })), createScriptedRng([15, 1, 1])).status).toBe("done");
  });

  it("a critical hit rerolls from all the doubled dice", () => {
    const first = engine.run(engine.submit(withStyle(), swing()), createScriptedRng([20, 1, 4, 2, 6]));
    if (first.status !== "awaiting") throw new Error("expected a question");
    const done = engine.resume(first.state, first.request.id, "yes", createScriptedRng([5, 3]));
    if (done.status !== "done") throw new Error("expected done");
    // dice 1,4,2,6 -> 5,4,3,6 = 18, bonus doubled 6
    expect(done.state.processed.find((e) => e.name === "damage.rolled")?.payload).toMatchObject({ byType: { slashing: 18 + 6 }, critical: true });
  });
});

describe("registerFighter", () => {
  function registered(level: number, extra: Parameters<typeof registerFighter>[0] extends infer T ? Partial<T> : never = {}): ResolutionState {
    const state = emptyState();
    state.store = {
      ...registerCombatant({ actorId: "pg", speedMeters: 9 }),
      ...registerFighter({ actorId: "pg", level, conModifier: 2, ...extra }),
      "vital:pg": vitalState(20, 40),
    };
    return play(state, ev("turn.start", { actorId: "pg", round: 1 }));
  }

  it("a fighter that starts at level 5 has its features and two attacks, without replaying level-ups", () => {
    let s = play(registered(5), use("action-surge"));
    expect(readUses(s.store, "pg")).toEqual({ "action-surge": 1 });
    s = play(s, ev("action.declared", { actorId: "pg", action: "attack" }));
    expect(turnOf(s.store, "pg")?.attacksLeft).toBe(2);
  });

  it("a Champion that starts at level 18 heals with Survivor", () => {
    const s = play(registered(18, { subclass: "champion" }), ev("turn.start", { actorId: "pg", round: 2 }));
    expect(readVital(s.store, "pg")?.hp).toBe(27);
  });

  it("spent uses can be restored from a saved sheet", () => {
    expect(readUses(registered(5, { spent: { "second-wind": 1 } }).store, "pg")).toEqual({ "second-wind": 1 });
  });

  it("keeps the chosen fighting styles, and rejects unknown or repeated ones", () => {
    expect(registerFighter({ actorId: "pg", level: 5, conModifier: 0, fightingStyles: ["defense", "dueling"] })["styles:pg"]).toEqual(["defense", "dueling"]);
    expect(() => registerFighter({ actorId: "pg", level: 5, conModifier: 0, fightingStyles: ["defense", "defense"] })).toThrow();
  });

  it("rejects a bad level or modifier", () => {
    expect(() => registerFighter({ actorId: "pg", level: 0, conModifier: 0 })).toThrow();
    expect(() => registerFighter({ actorId: "pg", level: 21, conModifier: 0 })).toThrow();
    expect(() => registerFighter({ actorId: "pg", level: 5, conModifier: 0.5 })).toThrow();
  });
});

describe("level up", () => {
  const levelUp = (level: number): GameEvent => ev("level.up", { actorId: "pg", level, classId: "fighter" });

  it("raises the attacks of the Attack action at levels 5, 11 and 20", () => {
    let s = fighterAt(4);
    for (const [level, attacks] of [[5, 2], [11, 3], [20, 4]] as const) {
      s = play(s, levelUp(level));
      s = play(s, ev("turn.start", { actorId: "pg", round: level }));
      s = play(s, ev("action.declared", { actorId: "pg", action: "attack" }));
      expect(turnOf(s.store, "pg")?.attacksLeft).toBe(attacks);
      s = play(s, ev("turn.end", { actorId: "pg", round: level }));
    }
  });

  it("records the new level, so the features that depend on it see it", () => {
    const s = play(fighterAt(4), levelUp(5));
    expect(s.store["level:pg:fighter"]).toBe(5);
    expect(keys(s)).toContain("log.class.attacks-per-action");
  });

  it("ignores another class or another creature's kind of event", () => {
    const s = play(fighterAt(4), ev("level.up", { actorId: "pg", level: 5, classId: "wizard" }));
    expect(s.store["level:pg:fighter"]).toBe(4);
  });
});

describe("indomitable", () => {
  const failed = ev("save.failed", { actorId: "pg", modifier: 5, mode: "normal", dc: 15 });

  function question(state: ResolutionState) {
    const first = engine.run(engine.submit(state, failed), noRolls);
    if (first.status !== "awaiting") throw new Error("expected a question");
    return first;
  }

  it("offers a reroll to the fighter, and yes rerolls and spends the use", () => {
    const first = question(fighterAt(9));
    expect(first.request.to).toEqual({ kind: "actor", actorId: "pg" });
    expect(isMessageKey(first.request.promptKey)).toBe(true);
    const done = engine.resume(first.state, first.request.id, "yes", createScriptedRng([14]));
    if (done.status !== "done") throw new Error("expected done");
    expect(readUses(done.state.store, "pg")).toEqual({ indomitable: 1 });
    const names = done.state.processed.map((e) => e.name);
    expect(names).toContain("save.passed");
    expect(done.state.processed.find((e) => e.name === "save.passed")?.payload).toMatchObject({ actorId: "pg", rerolled: true });
  });

  it("a failed reroll is announced as the final failure, once, and Indomitable is not offered again", () => {
    const first = question(fighterAt(17));
    const done = engine.resume(first.state, first.request.id, "yes", createScriptedRng([2]));
    if (done.status !== "done") throw new Error("expected done");
    // The original event stays in the history; exactly one failure is announced as the final, rerolled result.
    const finals = done.state.processed.filter((e) => e.name === "save.failed" && e.payload["rerolled"] === true);
    expect(finals).toHaveLength(1);
    expect(done.state.processed.map((e) => e.name)).not.toContain("save.passed");
    expect(readUses(done.state.store, "pg")).toEqual({ indomitable: 1 });
  });

  it("the original failed save does not reach later hooks once it is rerolled", () => {
    const seen: string[] = [];
    const spy = createEngine([...srdTurnHooks(), ...fighterHooks(), { id: "test.spy", event: "save.failed", priority: 90, run: ({ event }) => { seen.push(event.payload["rerolled"] === true ? "rerolled" : "original"); return {}; } }]);
    const first = spy.run(spy.submit(fighterAt(9), failed), noRolls);
    if (first.status !== "awaiting") throw new Error("expected a question");
    spy.resume(first.state, first.request.id, "yes", createScriptedRng([14]));
    expect(seen).toEqual([]);
  });

  it("no keeps the use", () => {
    const first = question(fighterAt(9));
    const done = engine.resume(first.state, first.request.id, "no", noRolls);
    if (done.status !== "done") throw new Error("expected done");
    expect(readUses(done.state.store, "pg")).toEqual({});
  });

  it("is not offered below level 9 or when no use is left", () => {
    expect(engine.run(engine.submit(fighterAt(8), failed), noRolls).status).toBe("done");
    expect(engine.run(engine.submit(fighterAt(9, { "uses:pg": { indomitable: 1 } }), failed), noRolls).status).toBe("done");
  });
});

describe("champion", () => {
  const champion = { "subclass:pg:fighter": "champion" };
  const attack = (): GameEvent => ev("attack.declared", { withinReach: true, actorId: "pg", targetId: "orc", modifier: 5, ac: 40, weaponAttack: true });
  const attacking = (level: number): ResolutionState =>
    play(fighterAt(level, champion), ev("action.declared", { actorId: "pg", action: "attack" }));

  it("critical hits on 19 from level 3, and on 18 from level 15", () => {
    expect(names(play(attacking(3), attack(), createScriptedRng([19])))).toContain("attack.hit");
    expect(names(play(attacking(3), attack(), createScriptedRng([18])))).toContain("attack.miss");
    expect(names(play(attacking(15), attack(), createScriptedRng([18])))).toContain("attack.hit");
  });

  it("a fighter without the Champion archetype keeps the natural 20", () => {
    const plain = play(fighterAt(5), ev("action.declared", { actorId: "pg", action: "attack" }));
    expect(names(play(plain, attack(), createScriptedRng([19])))).toContain("attack.miss");
  });

  it("an attack that does not say it is a weapon attack is not widened either", () => {
    const s = play(attacking(3), ev("attack.declared", { withinReach: true, actorId: "pg", targetId: "orc", modifier: 5, ac: 40 }), createScriptedRng([19]));
    expect(names(s)).toContain("attack.miss");
    expect(keys(s)).not.toContain("log.class.critical-range");
  });

  it("a spell attack is not widened", () => {
    const s = play(attacking(3), ev("attack.declared", { withinReach: true, actorId: "pg", targetId: "orc", modifier: 5, ac: 40, weaponAttack: false }), createScriptedRng([19]));
    expect(names(s)).toContain("attack.miss");
  });

  it("survivor heals at the start of the turn with half the hit points or fewer", () => {
    const s = play(fighterAt(18, champion), ev("turn.start", { actorId: "pg", round: 2 }));
    expect(readVital(s.store, "pg")?.hp).toBe(27);
    expect(keys(s)).toContain("log.class.survivor");
  });

  it("a wider range already on the attack is kept, and a narrower one is widened", () => {
    const attacked = (criticalFrom: number) => play(attacking(3), ev("attack.declared", { withinReach: true, actorId: "pg", targetId: "orc", modifier: 5, ac: 40, criticalFrom, weaponAttack: true }), createScriptedRng([18]));
    expect(names(attacked(18))).toContain("attack.hit");
    expect(names(attacked(20))).toContain("attack.miss");
    expect(keys(attacked(18))).not.toContain("log.class.critical-range");
    expect(names(attacked(19))).toContain("attack.miss");
  });

  it("survivor without the Constitution modifier on record says so instead of doing nothing silently", () => {
    const after = fighterAt(18, { ...champion, "con-mod:pg": null });
    expect(keys(after)).toContain("log.feature.missing-data");
    expect(readVital(after.store, "pg")?.hp).toBe(20);
  });

  it("survivor does nothing above half or before level 18", () => {
    const healthy = fighterAt(18, { ...champion, "vital:pg": vitalState(30, 40) });
    expect(readVital(play(healthy, ev("turn.start", { actorId: "pg", round: 2 })).store, "pg")?.hp).toBe(30);
    expect(readVital(play(fighterAt(17, champion), ev("turn.start", { actorId: "pg", round: 2 })).store, "pg")?.hp).toBe(20);
  });
});

describe("log lines", () => {
  it("every key the fighter hooks write exists in the catalog", () => {
    let s = fighterAt(18, { "subclass:pg:fighter": "champion", "uses:pg": { indomitable: 1 } });
    s = play(s, use("action-surge"));
    s = play(s, use("second-wind"), createScriptedRng([5]));
    s = play(s, use("action-surge"));
    s = play(s, ev("attack.declared", { withinReach: true, actorId: "pg", targetId: "orc", modifier: 5, ac: 10 }), createScriptedRng([12]));
    s = play(s, ev("rest.long", { actorId: "pg" }));
    for (const l of s.log) expect(isMessageKey(l.key), l.key).toBe(true);
    for (const l of s.log) {
      for (const [name, ref] of Object.entries(l.refs ?? {})) {
        if (ref === "text-key") expect(isMessageKey(String(l.params[name])), String(l.params[name])).toBe(true);
      }
    }
  });
});
