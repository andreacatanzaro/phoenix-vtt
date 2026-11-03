import type { LogLine } from "@phoenix/rules-core";
import { defineSubclass, heal, type Ability, type FeatureDefinition, type SubclassDefinition, type VitalChange, type VitalState } from "@phoenix/rules-srd";
import { fighter } from "./fighter";

const championFeature = (id: string, over: Partial<FeatureDefinition> = {}): FeatureDefinition => ({
  id,
  nameKey: `classes.fighter.subclasses.champion.features.${id}.name`,
  descriptionKey: `classes.fighter.subclasses.champion.features.${id}.description`,
  source: "srd",
  automation: "full",
  ...over,
});

export const champion: SubclassDefinition = defineSubclass(
  {
    id: "champion",
    classId: "fighter",
    nameKey: "classes.fighter.subclasses.champion.name",
    descriptionKey: "classes.fighter.subclasses.champion.description",
    levels: [
      { level: 3, features: ["improved-critical"] },
      { level: 7, features: ["remarkable-athlete"] },
      {
        level: 10,
        features: ["additional-fighting-style"],
        choices: [{ id: "additional-fighting-style", promptKey: "classes.fighter.prompts.additional-fighting-style" }],
      },
      { level: 15, features: ["superior-critical"] },
      { level: 18, features: ["survivor"] },
    ],
    features: [
      championFeature("improved-critical"),
      // The jump distance of the second paragraph is left to the DM.
      championFeature("remarkable-athlete", { automation: "partial", dmNoteKey: "classes.fighter.notes.remarkable-athlete" }),
      championFeature("additional-fighting-style"),
      championFeature("superior-critical"),
      championFeature("survivor"),
    ],
    source: "srd",
    automation: "partial",
  },
  fighter,
);

/** Lowest natural d20 result that is a critical hit with a weapon attack, for a Champion of this fighter level. */
export function championCriticalFrom(fighterLevel: number): number {
  if (!Number.isInteger(fighterLevel) || fighterLevel < 1 || fighterLevel > 20) throw new RangeError("Level must be a whole number from 1 to 20");
  if (fighterLevel >= 15) return 18;
  return fighterLevel >= 3 ? 19 : 20;
}

const ATHLETE_ABILITIES: readonly Ability[] = ["str", "dex", "con"];

/** Half the proficiency bonus, rounded up, on Strength, Dexterity and Constitution checks that do not already use proficiency. */
export function remarkableAthleteBonus(input: { fighterLevel: number; proficiencyBonus: number; ability: Ability; proficientInCheck: boolean }): number {
  if (!Number.isInteger(input.proficiencyBonus) || input.proficiencyBonus < 2) throw new RangeError("Proficiency bonus must be a whole number, 2 or more");
  if (input.fighterLevel < 7 || input.proficientInCheck || !ATHLETE_ABILITIES.includes(input.ability)) return 0;
  return Math.ceil(input.proficiencyBonus / 2);
}

/** Start of the turn: with half the hit points or fewer, but above 0, regain 5 plus the Constitution modifier. */
export function survivorHealing(input: { fighterLevel: number; actorId: string; vital: VitalState; conModifier: number }): VitalChange {
  const { vital, actorId } = input;
  if (!Number.isSafeInteger(input.conModifier)) throw new RangeError("Constitution modifier must be a whole number");
  const amount = Math.max(0, 5 + input.conModifier);
  if (input.fighterLevel < 18 || vital.status !== "alive" || vital.hp < 1 || vital.hp * 2 > vital.hpMax || amount === 0) {
    return { state: vital, events: [], log: [] };
  }
  const change = heal(vital, actorId, amount);
  const log: LogLine[] = [{ key: "log.class.survivor", params: { actor: actorId, amount: change.state.hp - vital.hp }, refs: { actor: "actor-id" } }];
  return { state: change.state, events: change.events, log: [...log, ...change.log] };
}
