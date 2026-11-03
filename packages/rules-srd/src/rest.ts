import { rollDice, type GameEvent, type LogLine, type Rng } from "@phoenix/rules-core";
import { actorLine as line } from "./hook-support";
import { MAX_EXHAUSTION } from "./conditions";
import { hoursBetween, type GameTime } from "./game-time";
import { heal, type VitalState } from "./death";
import type { RuleMeta } from "./meta";
import { rollLogLine } from "./roll-log";

/**
 * Rests take game time: the caller advances the world clock by at least SHORT_REST_MINUTES or LONG_REST_MINUTES
 * and passes the resulting time. Recovery of hit points and hit dice is automatic. Class features, spell slots and prepared spells react to the
 * `rest.short` and `rest.long` events (content, later). Interruptions and food are the DM's call.
 */
export const restMeta: RuleMeta = { automation: "partial", source: "srd" };

export const HIT_DIE_SIZES = [6, 8, 10, 12] as const;
export type HitDieSize = (typeof HIT_DIE_SIZES)[number];

/** One pool of hit dice (a single class for now; multiclass keeps one pool per die size later). */
export type HitDicePool = { size: HitDieSize; total: number; spent: number };

/** A long rest does not count if the previous one ended less than this many in-game hours ago. */
export const LONG_REST_INTERVAL_HOURS = 24;
/** Minimum duration in game minutes: the caller advances the world clock by at least this much. */
export const SHORT_REST_MINUTES = 60;
export const LONG_REST_MINUTES = 8 * 60;

const MAX_HIT_DICE = 20;

function isDieSize(value: number): value is HitDieSize {
  return HIT_DIE_SIZES.some((size) => size === value);
}

export function hitDicePool(size: number, total: number): HitDicePool {
  if (!isDieSize(size)) throw new RangeError("A hit die is a d6, d8, d10 or d12");
  if (!Number.isInteger(total) || total < 1 || total > MAX_HIT_DICE) {
    throw new RangeError(`Hit dice must be a whole number from 1 to ${String(MAX_HIT_DICE)}`);
  }
  return { size, total, spent: 0 };
}

function event(name: string, actorId: string): GameEvent {
  return { name, payload: { actorId } };
}

/** `healed` is the hit points actually regained, after the cap at the maximum. */
export type HitDieSpent = { vital: VitalState; pool: HitDicePool; healed: number; events: GameEvent[]; log: LogLine[] };

/**
 * During a short rest: roll one hit die, add the Constitution modifier (at least 0 in total) and regain that many
 * hit points, up to the maximum.
 */
export function spendHitDie(vital: VitalState, pool: HitDicePool, actorId: string, conModifier: number, rng: Rng): HitDieSpent {
  if (vital.status !== "alive" && vital.status !== "stable") {
    throw new Error("Only a creature that is up or stable can spend hit dice");
  }
  if (!Number.isSafeInteger(conModifier)) throw new RangeError("Constitution modifier must be a whole number");
  if (pool.spent >= pool.total) throw new Error("No hit dice left to spend");
  const sign = conModifier < 0 ? "-" : "+";
  const notation = conModifier === 0 ? `1d${String(pool.size)}` : `1d${String(pool.size)}${sign}${String(Math.abs(conModifier))}`;
  const roll = rollDice(notation, rng);
  const rolled = Math.max(0, roll.total);
  const next: HitDicePool = { ...pool, spent: pool.spent + 1 };
  const restored = heal(vital, actorId, rolled);
  return {
    vital: restored.state,
    pool: next,
    healed: restored.state.hp - vital.hp,
    events: restored.events,
    log: [
      rollLogLine(roll),
      line("log.rest.hit-die-spent", actorId, { size: pool.size, rolled, remaining: next.total - next.spent, total: next.total }),
      ...restored.log,
    ],
  };
}

/** The short rest is over: tells effects and class features. */
export function finishShortRest(actorId: string): { events: GameEvent[]; log: LogLine[] } {
  return { events: [event("rest.short", actorId)], log: [line("log.rest.short", actorId)] };
}

export type LongRestInput = {
  vital: VitalState;
  /** The creature had at least 1 hit point when the rest began: the SRD asks for it at the start, not at the end. */
  hadHitPointsAtStart: boolean;
  pool: HitDicePool;
  exhaustion: number;
  /** The DM confirms the creature had food and drink; without it exhaustion does not go down. */
  fed: boolean;
  /** The world's game time at the end of this rest. */
  now: GameTime;
  /** Game time at which the creature's previous long rest ended; null when there was none. */
  lastLongRestAt: GameTime | null;
  /** The DM lets the rest count even if the last one ended less than 24 game hours ago. */
  ignoreInterval?: boolean;
};

export type LongRestResult = {
  vital: VitalState;
  pool: HitDicePool;
  exhaustion: number;
  benefited: boolean;
  /** When the creature's last long rest ended: `now` if this one counted, otherwise unchanged. */
  lastLongRestAt: GameTime | null;
  events: GameEvent[];
  log: LogLine[];
};

export function longRest(input: LongRestInput, actorId: string): LongRestResult {
  const { vital, pool } = input;
  if (vital.status === "dead") throw new Error("The dead do not rest");
  if (!Number.isInteger(input.exhaustion) || input.exhaustion < 0 || input.exhaustion > MAX_EXHAUSTION) {
    throw new RangeError(`Exhaustion level must be a whole number from 0 to ${String(MAX_EXHAUSTION)}`);
  }
  const since = input.lastLongRestAt === null ? null : hoursBetween(input.lastLongRestAt, input.now);
  const none = (key: string, extra: Record<string, number | string> = {}): LongRestResult => ({
    vital,
    pool,
    exhaustion: input.exhaustion,
    benefited: false,
    lastLongRestAt: input.lastLongRestAt,
    events: [],
    log: [line(key, actorId, extra)],
  });
  if (!input.hadHitPointsAtStart) return none("log.rest.no-hp");
  if (since !== null && since < LONG_REST_INTERVAL_HOURS && input.ignoreInterval !== true) {
    return none("log.rest.too-soon", { hours: Math.floor(since) });
  }
  const restored = heal(vital, actorId, vital.hpMax - vital.hp);
  const recoverable = Math.max(1, Math.floor(pool.total / 2));
  const regained = Math.min(pool.spent, recoverable);
  const nextPool: HitDicePool = { ...pool, spent: pool.spent - regained };
  const log: LogLine[] = [...restored.log, line("log.rest.long", actorId, { regained })];
  let exhaustion = input.exhaustion;
  if (exhaustion > 0) {
    if (input.fed) {
      exhaustion -= 1;
      log.push(line("log.rest.exhaustion-reduced", actorId, { level: exhaustion }));
    } else {
      log.push(line("log.rest.not-fed", actorId));
    }
  }
  return {
    vital: restored.state,
    pool: nextPool,
    exhaustion,
    benefited: true,
    lastLongRestAt: input.now,
    events: [...restored.events, event("rest.long", actorId)],
    log,
  };
}
