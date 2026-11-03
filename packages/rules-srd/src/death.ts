import { rollD20, rollDice, type GameEvent, type LogLine, type Rng, type RollMode, type RollResult } from "@phoenix/rules-core";
import { actorLine as line } from "./hook-support";
import { resolveD20Test, type D20TestResult } from "./d20-test";
import { advanceTime, type GameTime } from "./game-time";
import type { RuleMeta } from "./meta";
import { rollLogLine } from "./roll-log";

/** As the SRD, except a natural 1 on a death saving throw kills at once (author's rule). */
export const deathMeta: RuleMeta = { automation: "full", source: "srd-modified" };

export type DeathStatus = "alive" | "dying" | "stable" | "dead";

/** Hit points and death state of one creature, as plain data. Temporary hit points are not modeled yet. */
export type VitalState = {
  hp: number;
  hpMax: number;
  status: DeathStatus;
  successes: number;
  failures: number;
  /** Game time at which a stable creature recovers; set by `scheduleStableRecovery`, cleared when it stops being stable. */
  recoversAt?: GameTime;
};

export type VitalChange = { state: VitalState; events: GameEvent[]; log: LogLine[] };

const DEATH_SAVE_TARGET = 10;
const SAVES_NEEDED = 3;

export function vitalState(hp: number, hpMax: number): VitalState {
  if (!Number.isInteger(hpMax) || hpMax < 1) throw new RangeError("Hit point maximum must be a whole number, 1 or more");
  if (!Number.isInteger(hp) || hp < 1 || hp > hpMax) throw new RangeError("A living creature has between 1 and its maximum hit points");
  return { hp, hpMax, status: "alive", successes: 0, failures: 0 };
}

function amountOf(value: number, name: string): number {
  if (!Number.isSafeInteger(value) || value < 0) throw new RangeError(`${name} must be a whole number, 0 or more`);
  return value;
}

function event(name: string, actorId: string): GameEvent {
  return { name, payload: { actorId } };
}

/** The state without a recovery time: any change of status ends a scheduled recovery. */
function withoutRecovery(state: VitalState): VitalState {
  return { hp: state.hp, hpMax: state.hpMax, status: state.status, successes: state.successes, failures: state.failures };
}

function alter(state: VitalState, actorId: string, changes: Partial<VitalState>, events: string[], log: LogLine[]): VitalChange {
  return { state: { ...withoutRecovery(state), ...changes }, events: events.map((name) => event(name, actorId)), log };
}

function die(state: VitalState, actorId: string, why: string): VitalChange {
  return alter(state, actorId, { hp: 0, status: "dead", successes: 0, failures: 0 }, ["creature.dead"], [line(why, actorId)]);
}

function assertBreathing(state: VitalState): void {
  if (state.status === "dead") throw new Error("The creature is dead");
}

/**
 * Player characters and their companions make death saving throws; NPCs and monsters die at 0 hit points
 * unless the DM says otherwise.
 */
export type CreatureKind = "character" | "companion" | "npc" | "monster";

export function usesDeathSavesByDefault(kind: CreatureKind): boolean {
  return kind === "character" || kind === "companion";
}

export type DamageToCreature = {
  amount: number;
  critical: boolean;
  /** The damage comes from a melee attack. Only such an attack may knock a creature out instead of killing it. */
  melee?: boolean;
  knockOut?: boolean;
};

/** Ordinary hit point change of a creature that stays up: one event and one readable line. */
function hpChange(state: VitalState, actorId: string, hp: number): VitalChange {
  const delta = hp - state.hp;
  const next = { ...state, hp };
  if (delta === 0) return { state, events: [], log: [] };
  return {
    state: next,
    events: [{ name: "creature.hp-changed", payload: { actorId, hp, hpMax: state.hpMax, delta } }],
    log: [line(delta < 0 ? "log.hp.lost" : "log.hp.gained", actorId, { amount: Math.abs(delta), hp, hpMax: state.hpMax })],
  };
}

