import { createEngine, createScriptedRng, emptyState, type GameEvent, type JsonObject, type ResolutionState, type Rng } from "@phoenix/rules-core";
import { isMessageKey } from "@phoenix/shared";
import { describe, expect, it } from "vitest";
import { conditionEffects, setExhaustion, type ConditionId } from "./conditions";
import { activeActor, registerCombatant, srdTurnHooks, turnOf } from "./turn-hooks";

const engine = createEngine(srdTurnHooks());
const ev = (name: string, payload: JsonObject = {}): GameEvent => ({ name, payload });
const noRolls = createScriptedRng([]);

function play(state: ResolutionState, event: GameEvent, rng: Rng = noRolls): ResolutionState {
  const result = engine.run(engine.submit(state, event), rng);
  if (result.status !== "done") throw new Error(`expected done, got ${result.status}`);
  return result.state;
}

function table(extra: { speed?: number; attacks?: number } = {}): ResolutionState {
  const state = emptyState();
  state.store = {
    ...registerCombatant({ actorId: "pg", speedMeters: extra.speed ?? 9, attacksPerAction: extra.attacks ?? 2 }),
    ...registerCombatant({ actorId: "orc", speedMeters: 9 }),
  };
  return state;
}

/** pg's turn is on; orc is registered but has not had a turn yet. */
const started = (state = table()): ResolutionState => play(state, ev("turn.start", { actorId: "pg", round: 1 }));
/** Ends whoever's turn it is and starts `actorId`'s. */
const switchTo = (state: ResolutionState, actorId: string): ResolutionState => {
  const current = activeActor(state.store);
  const ended = current === null ? state : play(state, ev("turn.end", { actorId: current, round: 1 }));
  return play(ended, ev("turn.start", { actorId, round: 2 }));
};
const keys = (s: ResolutionState): string[] => s.log.map((l) => l.key);
const names = (s: ResolutionState): string[] => s.processed.map((e) => e.name);
const withCondition = (state: ResolutionState, id: ConditionId, targetId: string, sourceId = "x"): ResolutionState => ({
  ...state,
  effects: [...state.effects, ...conditionEffects({ id, targetId, sourceId, originId: "o", effectId: `${id}-${targetId}`, duration: { kind: "permanent" } })],
});

describe("turn start", () => {
  it("gives the creature a fresh turn with its speed", () => {
    const s = play(table(), ev("turn.start", { actorId: "pg", round: 1 }));
    expect(turnOf(s.store, "pg")).toMatchObject({ actions: 1, bonusActions: 1, reactions: 1, movementTotal: 9, attacksLeft: 0 });
    expect(keys(s)).toEqual(["log.turn.ready"]);
  });

  it("tells the table when the creature starts its turn incapacitated, without using up its resources", () => {
    const s = play(withCondition(table(), "stunned", "pg"), ev("turn.start", { actorId: "pg", round: 1 }));
    expect(turnOf(s.store, "pg")).toMatchObject({ actions: 1, bonusActions: 1, reactions: 1 });
    expect(keys(s)).toEqual(["log.turn.incapacitated"]);
    expect(keys(play(s, ev("action.declared", { actorId: "pg", action: "dash" }))).slice(-1)).toEqual(["log.action.incapacitated"]);
  });

  it("a creature freed from incapacitation during its turn can act again", () => {
    let s = play(withCondition(table(), "stunned", "pg"), ev("turn.start", { actorId: "pg", round: 1 }));
    s = { ...s, effects: [] };
    s = play(s, ev("action.declared", { actorId: "pg", action: "dash" }));
    expect(turnOf(s.store, "pg")?.actions).toBe(0);
    expect(keys(s).slice(-1)).toEqual(["log.action.used"]);
  });

  it("the speed shown at the start counts the conditions", () => {
    const s = play(withCondition(table(), "grappled", "pg"), ev("turn.start", { actorId: "pg", round: 1 }));
    expect(s.log[0]?.params).toMatchObject({ meters: 0 });
  });

  it("resets what was used last turn", () => {
    let s = play(started(), ev("action.declared", { actorId: "pg", action: "dash" }));
    s = play(s, ev("turn.start", { actorId: "pg", round: 2 }));
    expect(turnOf(s.store, "pg")).toMatchObject({ actions: 1, movementTotal: 9 });
  });

  it("a creature that was never registered gets no turn state and no actions", () => {
    const s = play(emptyState(), ev("turn.start", { actorId: "ghost" }));
    expect(turnOf(s.store, "ghost")).toBeNull();
    expect(keys(s)).toEqual(["log.turn.unregistered"]);
    expect(keys(play(s, ev("action.declared", { actorId: "ghost", action: "dash" }))).slice(-1)).toEqual(["log.turn.unregistered"]);
    expect(keys(play(s, ev("movement.declared", { actorId: "ghost", meters: 1 }))).slice(-1)).toEqual(["log.turn.unregistered"]);
  });

  it("turn.resume gives the turn back without resetting it", () => {
    let s = play(started(), ev("action.declared", { actorId: "pg", action: "dash" }));
    s = switchTo(s, "orc");
    s = play(s, ev("turn.end", { actorId: "orc" }));
    s = play(s, ev("turn.resume", { actorId: "pg", round: 1 }));
    expect(activeActor(s.store)).toBe("pg");
    expect(turnOf(s.store, "pg")).toMatchObject({ actions: 0, movementTotal: 18 });
  });

  it("only the creature whose turn it is can act; turn.end closes the turn", () => {
    expect(activeActor(started().store)).toBe("pg");
    const orcActs = play(started(), ev("action.declared", { actorId: "orc", action: "dash" }));
    expect(keys(orcActs).slice(-1)).toEqual(["log.action.not-your-turn"]);
    const ended = play(started(), ev("turn.end", { actorId: "pg", round: 1 }));
    expect(activeActor(ended.store)).toBeNull();
    expect(keys(play(ended, ev("action.declared", { actorId: "pg", action: "dash" }))).slice(-1)).toEqual(["log.action.not-your-turn"]);
    expect(keys(play(ended, ev("movement.declared", { actorId: "pg", meters: 1 }))).slice(-1)).toEqual(["log.movement.refused"]);
  });

  it("a turn.end for someone else's turn changes nothing", () => {
    expect(activeActor(play(started(), ev("turn.end", { actorId: "orc" })).store)).toBe("pg");
  });
});

