import type { Rng } from "./rng";

export type RollMode = "normal" | "advantage" | "disadvantage";

export type DiceSpec = {
  count: number;
  sides: number;
  modifier: number;
  keep: { mode: "highest" | "lowest"; n: number } | null;
};

export type RollResult = {
  notation: string;
  dice: number[];
  kept: number[];
  modifier: number;
  total: number;
  mode: RollMode;
  /** Only set for d20 rolls: natural 20 or natural 1 on the kept die. */
  critical: "success" | "failure" | null;
};

export const MAX_DICE_COUNT = 100;
export const MAX_DICE_SIDES = 1000;
export const MAX_MODIFIER = 1_000_000;

const DICE_PATTERN = /^(\d*)d(\d+)(?:(kh|kl)(\d+))?([+-]\d+)?$/;

export function parseDice(notation: string): DiceSpec {
  const match = DICE_PATTERN.exec(notation);
  if (match === null) throw new Error(`Invalid dice notation: "${notation}"`);
  const [, countText, sidesText, keepText, keepCountText, modifierText] = match;
  const count = countText === undefined || countText === "" ? 1 : Number(countText);
  const sides = Number(sidesText);
  const modifier = modifierText === undefined ? 0 : Number(modifierText);
  if (count < 1 || sides < 1 || count > MAX_DICE_COUNT || sides > MAX_DICE_SIDES || Math.abs(modifier) > MAX_MODIFIER) {
    throw new Error(`Invalid dice notation: "${notation}"`);
  }
  let keep: DiceSpec["keep"] = null;
  if (keepText !== undefined && keepCountText !== undefined) {
    const n = Number(keepCountText);
    if (n < 1 || n > count) throw new Error(`Invalid keep count in "${notation}"`);
    keep = { mode: keepText === "kh" ? "highest" : "lowest", n };
  }
  return { count, sides, modifier, keep };
}

function sum(values: readonly number[]): number {
  return values.reduce((acc, v) => acc + v, 0);
}

function naturalCritical(sides: number, kept: readonly number[]): RollResult["critical"] {
  if (sides !== 20 || kept.length !== 1) return null;
  if (kept[0] === 20) return "success";
  if (kept[0] === 1) return "failure";
  return null;
}

function keepDice(dice: readonly number[], keep: DiceSpec["keep"]): number[] {
  if (keep === null) return [...dice];
  const sorted = [...dice].sort((a, b) => a - b);
  return keep.mode === "highest" ? sorted.slice(sorted.length - keep.n).reverse() : sorted.slice(0, keep.n);
}

export function rollDice(notation: string, rng: Rng): RollResult {
  const spec = parseDice(notation);
  const dice = Array.from({ length: spec.count }, () => rng.int(1, spec.sides));
  const kept = keepDice(dice, spec.keep);
  return {
    notation,
    dice,
    kept,
    modifier: spec.modifier,
    total: sum(kept) + spec.modifier,
    mode: "normal",
    critical: naturalCritical(spec.sides, kept),
  };
}

export function rollD20(options: { modifier: number; mode: RollMode }, rng: Rng): RollResult {
  const { modifier, mode } = options;
  if (!Number.isSafeInteger(modifier) || Math.abs(modifier) > MAX_MODIFIER) {
    throw new RangeError(`Modifier must be a whole number within ±${String(MAX_MODIFIER)}`);
  }
  const count = mode === "normal" ? 1 : 2;
  const dice = Array.from({ length: count }, () => rng.int(1, 20));
  const kept = mode === "normal" ? [...dice] : keepDice(dice, { mode: mode === "advantage" ? "highest" : "lowest", n: 1 });
  const critical = naturalCritical(20, kept);
  const sign = modifier < 0 ? "-" : "+";
  return {
    notation: modifier === 0 ? "1d20" : `1d20${sign}${String(Math.abs(modifier))}`,
    dice,
    kept,
    modifier,
    total: sum(kept) + modifier,
    mode,
    critical,
  };
}
