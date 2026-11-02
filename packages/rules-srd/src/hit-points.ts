import type { RuleMeta } from "./meta";

export const hitPointsMeta: RuleMeta = { automation: "full", source: "original" };

/** Any change to a hit point maximum rounds down, whatever the cause (author's rule). */
export function scaleHpMax(hpMax: number, factor: number): number {
  if (!Number.isInteger(hpMax) || hpMax < 0) throw new RangeError("Hit point maximum must be a whole number, 0 or more");
  if (!Number.isFinite(factor) || factor < 0) throw new RangeError("Factor must be a finite number, 0 or more");
  return Math.floor(hpMax * factor);
}
