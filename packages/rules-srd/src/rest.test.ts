import { createScriptedRng } from "@phoenix/rules-core";
import { isMessageKey, renderLogLine } from "@phoenix/shared";
import { describe, expect, it } from "vitest";
import { vitalState, type VitalState } from "./death";
import { gameTime } from "./game-time";
import { LONG_REST_INTERVAL_HOURS, LONG_REST_MINUTES, SHORT_REST_MINUTES, finishShortRest, hitDicePool, longRest, spendHitDie, type HitDicePool } from "./rest";

const pool = (over: Partial<HitDicePool> = {}): HitDicePool => ({ size: 8, total: 5, spent: 0, ...over });
const hurt = (hp: number, hpMax = 30): VitalState => vitalState(hp, hpMax);
const names = (r: { events: { name: string }[] }): string[] => r.events.map((e) => e.name);

describe("hitDicePool", () => {
  it("accepts the four SRD die sizes and a sensible count", () => {
    for (const size of [6, 8, 10, 12] as const) expect(hitDicePool(size, 3)).toEqual({ size, total: 3, spent: 0 });
  });

  it("rejects other sizes and counts", () => {
    expect(() => hitDicePool(7, 3)).toThrow();
    expect(() => hitDicePool(8, 0)).toThrow();
    expect(() => hitDicePool(8, 21)).toThrow();
    expect(() => hitDicePool(8, 2.5)).toThrow();
  });
});

describe("spendHitDie", () => {
  it("rolls the die, adds the Constitution modifier and heals that much", () => {
    const r = spendHitDie(hurt(10), pool(), "hero", 2, createScriptedRng([5]));
    expect(r.healed).toBe(7);
    expect(r.vital.hp).toBe(17);
    expect(r.pool).toEqual({ size: 8, total: 5, spent: 1 });
  });

  it("never heals less than 0 with a negative modifier", () => {
    const r = spendHitDie(hurt(10), pool(), "hero", -3, createScriptedRng([1]));
    expect(r.healed).toBe(0);
    expect(r.vital.hp).toBe(10);
    expect(r.pool.spent).toBe(1);
  });

  it("caps the healing at the maximum, still spends the die and reports only what was regained", () => {
    const r = spendHitDie(hurt(28), pool(), "hero", 2, createScriptedRng([8]));
    expect(r.vital.hp).toBe(30);
    expect(r.pool.spent).toBe(1);
    expect(r.healed).toBe(2);
    expect(r.log[1]?.params).toMatchObject({ rolled: 10 });
    expect(r.log[2]).toMatchObject({ key: "log.hp.gained", params: { amount: 2, hp: 30, hpMax: 30 } });
  });

  it("makes the returned healing match the hit points that actually changed", () => {
    for (const [hp, expected] of [[10, 7], [25, 5], [30, 0]] as const) {
      const r = spendHitDie(hurt(hp), pool(), "hero", 2, createScriptedRng([5]));
      expect(r.healed, String(hp)).toBe(expected);
      expect(r.vital.hp - hp).toBe(expected);
    }
  });

  it("refuses when no die is left, and for a creature that is dying or dead", () => {
    expect(() => spendHitDie(hurt(10), pool({ spent: 5 }), "hero", 0, createScriptedRng([4]))).toThrow();
    for (const status of ["dying", "dead"] as const) {
      const state: VitalState = { hp: 0, hpMax: 30, status, successes: 0, failures: 0 };
      expect(() => spendHitDie(state, pool(), "hero", 0, createScriptedRng([4])), status).toThrow();
    }
  });

  it("lets a stable creature spend hit dice, and wakes it when it regains hit points", () => {
    const stable: VitalState = { hp: 0, hpMax: 30, status: "stable", successes: 0, failures: 0 };
    const r = spendHitDie(stable, pool(), "hero", 2, createScriptedRng([5]));
    expect(r.vital).toMatchObject({ hp: 7, status: "alive" });
    expect(r.healed).toBe(7);
    expect(r.events.map((e) => e.name)).toContain("creature.revived");
  });

  it("rejects a modifier that is not a whole number", () => {
    expect(() => spendHitDie(hurt(10), pool(), "hero", 1.5, createScriptedRng([4]))).toThrow();
  });

  it("logs the roll, the die spent and the hit points regained, as Italian text", () => {
    const r = spendHitDie(hurt(10), pool(), "hero", 2, createScriptedRng([5]));
    expect(r.log.map((l) => l.key)).toEqual(["log.roll.detail", "log.rest.hit-die-spent", "log.hp.gained"]);
    for (const line of r.log) {
      expect(isMessageKey(line.key), line.key).toBe(true);
      expect(renderLogLine(line, () => "Aria").length).toBeGreaterThan(0);
    }
    expect(renderLogLine(r.log[1] ?? { key: "", params: {} }, () => "Aria")).toBe(
      "Aria spende un Dado Vita (d8): tira 7. Dadi Vita rimasti: 4/5.",
    );
    expect(renderLogLine(r.log[2] ?? { key: "", params: {} }, () => "Aria")).toBe("Aria recupera 7 PF (17/30).");
  });

  it("does not change its input", () => {
    const vital = hurt(10);
    const p = pool();
    const snapshot = JSON.stringify([vital, p]);
    spendHitDie(vital, p, "hero", 0, createScriptedRng([4]));
    expect(JSON.stringify([vital, p])).toBe(snapshot);
  });
});

