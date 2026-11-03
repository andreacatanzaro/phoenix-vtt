import { spend, startOfTurn, type TurnEconomy } from "./turn-economy";
import type { RuleMeta } from "./meta";

export const actorTurnMeta: RuleMeta = { automation: "full", source: "srd" };

/** Everything one creature can still do in its current turn. Plain data, kept in the resolution store. */
export type ActorTurn = TurnEconomy & {
  /** Speed in meters at the start of the turn, conditions already applied. */
  baseSpeed: number;
  movementTotal: number;
  movementUsed: number;
  /** Attacks still available from the Attack action in progress (Extra Attack included). */
  attacksLeft: number;
  /** Whether the Attack action was taken this turn. */
  attackedThisTurn: boolean;
  /** Whether an attack with a light melee weapon was made this turn; the off-hand attack needs it. */
  lightAttackMade: boolean;
  /** Disengaged: moving provokes no opportunity attacks for the rest of the turn. */
  disengaged: boolean;
  /** Free text of the readied action, kept until it is carried out or the creature's next turn starts. */
  readied: string | null;
  /** The trigger came and the reaction was spent: the readied action can now be carried out. */
  readiedTriggered: boolean;
};

function nonNegative(value: number, name: string): number {
  if (!Number.isFinite(value) || value < 0) throw new RangeError(`${name} must be a finite number, 0 or more`);
  return value;
}

/** `speedMeters` is the creature's speed before conditions: they are applied when the creature moves. */
export function startActorTurn(options: { speedMeters: number }): ActorTurn {
  const speed = nonNegative(options.speedMeters, "speed");
  return {
    ...startOfTurn(),
    baseSpeed: speed,
    movementTotal: speed,
    movementUsed: 0,
    attacksLeft: 0,
    attackedThisTurn: false,
    lightAttackMade: false,
    disengaged: false,
    readied: null,
    readiedTriggered: false,
  };
}

export function movementLeft(turn: ActorTurn): number {
  return Math.max(0, turn.movementTotal - turn.movementUsed);
}

/** Spends meters of movement. `meters` is the cost, so crawling or difficult ground is counted by the caller. */
export function moveBy(turn: ActorTurn, meters: number): ActorTurn {
  const cost = nonNegative(meters, "movement");
  if (cost > movementLeft(turn) + 1e-9) throw new Error("Not enough movement left this turn");
  return { ...turn, movementUsed: turn.movementUsed + cost };
}

/** Attack action: `attacks` is how many attacks it allows (see the class's Extra Attack). Attacks left from an earlier Attack action this turn are kept. */
export function takeAttackAction(turn: ActorTurn, attacks: number): ActorTurn {
  if (!Number.isInteger(attacks) || attacks < 1) throw new RangeError("An Attack action allows at least one attack");
  return { ...spend(turn, "action"), attacksLeft: turn.attacksLeft + attacks, attackedThisTurn: true };
}

/** One attack of the Attack action in progress; `light` records an attack with a light melee weapon in one hand. */
export function spendAttack(turn: ActorTurn, options: { light?: boolean } = {}): ActorTurn {
  if (turn.attacksLeft < 1) throw new Error("No attacks left: take the Attack action first");
  return { ...turn, attacksLeft: turn.attacksLeft - 1, lightAttackMade: turn.lightAttackMade || options.light === true };
}

/** The off-hand attack of two-weapon fighting: a bonus action, only after an attack with a light melee weapon. */
export function spendBonusAttack(turn: ActorTurn): ActorTurn {
  if (!turn.lightAttackMade) throw new Error("A bonus-action attack needs an attack with a light melee weapon first");
  return spend(turn, "bonus-action");
}

/** Dash: movement for the turn grows by the speed the creature started it with. */
export function dash(turn: ActorTurn): ActorTurn {
  return { ...spend(turn, "action"), movementTotal: turn.movementTotal + turn.baseSpeed };
}

export function disengage(turn: ActorTurn): ActorTurn {
  return { ...spend(turn, "action"), disengaged: true };
}

/** Ready: spends the action; the text is the player's description of the trigger and what happens. */
export function ready(turn: ActorTurn, description: string): ActorTurn {
  if (description.trim() === "") throw new RangeError("Say what the readied action is");
  return { ...spend(turn, "action"), readied: description, readiedTriggered: false };
}

/** The trigger came: the creature spends its reaction, and may now carry out the readied action (see `useReadied`). */
export function releaseReadied(turn: ActorTurn): ActorTurn {
  if (turn.readied === null) throw new Error("No action is readied");
  if (turn.readiedTriggered) throw new Error("The readied action was already released");
  return { ...spend(turn, "reaction"), readiedTriggered: true };
}

/** The readied action is carried out: it costs nothing more, since the reaction was spent when it was released. */
export function useReadied(turn: ActorTurn): ActorTurn {
  if (turn.readied === null || !turn.readiedTriggered) throw new Error("No readied action is waiting to be carried out");
  return { ...turn, readied: null, readiedTriggered: false };
}

/** Any other action with no effect on the turn's numbers (Search, Use an Object, Hide, Help, Dodge, Cast a Spell). */
export function takeOtherAction(turn: ActorTurn): ActorTurn {
  return spend(turn, "action");
}

/** An opportunity attack needs a reaction, a mover that did not Disengage, and a reactor that can act. */
export function canOpportunityAttack(reactor: ActorTurn, mover: ActorTurn): boolean {
  return reactor.reactions > 0 && !mover.disengaged;
}