describe("actions", () => {
  it("dash spends the action and doubles the movement", () => {
    const s = play(started(), ev("action.declared", { actorId: "pg", action: "dash" }));
    expect(turnOf(s.store, "pg")).toMatchObject({ actions: 0, movementTotal: 18 });
    expect(names(s)).toContain("action.taken");
  });

  it("refuses a second action and logs it", () => {
    let s = play(started(), ev("action.declared", { actorId: "pg", action: "dash" }));
    s = play(s, ev("action.declared", { actorId: "pg", action: "disengage" }));
    expect(keys(s).slice(-1)).toEqual(["log.action.refused"]);
    expect(turnOf(s.store, "pg")?.disengaged).toBe(false);
  });

  it("refuses an action before the creature's turn has started, and an unknown one", () => {
    expect(keys(play(table(), ev("action.declared", { actorId: "pg", action: "dash" })))).toEqual(["log.action.not-your-turn"]);
    expect(keys(play(started(), ev("action.declared", { actorId: "pg", action: "fly" }))).slice(-1)).toEqual(["log.action.unknown"]);
  });

  it("dodge adds the effect, which ends at the dodger's next turn start", () => {
    let s = play(started(), ev("action.declared", { actorId: "pg", action: "dodge" }));
    expect(s.effects.map((e) => e.key)).toEqual(["action:dodge"]);
    s = switchTo(s, "orc");
    expect(s.effects).toHaveLength(1);
    s = switchTo(s, "pg");
    expect(s.effects).toHaveLength(0);
  });

  it("help needs an ally and gives a Help effect", () => {
    const s = play(started(), ev("action.declared", { actorId: "pg", action: "help", allyId: "orc", enemyId: "troll", enemyWithinReach: true }));
    expect(s.effects).toHaveLength(1);
    const noAlly = play(started(), ev("action.declared", { actorId: "pg", action: "help", task: "scalare" }));
    expect(keys(noAlly).slice(-1)).toEqual(["log.action.invalid"]);
    expect(turnOf(noAlly.store, "pg")?.actions).toBe(1);
    const noText = play(started(), ev("action.declared", { actorId: "pg", action: "ready", description: " " }));
    expect(keys(noText).slice(-1)).toEqual(["log.action.invalid"]);
    expect(turnOf(noText.store, "pg")?.actions).toBe(1);
  });

  it("hide, search and use-object spend the action and leave the ruling to the DM", () => {
    for (const action of ["hide", "search", "use-object"]) {
      const s = play(started(), ev("action.declared", { actorId: "pg", action }));
      expect(turnOf(s.store, "pg")?.actions).toBe(0);
      expect(keys(s)).toContain("log.action.dm-resolves");
    }
  });

  it("ready keeps the description and the reaction releases it", () => {
    let s = play(started(), ev("action.declared", { actorId: "pg", action: "ready", description: "colpisco chi apre la porta" }));
    expect(turnOf(s.store, "pg")?.readied).toBe("colpisco chi apre la porta");
    s = play(s, ev("action.ready-released", { actorId: "pg" }));
    expect(turnOf(s.store, "pg")).toMatchObject({ readied: "colpisco chi apre la porta", readiedTriggered: true, reactions: 0 });
    expect(names(s)).toContain("action.readied-resolved");
    expect(s.processed.find((e) => e.name === "action.readied-resolved")?.payload["description"]).toBe("colpisco chi apre la porta");
    expect(keys(play(started(), ev("action.ready-released", { actorId: "pg" }))).slice(-1)).toEqual(["log.action.invalid"]);
  });

  it("an incapacitated creature cannot act", () => {
    const stunned = play(withCondition(table(), "stunned", "pg"), ev("turn.start", { actorId: "pg", round: 1 }));
    expect(keys(play(stunned, ev("action.declared", { actorId: "pg", action: "attack" }))).slice(-1)).toEqual(["log.action.incapacitated"]);
  });
});