/**
 * `kind` sets whether the creature makes death saves; `usesDeathSaves` is the DM's override for one creature.
 * `knockOut` is a melee attacker's choice to leave the creature stable at 0 instead of dying; it needs `melee: true`.
 */
export function takeDamage(
  state: VitalState,
  actorId: string,
  damage: DamageToCreature,
  options: { kind: CreatureKind; usesDeathSaves?: boolean },
): VitalChange {
  assertBreathing(state);
  const amount = amountOf(damage.amount, "Damage");
  if (damage.knockOut === true && damage.melee !== true) throw new Error("Only a melee attack can knock a creature out");
  if (amount === 0) return { state, events: [], log: [] };
  if (state.status === "alive") {
    if (amount < state.hp) return hpChange(state, actorId, state.hp - amount);
    if (amount - state.hp >= state.hpMax) return die(state, actorId, "log.death.instant");
    // A melee knock out replaces the usual outcome, so it comes before the creature's own way of dropping to 0.
    // Massive damage is checked first: it kills outright whatever the attacker meant.
    if (damage.knockOut === true) {
      return alter(state, actorId, { hp: 0, status: "stable" }, ["creature.stable"], [line("log.death.knocked-out", actorId)]);
    }
    if (!(options.usesDeathSaves ?? usesDeathSavesByDefault(options.kind))) return die(state, actorId, "log.death.no-saves");
    return alter(state, actorId, { hp: 0, status: "dying" }, ["creature.dying"], [line("log.death.drops", actorId)]);
  }
  if (amount >= state.hpMax) return die(state, actorId, "log.death.instant");
  if (state.status === "stable") {
    // A stable creature that is hurt makes death saves again, but only if it is one that makes them at all.
    if (!(options.usesDeathSaves ?? usesDeathSavesByDefault(options.kind))) return die(state, actorId, "log.death.no-saves");
    return alter(state, actorId, { status: "dying", successes: 0, failures: 0 }, ["creature.dying"], [line("log.death.unstable", actorId)]);
  }
  const failures = state.failures + (damage.critical ? 2 : 1);
  const log = [line("log.death.damage-at-zero", actorId, { added: damage.critical ? 2 : 1, failures: Math.min(failures, SAVES_NEEDED) })];
  if (failures >= SAVES_NEEDED) {
    const dead = die({ ...state, failures }, actorId, "log.death.dead");
    return { ...dead, log: [...log, ...dead.log] };
  }
  return alter(state, actorId, { failures }, [], log);
}

export function rollDeathSave(
  state: VitalState,
  actorId: string,
  options: { modifier?: number; mode?: RollMode },
  rng: Rng,
): VitalChange & { roll: RollResult } {
  if (state.status !== "dying") throw new Error("Only a dying creature makes death saving throws");
  const roll = rollD20({ modifier: options.modifier ?? 0, mode: options.mode ?? "normal" }, rng);
  const natural = roll.kept[0] ?? 0;
  const detail = rollLogLine(roll);
  if (natural === 1) {
    const dead = die(state, actorId, "log.death.natural-1");
    return { ...dead, log: [detail, ...dead.log], roll };
  }
  if (natural === 20) {
    const back = alter(
      state,
      actorId,
      { hp: 1, status: "alive", successes: 0, failures: 0 },
      ["creature.revived"],
      [detail, line("log.death.natural-20", actorId)],
    );
    return { ...back, roll };
  }
  const success = roll.total >= DEATH_SAVE_TARGET;
  const successes = state.successes + (success ? 1 : 0);
  const failures = state.failures + (success ? 0 : 1);
  const outcome = line(success ? "log.death.save-success" : "log.death.save-failure", actorId, { successes, failures });
  if (successes >= SAVES_NEEDED) {
    const stable = alter(state, actorId, { status: "stable", successes: 0, failures: 0 }, ["creature.stable"], [detail, outcome, line("log.death.stable", actorId)]);
    return { ...stable, roll };
  }
  if (failures >= SAVES_NEEDED) {
    const dead = die({ ...state, failures }, actorId, "log.death.dead");
    return { ...dead, log: [detail, outcome, ...dead.log], roll };
  }
  return { ...alter(state, actorId, { successes, failures }, [], [detail, outcome]), roll };
}

