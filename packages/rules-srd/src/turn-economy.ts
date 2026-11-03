import type { RuleMeta } from "./meta";

export const turnEconomyMeta: RuleMeta = { automation: "full", source: "srd" };

export type ActionKind = "action" | "bonus-action" | "reaction";

/**
 * What a creature can still do in the current turn, as plain data. Everything refreshes at the start of the
 * creature's own turn (reactions included, as in the SRD). Incapacitation does not use them up: it only forbids acting
 * while it lasts, and the hooks check the creature's current conditions each time.
 */
export type TurnEconomy = {
  actions: number;
  bonusActions: number;
  reactions: number;
  /** Extra actions already granted this turn by Action Surge-like features, for the "once per turn" limits. */
  surgesThisTurn: number;
};

export function startOfTurn(): TurnEconomy {
  return { actions: 1, bonusActions: 1, reactions: 1, surgesThisTurn: 0 };
}

const FIELD = { action: "actions", "bonus-action": "bonusActions", reaction: "reactions" } as const;

export function canSpend(economy: TurnEconomy, kind: ActionKind): boolean {
  return economy[FIELD[kind]] > 0;
}

/** Throws when none is left; the caller checks `canSpend` first or lets the DM override. */
export function spend<T extends TurnEconomy>(economy: T, kind: ActionKind): T {
  if (!canSpend(economy, kind)) throw new Error(`No ${kind} left this turn`);
  const next = { ...economy };
  next[FIELD[kind]] -= 1;
  return next;
}

/** One additional action on top of the regular one (the SRD's Action Surge). `perTurnLimit` is how many such grants one turn allows. */
export function grantExtraAction<T extends TurnEconomy>(economy: T, perTurnLimit: number): T {
  if (economy.surgesThisTurn >= perTurnLimit) throw new Error("Already granted an extra action this turn");
  return { ...economy, actions: economy.actions + 1, surgesThisTurn: economy.surgesThisTurn + 1 };
}