describe("attacks", () => {
  const attack = (over: JsonObject = {}): GameEvent => ev("attack.declared", { withinReach: true, actorId: "pg", targetId: "orc", modifier: 5, ac: 13, ...over });
  const attacking = (): ResolutionState => play(started(), ev("action.declared", { actorId: "pg", action: "attack" }));

  it("the Attack action allows as many attacks as the creature has", () => {
    let s = attacking();
    expect(turnOf(s.store, "pg")?.attacksLeft).toBe(2);
    s = play(s, attack(), createScriptedRng([10]));
    s = play(s, attack(), createScriptedRng([10]));
    expect(turnOf(s.store, "pg")?.attacksLeft).toBe(0);
    s = play(s, attack());
    expect(keys(s).slice(-1)).toEqual(["log.attack.no-attacks"]);
  });

  it("an attack without the Attack action is refused with its own message and rolls nothing", () => {
    expect(keys(play(started(), attack())).slice(-1)).toEqual(["log.attack.no-attacks"]);
  });

  it("a critical range outside 2 to 20 is rejected without spending the attack, or throwing", () => {
    for (const criticalFrom of [1, 19.5, 25]) {
      const s = play(attacking(), attack({ criticalFrom }));
      expect(keys(s).slice(-1)).toEqual(["log.action.invalid"]);
      expect(turnOf(s.store, "pg")?.attacksLeft).toBe(2);
    }
  });

  it("a hit emits attack.hit and rolls damage when given", () => {
    const damage = [{ dice: "1d8", bonus: 3, type: "slashing" }];
    const s = play(attacking(), attack({ damage }), createScriptedRng([10, 4]));
    expect(names(s)).toContain("attack.hit");
    expect(s.processed.find((e) => e.name === "damage.rolled")?.payload).toMatchObject({ targetId: "orc", byType: { slashing: 7 }, critical: false });
  });

  it("a miss emits attack.miss and no damage", () => {
    const s = play(attacking(), attack({ damage: [{ dice: "1d8", bonus: 0, type: "slashing" }] }), createScriptedRng([2]));
    expect(names(s)).toContain("attack.miss");
    expect(names(s)).not.toContain("damage.rolled");
  });

  it("a critical hit doubles dice and bonus", () => {
    const s = play(attacking(), attack({ damage: [{ dice: "1d8", bonus: 3, type: "slashing" }] }), createScriptedRng([20, 4, 5]));
    expect(s.processed.find((e) => e.name === "damage.rolled")?.payload).toMatchObject({ byType: { slashing: 15 }, critical: true });
  });

  it("a wider critical range makes 19 a critical hit", () => {
    const s = play(attacking(), attack({ criticalFrom: 19, ac: 40 }), createScriptedRng([19]));
    expect(s.processed.find((e) => e.name === "attack.hit")?.payload["critical"]).toBe(true);
  });

  it("a dodging target gives disadvantage; the lower die is used", () => {
    let s = switchTo(started(), "orc");
    s = play(s, ev("action.declared", { actorId: "orc", action: "dodge" }));
    s = switchTo(s, "pg");
    s = play(s, ev("action.declared", { actorId: "pg", action: "attack" }));
    s = play(s, attack({ ac: 12 }), createScriptedRng([18, 3]));
    expect(names(s)).toContain("attack.miss");
  });

  it("an attacker the dodger cannot see ignores the dodge", () => {
    let s = switchTo(started(), "orc");
    s = play(s, ev("action.declared", { actorId: "orc", action: "dodge" }));
    s = switchTo(s, "pg");
    s = play(s, ev("action.declared", { actorId: "pg", action: "attack" }));
    s = play(s, attack({ ac: 12, attackerUnseen: true }), createScriptedRng([18]));
    expect(names(s)).toContain("attack.hit");
  });

  it("Help gives advantage on the first attack and is then used up", () => {
    let s = switchTo(started(), "orc");
    s = play(s, ev("action.declared", { actorId: "orc", action: "help", allyId: "pg", enemyId: "troll", enemyWithinReach: true }));
    s = switchTo(s, "pg");
    s = play(s, ev("action.declared", { actorId: "pg", action: "attack" }));
    s = play(s, attack({ targetId: "troll", ac: 15 }), createScriptedRng([4, 16]));
    expect(names(s)).toContain("attack.hit");
    expect(s.effects).toHaveLength(0);
  });

  it("advantage and disadvantage cancel", () => {
    const plain = play(attacking(), attack({ mode: "advantage", ac: 12 }), createScriptedRng([3, 4]));
    expect(names(plain)).toContain("attack.miss");
    const both = play(withCondition(attacking(), "poisoned", "pg"), attack({ mode: "advantage", ac: 12 }), createScriptedRng([15]));
    expect(names(both)).toContain("attack.hit");
  });

  it("a hit on a paralyzed target within reach is a critical hit", () => {
    const s = play(withCondition(attacking(), "paralyzed", "orc"), attack(), createScriptedRng([15, 15]));
    expect(s.processed.find((e) => e.name === "attack.hit")?.payload["critical"]).toBe(true);
  });

  it("a charmed attacker cannot attack its charmer, and the refused attack costs nothing", () => {
    const s = play(withCondition(attacking(), "charmed", "pg", "orc"), attack());
    expect(keys(s).slice(-1)).toEqual(["log.attack.forbidden"]);
    expect(turnOf(s.store, "pg")?.attacksLeft).toBe(2);
  });

  it("malformed damage is rejected before the attack is spent, and nothing is thrown", () => {
    for (const damage of [[{ dice: "bad", bonus: 0, type: "fire" }], [{ dice: "2d6+3", bonus: 0, type: "fire" }], [{ dice: "1d8", bonus: 1.5, type: "fire" }], [{ dice: "1d8", bonus: 0, type: "plasma" }], "1d8", [5]]) {
      const s = play(attacking(), attack({ damage }), createScriptedRng([15]));
      expect(keys(s).slice(-1)).toEqual(["log.action.invalid"]);
      expect(turnOf(s.store, "pg")?.attacksLeft).toBe(2);
    }
  });

  it("an attack with no damage at all is still rolled", () => {
    expect(names(play(attacking(), attack(), createScriptedRng([15])))).toContain("attack.hit");
  });

  it("a registered melee attack with bad damage is rejected at registration", () => {
    expect(() => registerCombatant({ actorId: "x", speedMeters: 9, meleeAttack: { modifier: 5, damage: [{ dice: "bad", bonus: 0, type: "fire" }] } })).toThrow();
  });

  it("a malformed attack costs nothing", () => {
    const s = play(attacking(), ev("attack.declared", { withinReach: true, actorId: "pg", targetId: "orc" }));
    expect(keys(s).slice(-1)).toEqual(["log.action.unknown"]);
    expect(turnOf(s.store, "pg")?.attacksLeft).toBe(2);
  });

  it("an attacker who became incapacitated during the turn cannot attack", () => {
    const s = play(withCondition(attacking(), "stunned", "pg"), attack());
    expect(keys(s).slice(-1)).toEqual(["log.action.incapacitated"]);
    expect(turnOf(s.store, "pg")?.attacksLeft).toBe(2);
  });

  describe("two-weapon fighting", () => {
    const both = { lightMelee: true, offHandLightMelee: true };

    it("the off-hand attack follows a light melee attack and costs the bonus action", () => {
      let s = play(attacking(), attack(both), createScriptedRng([10]));
      s = play(s, attack({ ...both, bonusAction: true }), createScriptedRng([10]));
      expect(turnOf(s.store, "pg")).toMatchObject({ bonusActions: 0, attacksLeft: 1, lightAttackMade: true });
    });

    it("is refused without a light melee attack first", () => {
      let s = play(attacking(), attack(), createScriptedRng([10]));
      s = play(s, attack({ ...both, bonusAction: true }));
      expect(keys(s).slice(-1)).toEqual(["log.attack.two-weapon-invalid"]);
      expect(turnOf(s.store, "pg")?.bonusActions).toBe(1);
    });

    it("is refused unless both weapons are declared light melee, and costs nothing", () => {
      let s = play(attacking(), attack(both), createScriptedRng([10]));
      s = play(s, attack({ bonusAction: true }));
      expect(keys(s).slice(-1)).toEqual(["log.attack.two-weapon-invalid"]);
      s = play(s, attack({ bonusAction: true, lightMelee: true }));
      expect(keys(s).slice(-1)).toEqual(["log.attack.two-weapon-invalid"]);
      expect(turnOf(s.store, "pg")).toMatchObject({ bonusActions: 1, attacksLeft: 1 });
    });

    it("is refused before any Attack action", () => {
      expect(keys(play(started(), attack({ ...both, bonusAction: true }))).slice(-1)).toEqual(["log.attack.two-weapon-invalid"]);
    });
  });

  it("two Attack actions in a turn add up their attacks", () => {
    let s = started();
    const own = turnOf(s.store, "pg");
    if (own === null) throw new Error("pg turn missing");
    s.store = { ...s.store, "turn:pg": { ...own, actions: 2 } };
    s = play(s, ev("action.declared", { actorId: "pg", action: "attack" }));
    s = play(s, attack(), createScriptedRng([10]));
    s = play(s, ev("action.declared", { actorId: "pg", action: "attack" }));
    expect(turnOf(s.store, "pg")?.attacksLeft).toBe(3);
  });
});

