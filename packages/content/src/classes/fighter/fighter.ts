import type { GameEvent, LogLine, Rng } from "@phoenix/rules-core";
import { rollDice } from "@phoenix/rules-core";
import {
  actorLine as line,
  defineClass,
  heal,
  resolveD20Test,
  grantExtraAction,
  spend,
  spendUse,
  type TurnEconomy,
  type D20TestInput,
  type D20TestResult,
  type FeatureDefinition,
  type FeatureUses,
  type VitalState,
} from "@phoenix/rules-srd";

const fighterFeature = (id: string, over: Partial<FeatureDefinition> = {}): FeatureDefinition => ({
  id,
  nameKey: `classes.fighter.features.${id}.name`,
  descriptionKey: `classes.fighter.features.${id}.description`,
  source: "srd",
  automation: "full",
  ...over,
});

export const secondWind = fighterFeature("second-wind", { uses: { table: [{ fromLevel: 1, count: 1 }], recharge: "short-rest" } });
export const fightingStyle = fighterFeature("fighting-style");
export const actionSurge = fighterFeature("action-surge", {
  uses: { table: [{ fromLevel: 2, count: 1 }, { fromLevel: 17, count: 2 }], recharge: "short-rest" },
});
export const extraAttack = fighterFeature("extra-attack", {
  // The number of attacks is worked out here; making them is up to the player's Attack action.
  automation: "partial",
  dmNoteKey: "classes.fighter.notes.extra-attack",
});
export const indomitable = fighterFeature("indomitable", {
  uses: { table: [{ fromLevel: 9, count: 1 }, { fromLevel: 13, count: 2 }, { fromLevel: 17, count: 3 }], recharge: "long-rest" },
});

const none: readonly string[] = [];
const at = (levels: Record<number, readonly string[]>, choices: Record<number, string> = {}) =>
  Array.from({ length: 20 }, (_, i) => {
    const choice = choices[i + 1];
    return {
      features: levels[i + 1] ?? none,
      ...(choice === undefined ? {} : { choices: [{ id: choice, promptKey: `classes.fighter.prompts.${choice}` }] }),
    };
  });

/** Fighter, from the SRD 5.1. The Champion is the only archetype the SRD includes. */
export const fighter = defineClass({
  id: "fighter",
  nameKey: "classes.fighter.name",
  hitDie: 10,
  saveProficiencies: ["str", "con"],
  proficiencies: {
    armor: ["light", "medium", "heavy", "shields"],
    weapons: ["simple", "martial"],
    extra: [],
    skills: { count: 2, from: ["acrobatics", "animal-handling", "athletics", "history", "insight", "intimidation", "perception", "survival"] },
  },
  levels: at(
    { 1: ["second-wind", "fighting-style"], 2: ["action-surge"], 5: ["extra-attack"], 9: ["indomitable"] },
    { 1: "fighting-style" },
  ),
  features: [secondWind, fightingStyle, actionSurge, extraAttack, indomitable],
  // The fighter gets two more ability score improvements than the standard levels give (6 and 14).
  asiLevels: [4, 6, 8, 12, 14, 16, 19],
  source: "srd",
  automation: "partial",
});

/** Attacks made with one Attack action: 1, then 2 from level 5, 3 from 11 and 4 at 20. */
export function attacksPerAction(level: number): number {
  if (!Number.isInteger(level) || level < 1 || level > 20) throw new RangeError("Level must be a whole number from 1 to 20");
  if (level >= 20) return 4;
  if (level >= 11) return 3;
  return level >= 5 ? 2 : 1;
}

export type SecondWindResult<T extends TurnEconomy = TurnEconomy> = { vital: VitalState; spent: FeatureUses; economy: T; healed: number; events: GameEvent[]; log: LogLine[] };

/** Bonus action: regain 1d10 plus fighter level hit points, once per short or long rest. */
export function useSecondWind<T extends TurnEconomy>(
  input: { actorId: string; level: number; vital: VitalState; spent: FeatureUses; economy: T },
  rng: Rng,
): SecondWindResult<T> {
  const { actorId, level, vital } = input;
  if (vital.status !== "alive") throw new Error("Only a creature that is up can use Second Wind");
  const economy = spend(input.economy, "bonus-action");
  const spent = spendUse(secondWind, level, input.spent);
  const rolled = rollDice("1d10", rng).total;
  const total = rolled + level;
  const change = heal(vital, actorId, total);
  return {
    vital: change.state,
    spent,
    economy,
    healed: change.state.hp - vital.hp,
    events: [{ name: "feature.used", payload: { actorId, featureId: "second-wind" } }, ...change.events],
    log: [line("log.class.second-wind", actorId, { rolled, level, total }), ...change.log],
  };
}

export type ActionSurgeResult<T extends TurnEconomy = TurnEconomy> = { spent: FeatureUses; economy: T; events: GameEvent[]; log: LogLine[] };

/** One additional action this turn (two uses before a rest from level 17, but only one in the same turn). */
export function useActionSurge<T extends TurnEconomy>(input: { actorId: string; level: number; spent: FeatureUses; economy: T }): ActionSurgeResult<T> {
  const spent = spendUse(actionSurge, input.level, input.spent);
  return {
    spent,
    economy: grantExtraAction(input.economy, 1),
    events: [{ name: "feature.used", payload: { actorId: input.actorId, featureId: "action-surge" } }],
    log: [line("log.class.action-surge", input.actorId)],
  };
}

export type IndomitableResult = { spent: FeatureUses; result: D20TestResult; events: GameEvent[]; log: LogLine[] };

/**
 * Rolls a failed saving throw again; the new result stands. The SRD only says the fighter "can reroll" it, so this
 * repeats the same roll: same modifier, same advantage or disadvantage, same DC (author's confirmed reading).
 */
export function useIndomitable(input: { actorId: string; level: number; spent: FeatureUses; save: D20TestInput }, rng: Rng): IndomitableResult {
  const spent = spendUse(indomitable, input.level, input.spent);
  const result = resolveD20Test(input.save, rng);
  return {
    spent,
    result,
    events: [{ name: "feature.used", payload: { actorId: input.actorId, featureId: "indomitable" } }],
    log: [line("log.class.indomitable", input.actorId), ...result.log],
  };
}
