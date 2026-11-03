import { describe, expect, it } from "vitest";
import {
  canOpportunityAttack,
  dash,
  disengage,
  movementLeft,
  moveBy,
  ready,
  releaseReadied,
  useReadied,
  spendAttack,
  spendBonusAttack,
  startActorTurn,
  takeAttackAction,
  takeOtherAction,
} from "./actor-turn";

const fresh = () => startActorTurn({ speedMeters: 9 });

describe("startActorTurn", () => {
  it("starts with full economy, the whole speed and nothing in progress", () => {
    expect(fresh()).toEqual({
      actions: 1, bonusActions: 1, reactions: 1, surgesThisTurn: 0,
      baseSpeed: 9, movementTotal: 9, movementUsed: 0, attacksLeft: 0, attackedThisTurn: false, lightAttackMade: false, disengaged: false, readied: null, readiedTriggered: false,
    });
  });

  it("rejects a bad speed", () => {
    expect(() => startActorTurn({ speedMeters: -1 })).toThrow();
    expect(() => startActorTurn({ speedMeters: Number.NaN })).toThrow();
  });
});

describe("movement", () => {
  it("spends meters and refuses to go over", () => {
    const t = moveBy(fresh(), 6);
    expect(movementLeft(t)).toBe(3);
    expect(() => moveBy(t, 3.5)).toThrow();
    expect(movementLeft(moveBy(t, 3))).toBe(0);
  });

  it("dash adds the starting speed once per Dash and costs the action", () => {
    const t = dash(fresh());
    expect(t.movementTotal).toBe(18);
    expect(t.actions).toBe(0);
    expect(() => dash(t)).toThrow();
  });

  it("dash after moving keeps what was already used", () => {
    expect(movementLeft(dash(moveBy(fresh(), 9)))).toBe(9);
  });

  it("disengage costs the action and stops opportunity attacks", () => {
    const mover = disengage(fresh());
    expect(mover.disengaged).toBe(true);
    expect(canOpportunityAttack(fresh(), mover)).toBe(false);
    expect(canOpportunityAttack(fresh(), fresh())).toBe(true);
  });

  it("an opportunity attack needs a reaction", () => {
    expect(canOpportunityAttack({ ...fresh(), reactions: 0 }, fresh())).toBe(false);
  });
});

describe("Attack action", () => {
  it("allows the given number of attacks and then refuses", () => {
    let t = takeAttackAction(fresh(), 2);
    expect(t.actions).toBe(0);
    t = spendAttack(spendAttack(t));
    expect(t.attacksLeft).toBe(0);
    expect(() => spendAttack(t)).toThrow();
  });

  it("cannot attack without the action, or without taking it first", () => {
    expect(() => spendAttack(fresh())).toThrow();
    expect(() => takeAttackAction({ ...fresh(), actions: 0 }, 1)).toThrow();
    expect(() => takeAttackAction(fresh(), 0)).toThrow();
  });

  it("a second Attack action adds its attacks to the ones left from the first", () => {
    const t = takeAttackAction({ ...fresh(), actions: 2 }, 2);
    expect(takeAttackAction(spendAttack(t), 2).attacksLeft).toBe(3);
    expect(takeAttackAction(t, 2).attacksLeft).toBe(4);
  });

  it("a bonus-action attack needs an attack with a light melee weapon and the bonus action", () => {
    expect(() => spendBonusAttack(fresh())).toThrow();
    const heavy = spendAttack(takeAttackAction(fresh(), 1));
    expect(() => spendBonusAttack(heavy)).toThrow();
    const light = spendBonusAttack(spendAttack(takeAttackAction(fresh(), 1), { light: true }));
    expect(light.bonusActions).toBe(0);
    expect(() => spendBonusAttack(light)).toThrow();
  });
});

describe("other actions", () => {
  it("cost the action", () => {
    expect(takeOtherAction(fresh()).actions).toBe(0);
    expect(() => takeOtherAction(takeOtherAction(fresh()))).toThrow();
  });

  it("ready holds the action and its description until released by a reaction", () => {
    const t = ready(fresh(), "se il goblin entra nella stanza, lo colpisco");
    expect(t.actions).toBe(0);
    const released = releaseReadied(t);
    expect(released.reactions).toBe(0);
    expect(released.readied).toBe("se il goblin entra nella stanza, lo colpisco");
    expect(released.readiedTriggered).toBe(true);
  });

  it("the released action is then carried out for free and the readying is over", () => {
    const done = useReadied(releaseReadied(ready(fresh(), "x")));
    expect(done).toMatchObject({ readied: null, readiedTriggered: false, reactions: 0, actions: 0 });
  });

  it("it cannot be carried out before it is released, or released twice", () => {
    expect(() => useReadied(ready(fresh(), "x"))).toThrow();
    expect(() => useReadied(fresh())).toThrow();
    expect(() => releaseReadied(releaseReadied(ready(fresh(), "x")))).toThrow();
  });

  it("ready needs a description, and release needs something readied and a reaction", () => {
    expect(() => ready(fresh(), "  ")).toThrow();
    expect(() => releaseReadied(fresh())).toThrow();
    expect(() => releaseReadied({ ...ready(fresh(), "x"), reactions: 0 })).toThrow();
  });
});