describe("conditions that arrive mid-turn", () => {
  it("an incapacitated creature can no longer take actions", () => {
    const s = play(withCondition(started(), "paralyzed", "pg"), ev("action.declared", { actorId: "pg", action: "dash" }));
    expect(keys(s).slice(-1)).toEqual(["log.action.incapacitated"]);
  });

  it("a creature that cannot move any more cannot spend movement", () => {
    for (const id of ["grappled", "restrained"] as const) {
      const s = play(withCondition(started(), id, "pg"), ev("movement.declared", { actorId: "pg", meters: 1 }));
      expect(keys(s).slice(-1)).toEqual(["log.movement.refused"]);
      expect(turnOf(s.store, "pg")?.movementUsed).toBe(0);
    }
  });
});

describe("ability checks", () => {
  const check = (over: JsonObject = {}): GameEvent => ev("check.declared", { actorId: "pg", modifier: 3, dc: 15, ...over });

  it("rolls against the DC and reports the outcome", () => {
    expect(names(play(started(), check(), createScriptedRng([14])))).toContain("check.passed");
    expect(names(play(started(), check(), createScriptedRng([5])))).toContain("check.failed");
  });

  it("Help gives advantage on the next check and is used up", () => {
    let s = switchTo(started(), "orc");
    s = play(s, ev("action.declared", { actorId: "orc", action: "help", allyId: "pg", task: "scalare" }));
    s = switchTo(s, "pg");
    s = play(s, check({ task: "scalare" }), createScriptedRng([4, 16]));
    expect(names(s)).toContain("check.passed");
    expect(s.effects).toHaveLength(0);
  });

  it("Help applies only to the check for the task it was given for", () => {
    let s = switchTo(started(), "orc");
    s = play(s, ev("action.declared", { actorId: "orc", action: "help", allyId: "pg", task: "scalare" }));
    s = switchTo(s, "pg");
    const other = play(s, check({ task: "forzare la porta" }), createScriptedRng([4]));
    expect(names(other)).toContain("check.failed");
    expect(other.effects).toHaveLength(1);
    expect(names(play(s, check(), createScriptedRng([4])))).toContain("check.failed");
  });

  it("conditions apply: poisoned has disadvantage", () => {
    const s = play(withCondition(started(), "poisoned", "pg"), check(), createScriptedRng([18, 2]));
    expect(names(s)).toContain("check.failed");
  });

  it("a blinded creature fails a sight check by itself, without rolling", () => {
    const s = play(withCondition(started(), "blinded", "pg"), check({ skill: "perception", tags: ["sight"] }));
    expect(names(s)).toContain("check.failed");
    expect(keys(s)).toContain("log.check.auto-fail");
  });

  it("without tags or a skill the DM is told about a blinded creature instead", () => {
    const s = play(withCondition(started(), "blinded", "pg"), check(), createScriptedRng([14]));
    expect(keys(s)).toContain("conditionNotices.blinded.checks");
  });

  it("a check with missing data is not resolved", () => {
    expect(keys(play(started(), ev("check.declared", { actorId: "pg" })))).toContain("log.action.unknown");
  });
});