/** Healing wakes a dying or stable creature with the healed amount and clears the death save counters. */
export function heal(state: VitalState, actorId: string, amount: number): VitalChange {
  assertBreathing(state);
  const healed = amountOf(amount, "Healing");
  if (state.status === "alive") return hpChange(state, actorId, Math.min(state.hpMax, state.hp + healed));
  if (healed === 0) return { state, events: [], log: [] };
  const restored = Math.min(state.hpMax, healed);
  return alter(
    state,
    actorId,
    { hp: restored, status: "alive", successes: 0, failures: 0 },
    ["creature.revived"],
    [line("log.death.healed", actorId, { amount: restored })],
  );
}

/** A successful Medicine check or a stabilizing effect: no more death saves, still unconscious at 0. */
export function stabilize(state: VitalState, actorId: string): VitalChange {
  if (state.status !== "dying") throw new Error("Only a dying creature can be stabilized");
  return alter(state, actorId, { status: "stable", successes: 0, failures: 0 }, ["creature.stable"], [line("log.death.stable", actorId)]);
}

export const STABILIZE_DC = 10;

/**
 * Stabilizing a dying creature with a Wisdom (Medicine) check, DC 10. The `modifier` is the healer's Medicine modifier.
 * A natural 20 succeeds and a natural 1 fails, as for any d20 test. On a failure the creature stays dying.
 */
export function stabilizeWithMedicine(
  state: VitalState,
  targetId: string,
  options: { modifier: number; mode?: RollMode },
  rng: Rng,
): VitalChange & { check: D20TestResult } {
  if (state.status !== "dying") throw new Error("Only a dying creature can be stabilized");
  const check = resolveD20Test({ modifier: options.modifier, mode: options.mode ?? "normal", dc: STABILIZE_DC }, rng);
  if (!check.success) return { state, events: [], log: check.log, check };
  const stable = stabilize(state, targetId);
  return { ...stable, log: [...check.log, ...stable.log], check };
}

/**
 * Rolls the 1d4 hours a stable creature stays down and records when it will recover, in game time.
 * Call it when `creature.stable` is emitted. A creature that already has a recovery time is left as it is.
 */
export function scheduleStableRecovery(state: VitalState, actorId: string, now: GameTime, rng: Rng): VitalChange {
  if (state.status !== "stable") throw new Error("Only a stable creature has a recovery time");
  if (state.recoversAt !== undefined) return { state, events: [], log: [] };
  const roll = rollDice("1d4", rng);
  const recoversAt = advanceTime(now, roll.total * 60);
  return {
    state: { ...state, recoversAt },
    events: [],
    log: [rollLogLine(roll), line("log.death.recovery-scheduled", actorId, { hours: roll.total })],
  };
}

export function isRecoveryDue(state: VitalState, now: GameTime): boolean {
  return state.status === "stable" && state.recoversAt !== undefined && now.minutes >= state.recoversAt.minutes;
}

/**
 * A stable creature regains 1 hit point and wakes up once its recovery time has come.
 * The DM can force it earlier with `force`.
 */
export function recoverFromStable(state: VitalState, actorId: string, now: GameTime, options: { force?: boolean } = {}): VitalChange {
  if (state.status !== "stable") throw new Error("Only a stable creature recovers this way");
  if (options.force !== true) {
    if (state.recoversAt === undefined) throw new Error("The recovery time has not been rolled yet: use scheduleStableRecovery");
    if (!isRecoveryDue(state, now)) throw new Error("The creature has not been stable long enough");
  }
  return alter(state, actorId, { hp: 1, status: "alive" }, ["creature.revived"], [line("log.death.healed", actorId, { amount: 1 })]);
}
