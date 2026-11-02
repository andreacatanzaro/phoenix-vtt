import { addEffect, type ActiveEffect, type LogLine } from "@phoenix/rules-core";
import { conditionEffects, conditionIdOf, type ActiveCondition, type ConditionEffectInput, type ConditionId } from "./conditions";
import type { RuleMeta } from "./meta";

export const conditionApplyMeta: RuleMeta = { automation: "full", source: "srd" };

/** A petrified creature is immune to being poisoned. */
export function conditionImmunities(conditions: readonly ActiveCondition[]): ConditionId[] {
  return conditions.some((c) => c.id === "petrified") ? ["poisoned"] : [];
}

/** `granted` are immunities from other sources (race, features, items). */
export function isImmuneToCondition(
  conditions: readonly ActiveCondition[],
  id: ConditionId,
  granted: readonly ConditionId[] = [],
): boolean {
  return conditionImmunities(conditions).includes(id) || granted.includes(id);
}

/**
 * Adds a condition unless the creature is immune. Every effect it brings along (such as the prone of an unconscious
 * creature) is checked on its own. The log says what was applied and what was blocked.
 */
export function applyCondition(
  effects: readonly ActiveEffect[],
  targetConditions: readonly ActiveCondition[],
  input: ConditionEffectInput,
  granted: readonly ConditionId[] = [],
): { effects: ActiveEffect[]; applied: boolean; log: LogLine[] } {
  let result = [...effects];
  let applied = false;
  const log: LogLine[] = [];
  for (const effect of conditionEffects(input)) {
    const id = conditionIdOf(effect);
    if (id === null) continue;
    const params = { target: input.targetId, condition: `conditions.${id}` };
    const refs = { target: "actor-id", condition: "text-key" } as const;
    if (isImmuneToCondition(targetConditions, id, granted)) {
      log.push({ key: "log.condition.immune", params, refs });
      continue;
    }
    const added = addEffect(result, effect);
    result = added.effects;
    if (added.applied) {
      applied = true;
      log.push({ key: "log.condition.applied", params, refs });
    }
  }
  return { effects: result, applied, log };
}
