import { rollD20, type LogLine, type Rng, type RollMode, type RollResult } from "@phoenix/rules-core";
import type { RuleMeta } from "./meta";
import { rollLogLine } from "./roll-log";

/** Natural 20 and 1 decide any d20 test (author's rule). Death saving throws have their own rule. */
export const d20TestMeta: RuleMeta = { automation: "full", source: "srd-modified" };

export type D20TestInput = { modifier: number; mode: RollMode; dc: number };

export type D20TestResult = {
  roll: RollResult;
  dc: number;
  success: boolean;
  /** True when a natural 20 or 1 decided the outcome instead of the total. */
  decidedByNatural: boolean;
  /** The DM is told about every natural 20 and 1. */
  notifyDm: boolean;
  log: LogLine[];
};

export function resolveD20Test(input: D20TestInput, rng: Rng): D20TestResult {
  if (!Number.isFinite(input.dc)) throw new RangeError("DC must be a finite number");
  const roll = rollD20({ modifier: input.modifier, mode: input.mode }, rng);
  if (roll.critical !== null) {
    const success = roll.critical === "success";
    return {
      roll,
      dc: input.dc,
      success,
      decidedByNatural: true,
      notifyDm: true,
      log: [
        rollLogLine(roll),
        { key: success ? "log.d20.natural-success" : "log.d20.natural-failure", params: { total: roll.total, dc: input.dc } },
      ],
    };
  }
  const success = roll.total >= input.dc;
  return {
    roll,
    dc: input.dc,
    success,
    decidedByNatural: false,
    notifyDm: false,
    log: [rollLogLine(roll), { key: success ? "log.d20.success" : "log.d20.failure", params: { total: roll.total, dc: input.dc } }],
  };
}
