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

/** What a check needs from the senses, or what it is about. Situational tags are added by whoever calls for the check. */
export type CheckTag = "sight" | "hearing" | "social";

/** Charisma skills used to interact socially. Perception and the like depend on the situation, so the DM tags them. */
export const SKILL_TAGS: Partial<Record<SkillId, readonly CheckTag[]>> = {
  deception: ["social"],
  intimidation: ["social"],
  performance: ["social"],
  persuasion: ["social"],
};

export function skillTags(skill: SkillId): readonly CheckTag[] {
  return SKILL_TAGS[skill] ?? [];
}

export function skillAbility(skill: SkillId): Ability {
  return SKILLS[skill];
}
