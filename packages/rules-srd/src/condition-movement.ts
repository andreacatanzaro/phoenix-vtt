import { speedFactor } from "./condition-rules";
import type { SightCheck } from "./condition-rules";
import type { ActiveCondition } from "./conditions";
import { isIncapacitated } from "./condition-rules";
import type { RuleMeta } from "./meta";

export const conditionMovementMeta: RuleMeta = { automation: "full", source: "srd" };

function nonNegative(value: number, name: string): number {
  if (!Number.isFinite(value) || value < 0) throw new RangeError(`${name} must be a finite number, 0 or more`);
  return value;
}

/** Base speed in meters with the conditions applied. */
export function effectiveSpeed(baseMeters: number, conditions: readonly ActiveCondition[]): number {
  return nonNegative(baseMeters, "speed") * speedFactor(conditions);
}

/** A prone creature can only crawl: every meter costs one extra meter. */
export function crawlMoveCost(conditions: readonly ActiveCondition[], meters: number): number {
  const distance = nonNegative(meters, "distance");
  return conditions.some((c) => c.id === "prone") ? distance * 2 : distance;
}

/** Standing up costs half the speed; `null` when the creature cannot move, `0` when it is not prone. */
export function standUpCost(baseMeters: number, conditions: readonly ActiveCondition[]): number | null {
  if (!conditions.some((c) => c.id === "prone")) return 0;
  const speed = effectiveSpeed(baseMeters, conditions);
  return speed === 0 ? null : speed / 2;
}

/** A grapple ends if the grappler is incapacitated or the creatures are farther apart than the grappler's reach. */
export function grappleHolds(
  grapplerConditions: readonly ActiveCondition[],
  distanceMeters: number,
  reachMeters: number,
): { holds: true } | { holds: false; reason: "incapacitated" | "out-of-reach" } {
  const distance = nonNegative(distanceMeters, "distance");
  if (isIncapacitated(grapplerConditions)) return { holds: false, reason: "incapacitated" };
  if (distance > nonNegative(reachMeters, "reach")) return { holds: false, reason: "out-of-reach" };
  return { holds: true };
}

/** A frightened creature cannot willingly move closer to the source of its fear while it can see it. */
export function frightenedBlocksApproach(
  conditions: readonly ActiveCondition[],
  move: { sourceId: string; before: number; after: number; sees: SightCheck },
): boolean {
  const afraidOfIt = conditions.some((c) => c.id === "frightened" && c.sourceId === move.sourceId);
  return afraidOfIt && move.sees(move.sourceId) && move.after < move.before;
}