describe("carrying out a readied action", () => {
  const readyAndRelease = (): ResolutionState => {
    let s = play(started(), ev("action.declared", { actorId: "pg", action: "ready", description: "mi nascondo se arriva" }));
    s = play(s, ev("action.ready-released", { actorId: "pg" }));
    return s;
  };

  it("the released action happens on someone else's turn, costs nothing more and ends the readying", () => {
    let s = switchTo(readyAndRelease(), "orc");
    s = play(s, ev("action.declared", { actorId: "pg", action: "dodge", readied: true }));
    expect(s.effects.map((e) => e.key)).toEqual(["action:dodge"]);
    expect(turnOf(s.store, "pg")).toMatchObject({ readied: null, readiedTriggered: false, actions: 0, reactions: 0 });
    expect(s.processed.filter((e) => e.name === "action.taken").map((e) => e.payload["readied"] ?? false)).toEqual([false, true]);
  });

  it("a readied attack is one attack, made out of turn, and does not use the Attack action's attacks", () => {
    let s = switchTo(readyAndRelease(), "orc");
    s = play(s, ev("attack.declared", { withinReach: true, actorId: "pg", targetId: "orc", modifier: 5, ac: 10, readied: true, damage: [{ dice: "1d6", bonus: 0, type: "slashing" }] }), createScriptedRng([15, 3]));
    expect(names(s)).toEqual(expect.arrayContaining(["attack.hit", "damage.rolled"]));
    expect(turnOf(s.store, "pg")).toMatchObject({ readied: null, readiedTriggered: false, attacksLeft: 0 });
  });

  it("is refused before the action was released, and a second time", () => {
    const readiedOnly = play(started(), ev("action.declared", { actorId: "pg", action: "ready", description: "x" }));
    expect(keys(play(readiedOnly, ev("action.declared", { actorId: "pg", action: "dodge", readied: true }))).slice(-1)).toEqual(["log.action.not-readied"]);
    expect(keys(play(readiedOnly, ev("attack.declared", { withinReach: true, actorId: "pg", targetId: "orc", modifier: 1, ac: 1, readied: true }))).slice(-1)).toEqual(["log.action.not-readied"]);
    const used = play(readyAndRelease(), ev("action.declared", { actorId: "pg", action: "dodge", readied: true }));
    expect(keys(play(used, ev("action.declared", { actorId: "pg", action: "disengage", readied: true }))).slice(-1)).toEqual(["log.action.not-readied"]);
  });

  it("a readied attack or dash goes through the proper event, not through action.declared", () => {
    expect(keys(play(readyAndRelease(), ev("action.declared", { actorId: "pg", action: "attack", readied: true }))).slice(-1)).toEqual(["log.action.invalid"]);
    expect(keys(play(readyAndRelease(), ev("action.declared", { actorId: "pg", action: "dash", readied: true }))).slice(-1)).toEqual(["log.action.invalid"]);
  });

  it("an incapacitated creature cannot carry it out", () => {
    const stunned = withCondition(readyAndRelease(), "stunned", "pg");
    expect(keys(play(stunned, ev("action.declared", { actorId: "pg", action: "dodge", readied: true }))).slice(-1)).toEqual(["log.action.incapacitated"]);
  });

  it("the readying ends when the creature's next turn starts", () => {
    const s = switchTo(switchTo(readyAndRelease(), "orc"), "pg");
    expect(turnOf(s.store, "pg")).toMatchObject({ readied: null, readiedTriggered: false });
  });
});

describe("helping", () => {
  it("a creature cannot help itself", () => {
    const s = play(started(), ev("action.declared", { actorId: "pg", action: "help", allyId: "pg", task: "scalare" }));
    expect(keys(s).slice(-1)).toEqual(["log.action.invalid"]);
    expect(turnOf(s.store, "pg")?.actions).toBe(1);
    expect(s.effects).toHaveLength(0);
  });

  it("helping a task needs the task named", () => {
    const s = play(started(), ev("action.declared", { actorId: "pg", action: "help", allyId: "orc" }));
    expect(keys(s).slice(-1)).toEqual(["log.action.invalid"]);
    expect(turnOf(s.store, "pg")?.actions).toBe(1);
  });

  it("helping an attack needs the helper within 1.5 m of the target", () => {
    const far = play(started(), ev("action.declared", { actorId: "pg", action: "help", allyId: "orc", enemyId: "troll" }));
    expect(keys(far).slice(-1)).toEqual(["log.action.invalid"]);
    const near = play(started(), ev("action.declared", { actorId: "pg", action: "help", allyId: "orc", enemyId: "troll", enemyWithinReach: true }));
    expect(near.effects).toHaveLength(1);
  });
});

describe("surprise", () => {
  const surprised = (): ResolutionState => play(table(), ev("surprise.declared", { actorId: "orc" }));

  it("a surprised creature cannot react before its first turn ends", () => {
    const s = surprised();
    expect(turnOf(s.store, "orc")?.reactions).toBe(0);
    const leave = ev("movement.left-reach", { actorId: "pg", reactorId: "orc" });
    expect(engine.run(engine.submit(started(s), leave), noRolls).status).toBe("done");
  });

  it("in its first turn it cannot move or act, and still has no reaction", () => {
    const s = switchTo(started(surprised()), "orc");
    expect(keys(s).slice(-1)).toEqual(["log.turn.surprised"]);
    expect(turnOf(s.store, "orc")).toMatchObject({ actions: 0, reactions: 0, movementTotal: 0 });
    expect(keys(play(s, ev("action.declared", { actorId: "orc", action: "dash" }))).slice(-1)).toEqual(["log.action.refused"]);
    expect(keys(play(s, ev("movement.declared", { actorId: "orc", meters: 1 }))).slice(-1)).toEqual(["log.movement.refused"]);
  });

  it("when that turn ends it is no longer surprised and can react", () => {
    let s = switchTo(started(surprised()), "orc");
    s = play(s, ev("turn.end", { actorId: "orc", round: 1 }));
    expect(turnOf(s.store, "orc")?.reactions).toBe(1);
    expect(s.store["surprised:orc"]).toBeUndefined();
    s = play(s, ev("turn.start", { actorId: "orc", round: 2 }));
    expect(turnOf(s.store, "orc")).toMatchObject({ actions: 1, reactions: 1, movementTotal: 9 });
  });

  it("a creature that was not surprised keeps its reaction before its first turn", () => {
    expect(turnOf(started().store, "orc")?.reactions).toBe(1);
  });

  it("an unknown creature cannot be declared surprised", () => {
    expect(keys(play(table(), ev("surprise.declared", { actorId: "ghost" }))).slice(-1)).toEqual(["log.action.unknown"]);
  });
});

