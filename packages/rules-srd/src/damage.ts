import { parseDice, rollDice, type LogLine, type Rng } from "@phoenix/rules-core";
import type { RuleMeta } from "./meta";

/** Critical hits double dice and bonuses (author's rule); defenses apply after the doubling. */
export const damageMeta: RuleMeta = { automation: "full", source: "srd-modified" };

export const DAMAGE_TYPES = [
  "acid",
  "bludgeoning",
  "cold",
  "fire",
  "force",
  "lightning",
  "necrotic",
  "piercing",
  "poison",
  "psychic",
  "radiant",
  "slashing",
  "thunder",
] as const;
export type DamageType = (typeof DAMAGE_TYPES)[number];

/** `dice` is plain "NdM" notation; flat bonuses go in `bonus` so a critical hit can double them. */
export type DamagePart = { dice: string; bonus: number; type: DamageType };

export type DamagePartResult = { type: DamageType; dice: number[]; bonus: number; amount: number };

export type DamageRoll = {
  parts: DamagePartResult[];
  byType: Partial<Record<DamageType, number>>;
  log: LogLine[];
};

export function rollDamage(parts: readonly DamagePart[], options: { critical: boolean }, rng: Rng): DamageRoll {
  const results: DamagePartResult[] = [];
  const byType: Partial<Record<DamageType, number>> = {};
  const log: LogLine[] = [];
  if (options.critical) log.push({ key: "log.damage.critical", params: {} });
  for (const part of parts) {
    if (!Number.isSafeInteger(part.bonus)) throw new RangeError("Damage bonus must be a whole number");
    const spec = parseDice(part.dice);
    if (spec.modifier !== 0 || spec.keep !== null) {
      throw new RangeError(`Damage dice "${part.dice}" must be plain NdM; put flat bonuses in "bonus"`);
    }
    const count = options.critical ? spec.count * 2 : spec.count;
    const bonus = options.critical ? part.bonus * 2 : part.bonus;
    const roll = rollDice(`${String(count)}d${String(spec.sides)}`, rng);
    const amount = Math.max(0, roll.total + bonus);
    results.push({ type: part.type, dice: roll.dice, bonus, amount });
    byType[part.type] = (byType[part.type] ?? 0) + amount;
    log.push({
      key: "log.damage.part",
      params: { amount, type: `damageTypes.${part.type}`, dice: roll.dice.join(", "), bonus },
      refs: { type: "text-key" },
    });
  }
  return { parts: results, byType, log };
}

export type Defenses = {
  resistances?: readonly DamageType[];
  vulnerabilities?: readonly DamageType[];
  immunities?: readonly DamageType[];
};

export type DefendedDamage = {
  byType: Partial<Record<DamageType, number>>;
  total: number;
  log: LogLine[];
};

/** Immunity first, then resistance (halve, round down), then vulnerability (double). */
export function applyDefenses(damage: Partial<Record<DamageType, number>>, defenses: Defenses): DefendedDamage {
  const byType: Partial<Record<DamageType, number>> = {};
  const log: LogLine[] = [];
  let total = 0;
  for (const type of DAMAGE_TYPES) {
    const before = damage[type];
    if (before === undefined) continue;
    let amount = before;
    /** Each entry records the amount it received and the amount it produced. */
    const adjust = (key: string, after: number): void => {
      log.push({
        key,
        params: { type: `damageTypes.${type}`, before: amount, after },
        refs: { type: "text-key" },
      });
      amount = after;
    };
    if (defenses.immunities?.includes(type) === true) {
      adjust("log.defense.immunity", 0);
    } else {
      if (defenses.resistances?.includes(type) === true) adjust("log.defense.resistance", Math.floor(amount / 2));
      if (defenses.vulnerabilities?.includes(type) === true) adjust("log.defense.vulnerability", amount * 2);
    }
    byType[type] = amount;
    total += amount;
  }
  log.push({ key: "log.damage.total", params: { total } });
  return { byType, total, log };
}
