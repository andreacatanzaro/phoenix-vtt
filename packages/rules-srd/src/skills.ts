import type { Ability } from "./abilities";
import type { RuleMeta } from "./meta";

export const skillsMeta: RuleMeta = { automation: "full", source: "srd" };

/** The Italian name of each skill lives in the i18n catalog under `skills.<id>`. */
export const SKILLS = {
  acrobatics: "dex",
  "animal-handling": "wis",
  arcana: "int",
  athletics: "str",
  deception: "cha",
  history: "int",
  insight: "wis",
  intimidation: "cha",
  investigation: "int",
  medicine: "wis",
  nature: "int",
  perception: "wis",
  performance: "cha",
  persuasion: "cha",
  religion: "int",
  "sleight-of-hand": "dex",
  stealth: "dex",
  survival: "wis",
} as const satisfies Record<string, Ability>;

export type SkillId = keyof typeof SKILLS;

export function skillAbility(skill: SkillId): Ability {
  return SKILLS[skill];
}
