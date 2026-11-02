export type EffectDuration =
  | { kind: "permanent" }
  | { kind: "rounds"; remaining: number }
  /** With `actorId`, ends only on an event whose payload `actorId` matches; without it, on any such event. */
  | { kind: "until-event"; event: string; actorId?: string };

export type ActiveEffect = {
  id: string;
  /** Identity of the effect itself (e.g. "shield"): same key + same source never stack. */
  key: string;
  /** i18n key of the Italian display name; the engine never prints `key` to users. */
  nameKey: string;
  sourceId: string;
  targetId: string;
  /** Provided by the rule that creates the effect; the higher one wins when they clash. */
  power: number;
  duration: EffectDuration;
  modifiers: { stat: string; value: number }[];
};

export function addEffect(
  effects: readonly ActiveEffect[],
  incoming: ActiveEffect,
): { effects: ActiveEffect[]; applied: boolean } {
  const clash = effects.find(
    (e) => e.key === incoming.key && e.sourceId === incoming.sourceId && e.targetId === incoming.targetId,
  );
  if (clash === undefined) return { effects: [...effects, incoming], applied: true };
  if (incoming.power <= clash.power) return { effects: [...effects], applied: false };
  return { effects: effects.map((e) => (e.id === clash.id ? incoming : e)), applied: true };
}

export function effectsFor(effects: readonly ActiveEffect[], targetId: string): ActiveEffect[] {
  return effects.filter((e) => e.targetId === targetId);
}

export function modifierTotal(effects: readonly ActiveEffect[], targetId: string, stat: string): number {
  return effectsFor(effects, targetId)
    .flatMap((e) => e.modifiers)
    .filter((m) => m.stat === stat)
    .reduce((acc, m) => acc + m.value, 0);
}

/**
 * Returns the effects that remain once those lasting until `event` have ended.
 * `actorId` is the creature the event concerns (e.g. whose turn starts), if any.
 */
export function endEffectsOnEvent(
  effects: readonly ActiveEffect[],
  event: string,
  actorId: string | null = null,
): ActiveEffect[] {
  return effects.filter((e) => {
    if (e.duration.kind !== "until-event" || e.duration.event !== event) return true;
    return e.duration.actorId !== undefined && e.duration.actorId !== actorId;
  });
}

export function removeEffects(effects: readonly ActiveEffect[], ids: readonly string[]): ActiveEffect[] {
  return effects.filter((e) => !ids.includes(e.id));
}

/** Ends one round: round-based effects lose a round and disappear when none is left. */
export function advanceRounds(effects: readonly ActiveEffect[]): ActiveEffect[] {
  return effects.flatMap((e) => {
    if (e.duration.kind !== "rounds") return [e];
    const remaining = e.duration.remaining - 1;
    return remaining > 0 ? [{ ...e, duration: { kind: "rounds" as const, remaining } }] : [];
  });
}
