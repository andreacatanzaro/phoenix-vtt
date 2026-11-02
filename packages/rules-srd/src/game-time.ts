import type { RuleMeta } from "./meta";

/**
 * In-game time. It belongs to the world: the DM and automatic actions (rests, travel) move it forward.
 * It has nothing to do with the real clock, which the engine never reads.
 */
export const gameTimeMeta: RuleMeta = { automation: "full", source: "original" };

export const MINUTES_PER_HOUR = 60;

/** Whole minutes since the start of the world. */
export type GameTime = { minutes: number };

function wholeMinutes(value: number, name: string): number {
  if (!Number.isSafeInteger(value) || value < 0) throw new RangeError(`${name} must be a whole number of minutes, 0 or more`);
  return value;
}

export function gameTime(minutes: number): GameTime {
  return { minutes: wholeMinutes(minutes, "Game time") };
}

export function advanceTime(time: GameTime, minutes: number): GameTime {
  return { minutes: time.minutes + wholeMinutes(minutes, "Elapsed time") };
}

export function minutesBetween(from: GameTime, to: GameTime): number {
  if (to.minutes < from.minutes) throw new RangeError("The end of the interval is before its start");
  return to.minutes - from.minutes;
}

export function hoursBetween(from: GameTime, to: GameTime): number {
  return minutesBetween(from, to) / MINUTES_PER_HOUR;
}