describe("why an action is refused", () => {
  it("the event carries the reason", () => {
    const reason = (s: ResolutionState): unknown => s.processed.find((e) => e.name === "action.refused")?.payload["reason"];
    expect(reason(play(started(), ev("action.declared", { actorId: "orc", action: "dash" })))).toBe("not-your-turn");
    expect(reason(play(withCondition(started(), "stunned", "pg"), ev("action.declared", { actorId: "pg", action: "dash" })))).toBe("incapacitated");
    const used = play(started(), ev("action.declared", { actorId: "pg", action: "dash" }));
    expect(reason(play(used, ev("action.declared", { actorId: "pg", action: "disengage" })))).toBe("none-left");
  });

  it("an opportunity attack made while incapacitated says so, not that it is not the turn", () => {
    const s = play(withCondition(started(), "stunned", "orc"), ev("attack.declared", { withinReach: true, actorId: "orc", targetId: "pg", modifier: 1, ac: 10, opportunity: true }));
    expect(keys(s).slice(-1)).toEqual(["log.action.incapacitated"]);
  });
});

describe("repeating Dodge and Help", () => {
  it("a second Dodge, even after Action Surge, is not spent for nothing", () => {
    const state = started();
    const own = turnOf(state.store, "pg");
    if (own === null) throw new Error("pg turn missing");
    state.store = { ...state.store, "turn:pg": { ...own, actions: 2 } };
    let s = play(state, ev("action.declared", { actorId: "pg", action: "dodge" }));
    s = play(s, ev("action.declared", { actorId: "pg", action: "dodge" }));
    expect(keys(s).slice(-1)).toEqual(["log.action.redundant"]);
    expect(turnOf(s.store, "pg")?.actions).toBe(1);
    expect(s.effects).toHaveLength(1);
  });

  it("a second identical Help is refused too, but a different one is fine", () => {
    const state = started();
    const own = turnOf(state.store, "pg");
    if (own === null) throw new Error("pg turn missing");
    state.store = { ...state.store, "turn:pg": { ...own, actions: 3 } };
    const help = (enemyId: string): GameEvent => ev("action.declared", { actorId: "pg", action: "help", allyId: "orc", enemyId, enemyWithinReach: true });
    let s = play(state, help("troll"));
    s = play(s, help("troll"));
    expect(keys(s).slice(-1)).toEqual(["log.action.redundant"]);
    s = play(s, help("goblin"));
    expect(s.effects).toHaveLength(2);
    expect(turnOf(s.store, "pg")?.actions).toBe(1);
  });
});

describe("registering again mid-fight", () => {
  it("with the current store, a creature already in the fight keeps its turn state", () => {
    let s = play(started(), ev("action.declared", { actorId: "pg", action: "dash" }));
    s.store = { ...s.store, ...registerCombatant({ actorId: "pg", speedMeters: 12, store: s.store }) };
    expect(turnOf(s.store, "pg")).toMatchObject({ actions: 0, movementTotal: 18 });
    expect(s.store["speed:pg"]).toBe(12);
    s = play(s, ev("turn.start", { actorId: "pg", round: 2 }));
    expect(turnOf(s.store, "pg")).toMatchObject({ actions: 1, movementTotal: 12 });
  });

  it("for a creature not in the fight yet, or without the store, it starts a fresh turn state", () => {
    expect(registerCombatant({ actorId: "new", speedMeters: 9, store: {} })["turn:new"]).toBeDefined();
    expect(registerCombatant({ actorId: "pg", speedMeters: 9 })["turn:pg"]).toBeDefined();
    expect(registerCombatant({ actorId: "pg", speedMeters: 9, store: { "turn:pg": { broken: true } } })["turn:pg"]).toBeDefined();
  });
});

describe("stored turn state", () => {
  it("a state saved before newer fields existed still loads, with those fields at their starting value", () => {
    const state = started();
    const own = turnOf(state.store, "pg");
    if (own === null) throw new Error("pg turn missing");
    state.store = { ...state.store, "turn:pg": { actions: own.actions, bonusActions: own.bonusActions, reactions: own.reactions, baseSpeed: own.baseSpeed, movementTotal: own.movementTotal, movementUsed: own.movementUsed } };
    expect(turnOf(state.store, "pg")).toMatchObject({ surgesThisTurn: 0, lightAttackMade: false, readied: null, readiedTriggered: false, attacksLeft: 0 });
    expect(keys(play(state, ev("action.declared", { actorId: "pg", action: "dash" }))).slice(-1)).toEqual(["log.action.used"]);
  });

  it("a damaged entry is reported as such, not as a lack of actions", () => {
    const state = started();
    state.store = { ...state.store, "turn:pg": { actions: "many" } };
    expect(keys(play(state, ev("action.declared", { actorId: "pg", action: "dash" }))).slice(-1)).toEqual(["log.turn.damaged"]);
    expect(keys(play(state, ev("movement.declared", { actorId: "pg", meters: 1 }))).slice(-1)).toEqual(["log.turn.damaged"]);
  });
});

