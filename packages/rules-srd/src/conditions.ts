import { removeEffects, type ActiveEffect, type EffectDuration } from "@phoenix/rules-core";
import type { RuleMeta } from "./meta";

export const CONDITION_IDS = [
  "blinded",
  "charmed",
  "deafened",
  "exhaustion",
  "frightened",
  "grappled",
  "incapacitated",
  "invisible",
  "paralyzed",
  "petrified",
  "poisoned",
  "prone",
  "restrained",
  "stunned",
  "unconscious",
] as const;
export type ConditionId = (typeof CONDITION_IDS)[number];

const full: RuleMeta = { automation: "full", source: "srd" };
/** `partial`: the system applies the numbers, the DM applies what depends on sight, hearing or the fiction. */
const partial: RuleMeta = { automation: "partial", source: "srd" };

export const conditionMeta: Record<ConditionId, RuleMeta> = {
  blinded: partial,
  charmed: partial,
  deafened: partial,
  exhaustion: partial,
  frightened: partial,
  grappled: partial,
  incapacitated: full,
  invisible: partial,
  paralyzed: full,
  petrified: partial,
  poisoned: full,
  prone: partial,
  restrained: full,
  stunned: full,
  unconscious: partial,
};

export const MAX_EXHAUSTION = 6;

/** A condition read back from the effect stack. `level` is set for exhaustion only. */
export type ActiveCondition = { id: ConditionId; sourceId: string; originId?: string; level?: number };

const KEY_PREFIX = "condition:";
const EXHAUSTION_STAT = "exhaustion";

function isConditionId(value: string): value is ConditionId {
  return CONDITION_IDS.some((id) => id === value);
}

export type ConditionEffectInput = {
  id: ConditionId;
  targetId: string;
  /** Who caused it; frightened and charmed need it to know whom they refer to. */
  sourceId: string;
  /**
   * What caused it (a spell, an attack, a trap). The same origin from the same source never stacks;
   * different origins are independent, so one ending does not end the other.
   */
  originId: string;
  effectId: string;
  duration: EffectDuration;
};

/** Conditions live on the effect stack. An unconscious creature also falls prone, so that adds a second effect. */
export function conditionEffects(input: ConditionEffectInput): ActiveEffect[] {
  if (input.id === "exhaustion") throw new Error("Exhaustion has levels: use setExhaustion");
  const make = (id: ConditionId, effectId: string, originId: string, duration: EffectDuration): ActiveEffect => ({
    id: effectId,
    key: `${KEY_PREFIX}${id}:${originId}`,
    nameKey: `conditions.${id}`,
    sourceId: input.sourceId,
    targetId: input.targetId,
    power: 1,
    duration,
    modifiers: [],
  });
  const effects = [make(input.id, input.effectId, input.originId, input.duration)];
  // Waking up does not make a creature stand: the prone that comes with unconsciousness lasts until it is ended on its own.
  if (input.id === "unconscious") {
    effects.push(make("prone", `${input.effectId}:prone`, `${input.originId}:prone`, { kind: "permanent" }));
  }
  return effects;
}

/** The condition an effect on the stack stands for, or null if it is not a condition. */
export function conditionIdOf(effect: ActiveEffect): ConditionId | null {
  if (!effect.key.startsWith(KEY_PREFIX)) return null;
  const [id] = effect.key.slice(KEY_PREFIX.length).split(":");
  return id !== undefined && isConditionId(id) ? id : null;
}

export function conditionsOf(effects: readonly ActiveEffect[], targetId: string): ActiveCondition[] {
  const found: ActiveCondition[] = [];
  for (const effect of effects) {
    if (effect.targetId !== targetId || !effect.key.startsWith(KEY_PREFIX)) continue;
    const [id, ...origin] = effect.key.slice(KEY_PREFIX.length).split(":");
    if (id === undefined || !isConditionId(id)) continue;
    if (id === "exhaustion") {
      found.push({ id, sourceId: effect.sourceId, level: effect.modifiers.find((m) => m.stat === EXHAUSTION_STAT)?.value ?? 0 });
    } else {
      found.push({ id, sourceId: effect.sourceId, originId: origin.join(":") });
    }
  }
  return found;
}

export function exhaustionLevel(effects: readonly ActiveEffect[], targetId: string): number {
  return conditionsOf(effects, targetId).find((c) => c.id === "exhaustion")?.level ?? 0;
}

/** Exhaustion adds up across sources, so there is a single effect per creature whose level is set directly. */
export function setExhaustion(effects: readonly ActiveEffect[], targetId: string, level: number, effectId: string): ActiveEffect[] {
  if (!Number.isInteger(level) || level < 0 || level > MAX_EXHAUSTION) {
    throw new RangeError(`Exhaustion level must be a whole number from 0 to ${String(MAX_EXHAUSTION)}`);
  }
  const old = effects.filter((e) => e.targetId === targetId && e.key === `${KEY_PREFIX}exhaustion`).map((e) => e.id);
  const rest = removeEffects(effects, old);
  if (level === 0) return rest;
  return [
    ...rest,
    {
      id: effectId,
      key: `${KEY_PREFIX}exhaustion`,
      nameKey: "conditions.exhaustion",
      sourceId: "exhaustion",
      targetId,
      power: level,
      duration: { kind: "permanent" },
      modifiers: [{ stat: EXHAUSTION_STAT, value: level }],
    },
  ];
}
