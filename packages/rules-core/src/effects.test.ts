import { describe, expect, it } from "vitest";
import { addEffect, advanceRounds, effectsFor, endEffectsOnEvent, modifierTotal, type ActiveEffect } from "./effects";

const shield = (over: Partial<ActiveEffect> = {}): ActiveEffect => ({
  id: "e1",
  key: "shield",
  nameKey: "test.effect.shield",
  sourceId: "caster-1",
  targetId: "hero",
  power: 5,
  duration: { kind: "until-event", event: "turn.start" },
  modifiers: [{ stat: "ac", value: 5 }],
  ...over,
});

describe("addEffect", () => {
  it("adds a new effect", () => {
    const { effects, applied } = addEffect([], shield());
    expect(applied).toBe(true);
    expect(effects).toHaveLength(1);
  });

  it("does not stack the same effect from the same source", () => {
    const first = addEffect([], shield()).effects;
    const second = addEffect(first, shield({ id: "e2" }));
    expect(second.applied).toBe(false);
    expect(second.effects).toHaveLength(1);
  });

  it("keeps the stronger of two equal effects from the same source", () => {
    const first = addEffect([], shield({ power: 2, modifiers: [{ stat: "ac", value: 2 }] })).effects;
    const second = addEffect(first, shield({ id: "e2", power: 5 }));
    expect(second.applied).toBe(true);
    expect(second.effects).toHaveLength(1);
    expect(modifierTotal(second.effects, "hero", "ac")).toBe(5);
  });

  it("stacks the same effect from different sources", () => {
    const first = addEffect([], shield()).effects;
    const second = addEffect(first, shield({ id: "e2", sourceId: "caster-2" }));
    expect(second.effects).toHaveLength(2);
    expect(modifierTotal(second.effects, "hero", "ac")).toBe(10);
  });
});

describe("queries and expiry", () => {
  it("filters by target", () => {
    const effects = addEffect([], shield()).effects;
    expect(effectsFor(effects, "hero")).toHaveLength(1);
    expect(effectsFor(effects, "villain")).toHaveLength(0);
  });

  it("ends effects that last until a given event", () => {
    const effects = addEffect([], shield()).effects;
    expect(endEffectsOnEvent(effects, "turn.start")).toEqual([]);
    expect(endEffectsOnEvent(effects, "rest.long")).toHaveLength(1);
  });

  it("ends a creature-bound effect only on that creature's event", () => {
    const bound = addEffect([], shield({ duration: { kind: "until-event", event: "turn.start", actorId: "hero" } })).effects;
    expect(endEffectsOnEvent(bound, "turn.start", "villain")).toHaveLength(1);
    expect(endEffectsOnEvent(bound, "turn.start", null)).toHaveLength(1);
    expect(endEffectsOnEvent(bound, "turn.start", "hero")).toEqual([]);
  });

  it("is JSON serializable", () => {
    const effects = addEffect([], shield()).effects;
    expect(JSON.parse(JSON.stringify(effects))).toEqual(effects);
  });
});

describe("advanceRounds", () => {
  const timed = (remaining: number): ActiveEffect =>
    shield({ id: `t${String(remaining)}`, key: `timed-${String(remaining)}`, duration: { kind: "rounds", remaining } });

  it("decrements round-based effects", () => {
    const [effect] = advanceRounds([timed(3)]);
    expect(effect?.duration).toEqual({ kind: "rounds", remaining: 2 });
  });

  it("removes an effect when its last round ends", () => {
    expect(advanceRounds([timed(1)])).toEqual([]);
  });

  it("leaves other durations untouched", () => {
    const permanent = shield({ id: "p", key: "p", duration: { kind: "permanent" } });
    const untilEvent = shield({ id: "u", key: "u" });
    expect(advanceRounds([permanent, untilEvent])).toEqual([permanent, untilEvent]);
  });

  it("stops a spent effect from modifying stats", () => {
    expect(modifierTotal(advanceRounds([timed(1)]), "hero", "ac")).toBe(0);
  });
});
