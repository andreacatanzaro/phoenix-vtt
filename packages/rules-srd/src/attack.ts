import { rollD20, type LogLine, type Rng, type RollMode, type RollResult } from "@phoenix/rules-core";
import type { RuleMeta } from "./meta";
import { rollLogLine } from "./roll-log";

/** Natural 20 always hits and is a critical hit, natural 1 always misses (author's rule). */
export const attackRollMeta: RuleMeta = { automation: "full", source: "srd-modified" };

export type AttackInput = { modifier: number; mode: RollMode; ac: number };

export type AttackResult = {
  roll: RollResult;
  ac: number;
  hit: boolean;
  /** A natural 20: damage dice and damage bonuses are doubled. */
  critical: boolean;
  notifyDm: boolean;
  log: LogLine[];
};

export function resolveAttackRoll(input: AttackInput, rng: Rng): AttackResult {
  if (!Number.isFinite(input.ac)) throw new RangeError("AC must be a finite number");
  const roll = rollD20({ modifier: input.modifier, mode: input.mode }, rng);
  const params = { total: roll.total, ac: input.ac };
  const make = (hit: boolean, critical: boolean, key: string): AttackResult => ({
    roll,
    ac: input.ac,
    hit,
    critical,
    notifyDm: roll.critical !== null,
    log: [rollLogLine(roll), { key, params }],
  });
  if (roll.critical === "success") return make(true, true, "log.attack.critical-hit");
  if (roll.critical === "failure") return make(false, false, "log.attack.critical-miss");
  return roll.total >= input.ac ? make(true, false, "log.attack.hit") : make(false, false, "log.attack.miss");
}