describe("proximity must be stated", () => {
  const bare = (over: JsonObject = {}): GameEvent => ev("attack.declared", { actorId: "pg", targetId: "orc", modifier: 5, ac: 10, ...over });
  const attacking = (): ResolutionState => play(started(), ev("action.declared", { actorId: "pg", action: "attack" }));

  it("an attack that does not say whether the target is within reach is rejected and costs nothing", () => {
    const s = play(attacking(), bare());
    expect(keys(s).slice(-1)).toEqual(["log.action.invalid"]);
    expect(turnOf(s.store, "pg")?.attacksLeft).toBe(2);
    expect(keys(play(attacking(), bare({ withinReach: "yes" }))).slice(-1)).toEqual(["log.action.invalid"]);
  });

  it("the stated value decides: a ranged attack on a prone target has disadvantage, a melee one advantage", () => {
    const prone = withCondition(attacking(), "prone", "orc");
    const far = play(prone, bare({ withinReach: false, ac: 12 }), createScriptedRng([18, 3]));
    expect(names(far)).toContain("attack.miss");
    const near = play(prone, bare({ withinReach: true, ac: 12 }), createScriptedRng([3, 18]));
    expect(names(near)).toContain("attack.hit");
  });

  it("a hit on a paralyzed target is a critical hit only from within reach", () => {
    const paralyzed = withCondition(attacking(), "paralyzed", "orc");
    expect(play(paralyzed, bare({ withinReach: true }), createScriptedRng([15, 15])).processed.find((e) => e.name === "attack.hit")?.payload["critical"]).toBe(true);
    expect(play(paralyzed, bare({ withinReach: false }), createScriptedRng([15, 15])).processed.find((e) => e.name === "attack.hit")?.payload["critical"]).toBe(false);
  });
});

describe("moving between the attacks of one Attack action", () => {
  it("leaves the remaining attacks and movement available, so a second target can be reached", () => {
    const hit = (targetId: string): GameEvent => ev("attack.declared", { withinReach: true, actorId: "pg", targetId, modifier: 5, ac: 10 });
    let s = play(started(), ev("action.declared", { actorId: "pg", action: "attack" }));
    s = play(s, hit("orc"), createScriptedRng([15]));
    s = play(s, ev("movement.declared", { actorId: "pg", meters: 6 }));
    expect(turnOf(s.store, "pg")).toMatchObject({ attacksLeft: 1, movementUsed: 6 });
    s = play(s, hit("goblin"), createScriptedRng([15]));
    expect(turnOf(s.store, "pg")).toMatchObject({ attacksLeft: 0, movementUsed: 6, actions: 0 });
    expect(names(s).filter((n) => n === "attack.hit")).toHaveLength(2);
    expect(keys(s).includes("log.action.refused")).toBe(false);
  });

  it("the unused movement can still be spent after the last attack", () => {
    let s = play(started(), ev("action.declared", { actorId: "pg", action: "attack" }));
    s = play(s, ev("attack.declared", { withinReach: true, actorId: "pg", targetId: "orc", modifier: 5, ac: 10 }), createScriptedRng([15]));
    s = play(s, ev("movement.declared", { actorId: "pg", meters: 3 }));
    s = play(s, ev("attack.declared", { withinReach: true, actorId: "pg", targetId: "goblin", modifier: 5, ac: 10 }), createScriptedRng([15]));
    s = play(s, ev("movement.declared", { actorId: "pg", meters: 6 }));
    expect(turnOf(s.store, "pg")?.movementUsed).toBe(9);
  });
});

describe("movement", () => {
  it("spends movement and refuses to go over", () => {
    let s = play(started(), ev("movement.declared", { actorId: "pg", meters: 6 }));
    expect(turnOf(s.store, "pg")?.movementUsed).toBe(6);
    s = play(s, ev("movement.declared", { actorId: "pg", meters: 4 }));
    expect(keys(s).slice(-1)).toEqual(["log.movement.refused"]);
    expect(turnOf(s.store, "pg")?.movementUsed).toBe(6);
  });

  it("a slowed creature moves less, and a creature freed mid-turn moves again", () => {
    const slowed = withCondition(started(), "grappled", "pg");
    expect(keys(play(slowed, ev("movement.declared", { actorId: "pg", meters: 1 }))).slice(-1)).toEqual(["log.movement.refused"]);
    expect(turnOf(play({ ...slowed, effects: [] }, ev("movement.declared", { actorId: "pg", meters: 9 })).store, "pg")?.movementUsed).toBe(9);
  });

  it("exhaustion that halves the speed halves the movement available now", () => {
    const tired = { ...started(), effects: setExhaustion([], "pg", 2, "ex") };
    expect(turnOf(play(tired, ev("movement.declared", { actorId: "pg", meters: 4.5 })).store, "pg")?.movementUsed).toBe(4.5);
    expect(keys(play(tired, ev("movement.declared", { actorId: "pg", meters: 5 }))).slice(-1)).toEqual(["log.movement.refused"]);
  });

  it("dash makes the extra movement available", () => {
    let s = play(started(), ev("action.declared", { actorId: "pg", action: "dash" }));
    s = play(s, ev("movement.declared", { actorId: "pg", meters: 18 }));
    expect(turnOf(s.store, "pg")?.movementUsed).toBe(18);
  });
});

