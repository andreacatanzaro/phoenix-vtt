import type { Ability } from "./abilities";
import type { CheckTag } from "./skills";
import type { ActiveCondition } from "./conditions";
import { DAMAGE_TYPES, type Defenses } from "./damage";
import { scaleHpMax } from "./hit-points";
import type { RuleMeta } from "./meta";

export const conditionRulesMeta: RuleMeta = { automation: "partial", source: "srd" };

export type ModeSource = "advantage" | "disadvantage";

/** Asks the scene whether the creature can see `sourceId`; when absent, sight-dependent effects go to the DM. */
export type SightCheck = (sourceId: string) => boolean;

/**
 * Poison already in a petrified creature's body is suspended, so it has no effect until the petrification ends.
 * The condition stays on the stack; queries just ignore it.
 */
export function effectiveConditions(conditions: readonly ActiveCondition[]): ActiveCondition[] {
  const petrified = conditions.some((c) => c.id === "petrified");
  return conditions.filter((c) => !(petrified && c.id === "poisoned"));
}

function has(conditions: readonly ActiveCondition[], id: ActiveCondition["id"]): boolean {
  return conditions.some((c) => c.id === id);
}

function exhaustion(conditions: readonly ActiveCondition[]): number {
  return conditions.find((c) => c.id === "exhaustion")?.level ?? 0;
}

const INCAPACITATING = ["incapacitated", "paralyzed", "petrified", "stunned", "unconscious"] as const;
const CANNOT_MOVE = ["grappled", "restrained", "paralyzed", "petrified", "stunned", "unconscious"] as const;
const AUTO_FAIL_STR_DEX = ["paralyzed", "petrified", "stunned", "unconscious"] as const;

/** An incapacitated creature takes no actions or reactions. */
export function isIncapacitated(conditions: readonly ActiveCondition[]): boolean {
  return INCAPACITATING.some((id) => has(conditions, id));
}

/** 0 when the creature cannot move, 0.5 when exhaustion halves its speed, otherwise 1. */
export function speedFactor(conditions: readonly ActiveCondition[]): number {
  const level = exhaustion(conditions);
  if (CANNOT_MOVE.some((id) => has(conditions, id)) || level >= 5) return 0;
  return level >= 2 ? 0.5 : 1;
}

/** Fear applies while the source is in sight. Without a sight check the DM is told instead. */
function fear(
  conditions: readonly ActiveCondition[],
  sees: SightCheck | undefined,
  sources: ModeSource[],
  notices: string[],
): void {
  for (const afraid of conditions.filter((c) => c.id === "frightened")) {
    if (sees === undefined) notices.push("frightened.sight");
    else if (sees(afraid.sourceId)) sources.push("disadvantage");
  }
}

export type AttackContext = {
  /** The target is within 1.5 m of the attacker. */
  targetWithinReach: boolean;
  attackerId: string;
  targetId: string;
  seesSource?: SightCheck;
};

export type AttackModes = {
  /** Feed these to `resolveRollMode`: one of each cancels out. */
  sources: ModeSource[];
  /** A hit is a critical hit (paralyzed or unconscious target within reach). */
  autoCritOnHit: boolean;
  /** The attacker may not target this creature (charmed by it). */
  forbidden: boolean;
  /** Entries of `conditionNotices` the DM applies by hand. */
  notices: string[];
};

