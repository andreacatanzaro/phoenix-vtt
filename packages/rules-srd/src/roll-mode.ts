import type { RollMode } from "@phoenix/rules-core";
import type { RuleMeta } from "./meta";

export const rollModeMeta: RuleMeta = { automation: "full", source: "srd" };

/** One advantage and one disadvantage cancel out; extra sources of either kind change nothing. */
export function resolveRollMode(sources: readonly ("advantage" | "disadvantage")[]): RollMode {
  const advantage = sources.includes("advantage");
  const disadvantage = sources.includes("disadvantage");
  if (advantage && disadvantage) return "normal";
  if (advantage) return "advantage";
  if (disadvantage) return "disadvantage";
  return "normal";
}