describe("finishShortRest", () => {
  it("emits rest.short for the actor, so effects and class features can react", () => {
    const r = finishShortRest("hero");
    expect(r.events).toEqual([{ name: "rest.short", payload: { actorId: "hero" } }]);
    expect(r.log.map((l) => l.key)).toEqual(["log.rest.short"]);
  });
});

describe("longRest", () => {
  const rest = (over: Partial<Parameters<typeof longRest>[0]> = {}) =>
    longRest(
      { vital: hurt(5), hadHitPointsAtStart: true, pool: pool({ spent: 5 }), exhaustion: 0, fed: true, now: gameTime(10_000), lastLongRestAt: null, ...over },
      "hero",
    );
  const hoursAgo = (hours: number) => ({ now: gameTime(10_000), lastLongRestAt: gameTime(10_000 - hours * 60) });

  it("restores all hit points", () => {
    const r = rest();
    expect(r.benefited).toBe(true);
    expect(r.vital.hp).toBe(30);
    expect(names(r)).toContain("rest.long");
  });

  it("recovers spent hit dice up to half the total, at least one", () => {
    expect(rest({ pool: pool({ total: 5, spent: 5 }) }).pool.spent).toBe(3);
    expect(rest({ pool: pool({ total: 8, spent: 8 }) }).pool.spent).toBe(4);
    expect(rest({ pool: pool({ total: 1, spent: 1 }) }).pool.spent).toBe(0);
    expect(rest({ pool: pool({ total: 5, spent: 1 }) }).pool.spent).toBe(0);
  });

  it("lowers exhaustion by one level when fed and hydrated, never below 0", () => {
    expect(rest({ exhaustion: 3 }).exhaustion).toBe(2);
    expect(rest({ exhaustion: 0 }).exhaustion).toBe(0);
  });

  it("leaves exhaustion alone without food and drink, and says so", () => {
    const r = rest({ exhaustion: 3, fed: false });
    expect(r.exhaustion).toBe(3);
    expect(r.vital.hp).toBe(30);
    expect(r.log.map((l) => l.key)).toContain("log.rest.not-fed");
  });

  it("gives no benefit if the last long rest was less than 24 hours ago", () => {
    expect(LONG_REST_INTERVAL_HOURS).toBe(24);
    const r = rest(hoursAgo(10));
    expect(r.benefited).toBe(false);
    expect(r.vital.hp).toBe(5);
    expect(r.pool.spent).toBe(5);
    expect(names(r)).toEqual([]);
    expect(r.log.map((l) => l.key)).toEqual(["log.rest.too-soon"]);
    expect(r.log[0]?.params["hours"]).toBe(10);
    expect(rest(hoursAgo(24)).benefited).toBe(true);
    expect(rest(hoursAgo(23.5)).benefited).toBe(false);
  });

  it("counts the interval in game time, from the end of the previous long rest", () => {
    const first = rest({ now: gameTime(1000), lastLongRestAt: null });
    expect(first.lastLongRestAt).toEqual(gameTime(1000));
    const tooSoon = rest({ now: gameTime(1000 + 23 * 60), lastLongRestAt: first.lastLongRestAt });
    expect(tooSoon.benefited).toBe(false);
    expect(tooSoon.lastLongRestAt).toEqual(gameTime(1000));
    const later = rest({ now: gameTime(1000 + 24 * 60), lastLongRestAt: first.lastLongRestAt });
    expect(later.benefited).toBe(true);
    expect(later.lastLongRestAt).toEqual(gameTime(1000 + 24 * 60));
  });

  it("knows how long rests last in game minutes", () => {
    expect(SHORT_REST_MINUTES).toBe(60);
    expect(LONG_REST_MINUTES).toBe(480);
  });

  it("rejects a previous rest that is in the future", () => {
    expect(() => rest({ now: gameTime(100), lastLongRestAt: gameTime(200) })).toThrow();
  });

  it("lets the DM ignore the interval", () => {
    expect(rest({ ...hoursAgo(2), ignoreInterval: true }).benefited).toBe(true);
  });

  it("needs at least 1 hit point when the rest begins: a creature that began at 0 gets no benefit, even if healed meanwhile", () => {
    const r = rest({ hadHitPointsAtStart: false, vital: hurt(12) });
    expect(r.benefited).toBe(false);
    expect(r.vital.hp).toBe(12);
    expect(r.log.map((l) => l.key)).toEqual(["log.rest.no-hp"]);
  });

  it("gives the benefit to a creature that began with hit points, whatever state it finished in", () => {
    for (const status of ["stable", "dying"] as const) {
      const r = rest({ vital: { hp: 0, hpMax: 30, status, successes: 0, failures: 0 } });
      expect(r.benefited, status).toBe(true);
      expect(r.vital).toMatchObject({ hp: 30, status: "alive" });
    }
  });

  it("does not rest the dead", () => {
    expect(() => rest({ vital: { hp: 0, hpMax: 30, status: "dead", successes: 0, failures: 0 } })).toThrow();
  });

  it("rejects invalid exhaustion", () => {
    expect(() => rest({ exhaustion: 7 })).toThrow();
    expect(() => rest({ exhaustion: -1 })).toThrow();
  });

  it("logs the rest and only emits catalog keys", () => {
    const r = rest({ exhaustion: 2 });
    expect(r.log.map((l) => l.key)).toEqual(["log.hp.gained", "log.rest.long", "log.rest.exhaustion-reduced"]);
    for (const line of r.log) {
      expect(isMessageKey(line.key), line.key).toBe(true);
      expect(renderLogLine(line, () => "Aria").length).toBeGreaterThan(0);
    }
  });
});