describe("opportunity attacks", () => {
  const leave = ev("movement.left-reach", { actorId: "pg", reactorId: "orc" });

  function asked(state: ResolutionState) {
    const first = engine.run(engine.submit(state, leave), noRolls);
    if (first.status !== "awaiting") throw new Error("expected a question");
    return first;
  }

  function finished(result: ReturnType<typeof engine.resume>): ResolutionState {
    if (result.status !== "done") throw new Error("expected done");
    return result.state;
  }

  it("asks the reactor, and yes spends the reaction", () => {
    const first = asked(started());
    expect(first.request.to).toEqual({ kind: "actor", actorId: "orc" });
    expect(isMessageKey(first.request.promptKey)).toBe(true);
    const done = finished(engine.resume(first.state, first.request.id, "yes", noRolls));
    expect(turnOf(done.store, "orc")?.reactions).toBe(0);
    expect(names(done)).toContain("reaction.opportunity-attack");
  });

  it("no keeps the reaction", () => {
    const first = asked(started());
    expect(turnOf(finished(engine.resume(first.state, first.request.id, "no", noRolls)).store, "orc")?.reactions).toBe(1);
  });

  it("an expired question defaults to no", () => {
    const first = asked(started());
    expect(turnOf(finished(engine.expire(first.state, first.request.id, noRolls)).store, "orc")?.reactions).toBe(1);
  });

  it("asks even if the reactor has not had its first turn, because its reaction exists from registration", () => {
    const state = started();
    expect(turnOf(state.store, "orc")).toMatchObject({ reactions: 1 });
    expect(engine.run(engine.submit(state, leave), noRolls).status).toBe("awaiting");
  });

  it("does not ask when the reactor is incapacitated", () => {
    expect(engine.run(engine.submit(withCondition(started(), "stunned", "orc"), leave), noRolls).status).toBe("done");
  });

  it("the reaction is still there on the reactor's own turn start, and a new turn gives it back", () => {
    const first = asked(started());
    const used = finished(engine.resume(first.state, first.request.id, "yes", noRolls));
    expect(turnOf(used.store, "orc")?.reactions).toBe(0);
    expect(turnOf(switchTo(used, "orc").store, "orc")?.reactions).toBe(1);
  });

  it("a yes with the reactor's melee attack on record resolves the attack and spends the reaction", () => {
    const state = table();
    state.store = {
      ...state.store,
      ...registerCombatant({ actorId: "pg", speedMeters: 9, armorClass: 12 }),
      ...registerCombatant({ actorId: "orc", speedMeters: 9, meleeAttack: { modifier: 5, damage: [{ dice: "1d8", bonus: 3, type: "slashing" }] } }),
    };
    const first = asked(started(state));
    const done = finished(engine.resume(first.state, first.request.id, "yes", createScriptedRng([14, 4])));
    expect(names(done)).toEqual(expect.arrayContaining(["attack.declared", "attack.hit", "damage.rolled"]));
    expect(keys(done)).toEqual(expect.arrayContaining(["log.reaction.opportunity-chosen", "log.reaction.opportunity-attack"]));
    expect(done.processed.find((e) => e.name === "damage.rolled")?.payload).toMatchObject({ actorId: "orc", targetId: "pg", byType: { slashing: 7 } });
    expect(turnOf(done.store, "orc")?.reactions).toBe(0);
    expect(turnOf(done.store, "pg")?.attacksLeft).toBe(0);
  });

  it("an opportunity attack that misses still costs the reaction", () => {
    const state = table();
    state.store = {
      ...state.store,
      ...registerCombatant({ actorId: "pg", speedMeters: 9, armorClass: 30 }),
      ...registerCombatant({ actorId: "orc", speedMeters: 9, meleeAttack: { modifier: 0, damage: [] } }),
    };
    const first = asked(started(state));
    const done = finished(engine.resume(first.state, first.request.id, "yes", createScriptedRng([3])));
    expect(names(done)).toContain("attack.miss");
    expect(turnOf(done.store, "orc")?.reactions).toBe(0);
  });

  it("an opportunity attack declared without a reaction left, or against a mover who disengaged, is refused", () => {
    const hit = ev("attack.declared", { withinReach: true, actorId: "orc", targetId: "pg", modifier: 5, ac: 10, opportunity: true });
    const state = started();
    const orc = turnOf(state.store, "orc");
    if (orc === null) throw new Error("orc turn missing");
    expect(keys(play({ ...state, store: { ...state.store, "turn:orc": { ...orc, reactions: 0 } } }, hit)).slice(-1)).toEqual(["log.reaction.refused"]);
    const disengaged = play(started(), ev("action.declared", { actorId: "pg", action: "disengage" }));
    const denied = play(disengaged, hit);
    expect(keys(denied).slice(-1)).toEqual(["log.reaction.opportunity-denied"]);
    expect(denied.processed.find((e) => e.name === "action.refused")?.payload["reason"]).toBe("target-disengaged");
  });

  it("does not ask when the mover disengaged", () => {
    const disengaged = play(started(), ev("action.declared", { actorId: "pg", action: "disengage" }));
    expect(engine.run(engine.submit(disengaged, leave), noRolls).status).toBe("done");
  });

  it("does not ask when the reactor has used its reaction", () => {
    const state = started();
    const orc = turnOf(state.store, "orc");
    if (orc === null) throw new Error("orc turn missing");
    state.store = { ...state.store, "turn:orc": { ...orc, reactions: 0 } };
    expect(engine.run(engine.submit(state, leave), noRolls).status).toBe("done");
  });
});

describe("log lines", () => {
  it("every key the hooks write exists in the catalog", () => {
    let s = started();
    s = play(s, ev("action.declared", { actorId: "pg", action: "attack" }));
    s = play(s, ev("attack.declared", { withinReach: true, actorId: "pg", targetId: "orc", modifier: 5, ac: 13, damage: [{ dice: "1d8", bonus: 1, type: "fire" }] }), createScriptedRng([12, 3]));
    s = play(s, ev("movement.declared", { actorId: "pg", meters: 6 }));
    s = play(s, ev("action.declared", { actorId: "pg", action: "fly" }));
    s = switchTo(s, "orc");
    s = play(s, ev("action.declared", { actorId: "orc", action: "hide" }));
    s = play(s, ev("check.declared", { actorId: "orc", modifier: 2, dc: 12 }), createScriptedRng([9]));
    for (const l of s.log) expect(isMessageKey(l.key), l.key).toBe(true);
    for (const l of s.log) {
      for (const [name, ref] of Object.entries(l.refs ?? {})) {
        if (ref === "text-key") expect(isMessageKey(String(l.params[name])), String(l.params[name])).toBe(true);
      }
    }
  });
});
