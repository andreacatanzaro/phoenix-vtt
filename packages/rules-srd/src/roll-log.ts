import type { LogLine, RollResult } from "@phoenix/rules-core";
import type { RuleMeta } from "./meta";

export const rollLogMeta: RuleMeta = { automation: "full", source: "original" };

function signed(value: number): string {
  return value < 0 ? `-${String(Math.abs(value))}` : `+${String(value)}`;
}

/** Full record of a roll (dice, kept dice, modifier, total, advantage state), so the DM can inspect it later. */
export function rollLogLine(roll: RollResult): LogLine {
  return {
    key: "log.roll.detail",
    params: {
      notation: roll.notation,
      mode: `roll.mode.${roll.mode}`,
      dice: roll.dice.join(", "),
      kept: roll.kept.join(", "),
      modifier: signed(roll.modifier),
      total: roll.total,
    },
    refs: { mode: "text-key" },
  };
}
