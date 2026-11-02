import { rollD20, type LogLine, type Rng, type RollMode } from "@phoenix/rules-core";
import type { RuleMeta } from "./meta";
import { rollLogLine } from "./roll-log";

/** Fully automatic except ties, which the SRD leaves to the DM. */
export const initiativeMeta: RuleMeta = { automation: "partial", source: "srd" };

/** Initiative is a plain d20 roll: a natural 20 or 1 has no critical effect, the order is by total only. */
/** Who controls an actor decides who settles ties: players order their own characters, the DM everything else. */
export type Controller = "player" | "dm";

export type InitiativeInput = { actorId: string; modifier: number; mode: RollMode; controller: Controller };

export type TieGroup = { actorIds: string[]; decidedBy: "players" | "dm" };

export type InitiativeEntry = {
  actorId: string;
  total: number;
  /** The kept d20, before modifiers. */
  natural: number;
  modifier: number;
  controller: Controller;
};

function assertUnique(actorIds: readonly string[]): void {
  if (new Set(actorIds).size !== actorIds.length) throw new Error("Each actor can roll initiative only once");
}

export function rollInitiative(inputs: readonly InitiativeInput[], rng: Rng): { entries: InitiativeEntry[]; log: LogLine[] } {
  assertUnique(inputs.map((i) => i.actorId));
  const entries: InitiativeEntry[] = [];
  const log: LogLine[] = [];
  for (const input of inputs) {
    const roll = rollD20({ modifier: input.modifier, mode: input.mode }, rng);
    entries.push({
      actorId: input.actorId,
      total: roll.total,
      natural: roll.kept[0] ?? 0,
      modifier: input.modifier,
      controller: input.controller,
    });
    log.push(rollLogLine(roll), {
      key: "log.initiative.result",
      params: { actor: input.actorId, total: roll.total },
      refs: { actor: "actor-id" },
    });
  }
  return { entries, log };
}

/**
 * Highest total first. Equal totals keep their input order and are listed in `tieGroups` for whoever the SRD
 * names to settle: the players when only player characters tie, the DM when any creature of the DM is involved.
 */
export function orderInitiative(entries: readonly InitiativeEntry[]): {
  order: InitiativeEntry[];
  tieGroups: TieGroup[];
  log: LogLine[];
} {
  assertUnique(entries.map((e) => e.actorId));
  const order = [...entries].sort((a, b) => b.total - a.total);
  const tieGroups: TieGroup[] = [];
  const log: LogLine[] = [];
  for (let i = 0; i < order.length; ) {
    let end = i + 1;
    while (end < order.length && order[end]?.total === order[i]?.total) end += 1;
    if (end - i > 1) {
      const group = order.slice(i, end);
      const decidedBy = group.every((e) => e.controller === "player") ? "players" : "dm";
      tieGroups.push({ actorIds: group.map((e) => e.actorId), decidedBy });
      for (const e of group) {
        log.push({
          key: decidedBy === "players" ? "log.initiative.tie-players" : "log.initiative.tie-dm",
          params: { actor: e.actorId, total: e.total },
          refs: { actor: "actor-id" },
        });
      }
    }
    i = end;
  }
  return { order, tieGroups, log };
}

/** Applies the decision on one tie group: `actorIds` must be exactly that group, in the chosen order. */
export function breakTie(order: readonly InitiativeEntry[], actorIds: readonly string[]): InitiativeEntry[] {
  const positions = actorIds.map((id) => order.findIndex((e) => e.actorId === id));
  if (positions.some((p) => p === -1) || new Set(actorIds).size !== actorIds.length) {
    throw new Error("Tie choice names an unknown or repeated actor");
  }
  const first = order[Math.min(...positions)];
  if (first === undefined) throw new Error("Tie choice is empty");
  const sameTotal = order.filter((e) => e.total === first.total);
  const isWholeGroup =
    actorIds.length === sameTotal.length &&
    sameTotal.length > 1 &&
    sameTotal.every((e) => actorIds.includes(e.actorId));
  if (!isWholeGroup) throw new Error("Tie choice must be exactly one group of actors with the same total");
  const start = order.findIndex((e) => e.total === first.total);
  const chosen = actorIds.map((id) => order.find((e) => e.actorId === id)).filter((e): e is InitiativeEntry => e !== undefined);
  return [...order.slice(0, start), ...chosen, ...order.slice(start + chosen.length)];
}
