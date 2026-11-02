import type { GameEvent, LogLine } from "@phoenix/rules-core";
import type { InitiativeEntry } from "./initiative";
import type { RuleMeta } from "./meta";

export const turnsMeta: RuleMeta = { automation: "full", source: "srd" };

/** A turn waiting to be played out of the normal order. */
export type PendingTurn = {
  /** Position in `order` of the actor who will play. */
  position: number;
  /** False for an actor whose turn was interrupted and who picks it up again; true for a newcomer's first turn. */
  fresh: boolean;
};

/** Combat order and position, as plain data so it survives a restart. */
export type CombatState = {
  round: number;
  order: { actorId: string; total: number }[];
  /** Position in `order` of the actor whose turn it is. */
  index: number;
  /**
   * Turns to play before the normal order goes on, the next one last. Totals grow from the first to the last
   * entry: whoever interrupts has a higher total than the actor they interrupt.
   */
  pending: PendingTurn[];
};

export type TurnStep = { state: CombatState; events: GameEvent[]; log: LogLine[] };

export function currentActor(state: CombatState): string {
  const current = state.order[state.index];
  if (current === undefined) throw new Error("Combat state has no current actor");
  return current.actorId;
}

function turnStart(state: CombatState): { events: GameEvent[]; log: LogLine[] } {
  const actorId = currentActor(state);
  return {
    events: [{ name: "turn.start", payload: { actorId, round: state.round } }],
    log: [{ key: "log.turn.start", params: { actor: actorId, round: state.round }, refs: { actor: "actor-id" } }],
  };
}

/** `order` is already sorted, with any tie settled by whoever the SRD names. */
export function startCombat(order: readonly InitiativeEntry[]): TurnStep {
  if (order.length === 0) throw new Error("Combat needs at least one actor");
  const state: CombatState = {
    round: 1,
    order: order.map((e) => ({ actorId: e.actorId, total: e.total })),
    index: 0,
    pending: [],
  };
  const start = turnStart(state);
  return { state, events: [{ name: "round.start", payload: { round: 1 } }, ...start.events], log: start.log };
}

export function nextTurn(previous: CombatState): TurnStep {
  const events: GameEvent[] = [{ name: "turn.end", payload: { actorId: currentActor(previous), round: previous.round } }];
  const upNext = previous.pending[previous.pending.length - 1];
  if (upNext !== undefined) {
    const state: CombatState = {
      round: previous.round,
      order: previous.order.map((c) => ({ ...c })),
      index: upNext.position,
      pending: previous.pending.slice(0, -1),
    };
    if (upNext.fresh) {
      const start = turnStart(state);
      return { state, events: [...events, ...start.events], log: start.log };
    }
    // An interrupted actor picks their turn up again: `turn.resume`, not `turn.start`, so per-turn effects and resources do not reset.
    const actorId = currentActor(state);
    return {
      state,
      events: [...events, { name: "turn.resume", payload: { actorId, round: state.round } }],
      log: [{ key: "log.turn.resume", params: { actor: actorId, round: state.round }, refs: { actor: "actor-id" } }],
    };
  }
  const wraps = previous.index + 1 >= previous.order.length;
  const state: CombatState = {
    round: wraps ? previous.round + 1 : previous.round,
    order: previous.order.map((c) => ({ ...c })),
    index: wraps ? 0 : previous.index + 1,
    pending: [],
  };
  if (wraps) {
    events.push({ name: "round.end", payload: { round: previous.round } }, { name: "round.start", payload: { round: state.round } });
  }
  const start = turnStart(state);
  return { state, events: [...events, ...start.events], log: start.log };
}

/**
 * Joins mid-combat after rolling initiative: placed by total, after anyone with the same total, and acts in the
 * current round. With a higher total than the actor whose turn it is, the newcomer plays now and that actor
 * resumes afterwards; otherwise the newcomer plays at their place in the order.
 */
export function addCombatant(state: CombatState, entry: InitiativeEntry): TurnStep {
  if (state.order.some((c) => c.actorId === entry.actorId)) throw new Error(`${entry.actorId} is already in combat`);
  let position = state.order.findIndex((c) => c.total < entry.total);
  if (position === -1) position = state.order.length;
  const order = state.order.map((c) => ({ ...c }));
  order.splice(position, 0, { actorId: entry.actorId, total: entry.total });
  const shift = (p: PendingTurn): PendingTurn => ({ ...p, position: p.position >= position ? p.position + 1 : p.position });
  const pending = state.pending.map(shift);
  const joinsNow = position <= state.index;
  if (joinsNow) {
    pending.push({ position: state.index + 1, fresh: false });
  } else if (state.pending.some((p) => p.position >= position)) {
    // The normal order will jump past this place once an interrupted actor resumes, so the newcomer is queued.
    const slot = pending.findIndex((p) => (order[p.position]?.total ?? 0) > entry.total);
    pending.splice(slot === -1 ? pending.length : slot, 0, { position, fresh: true });
  }
  const next: CombatState = { round: state.round, order, index: joinsNow ? position : state.index, pending };
  const params = { actor: entry.actorId, total: entry.total, round: state.round };
  const refs = { actor: "actor-id" } as const;
  if (!joinsNow) return { state: next, events: [], log: [{ key: "log.turn.join-later", params, refs }] };
  return {
    state: next,
    events: [{ name: "turn.start", payload: { actorId: entry.actorId, round: state.round, interrupts: currentActor(state) } }],
    log: [{ key: "log.turn.join-now", params, refs }],
  };
}

/** Leaves combat. The actor whose turn it is must end it first. */
export function removeCombatant(state: CombatState, actorId: string): CombatState {
  const position = state.order.findIndex((c) => c.actorId === actorId);
  if (position === -1) throw new Error(`${actorId} is not in combat`);
  if (state.order.length === 1) throw new Error("Cannot remove the last actor from combat");
  if (position === state.index) throw new Error("End this actor's turn before removing them");
  if (state.pending.some((p) => p.position === position)) throw new Error("This actor still has a turn waiting to be played");
  const order = state.order.filter((_, i) => i !== position).map((c) => ({ ...c }));
  const shift = (p: number): number => (p > position ? p - 1 : p);
  return {
    round: state.round,
    order,
    index: shift(state.index),
    pending: state.pending.map((p) => ({ ...p, position: shift(p.position) })),
  };
}
