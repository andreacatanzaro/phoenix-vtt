/**
 * Every conversion between SRD 5.1 units and Phoenix units lives here, so a value is corrected in one place.
 * Game code works in meters (decimals allowed), cells and kilograms, never in feet or pounds.
 */

/** One map cell, in meters (the SRD's 5 ft square). */
export const CELL_METERS = 1.5;
/** SRD feet to meters is 1 ft = 0.3 m, kept as the ratio 3/10 to avoid float drift. */
const FEET_TO_METERS_NUMERATOR = 3;
const FEET_TO_METERS_DENOMINATOR = 10;
/** One SRD pound, in kilograms. */
export const POUND_KG = 0.5;
/** One coin weighs 10 g. */
export const COIN_KG = 0.01;
/** Carrying capacity per point of Strength, in kilograms (SRD: 15 lb). */
export const CARRY_KG_PER_STRENGTH = 7.5;
/** Lift, push and drag capacity per point of Strength, in kilograms (SRD: 30 lb). */
export const LIFT_KG_PER_STRENGTH = 15;
/** Falling deals 1d6 for every full 3 m (SRD: 10 ft)... */
export const FALL_METERS_PER_DIE = 3;
/** ...up to 20d6. */
export const FALL_MAX_DICE = 20;

export const MIN_ABILITY_SCORE = 1;
export const MAX_ABILITY_SCORE = 30;

function finite(value: number, name: string): number {
  if (!Number.isFinite(value)) throw new RangeError(`${name} must be a finite number`);
  return value;
}

function nonNegative(value: number, name: string): number {
  if (finite(value, name) < 0) throw new RangeError(`${name} cannot be negative`);
  return value;
}

function strength(score: number): number {
  if (!Number.isInteger(score) || score < MIN_ABILITY_SCORE || score > MAX_ABILITY_SCORE) {
    throw new RangeError(`Strength must be a whole number from ${String(MIN_ABILITY_SCORE)} to ${String(MAX_ABILITY_SCORE)}`);
  }
  return score;
}

export function feetToMeters(feet: number): number {
  return (finite(feet, "feet") * FEET_TO_METERS_NUMERATOR) / FEET_TO_METERS_DENOMINATOR;
}

export function cellsToMeters(cells: number): number {
  return finite(cells, "cells") * CELL_METERS;
}

export function metersToCells(meters: number): number {
  return (finite(meters, "meters") * 2) / 3;
}

export function poundsToKg(pounds: number): number {
  return nonNegative(pounds, "pounds") * POUND_KG;
}

export function coinsToKg(coins: number): number {
  return nonNegative(coins, "coins") * COIN_KG;
}

export function carryCapacityKg(strengthScore: number): number {
  return strength(strengthScore) * CARRY_KG_PER_STRENGTH;
}

export function liftCapacityKg(strengthScore: number): number {
  return strength(strengthScore) * LIFT_KG_PER_STRENGTH;
}

/** Number of d6 of falling damage for a fall of `meters`. */
export function fallDice(meters: number): number {
  const height = nonNegative(meters, "meters");
  return Math.min(FALL_MAX_DICE, Math.floor(height / FALL_METERS_PER_DIE));
}
