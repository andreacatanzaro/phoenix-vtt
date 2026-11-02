import { MAX_ABILITY_SCORE, MIN_ABILITY_SCORE } from "@phoenix/shared";
import type { RuleMeta } from "./meta";

export const abilitiesMeta: RuleMeta = { automation: "full", source: "srd" };

export const ABILITIES = ["str", "dex", "con", "int", "wis", "cha"] as const;
export type Ability = (typeof ABILITIES)[number];

export type Proficiency = "none" | "proficient" | "expertise";

export const MAX_LEVEL = 20;

export function abilityModifier(score: number): number {
  if (!Number.isInteger(score) || score < MIN_ABILITY_SCORE || score > MAX_ABILITY_SCORE) {
    throw new RangeError(`Ability score must be a whole number from ${String(MIN_ABILITY_SCORE)} to ${String(MAX_ABILITY_SCORE)}`);
  }
  return Math.floor((score - 10) / 2);
}

export function proficiencyBonus(level: number): number {
  if (!Number.isInteger(level) || level < 1 || level > MAX_LEVEL) {
    throw new RangeError(`Level must be a whole number from 1 to ${String(MAX_LEVEL)}`);
  }
  return 2 + Math.floor((level - 1) / 4);
}

/** Modifier of a check or save: ability modifier plus proficiency (once) or expertise (twice). */
export function checkModifier(input: { score: number; level: number; proficiency: Proficiency }): number {
  const base = abilityModifier(input.score);
  const bonus = proficiencyBonus(input.level);
  if (input.proficiency === "proficient") return base + bonus;
  if (input.proficiency === "expertise") return base + bonus * 2;
  return base;
}