export function attackModes(
  attackerConditions: readonly ActiveCondition[],
  targetConditions: readonly ActiveCondition[],
  context: AttackContext,
): AttackModes {
  const attacker = effectiveConditions(attackerConditions);
  const target = effectiveConditions(targetConditions);
  const sources: ModeSource[] = [];
  const notices: string[] = [];
  for (const id of ["blinded", "poisoned", "prone", "restrained"] as const) {
    if (has(attacker, id)) sources.push("disadvantage");
  }
  if (has(attacker, "invisible")) sources.push("advantage");
  if (exhaustion(attacker) >= 3) sources.push("disadvantage");
  fear(attacker, context.seesSource, sources, notices);
  for (const id of ["blinded", "paralyzed", "petrified", "restrained", "stunned", "unconscious"] as const) {
    if (has(target, id)) sources.push("advantage");
  }
  if (has(target, "invisible")) sources.push("disadvantage");
  if (has(target, "prone")) sources.push(context.targetWithinReach ? "advantage" : "disadvantage");
  const forbidden = attacker.some((c) => c.id === "charmed" && c.sourceId === context.targetId);
  const autoCritOnHit = context.targetWithinReach && (has(target, "paralyzed") || has(target, "unconscious"));
  return { sources, autoCritOnHit, forbidden, notices };
}

export type CheckContext = {
  seesSource?: SightCheck;
  /**
   * What the check needs or is about. Without tags the DM is told about blinded and deafened creatures;
   * with tags (an empty list means "needs no sense") the system decides.
   */
  tags?: readonly CheckTag[];
  /** Who rolls and who they deal with, for the charmed creature's social checks. */
  rollerId?: string;
  opponent?: { id: string; conditions: readonly ActiveCondition[] };
};

export function abilityCheckModes(
  allConditions: readonly ActiveCondition[],
  context: CheckContext,
): { sources: ModeSource[]; autoFail: boolean; notices: string[] } {
  const conditions = effectiveConditions(allConditions);
  const sources: ModeSource[] = [];
  const notices: string[] = [];
  let autoFail = false;
  if (has(conditions, "poisoned")) sources.push("disadvantage");
  if (exhaustion(conditions) >= 1) sources.push("disadvantage");
  fear(conditions, context.seesSource, sources, notices);
  const tags = context.tags;
  if (has(conditions, "blinded")) {
    if (tags === undefined) notices.push("blinded.checks");
    else if (tags.includes("sight")) autoFail = true;
  }
  if (has(conditions, "deafened")) {
    if (tags === undefined) notices.push("deafened.checks");
    else if (tags.includes("hearing")) autoFail = true;
  }
  // The creature that charmed someone has advantage on social checks against them.
  const opponent = context.opponent;
  if (
    tags?.includes("social") === true &&
    context.rollerId !== undefined &&
    opponent !== undefined &&
    opponent.conditions.some((c) => c.id === "charmed" && c.sourceId === context.rollerId)
  ) {
    sources.push("advantage");
  }
  return { sources, autoFail, notices };
}

export function saveModes(
  allConditions: readonly ActiveCondition[],
  ability: Ability,
): { autoFail: boolean; sources: ModeSource[] } {
  const conditions = effectiveConditions(allConditions);
  const autoFail = (ability === "str" || ability === "dex") && AUTO_FAIL_STR_DEX.some((id) => has(conditions, id));
  const sources: ModeSource[] = [];
  if (has(conditions, "restrained") && ability === "dex") sources.push("disadvantage");
  if (exhaustion(conditions) >= 3) sources.push("disadvantage");
  return { autoFail, sources };
}

/** A petrified creature resists all damage. */
export function conditionDefenses(conditions: readonly ActiveCondition[]): Defenses {
  return has(conditions, "petrified") ? { resistances: [...DAMAGE_TYPES] } : {};
}

/** Exhaustion level 4 halves the hit point maximum. */
export function hpMaxFactor(conditions: readonly ActiveCondition[]): number {
  return exhaustion(conditions) >= 4 ? 0.5 : 1;
}

/** The hit point maximum with the conditions applied, always rounded down. */
export function effectiveHpMax(hpMax: number, conditions: readonly ActiveCondition[]): number {
  return scaleHpMax(hpMax, hpMaxFactor(conditions));
}

export function exhaustionKills(conditions: readonly ActiveCondition[]): boolean {
  return exhaustion(conditions) >= 6;
}
